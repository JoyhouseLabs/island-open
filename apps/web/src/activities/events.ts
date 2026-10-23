import { inventoryActSchema, type InventoryAction } from "@island/contracts";
type Event = { type: string; detail?: string };
type Request = {
  accountId: string;
  idempotencyKey: string;
  action: InventoryAction;
};
type Entry = { createdAt: number; request: Request };
type StoragePort = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem" | "key" | "length"
>;
/** One immutable storage key per action: independent tabs cannot overwrite each other's queue. */
export class ActivityEvents {
  private memory = new Map<string, Entry>();
  private running: Promise<void> | null = null;
  readonly prefix: string;
  constructor(
    readonly accountId: string,
    private storage: StoragePort,
    private send: (request: Request) => Promise<unknown>,
    private rejected: (error: unknown) => boolean = () => false,
  ) {
    this.prefix = `island-account-action-v2:${accountId}:`;
  }
  private entries() {
    const all = new Map(this.memory);
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (!key?.startsWith(this.prefix)) continue;
      const raw = this.storage.getItem(key);
      if (!raw) continue;
      const entry = JSON.parse(raw) as Entry;
      const request = inventoryActSchema.parse(entry.request);
      if (
        request.accountId !== this.accountId ||
        key !== this.prefix + request.idempotencyKey ||
        !Number.isFinite(entry.createdAt)
      )
        throw new Error("本机活动记录格式不正确，请保留数据后重试");
      all.set(key, { createdAt: entry.createdAt, request: request as Request });
    }
    return [...all].sort(
      (a, b) => a[1].createdAt - b[1].createdAt || a[0].localeCompare(b[0]),
    );
  }
  get pending() {
    return this.entries().length;
  }
  record(event: Event) {
    this.enqueue({ op: "event", ...event });
  }
  enqueue(action: InventoryAction) {
    if (this.pending >= 500)
      throw new Error("待同步记录较多，请连接网络后继续");
    const request = inventoryActSchema.parse({
      accountId: this.accountId,
      idempotencyKey: crypto.randomUUID(),
      action,
    }) as Request;
    const key = this.prefix + request.idempotencyKey,
      entry = { createdAt: Date.now(), request };
    this.memory.set(key, entry);
    this.storage.setItem(key, JSON.stringify(entry));
  }
  flush() {
    if (this.running) return this.running;
    this.running = (async () => {
      // Also retries a previous storage failure before sending anything.
      for (const [key, entry] of this.memory)
        this.storage.setItem(key, JSON.stringify(entry));
      for (;;) {
        const next = this.entries()[0];
        if (!next) return;
        const [key, entry] = next;
        try {
          await this.send(entry.request);
        } catch (error) {
          if (this.rejected(error)) {
            this.storage.removeItem(key);
            this.memory.delete(key);
          }
          throw error;
        }
        this.storage.removeItem(key);
        this.memory.delete(key);
      }
    })().finally(() => {
      this.running = null;
    });
    return this.running;
  }
}
