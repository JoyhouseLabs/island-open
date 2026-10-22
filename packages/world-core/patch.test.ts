import { describe, it, expect } from "vitest";
import { createWorld } from "./src/index.js";
import { applyWorldOps, canRebase, diffWorld, terrainScale } from "./src/patch.js";

describe("world patches", () => {
  it("diffs a rename, a season and one new plant into small operations", () => {
    const base = createWorld(4, "原来的岛");
    const plant = {
      id: "new-flower",
      kind: "flower" as const,
      x: 0,
      z: 0,
      seed: 3,
      growth: 1,
    };
    const next = {
      ...base,
      name: "新的岛",
      environment: { ...base.environment, season: "winter" as const },
      entities: [...base.entities, plant],
    };
    const ops = diffWorld(base, next);
    expect(ops.map((op) => op.op)).toEqual(["rename", "environment", "place"]);
    expect(terrainScale(ops)).toBe(false);
    const applied = applyWorldOps(base, ops);
    expect(applied.ok).toBe(true);
    if (applied.ok) expect(applied.snapshot).toEqual(next);
  });

  it("rebases two plants and refuses two seasons", () => {
    const base = createWorld(4);
    const flower = (id: string, x: number) => ({
      id,
      kind: "flower" as const,
      x,
      z: 0,
      seed: 1,
      growth: 1,
    });
    const left = diffWorld(base, {
      ...base,
      entities: [...base.entities, flower("a", 1)],
    });
    const right = diffWorld(base, {
      ...base,
      entities: [...base.entities, flower("b", 8)],
    });
    expect(canRebase(left, right)).toBe(true);
    const first = applyWorldOps(base, left);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = applyWorldOps(first.snapshot, right);
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.snapshot.entities.some((e) => e.id === "a")).toBe(true);
      expect(second.snapshot.entities.some((e) => e.id === "b")).toBe(true);
    }
    const winter = diffWorld(base, {
      ...base,
      environment: { hour: 20, season: "winter" },
    });
    const spring = diffWorld(base, {
      ...base,
      environment: { hour: 8, season: "spring" },
    });
    expect(canRebase(winter, spring)).toBe(false);
  });

  it("treats a whole-island growth as terrain and keeps the seed fixed", () => {
    const base = createWorld(4);
    const grown = {
      ...base,
      entities: base.entities.map((e) => ({ ...e, growth: Math.min(1, e.growth + 0.12) })),
    };
    expect(terrainScale(diffWorld(base, grown))).toBe(true);
    const replaced = applyWorldOps(base, [{ op: "replace", snapshot: { ...grown, seed: 9 } }]);
    expect(replaced).toEqual({ ok: false, code: "INVALID" });
  });
});
