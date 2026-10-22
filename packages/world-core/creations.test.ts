import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  creationBlueprintSchema,
  creationSize,
  sameWorld,
  worldSchema,
  type CreationPlacement,
} from "@island/contracts";
import {
  createWorld,
  creationPlacementError,
  creationObstacles,
  furniturePlacementError,
  diffWorld,
  applyWorldOps,
  canRebase,
  validatePlacement,
} from "./src/index.js";
const part = {
  id: randomUUID(),
  shape: "box" as const,
  color: "#89b7a2",
  x: 0,
  y: 0.5,
  z: 0,
  width: 1,
  height: 1,
  depth: 2,
  rotation: 0 as const,
};
const blueprint = { name: "Test", parts: [part] };
const instance: CreationPlacement = {
  id: randomUUID(),
  definitionId: randomUUID(),
  definitionVersion: 1,
  blueprint,
  x: 0,
  z: 0,
  rotation: 0,
};
function spot() {
  const w = createWorld(14);
  for (let x = -100; x < 100; x += 3)
    for (let z = -60; z < 90; z += 3) {
      const f = { ...instance, x, z };
      if (!creationPlacementError(w, f)) return { w, f };
    }
  throw Error("no valid spot");
}
describe("authored creations", () => {
  it("bounds every part including rotated dimensions, below-ground parts, duplicate IDs and floating designs", () => {
    expect(creationBlueprintSchema.safeParse(blueprint).success).toBe(true);
    for (const patch of [
      { x: 3 },
      { y: 0.125 },
      { width: NaN },
      { width: 0.1 },
      { y: 5.75 },
      { y: 1 },
      { x: 2.5, rotation: 1 },
    ])
      expect(
        creationBlueprintSchema.safeParse({
          ...blueprint,
          parts: [{ ...part, ...patch }],
        }).success,
      ).toBe(false);
    expect(
      creationBlueprintSchema.safeParse({ ...blueprint, parts: [part, part] })
        .success,
    ).toBe(false);
    expect(
      creationBlueprintSchema.safeParse({
        ...blueprint,
        parts: Array.from({ length: 25 }, () => ({
          ...part,
          id: randomUUID(),
        })),
      }).success,
    ).toBe(false);
  });
  it("round trips instances, storage and undo; protects conflicting instances and normalizes JSONB", () => {
    const { w, f } = spot(),
      next = { ...w, creations: [f] };
    expect(applyWorldOps(w, diffWorld(w, next))).toEqual({
      ok: true,
      snapshot: worldSchema.parse(next),
    });
    const stored = { ...next, creations: [] };
    expect(applyWorldOps(next, diffWorld(next, stored))).toEqual({
      ok: true,
      snapshot: worldSchema.parse(stored),
    });
    expect(applyWorldOps(stored, diffWorld(stored, next))).toEqual({
      ok: true,
      snapshot: worldSchema.parse(next),
    });
    expect(
      canRebase(diffWorld(w, next), [
        { op: "creation.put", id: f.id, value: null },
      ]),
    ).toBe(false);
    expect(
      canRebase(diffWorld(w, next), [
        { op: "creation.put", id: randomUUID(), value: null },
      ]),
    ).toBe(true);
    expect(
      applyWorldOps(w, [{ op: "creation.put", id: randomUUID(), value: f }]).ok,
    ).toBe(false);
    expect(worldSchema.safeParse({ ...w, creations: [f, f] }).success).toBe(
      false,
    );
    expect(
      sameWorld(
        next,
        JSON.parse(
          JSON.stringify(next, (k, v) =>
            v && !Array.isArray(v) && typeof v === "object"
              ? Object.fromEntries(Object.entries(v).reverse())
              : v,
          ),
        ),
      ),
    ).toBe(true);
    expect(sameWorld(w, { ...w, creations: [] })).toBe(true);
  });
  it("uses the same rotated footprint for collision and bidirectional overlap checks", () => {
    const { w, f } = spot();
    expect(validatePlacement({ ...w, creations: [f] })).toBeNull();
    expect(creationSize({ ...f, rotation: 1 })).toEqual({ x: 1, z: 0.5 });
    expect(creationObstacles([{ ...f, rotation: 1 }])[0]?.halfSize).toEqual({
      x: 1,
      z: 0.5,
    });
    expect(creationPlacementError({ ...w, scene: "library" }, f)).toBeTruthy();
    expect(
      creationPlacementError(
        { ...w, creations: [f] },
        { ...f, id: randomUUID() },
      ),
    ).toBeTruthy();
    const furniture = {
      id: randomUUID(),
      itemId: "oak-chair" as const,
      x: f.x,
      z: f.z,
      rotation: 0 as const,
    };
    expect(
      creationPlacementError({ ...w, furniture: [furniture] }, f),
    ).toContain("家具");
    expect(
      furniturePlacementError({ ...w, creations: [f] }, furniture),
    ).toBeTruthy();
    expect(creationPlacementError(w, { ...f, x: 150 })).toBeTruthy();
    expect(
      creationPlacementError(
        {
          ...w,
          creations: Array.from({ length: 16 }, () => ({
            ...f,
            id: randomUUID(),
          })),
        },
        f,
      ),
    ).toContain("16");
  });
});
