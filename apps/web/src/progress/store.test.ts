import { beforeEach, expect, test, vi } from "vitest";
import { emptyGrowth } from "@island/world-core";
vi.mock("../api", () => ({
  api: vi.fn(),
  RequestError: class extends Error {},
}));
vi.mock("../drafts", () => ({
  readDraft: vi.fn(async () => null),
  writeDraft: vi.fn(async () => {}),
}));
import { api } from "../api";
import { writeDraft } from "../drafts";
import { GrowthStore } from "./store";
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const remote = (stars: number) => ({ ...emptyGrowth(), stars, fresh: false });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("window", { addEventListener() {}, setTimeout, clearTimeout });
});
test("switching accounts clears visible data immediately and ignores late reads", async () => {
  let old!: (value: unknown) => void;
  vi.mocked(api)
    .mockImplementationOnce(
      () =>
        new Promise((r) => {
          old = r;
        }),
    )
    .mockResolvedValueOnce(remote(8));
  const store = new GrowthStore();
  await store.load();
  store.bind("a");
  store.state = { ...emptyGrowth(), stars: 100 };
  store.bind("b");
  expect(store.state.stars).toBe(0);
  await tick();
  expect(store.state.stars).toBe(8);
  old(remote(100));
  await tick();
  expect(store.state.stars).toBe(8);
  expect(
    vi.mocked(writeDraft).mock.calls.every(([key]) => key !== "growth-v1:a"),
  ).toBe(true);
});
test("late mutation responses cannot restore the logged-out account", async () => {
  let action!: (value: unknown) => void;
  vi.mocked(api)
    .mockResolvedValueOnce(remote(8))
    .mockImplementationOnce(
      () =>
        new Promise((r) => {
          action = r;
        }),
    );
  const store = new GrowthStore();
  await store.load();
  store.bind("a");
  await tick();
  store.collect("shell", "贝壳");
  store.bind(null);
  expect(store.state.stars).toBe(0);
  action(remote(99));
  await tick();
  expect(store.state.stars).toBe(0);
});
test("failed account reads never expose the previous account as offline stock", async () => {
  vi.mocked(api)
    .mockResolvedValueOnce(remote(20))
    .mockRejectedValueOnce(Error("offline"));
  const store = new GrowthStore();
  await store.load();
  store.bind("a");
  await tick();
  store.bind("b");
  await tick();
  expect(store.state.stars).toBe(0);
});
