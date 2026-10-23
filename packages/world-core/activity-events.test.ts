import { expect, it } from "vitest";
import { ActivityEvents } from "../../apps/web/src/activities/events";
const user = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  };
}
it("retries persisted account activities with the same request and isolates accounts", async () => {
  const storage = memoryStorage(),
    requests: unknown[] = [];
  const first = new ActivityEvents(user, storage, async (request) => {
    requests.push(structuredClone(request));
    throw new Error("lost response");
  });
  first.record({ type: "book.opened", detail: "qianziwen" });
  await expect(first.flush()).rejects.toThrow("lost response");
  const next = new ActivityEvents(user, storage, async (request) => {
    requests.push(structuredClone(request));
  });
  await next.flush();
  expect(requests[1]).toEqual(requests[0]);
  let sent = false;
  await new ActivityEvents(other, storage, async () => {
    sent = true;
  }).flush();
  expect(sent).toBe(false);
  await next.flush();
  expect(requests).toHaveLength(2);
  expect(storage.length).toBe(0);
});
it("keeps unsaved activity requests in memory until local persistence recovers", async () => {
  let failing = true,
    count = 0;
  const storage = memoryStorage(),
    set = storage.setItem;
  storage.setItem = (k, v) => {
    if (failing) throw Error("full");
    set(k, v);
  };
  const store = new ActivityEvents(user, storage, async () => {
    count++;
  });
  expect(() => store.record({ type: "note.written" })).toThrow("full");
  await expect(store.flush()).rejects.toThrow("full");
  expect(count).toBe(0);
  failing = false;
  await store.flush();
  expect(count).toBe(1);
  expect(store.pending).toBe(0);
});
it("independent tabs never overwrite each other's actions and retries retain operation identities", async () => {
  const storage = memoryStorage(),
    received = new Map<string, unknown>();
  const send = async (request: { idempotencyKey: string }) => {
    received.set(request.idempotencyKey, structuredClone(request));
    await Promise.resolve();
  };
  const left = new ActivityEvents(user, storage, send),
    right = new ActivityEvents(user, storage, send);
  left.record({ type: "book.page_read", detail: "qianziwen" });
  right.record({ type: "note.written" });
  expect(left.pending).toBe(2);
  expect(right.pending).toBe(2);
  await Promise.all([left.flush(), right.flush()]);
  expect(received.size).toBe(2);
  expect(storage.length).toBe(0);
  expect(left.pending).toBe(0);
  expect(right.pending).toBe(0);
});
it("only confirmed permanent rejections leave the queue; authentication and uncertain outcomes remain retryable", async () => {
  const storage = memoryStorage();
  let error = "account changed";
  const queue = new ActivityEvents(
    user,
    storage,
    async () => {
      if (error) throw Error(error);
    },
    (e) => (e as Error).message === "not enough stars",
  );
  queue.enqueue({ op: "buy", itemId: "hat-copter" });
  await expect(queue.flush()).rejects.toThrow("account changed");
  expect(queue.pending).toBe(1);
  error = "not enough stars";
  await expect(queue.flush()).rejects.toThrow(error);
  expect(queue.pending).toBe(0);
  error = "";
  queue.record({ type: "note.written" });
  await queue.flush();
  expect(queue.pending).toBe(0);
});
