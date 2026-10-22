import {
  PHYSICS_RULES_VERSION,
  physicsBudgets,
  physicsRoomCommandSchema,
  physicsCheckpointSchema,
  type PhysicsRoomCommand,
  type PhysicsScene,
  type PhysicsFrame,
  type PhysicsPlayerState,
  type PhysicsLayoutOperation,
  type ObjectDefinition,
} from "@island/contracts";
import { editedPhysicsScene } from "./editing.js";
import { PhysicsRuntime } from "./index.js";
import { PhysicsCharacter } from "./character.js";
import { PhysicsGrab } from "./grab.js";

export interface CommandReceipt {
  commandId: string;
  ok: boolean;
  message: string;
  tick: number;
}
interface Player {
  character: PhysicsCharacter;
  grab: PhysicsGrab;
  canInteract: boolean;
  input: Extract<PhysicsRoomCommand, { type: "input" }>;
  inputTick: number;
  ackInput: number;
  lastCommandSequence: number;
  receipts: Map<string, { fingerprint: string; receipt: CommandReceipt }>;
}
export class PhysicsRoomError extends Error {
  constructor(
    readonly code:
      | "INVALID_COMMAND"
      | "NOT_JOINED"
      | "ROOM_FULL"
      | "FORBIDDEN"
      | "STALE_COMMAND"
      | "STALE_LAYOUT"
      | "EDIT_CONFLICT",
    message: string,
  ) {
    super(message);
  }
}
/** Trusted room authority. Network adapters must authenticate joins and bind IDs. */
export class PhysicsRoom {
  private players = new Map<string, Player>();
  private sentBodies = new Map<string, string>();
  private sequence = 0;
  private lastDeltaSequence = -1;
  private prepared: {
    id: string;
    scene: PhysicsScene;
    changedId: string;
  } | null = null;
  prepareEdit(
    id: string,
    expectedRevision: number,
    operation: PhysicsLayoutOperation,
    definition?: ObjectDefinition,
  ) {
    if (this.prepared)
      throw new PhysicsRoomError("EDIT_CONFLICT", "另一项布置正在提交");
    if (expectedRevision !== this.layoutRevision)
      throw new PhysicsRoomError("STALE_LAYOUT", "布局已更新，请重新布置");
    const scene = editedPhysicsScene(this.runtime.scene, operation, definition);
    const changedId =
      operation.type === "place" ? operation.object.id : operation.objectId;
    if (operation.type !== "remove") {
      if (
        [...this.players.keys()].some(
          (id) => this.playerState(id).held === changedId,
        )
      )
        throw new PhysicsRoomError("EDIT_CONFLICT", "请先放下正在拿着的物品");
      const object = scene.objects.find((o) => o.id === changedId)!;
      const def = scene.definitions.find(
        (d) =>
          d.id === object.definitionId &&
          d.version === object.definitionVersion,
      )!;
      this.runtime.validatePlacement(
        object,
        def,
        operation.type === "move" ? changedId : undefined,
      );
    }
    const checkpoint = this.checkpoint(0);
    checkpoint.layoutRevision++;
    checkpoint.states = checkpoint.states
      .filter((s) => s.id !== changedId)
      .map((s) => ({ ...s, sleeping: false }));
    const object = scene.objects.find((o) => o.id === changedId);
    if (object)
      checkpoint.states.push({
        id: object.id,
        position: object.position,
        rotation: object.rotation,
        sleeping: false,
      });
    this.prepared = { id, scene, changedId };
    return { scene, checkpoint };
  }
  abortEdit(id: string) {
    if (this.prepared?.id === id) this.prepared = null;
  }
  commitEdit(id: string) {
    const pending = this.prepared;
    if (!pending || pending.id !== id)
      throw new PhysicsRoomError("EDIT_CONFLICT", "布置提交已失效");
    for (const player of this.players.values()) {
      if (player.grab.body === this.runtime.bodies.get(pending.changedId))
        player.grab.release();
      player.input = {
        ...player.input,
        x: 0,
        z: 0,
        jump: false,
        layoutRevision: this.layoutRevision + 1,
      };
    }
    this.runtime.applyLayout(pending.scene, pending.changedId);
    this.layoutRevision++;
    this.prepared = null;
    this.sentBodies.clear();
    return this.frame(true);
  }
  private constructor(
    readonly runtime: PhysicsRuntime,
    readonly epoch: string,
    public layoutRevision: number,
  ) {}
  static async create(
    scene: PhysicsScene,
    epoch: string,
    layoutRevision = 1,
    checkpoint?: unknown,
  ) {
    const runtime = await PhysicsRuntime.create(scene);
    try {
      if (!Number.isSafeInteger(layoutRevision) || layoutRevision < 1)
        throw new Error("布局版本无效");
      if (checkpoint !== undefined) {
        const parsed = physicsCheckpointSchema.parse(checkpoint);
        if (parsed.layoutRevision !== layoutRevision)
          throw new PhysicsRoomError("STALE_LAYOUT", "检查点与布局版本不一致");
        runtime.restore(parsed);
      }
      return new PhysicsRoom(runtime, epoch, layoutRevision);
    } catch (error) {
      runtime.dispose();
      throw error;
    }
  }
  get size() {
    return this.players.size;
  }
  join(id: string, canInteract: boolean) {
    if (this.players.has(id))
      throw new PhysicsRoomError("INVALID_COMMAND", "连接已经加入房间");
    if (this.players.size >= physicsBudgets.players)
      throw new PhysicsRoomError("ROOM_FULL", "房间已满");
    const character = this.runtime.createCharacter(
      id,
      this.runtime.scene.spawn,
      canInteract,
    );
    this.players.set(id, {
      character,
      grab: new PhysicsGrab(this.runtime.world, character),
      canInteract,
      input: {
        type: "input",
        sequence: -1,
        layoutRevision: this.layoutRevision,
        x: 0,
        z: 0,
        jump: false,
        yaw: 0,
      },
      inputTick: this.runtime.tick,
      ackInput: -1,
      lastCommandSequence: -1,
      receipts: new Map(),
    });
  }
  leave(id: string) {
    const player = this.players.get(id);
    player?.grab.release();
    this.runtime.removeCharacter(id);
    this.players.delete(id);
  }
  setPermission(id: string, canInteract: boolean) {
    const player = this.player(id);
    player.canInteract = canInteract;
    player.character.setCanPush(canInteract);
    if (!canInteract) player.grab.release();
  }
  private player(id: string) {
    const player = this.players.get(id);
    if (!player) throw new PhysicsRoomError("NOT_JOINED", "请重新进入房间");
    return player;
  }
  command(id: string, input: unknown): CommandReceipt | null {
    if (this.prepared)
      throw new PhysicsRoomError("EDIT_CONFLICT", "布置正在提交，请稍候");
    const player = this.player(id),
      parsed = physicsRoomCommandSchema.safeParse(input);
    if (!parsed.success)
      throw new PhysicsRoomError("INVALID_COMMAND", "操作格式不正确");
    const command = parsed.data;
    if (command.layoutRevision !== this.layoutRevision)
      throw new PhysicsRoomError("STALE_LAYOUT", "布局已更新，请重新同步");
    if (command.type === "input") {
      if (command.sequence <= player.input.sequence) return null;
      player.input = command;
      player.inputTick = this.runtime.tick;
      return null;
    }
    if (!player.canInteract)
      throw new PhysicsRoomError("FORBIDDEN", "岛主尚未开放物品互动");
    const fingerprint = JSON.stringify(command),
      cached = player.receipts.get(command.commandId);
    if (cached) {
      if (cached.fingerprint !== fingerprint)
        throw new PhysicsRoomError(
          "STALE_COMMAND",
          "操作编号已经用于另一项操作",
        );
      return cached.receipt;
    }
    if (command.sequence <= player.lastCommandSequence)
      throw new PhysicsRoomError("STALE_COMMAND", "操作已过期，请同步后重试");
    player.lastCommandSequence = command.sequence;
    const receipt: CommandReceipt = {
      commandId: command.commandId,
      ok: false,
      message: "",
      tick: this.runtime.tick,
    };
    try {
      if (command.type === "grab" || command.type === "push") {
        const object = this.runtime.scene.objects.find(
          (o) => o.id === command.objectId,
        );
        const definition = this.runtime.scene.definitions.find(
          (d) =>
            d.id === object?.definitionId &&
            d.version === object.definitionVersion,
        );
        if (!object || !definition?.abilities.includes("grabbable"))
          throw new Error("这个物品不能搬动");
        const body = this.runtime.bodies.get(object.id)!;
        if (command.type === "grab") player.grab.take(body);
        else player.grab.push(body);
      } else if (command.type === "drop") player.grab.drop();
      else
        player.grab.toss({
          x: Math.sin(player.input.yaw),
          y: 0,
          z: Math.cos(player.input.yaw),
        });
      receipt.ok = true;
    } catch (error) {
      receipt.message = error instanceof Error ? error.message : "操作未完成";
    }
    player.receipts.set(command.commandId, { fingerprint, receipt });
    if (player.receipts.size > 128)
      player.receipts.delete(player.receipts.keys().next().value!);
    return receipt;
  }
  step() {
    if (this.prepared) return;
    this.runtime.step((dt) => {
      for (const player of this.players.values()) {
        const idle = this.runtime.tick - player.inputTick > 15;
        player.character.step(
          idle ? { x: 0, z: 0, jump: false } : player.input,
          dt,
        );
        player.ackInput = player.input.sequence;
        if (idle) player.grab.release();
        player.grab.step(
          {
            x: Math.sin(player.input.yaw),
            y: 0,
            z: Math.cos(player.input.yaw),
          },
          dt,
        );
        const position = player.character.position(),
          bounds = this.runtime.scene.bounds;
        if (
          (["x", "y", "z"] as const).some(
            (axis) =>
              position[axis] < bounds.min[axis] ||
              position[axis] > bounds.max[axis],
          )
        ) {
          player.grab.release();
          player.character.teleport(this.runtime.scene.spawn);
        }
      }
    });
  }
  playerState(id: string): PhysicsPlayerState {
    const player = this.player(id),
      handle = player.grab.body?.handle;
    const held =
      handle === undefined
        ? null
        : ([...this.runtime.bodies].find(
            ([, body]) => body.handle === handle,
          )?.[0] ?? null);
    return {
      id,
      ...player.character.snapshot(),
      ackInput: player.ackInput,
      held,
      yaw: player.input.yaw,
      canInteract: player.canInteract,
      dropPreview: player.grab.previewDrop(),
    };
  }
  frame(full = false): PhysicsFrame {
    const bodies = this.runtime.states().filter((state) => {
      if (
        !full &&
        !this.runtime.bodies.get(state.id)!.isDynamic() &&
        !this.runtime.bodies.get(state.id)!.isKinematic()
      )
        return false;
      const signature = JSON.stringify({
        ...state,
        position: Object.fromEntries(
          Object.entries(state.position).map(([k, v]) => [
            k,
            Math.round(v * 1000),
          ]),
        ),
        rotation: Object.fromEntries(
          Object.entries(state.rotation).map(([k, v]) => [
            k,
            Math.round(v * 10000),
          ]),
        ),
      });
      const changed = this.sentBodies.get(state.id) !== signature;
      if (!full) this.sentBodies.set(state.id, signature);
      return full || changed;
    });
    const sequence = this.sequence++,
      baseSequence = this.lastDeltaSequence;
    if (!full) this.lastDeltaSequence = sequence;
    return {
      baseSequence,
      epoch: this.epoch,
      sequence,
      tick: this.runtime.tick,
      layoutRevision: this.layoutRevision,
      full,
      bodies,
      players: [...this.players.keys()].map((id) => this.playerState(id)),
    };
  }
  checkpoint(revision: number) {
    return {
      schemaVersion: 4 as const,
      physicsVersion: PHYSICS_RULES_VERSION,
      layoutRevision: this.layoutRevision,
      revision,
      tick: this.runtime.tick,
      states: this.runtime.states(),
    };
  }
  dispose() {
    for (const id of [...this.players.keys()]) this.leave(id);
    this.runtime.dispose();
    this.sentBodies.clear();
  }
}
