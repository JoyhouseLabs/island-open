import { expect, test } from "vitest";
import {
  applyGrowthEvent,
  buyUnlock,
  emptyGrowth,
  starterTasks,
  taskProgress,
  unlocks,
} from "./src/index.js";

test("events fold into counts, stars and deeds; completion happens once", () => {
  let state = emptyGrowth();
  for (let i = 0; i < 3; i++)
    state = applyGrowthEvent(state, { type: "flower.planted" }).state;
  const green = starterTasks.find((t) => t.id === "green-thumb")!;
  expect(state.done[green.id]).toBe(true);
  expect(state.stars).toBe(1);
  expect(state.deeds[0]!.text).toContain("绿手指");

  // Completing again must not double-award.
  const again = applyGrowthEvent(state, { type: "flower.planted" });
  expect(again.completed).toHaveLength(0);
  expect(again.state.stars).toBe(1);
});

test("detail-qualified goals only match their own detail", () => {
  let state = emptyGrowth();
  state = applyGrowthEvent(state, { type: "weather.changed", detail: "sun" }).state;
  state = applyGrowthEvent(state, { type: "book.page_read", detail: "lunyu-xueer" })
    .state;
  const storm = starterTasks.find((t) => t.id === "storm-watcher")!;
  const page = starterTasks.find((t) => t.id === "page-of-light")!;
  expect(state.done[storm.id]).toBeUndefined();
  expect(state.done[page.id]).toBeUndefined();
  state = applyGrowthEvent(state, { type: "weather.changed", detail: "thunder" }).state;
  state = applyGrowthEvent(state, { type: "book.page_read", detail: "qianziwen" })
    .state;
  expect(state.done[storm.id]).toBe(true);
  expect(state.done[page.id]).toBe(true);
});

test("progress reporting is capped at the goal", () => {
  let state = emptyGrowth();
  state = applyGrowthEvent(state, { type: "animal.petted" }).state;
  const friends = starterTasks.find((t) => t.id === "three-friends")!;
  expect(taskProgress(state, friends)).toBe(1);
  for (let i = 0; i < 5; i++)
    state = applyGrowthEvent(state, { type: "animal.petted" }).state;
  expect(taskProgress(state, friends)).toBe(3);
});

test("detail-free goals aggregate every detail of the same event type", () => {
  let state = emptyGrowth();
  state = applyGrowthEvent(state, { type: "scene.visited", detail: "library" }).state;
  state = applyGrowthEvent(state, { type: "scene.visited", detail: "garden" }).state;
  expect(
    state.done["wanderer"],
    "two visits of three should not complete the task",
  ).toBeUndefined();
  state = applyGrowthEvent(state, { type: "scene.visited", detail: "home" }).state;
  expect(state.done["wanderer"]).toBe(true);
  expect(state.stars).toBe(2);
});

test("stars buy unlocks once, and only when affordable", () => {
  let state = emptyGrowth();
  state = { ...state, stars: 4 };
  const crown = unlocks.find((u) => u.id === "hat-starcrown")!;
  const poor = buyUnlock(state, "resident-wolf");
  expect(poor.ok).toBe(false);
  expect(poor.error).toContain("还差");
  const bought = buyUnlock(state, crown.id);
  expect(bought.ok).toBe(true);
  expect(bought.state.stars).toBe(1);
  expect(bought.state.owned[crown.id]).toBe(true);
  expect(bought.state.deeds[0]!.text).toContain("星星冠");
  const again = buyUnlock(bought.state, crown.id);
  expect(again.ok).toBe(false);
  expect(again.state.stars).toBe(1);
});
