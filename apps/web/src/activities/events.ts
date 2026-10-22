import { inventoryActSchema } from "@island/contracts";
type Event = { type: string; detail?: string };
type Request = {
  accountId: string;
  idempotencyKey: string;
  action: Event & { op: "event" };
};
/** Account-scoped write-ahead events; the API checks accountId against its session. */
export class ActivityEvents {
  private queue: Request[] = [];
  private running: Promise<void> | null = null;
  private key: string;
  constructor(
    readonly accountId: string,
    private storage: Pick<Storage, "getItem" | "setItem">,
    private send: (request: Request) => Promise<unknown>,
  ) {
    this.key = `island-account-events-v1:${accountId}`;
    const saved = JSON.parse(storage.getItem(this.key) ?? "[]") as unknown;
    if (!Array.isArray(saved) || saved.length > 500)
      throw new Error("活动记录无法读取，请保留本机数据后重试");
    this.queue = saved.map((value) => {
      const parsed = inventoryActSchema.parse(value);
      if (parsed.accountId !== accountId || parsed.action.op !== "event")
        throw new Error("活动记录账号不一致");
      return parsed as Request;
    });
  }
  private persist() {
    this.storage.setItem(this.key, JSON.stringify(this.queue));
  }
  record(event: Event) {
    if (this.queue.length >= 500)
      throw new Error("待同步活动较多，请连接网络后继续");
    this.queue.push({
      accountId: this.accountId,
      idempotencyKey: crypto.randomUUID(),
      action: { op: "event", ...event },
    });
    this.persist();
  }
  flush() {
    if (this.running) return this.running;
    this.running = (async () => {
      // Persist before sending, including a previous storage failure.
      this.persist();
      while (this.queue.length) {
        await this.send(this.queue[0]!);
        this.queue.shift();
        this.persist();
      }
    })().finally(() => {
      this.running = null;
    });
    return this.running;
  }
}
