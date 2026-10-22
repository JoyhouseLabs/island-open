import {
  explorationStateSchema,
  saveExplorationSchema,
  type ExplorationRecord,
  type ExplorationState,
  type SaveExploration,
} from "@island/contracts";
import {
  CAMP,
  CHUNK_SIZE,
  WILDERNESS_VERSION,
  chunkAt,
} from "@island/world-core";
export function blankExploration(seed: number): ExplorationState {
  return {
    generatorVersion: WILDERNESS_VERSION,
    seed,
    position: { chunk: { x: 0, z: 0 }, x: CAMP.x, z: CAMP.z - 8 },
    explored: [],
    discoveries: [],
  };
}
export function unpackPosition(state: ExplorationState) {
  return {
    x: state.position.chunk.x * CHUNK_SIZE + state.position.x,
    z: state.position.chunk.z * CHUNK_SIZE + state.position.z,
  };
}
export function packPosition(
  x: number,
  z: number,
): ExplorationState["position"] {
  const chunk = chunkAt(x, z);
  return { chunk, x: x - chunk.x * CHUNK_SIZE, z: z - chunk.z * CHUNK_SIZE };
}
type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
type Transport = {
  read(): Promise<ExplorationRecord>;
  save(request: SaveExploration): Promise<ExplorationRecord>;
};
export type JournalStatus =
  "loading" | "local" | "dirty" | "synced" | "offline" | "conflict";
/** Local write-ahead snapshot + optimistic cloud revision. A pending request is retried verbatim. */
export class ExplorationJournal {
  state: ExplorationState;
  revision = 0;
  ready = false;
  status: JournalStatus = "loading";
  storageFailed = false;
  private dirty = false;
  private pending: SaveExploration | null = null;
  private busy: Promise<void> | null = null;
  private loadTask: Promise<void> | null = null;
  private listeners = new Set<() => void>();
  constructor(
    readonly key: string,
    readonly seed: number,
    private storage: Storage,
    private remote?: Transport,
  ) {
    this.state = blankExploration(seed);
    try {
      const raw = storage.getItem(key);
      if (raw) {
        const saved = JSON.parse(raw),
          parsed = explorationStateSchema.safeParse(saved.state);
        if (
          !parsed.success ||
          parsed.data.seed !== seed ||
          !Number.isInteger(saved.revision) ||
          saved.revision < 0 ||
          typeof saved.dirty !== "boolean"
        )
          throw Error("invalid local exploration");
        this.state = parsed.data;
        this.revision = saved.revision;
        this.dirty = saved.dirty;
        if (saved.pending)
          this.pending = saveExplorationSchema.parse(saved.pending);
      }
    } catch {
      this.storageFailed = true;
      try {
        const raw = storage.getItem(key);
        if (raw) storage.setItem(`${key}:invalid-backup`, raw);
      } catch {
        /* Storage may be unavailable. */
      }
    }
  }
  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };
  private emit() {
    for (const cb of this.listeners) cb();
  }
  private persist() {
    try {
      this.storage.setItem(
        this.key,
        JSON.stringify({
          state: this.state,
          revision: this.revision,
          dirty: this.dirty,
          pending: this.pending,
        }),
      );
      this.storageFailed = false;
    } catch {
      this.storageFailed = true;
    }
  }
  private validate(record: ExplorationRecord) {
    if (!Number.isInteger(record.revision) || record.revision < 0)
      throw Error("invalid revision");
    if (
      record.state &&
      explorationStateSchema.parse(record.state).seed !== this.seed
    )
      throw Error("wrong world seed");
    return record;
  }
  load(): Promise<void> {
    return (this.loadTask ??= this.initialize());
  }
  private async initialize() {
    if (this.ready) return;
    if (!this.remote) {
      this.ready = true;
      this.status = "local";
      this.emit();
      return;
    }
    try {
      const record = this.validate(await this.remote.read());
      if (this.pending && record.mutationId === this.pending.mutationId) {
        this.revision = record.revision;
        this.pending = null;
        this.dirty =
          JSON.stringify(this.state) !== JSON.stringify(record.state);
      }
      if (this.dirty && this.revision !== record.revision)
        this.status = "conflict";
      else if (this.dirty) this.status = "dirty";
      else {
        this.state = record.state ?? blankExploration(this.seed);
        this.revision = record.revision;
        this.status = "synced";
      }
      this.persist();
    } catch {
      this.status = "offline";
    }
    this.ready = true;
    this.emit();
  }
  update(state: ExplorationState) {
    if (JSON.stringify(state) === JSON.stringify(this.state)) return;
    this.state = state;
    this.dirty = true;
    if (this.status !== "conflict")
      this.status = this.remote ? "dirty" : "local";
    this.persist();
    this.emit();
  }
  flush(): Promise<void> {
    if (this.busy) return this.busy;
    if (
      !this.remote ||
      !this.ready ||
      this.status === "conflict" ||
      (!this.dirty && !this.pending)
    )
      return Promise.resolve();
    this.busy = (async () => {
      for (
        let attempt = 0;
        attempt < 2 && (this.dirty || this.pending);
        attempt++
      ) {
        await this.send();
        if (this.status === "offline" || this.status === "conflict") break;
      }
    })().finally(() => {
      this.busy = null;
    });
    return this.busy;
  }
  async saveBeforeLeave() {
    await this.load();
    await this.flush();
    if (this.remote && (this.status !== "synced" || this.dirty || this.pending))
      throw new Error(
        this.status === "conflict"
          ? "请先处理另一台设备的探索进度，再返回公园"
          : "探索进度尚未同步，请重试保存后返回公园",
      );
    if (this.storageFailed)
      throw new Error("本机保存失败，请保持页面打开并重试");
  }
  private async send() {
    const request = this.pending ?? {
      revision: this.revision,
      mutationId: crypto.randomUUID(),
      state: this.state,
    };
    this.pending = request;
    this.persist();
    try {
      const record = this.validate(await this.remote!.save(request));
      this.revision = record.revision;
      this.pending = null;
      this.dirty = JSON.stringify(this.state) !== JSON.stringify(request.state);
      this.status = this.dirty ? "dirty" : "synced";
      this.persist();
    } catch (e) {
      this.status =
        (e as { status?: number }).status === 409 ? "conflict" : "offline";
    }
    this.emit();
  }
  /** Explicit conflict resolution. Keeps the previous local snapshot as a backup. */
  async resolve(choice: "cloud" | "local") {
    if (!this.remote || this.busy) return;
    try {
      const record = this.validate(await this.remote.read());
      this.storage.setItem(`${this.key}:backup`, JSON.stringify(this.state));
      this.revision = record.revision;
      this.pending = null;
      if (choice === "cloud") {
        this.state = record.state ?? blankExploration(this.seed);
        this.dirty = false;
        this.status = "synced";
      } else {
        this.dirty = true;
        this.status = "dirty";
      }
      this.persist();
      this.emit();
      if (choice === "local") await this.flush();
    } catch {
      this.status = "offline";
      this.emit();
    }
  }
}
