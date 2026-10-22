import {
  physicsServerMessageSchema,
  type PhysicsFrame,
  type PhysicsScene,
  type PhysicsRoomCommand,
  type PhysicsServerMessage,
} from "@island/contracts";
import {
  PhysicsFrameBuffer,
  PhysicsPrediction,
} from "@island/physics-core/client";

export class PhysicsConnection {
  prediction: PhysicsPrediction | null = null;
  buffer = new PhysicsFrameBuffer();
  scene: PhysicsScene | null = null;
  you = "";
  canEdit = false;
  status: "connecting" | "connected" | "disconnected" = "connecting";
  message = "正在连接世界…";
  saved = "尚未确认保存";
  pending = false;
  lastActionMs: number | null = null;
  lastVisibleActionMs: number | null = null;
  private visiblePending: {
    type: string;
    objectId: string | null;
    at: number;
  } | null = null;
  inputVisibleMs: number | null = null;
  maxCorrectionMeters = 0;
  private movementAt: number | null = null;
  markMovement() {
    this.movementAt = performance.now();
  }
  moved() {
    if (this.movementAt !== null) {
      this.inputVisibleMs = performance.now() - this.movementAt;
      this.movementAt = null;
    }
  }
  private actionStarted = 0;
  private syncRequestedAt = 0;
  private socket: WebSocket | null = null;
  private disposed = false;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private retryCount = 0;
  private actionSequence = 0;
  private actionTimer: ReturnType<typeof setInterval> | undefined;
  private pendingCommand: PhysicsRoomCommand | null = null;
  private saveId: string | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  constructor(
    readonly sceneId: string,
    readonly token: string | null,
    private changed: () => void,
  ) {
    this.connect();
  }
  get me() {
    return this.buffer.latest?.players.find((player) => player.id === this.you);
  }
  private send(message: unknown) {
    if (this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify(message));
  }
  connect() {
    if (this.disposed) return;
    clearTimeout(this.retry);
    this.socket?.close();
    this.status = "connecting";
    this.changed();
    const url = new URL(
      `/api/physics/scenes/${this.sceneId}/socket`,
      location.origin,
    );
    url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
    if (this.token) url.searchParams.set("t", this.token);
    const socket = new WebSocket(url);
    this.socket = socket;
    let initializing = true;
    const queued: Array<{ frame: PhysicsFrame; at: number }> = [];
    socket.onmessage = (event) => {
      if (this.disposed || this.socket !== socket) return;
      let message: PhysicsServerMessage;
      try {
        message = physicsServerMessageSchema.parse(
          JSON.parse(String(event.data)),
        );
      } catch {
        this.message = "世界数据无法读取，请刷新重试";
        socket.close(4400, "INVALID_SERVER_MESSAGE");
        return;
      }
      if (message.type === "welcome") {
        const welcome = message;
        void PhysicsPrediction.create(welcome.scene, welcome.you)
          .then((prediction) => {
            if (
              this.disposed ||
              this.socket !== socket ||
              socket.readyState !== WebSocket.OPEN
            ) {
              prediction.dispose();
              return;
            }
            this.prediction?.dispose();
            this.prediction = prediction;
            this.scene = welcome.scene;
            this.you = welcome.you;
            this.canEdit = welcome.canEdit;
            this.buffer = new PhysicsFrameBuffer();
            this.actionSequence = 0;
            this.frame(
              welcome.frame,
              queued.length ? queued[0]!.at - 1 : performance.now(),
            );
            for (const entry of queued) this.frame(entry.frame, entry.at);
            initializing = false;
            queued.length = 0;
            this.status = "connected";
            this.retryCount = 0;
            this.message = "已连接，和朋友一起试试物理互动";
            this.saved = welcome.checkpointRevision
              ? `已恢复保存 ${welcome.checkpointRevision}`
              : "等待首次保存";
            this.changed();
          })
          .catch(() => {
            this.message = "物理引擎加载失败，请重新连接";
            socket.close(4400, "PHYSICS_INIT_FAILED");
          });
      } else if (message.type === "frame") {
        if (initializing) {
          queued.push({ frame: message.frame, at: performance.now() });
          if (queued.length > 64) socket.close(1013, "INIT_TOO_SLOW");
        } else this.frame(message.frame, performance.now());
      } else if (message.type === "receipt") {
        if (
          this.pendingCommand &&
          "commandId" in this.pendingCommand &&
          message.commandId === this.pendingCommand.commandId
        ) {
          this.lastActionMs = performance.now() - this.actionStarted;
          const names = {
            grab: "已拿起",
            drop: "已放下",
            toss: "已轻抛",
            push: "已轻推",
          };
          if (!message.ok) this.visiblePending = null;
          this.message = message.ok
            ? names[this.pendingCommand.type as keyof typeof names]
            : message.message;
          this.clearPending();
          this.changed();
        }
      } else if (message.type === "saved") {
        if (message.requestId === this.saveId) {
          this.saveId = null;
          clearTimeout(this.saveTimer);
        }
        this.saved = `已保存 ${new Date(message.savedAt).toLocaleTimeString()} · ${message.revision}`;
        this.changed();
      } else {
        this.message = message.message;
        if (message.requestId === this.saveId) {
          this.saveId = null;
          clearTimeout(this.saveTimer);
          this.saved = "保存未成功，请重试";
        }
        this.clearPending();
        this.changed();
      }
    };
    socket.onclose = (event) => {
      if (this.socket !== socket || this.disposed) return;
      this.status = "disconnected";
      this.prediction?.pause();
      const hadPending = this.pending;
      this.clearPending();
      if (this.saveId) {
        this.saved = "保存结果未确认，重连后核对";
        this.saveId = null;
        clearTimeout(this.saveTimer);
      }
      if (event.code === 4401) this.message = "登录已失效，请重新登录";
      else if (event.code === 4403 && event.reason !== "ACCESS_CHANGED")
        this.message = "世界没有开放或参观链接已失效";
      else
        this.message = hadPending
          ? "连接中断，刚才的操作未确认；重连后请检查物品"
          : "连接中断，正在重新同步…";
      this.changed();
      if (
        [1001, 1006, 1012, 1013, 4408].includes(event.code) ||
        event.reason === "ACCESS_CHANGED"
      ) {
        if (this.retryCount < 5)
          this.retry = setTimeout(
            () => this.connect(),
            Math.min(8000, 500 * 2 ** this.retryCount++),
          );
      }
    };
  }
  private frame(frame: PhysicsFrame, at: number) {
    const hadBaseline = !!this.buffer.latest;
    if (!this.buffer.accept(frame, at)) {
      if (frame.sequence > (this.buffer.latest?.sequence ?? -1)) this.sync();
      return;
    }
    if (frame.full) this.syncRequestedAt = 0;
    const player = this.me;
    if (player && this.prediction) {
      this.prediction.acknowledge(
        player,
        this.buffer.latest!.bodies,
        frame.full,
      );
      if (hadBaseline)
        this.maxCorrectionMeters = Math.max(
          this.maxCorrectionMeters,
          this.prediction.lastCorrection,
        );
    }
    if (this.visiblePending && player) {
      const pending = this.visiblePending;
      if (
        (pending.type === "grab" && player.held === pending.objectId) ||
        (["drop", "toss"].includes(pending.type) && player.held === null)
      ) {
        this.lastVisibleActionMs = performance.now() - pending.at;
        this.visiblePending = null;
      }
    }
    this.changed();
  }
  input(command: PhysicsRoomCommand) {
    if (this.status === "connected") this.send({ type: "command", command });
  }
  action(type: "grab" | "drop" | "push" | "toss", objectId: string | null) {
    if (this.status !== "connected" || this.pending || !this.me?.canInteract)
      return;
    if ((type === "grab" || type === "push") && !objectId) {
      this.message = "先点选一个物品";
      this.changed();
      return;
    }
    const base = {
      layoutRevision: this.buffer.latest!.layoutRevision,
      sequence: this.actionSequence++,
      commandId: crypto.randomUUID(),
    };
    const command: PhysicsRoomCommand =
      type === "grab" || type === "push"
        ? { ...base, type, objectId: objectId! }
        : { ...base, type };
    this.actionStarted = performance.now();
    this.lastVisibleActionMs = null;
    this.visiblePending = { type, objectId, at: this.actionStarted };
    this.pendingCommand = command;
    this.pending = true;
    this.send({ type: "command", command });
    this.changed();
    let attempts = 0;
    this.actionTimer = setInterval(() => {
      if (++attempts > 3) {
        this.clearPending();
        this.message = "操作未确认，请检查物品后重试";
        this.changed();
        return;
      }
      this.send({ type: "command", command });
    }, 700);
  }
  private clearPending() {
    clearInterval(this.actionTimer);
    this.actionTimer = undefined;
    this.pendingCommand = null;
    this.pending = false;
  }
  sync() {
    if (
      this.status !== "connected" ||
      (this.syncRequestedAt && performance.now() - this.syncRequestedAt < 500)
    )
      return;
    this.syncRequestedAt = performance.now();
    this.prediction?.pause();
    this.send({ type: "sync" });
  }
  save() {
    if (this.status !== "connected" || !this.canEdit || this.saveId) return;
    this.saveId = crypto.randomUUID();
    this.saved = "正在保存…";
    this.send({ type: "save", requestId: this.saveId });
    this.changed();
    this.saveTimer = setTimeout(() => {
      this.saveId = null;
      this.saved = "保存结果未确认，请重试";
      this.changed();
    }, 10000);
  }
  dispose() {
    this.disposed = true;
    clearTimeout(this.retry);
    clearTimeout(this.saveTimer);
    this.clearPending();
    this.socket?.close();
    this.prediction?.dispose();
  }
}
