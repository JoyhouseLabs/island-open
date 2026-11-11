import { describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import {
  starlightRequestSchema,
  starlightStateSchema,
  type StarlightAction,
  type StarlightState,
} from "@island/contracts";
import {
  applyStarlight,
  emptyStarlight,
  HARVEST_COOLDOWN,
  playPlacementError,
  playResourceNodes,
  playObstacles,
  resourceStage,
  walkSpecs,
} from "./src/index.js";
const now = 1_000_000;
const request = (state: StarlightState, action: StarlightAction) => ({
  actionId: randomUUID(),
  expectedRevision: state.revision,
  action,
});
const apply = (s: StarlightState, a: StarlightAction, time = now) =>
  applyStarlight(s, request(s, a), time).state;
const rich = () => ({
  ...emptyStarlight(),
  materials: { branch: 20, pebble: 20, moonfruit: 20 },
});
const at = { x: 8, z: 15, rotation: 0, color: "gold" } as const;

describe("starlight material economy", () => {
  test("all resource points and approach areas are on walkable ground", () => {
    for (const n of playResourceNodes)
      expect(walkSpecs.starlight.walkable(n.x, n.z), n.id).toBe(true);
  });
  test("harvest grants only the defined yield and cooldown uses the supplied server time", () => {
    const n = playResourceNodes[0]!;
    const action: StarlightAction = {
      op: "harvest",
      nodeId: n.id,
      position: { x: n.x, z: n.z },
    };
    const before = emptyStarlight(),
      after = apply(before, action);
    expect(after.materials.moonfruit).toBe(2);
    expect(before.materials.moonfruit).toBe(0);
    expect(resourceStage(after, n.id, now + 1000).label).toBe("刚采过");
    expect(resourceStage(after, n.id, now + 35_000).label).toBe("幼苗");
    expect(resourceStage(after, n.id, now + 65_000).label).toBe("生长中");
    expect(() => apply(after, action, now + HARVEST_COOLDOWN - 1)).toThrow(
      "还在长大",
    );
    expect(
      apply(after, action, now + HARVEST_COOLDOWN).materials.moonfruit,
    ).toBe(4);
  });
  test("far, unknown and overflowing harvests leave the original state untouched", () => {
    const n = playResourceNodes[0]!,
      s = emptyStarlight();
    s.materials.moonfruit = 98;
    expect(() =>
      apply(s, { op: "harvest", nodeId: n.id, position: { x: 0, z: 10 } }),
    ).toThrow("走近");
    expect(() =>
      apply(s, { op: "harvest", nodeId: "made-up", position: { x: 0, z: 10 } }),
    ).toThrow("没有这个");
    expect(() =>
      apply(s, { op: "harvest", nodeId: n.id, position: n }),
    ).toThrow("99");
    expect(s.harvested).toEqual({});
    expect(s.materials.moonfruit).toBe(98);
  });
  test("stale revisions and invalid protocol values cannot spend material", () => {
    const s = rich();
    s.revision = 3;
    expect(() =>
      applyStarlight(
        s,
        {
          ...request(s, { op: "craft", blueprint: "lantern" }),
          expectedRevision: 2,
        },
        now,
      ),
    ).toThrow("另一处");
    for (const position of [
      { x: Infinity, z: 0 },
      { x: 100, z: 0 },
      { x: 0, z: NaN },
    ])
      expect(
        starlightRequestSchema.safeParse(
          request(s, { op: "harvest", nodeId: "fruit-east", position }),
        ).success,
      ).toBe(false);
    expect(
      starlightRequestSchema.safeParse({
        ...request(s, { op: "craft", blueprint: "lantern" }),
        reward: 99,
      }).success,
    ).toBe(false);
    expect(s.materials.branch).toBe(20);
  });
  test("build validates before spending; moving and storing preserve ownership and balances", () => {
    const s = rich();
    expect(() =>
      apply(s, {
        op: "build",
        blueprint: "lantern",
        placement: { ...at, x: 0, z: 10 },
      }),
    ).toThrow("通路");
    expect(s.materials.branch).toBe(20);
    expect(s.structures).toHaveLength(0);
    let next = apply(s, { op: "build", blueprint: "lantern", placement: at });
    expect(next.materials.branch).toBe(18);
    expect(next.materials.pebble).toBe(18);
    const id = next.structures[0]!.id;
    next = apply(next, {
      op: "place",
      id,
      placement: { ...at, x: 9, rotation: 1 },
    });
    next = apply(next, { op: "store", id });
    expect(next.structures[0]!.placement).toBeNull();
    expect(next.materials.branch).toBe(18);
    next = apply(next, { op: "place", id, placement: at });
    expect(next.structures).toHaveLength(1);
    expect(() =>
      apply(next, { op: "place", id: randomUUID(), placement: at }),
    ).toThrow("没有找到");
  });
  test("recipes cannot go negative, structure count is bounded and snack spends exactly three", () => {
    expect(() =>
      apply(emptyStarlight(), { op: "craft", blueprint: "mat" }),
    ).toThrow("还差");
    const s = rich();
    s.structures = Array.from({ length: 24 }, () => ({
      id: randomUUID(),
      blueprint: "basket",
      version: 1,
      placement: null,
    }));
    expect(() => apply(s, { op: "craft", blueprint: "lantern" })).toThrow("24");
    const next = apply(rich(), { op: "snack" });
    expect(next.materials.moonfruit).toBe(17);
    expect(next.snacks).toBe(1);
  });
  test("placement protects gates, spawn, resource access, buildings and exclusive reward colors", () => {
    const s = rich();
    const id = randomUUID();
    for (const p of [
      { x: 0, z: 27 },
      { x: 0, z: 10 },
      { x: 0, z: 0 },
      { x: 11, z: 8 },
      { x: 35, z: 29 },
    ])
      expect(playPlacementError(s, id, { ...at, ...p })).toBeTruthy();
    expect(playPlacementError(s, id, at)).toBeNull();
    expect(playPlacementError(s, id, { ...at, color: "star" })).toContain(
      "试炼",
    );
    expect(
      playPlacementError(s, id, at, [
        { id: randomUUID(), kind: "tree", x: 8, z: 15, seed: 1, growth: 1 },
      ]),
    ).toBeTruthy();
    const placed = apply(s, {
      op: "build",
      blueprint: "lantern",
      placement: at,
    });
    expect(playPlacementError(placed, id, { ...at, x: 8.5 })).toContain("太近");
    expect(playObstacles(placed.structures)).toHaveLength(1);
    const mat = apply(s, { op: "build", blueprint: "mat", placement: at });
    expect(playObstacles(mat.structures)).toHaveLength(0);
  });
});

describe("friendly turn trial", () => {
  const start = () => apply(rich(), { op: "trial.start" });
  test("pause freezes a complete round, resume keeps the same encounter, leaving has no penalty", () => {
    let s = start();
    const id = s.trial!.id;
    s = apply(s, { op: "trial.turn", skill: "observe" });
    const before = structuredClone(s.trial);
    s = apply(s, { op: "trial.pause" });
    expect(() => apply(s, { op: "trial.turn", skill: "beam" })).toThrow(
      "继续试炼",
    );
    expect(() =>
      apply(s, { op: "build", blueprint: "lantern", placement: at }),
    ).toThrow("先退出");
    expect(() => apply(s, { op: "trial.start" })).toThrow("已有试炼");
    s = apply(s, { op: "trial.resume" }, now + 999999);
    expect(s.trial).toEqual(before);
    expect(s.trial!.id).toBe(id);
    s = apply(s, { op: "trial.leave" });
    expect(s.materials).toEqual(rich().materials);
    expect(s.trial!.phase).toBe("abandoned");
  });
  test("observe consumes a turn, guard reduces the announced hit, focus enhances one beam", () => {
    let s = start();
    s = apply(s, { op: "trial.turn", skill: "observe" });
    expect(s.trial!.turn).toBe(2);
    expect(s.trial!.points).toBe(4);
    s = apply(s, { op: "trial.turn", skill: "guard" });
    expect(s.trial!.energy).toBe(8);
    expect(s.trial!.turn).toBe(3);
    s = apply(s, { op: "trial.turn", skill: "beam" });
    expect(s.trial!.shadow).toBe(5);
    expect(s.trial!.focused).toBe(false);
  });
  test("victory grants a durable cosmetic only; repeating a finished action cannot grant more", () => {
    let s = start();
    for (let i = 0; i < 4; i++)
      s = apply(s, { op: "trial.turn", skill: "beam" });
    expect(s.trial!.phase).toBe("won");
    expect(s.starReward).toBe(true);
    expect(s.materials).toEqual(rich().materials);
    expect(() => apply(s, { op: "trial.turn", skill: "beam" })).toThrow(
      "没有进行中",
    );
    expect(
      apply(s, {
        op: "build",
        blueprint: "lantern",
        placement: { ...at, color: "star" },
      }).structures[0]!.placement!.color,
    ).toBe("star");
    expect(starlightStateSchema.safeParse(s).success).toBe(true);
  });
  test("running out of energy preserves material, restart is possible and zero AP cannot cast", () => {
    let s = start();
    s.trial!.points = 0;
    expect(() => apply(s, { op: "trial.turn", skill: "beam" })).toThrow(
      "行动点",
    );
    for (let i = 0; i < 4; i++)
      s = apply(s, { op: "trial.turn", skill: "observe" });
    expect(s.trial!.phase).toBe("rest");
    expect(s.materials).toEqual(rich().materials);
    expect(s.starReward).toBe(false);
    expect(apply(s, { op: "trial.start" }).trial!.energy).toBe(10);
  });
});

describe("expanded trial techniques", () => {
  const start = () => apply(rich(), { op: "trial.start" });
  test("new skills validate but reject insufficient points without altering the snapshot", () => {
    const s = start(),
      before = structuredClone(s);
    for (const skill of ["double", "rush", "moonlight"] as const) {
      expect(
        starlightRequestSchema.safeParse(
          request(s, { op: "trial.turn", skill }),
        ).success,
      ).toBe(true);
      expect(() => apply(s, { op: "trial.turn", skill })).toThrow();
      expect(s).toEqual(before);
    }
    expect(
      starlightRequestSchema.safeParse(
        request(s, { op: "trial.turn", skill: "unknown" } as never),
      ).success,
    ).toBe(false);
  });
  test("double and rush differ in cost and damage, preserving focus for a later beam", () => {
    const s = apply(start(), { op: "trial.turn", skill: "observe" });
    const double = apply(s, { op: "trial.turn", skill: "double" });
    expect(double.trial).toMatchObject({
      points: 3,
      shadow: 6,
      energy: 5,
      focused: true,
      turn: 3,
    });
    const rush = apply(s, { op: "trial.turn", skill: "rush" });
    expect(rush.trial).toMatchObject({
      points: 2,
      shadow: 4,
      energy: 5,
      focused: true,
      turn: 3,
    });
    const win = apply(rush, { op: "trial.turn", skill: "beam" });
    expect(win.trial).toMatchObject({
      phase: "won",
      shadow: 0,
      energy: 5,
      focused: false,
    });
    expect(win.starReward).toBe(true);
  });
  test("recovery caps at ten, precedes response, advances the turn and costs three", () => {
    const s = start();
    Object.assign(s.trial!, { energy: 8, points: 4, turn: 2 });
    const healed = apply(s, { op: "trial.turn", skill: "moonlight" });
    expect(healed.trial).toMatchObject({
      energy: 5,
      points: 3,
      turn: 3,
      shadow: 10,
    });
    expect(healed.trial!.log.at(-1)).toContain("恢复 2");
    const again = apply(healed, { op: "trial.turn", skill: "moonlight" });
    expect(again.trial).toMatchObject({ energy: 9, points: 2, turn: 4 });
    expect(again.materials).toEqual(s.materials);
    const full = start();
    full.trial!.points = 4;
    expect(() => apply(full, { op: "trial.turn", skill: "moonlight" })).toThrow(
      "能量已满",
    );
    const paused = apply(s, { op: "trial.pause" });
    expect(() =>
      apply(paused, { op: "trial.turn", skill: "moonlight" }),
    ).toThrow("继续试炼");
  });
});
