import type {
  BodyState,
  PhysicsFrame,
  PhysicsPlayerState,
  PhysicsRoomCommand,
  PhysicsScene,
} from "@island/contracts";
import { PhysicsRuntime, PHYSICS_DT, RAPIER } from "./index.js";
import type { PhysicsCharacter } from "./character.js";

type Input = Extract<PhysicsRoomCommand, { type: "input" }>;
/** Full baselines plus ordered deltas. Render at a small delay, never extrapolate. */
export class PhysicsFrameBuffer {
  private frames: Array<{ at: number; frame: PhysicsFrame }> = [];
  private bodies = new Map<string, BodyState>();
  latest: PhysicsFrame | null = null;
  accept(frame: PhysicsFrame, at: number) {
    if (
      this.latest?.epoch === frame.epoch &&
      frame.sequence <= this.latest.sequence
    )
      return false;
    if (
      !frame.full &&
      (!this.latest ||
        this.latest.epoch !== frame.epoch ||
        this.latest.layoutRevision !== frame.layoutRevision ||
        frame.baseSequence > this.latest.sequence)
    )
      return false;
    if (
      frame.full &&
      (this.latest?.epoch !== frame.epoch ||
        this.latest.layoutRevision !== frame.layoutRevision)
    ) {
      this.frames = [];
      this.bodies.clear();
    }
    if (frame.full) this.bodies.clear();
    for (const body of frame.bodies) this.bodies.set(body.id, body);
    this.latest = { ...frame, bodies: [...this.bodies.values()] };
    this.frames.push({ at, frame: this.latest });
    if (this.frames.length > 32) this.frames.shift();
    return true;
  }
  sample(now: number, delay = 100) {
    if (!this.frames.length) return null;
    const target = now - delay;
    let before = this.frames[0]!,
      after = before;
    for (const entry of this.frames) {
      if (entry.at <= target) before = entry;
      after = entry;
      if (entry.at >= target) break;
    }
    const alpha =
      before === after
        ? 1
        : Math.max(
            0,
            Math.min(1, (target - before.at) / (after.at - before.at)),
          );
    return { before: before.frame, after: after.frame, alpha };
  }
}

/** Predict only our capsule. Objects remain server-owned kinematic obstacles. */
export class PhysicsPrediction {
  readonly player: PhysicsCharacter;
  private history: Input[] = [];
  private nextSequence = 0;
  private accumulator = 0;
  lastCorrection = 0;
  private renderOffset = { x: 0, y: 0, z: 0 };
  visualPosition = { x: 0, y: 0, z: 0 };
  private constructor(
    readonly runtime: PhysicsRuntime,
    readonly id: string,
  ) {
    for (const body of runtime.bodies.values())
      if (!body.isFixed())
        body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, false);
    this.player = runtime.createCharacter(id, runtime.scene.spawn, false);
    this.visualPosition = this.player.position();
  }
  static async create(scene: PhysicsScene, id: string) {
    return new PhysicsPrediction(await PhysicsRuntime.create(scene), id);
  }
  private applyBodies(states: BodyState[]) {
    for (const state of states) {
      const body = this.runtime.bodies.get(state.id);
      if (!body) continue;
      body.setTranslation(state.position, false);
      body.setRotation(state.rotation, false);
      if (body.isKinematic()) {
        body.setNextKinematicTranslation(state.position);
        body.setNextKinematicRotation(state.rotation);
      }
    }
  }
  acknowledge(player: PhysicsPlayerState, bodies: BodyState[], full: boolean) {
    const before = this.player.position();
    this.applyBodies(bodies);
    this.player.reconcile(player);
    this.runtime.world.propagateModifiedBodyPositionsToColliders();
    this.history = full
      ? []
      : this.history.filter((input) => input.sequence > player.ackInput);
    this.nextSequence = Math.max(this.nextSequence, player.ackInput + 1);
    for (const input of this.history) {
      this.player.step(input, PHYSICS_DT);
      this.runtime.world.step();
    }
    const after = this.player.position();
    this.lastCorrection = Math.hypot(
      before.x - after.x,
      before.y - after.y,
      before.z - after.z,
    );
    for (const axis of ["x", "y", "z"] as const)
      this.renderOffset[axis] += before[axis] - after[axis];
    if (
      Math.hypot(
        this.renderOffset.x,
        this.renderOffset.y,
        this.renderOffset.z,
      ) > 0.75
    )
      this.renderOffset = { x: 0, y: 0, z: 0 };
  }
  updateVisual(delta: number) {
    const position = this.player.position(),
      decay = Math.exp(-18 * Math.max(0, Math.min(delta, 0.1)));
    for (const axis of ["x", "y", "z"] as const) {
      this.renderOffset[axis] *= decay;
      this.visualPosition[axis] = position[axis] + this.renderOffset[axis];
    }
  }
  advance(
    delta: number,
    input: Omit<Input, "type" | "sequence">,
    send: (input: Input) => void,
  ) {
    this.accumulator += Math.max(0, Math.min(delta, 4 * PHYSICS_DT));
    while (this.accumulator + 1e-9 >= PHYSICS_DT) {
      this.accumulator -= PHYSICS_DT;
      const command: Input = {
        ...input,
        type: "input",
        sequence: this.nextSequence++,
      };
      if (this.history.length >= 60) {
        this.accumulator = 0;
        break;
      }
      this.history.push(command);
      this.player.step(command, PHYSICS_DT);
      this.runtime.world.step();
      send(command);
    }
  }
  pause() {
    this.accumulator = 0;
    this.history = [];
  }
  dispose() {
    this.history = [];
    this.runtime.dispose();
  }
}
