import { describe, it, expect } from "vitest";
import {
  worldSchema,
  furnitureCatalog,
  type FurniturePlacement,
} from "@island/contracts";
import {
  createWorld,
  furniturePlacementError,
  validatePlacement,
  furnitureSize,
  furnitureObstacles,
  diffWorld,
  applyWorldOps,
  canRebase,
} from "./src/index.js";
const id = "10000000-0000-4000-8000-000000000001";
function spot(world = createWorld(14)): FurniturePlacement {
  for (let x = -100; x < 100; x += 3)
    for (let z = -60; z < 90; z += 3) {
      const f = {
        id,
        itemId: "oak-chair" as const,
        x,
        z,
        rotation: 0 as const,
      };
      if (!furniturePlacementError(world, f)) return f;
    }
  throw new Error("no spot");
}
describe("purchased furniture layout", () => {
  it("roundtrips placement, move, rotation, storage and undo operations", () => {
    const a = createWorld(14),
      f = spot(a),
      b = { ...a, furniture: [f] };
    const applied = applyWorldOps(a, diffWorld(a, b));
    expect(applied).toEqual({ ok: true, snapshot: worldSchema.parse(b) });
    const moved = { ...b, furniture: [{ ...f, rotation: 1 as const }] };
    expect(applyWorldOps(b, diffWorld(b, moved))).toEqual({
      ok: true,
      snapshot: worldSchema.parse(moved),
    });
    const stored = { ...b, furniture: [] };
    expect(applyWorldOps(b, diffWorld(b, stored))).toEqual({
      ok: true,
      snapshot: worldSchema.parse(stored),
    });
    expect(applyWorldOps(stored, diffWorld(stored, b))).toEqual({
      ok: true,
      snapshot: worldSchema.parse(b),
    });
    expect(canRebase(diffWorld(a, b), diffWorld(b, moved))).toBe(false);
  });
  it("rejects duplicate IDs, unsupported scenes, blocked terrain and overlaps", () => {
    const w = createWorld(14),
      f = spot(w);
    expect(worldSchema.safeParse({ ...w, furniture: [f, f] }).success).toBe(
      false,
    );
    expect(furniturePlacementError({ ...w, scene: "garden" }, f)).toBeTruthy();
    expect(furniturePlacementError(w, { ...f, x: 149, z: 0 })).toBeTruthy();
    expect(
      furniturePlacementError(
        { ...w, furniture: [f] },
        { ...f, id: "10000000-0000-4000-8000-000000000002" },
      ),
    ).toBeTruthy();
    expect(validatePlacement({ ...w, furniture: [f] })).toBeNull();
    expect(
      applyWorldOps(w, [
        {
          op: "furniture.put",
          id: "10000000-0000-4000-8000-000000000002",
          value: f,
        },
      ]).ok,
    ).toBe(false);
  });
  it("uses catalog footprints for rotation and collisions; rugs remain walkable", () => {
    const f = { ...spot(), itemId: "picket-fence" as const };
    expect(furnitureSize({ ...f, rotation: 1 })).toEqual({ x: 0.25, z: 1.8 });
    expect(furnitureObstacles([f, { ...f, itemId: "woven-rug" }])).toHaveLength(
      1,
    );
    expect(new Set(furnitureCatalog.map((d) => d.id)).size).toBe(12);
  });
});
