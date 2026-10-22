import { expect, it } from "vitest";
import { ActivityEvents } from "../../apps/web/src/activities/events";
it("retries persisted account activities with the same request and isolates accounts", async () => {
  const data = new Map<string, string>(),
    storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => {
        data.set(k, v);
      },
    };
  const user = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const requests: unknown[] = [];
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
});
it("keeps unsaved activity requests in memory until local persistence can recover", async () => {
  let failing = true,
    count = 0;
  const store = new ActivityEvents(
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    {
      getItem: () => null,
      setItem: () => {
        if (failing) throw Error("full");
      },
    },
    async () => {
      count++;
    },
  );
  expect(() => store.record({ type: "note.written" })).toThrow("full");
  await expect(store.flush()).rejects.toThrow("full");
  expect(count).toBe(0);
  failing = false;
  await store.flush();
  expect(count).toBe(1);
});
