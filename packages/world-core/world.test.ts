import { describe, it, expect } from "vitest";
import {
  createWorld,
  placementError,
  growWorld,
  validatePlacement,
  walkRoute,
  radial,
  pond,
  zoneAt,
  groundHeight,
  buildings,
  roadSegments,
  landmarks,
} from "./src/index.js";
import { worldSchema } from "@island/contracts";
describe("world invariants", () => {
  it("reproduces fixed worlds without overlapping routes or entrances", () => {
    for (let seed = 0; seed < 30; seed++) {
      const w = createWorld(seed);
      expect(w.entities.length).toBeGreaterThan(40);
      expect(w).toEqual(createWorld(seed));
      expect(validatePlacement(w)).toBeNull();
      expect(worldSchema.safeParse(w).success).toBe(true);
    }
  });
  it("protects water, shore, house and main paths", () => {
    for (const p of [
      { x: pond.x, z: pond.z },
      { x: -28, z: 7 },
      { x: -28, z: 34 },
      { x: 149, z: 0 },
    ])
      expect(placementError(p)).not.toBeNull();
  });
  it("growth is bounded and preserves layout and original snapshot", () => {
    const w = createWorld(7),
      copy = structuredClone(w);
    let grown = w;
    for (let i = 0; i < 20; i++) grown = growWorld(grown);
    expect(w).toEqual(copy);
    expect(grown.entities.every((e) => e.growth === 1)).toBe(true);
    expect(grown.entities.map((e) => [e.id, e.x, e.z])).toEqual(
      w.entities.map((e) => [e.id, e.x, e.z]),
    );
  });
  it("rejects duplicate entity IDs", () => {
    const w = createWorld();
    w.entities.push({ ...w.entities[0]! });
    expect(worldSchema.safeParse(w).success).toBe(false);
  });
  it("keeps the fox route on the island and outside the pond", () => {
    for (let d = 0; d < 1000; d += 0.5) {
      const p = walkRoute(d);
      expect(radial(p.x, p.z)).toBeLessThan(0.85);
      expect(
        Math.hypot(
          (p.x - pond.x) / (pond.rx + 1),
          (p.z - pond.z) / (pond.rz + 1),
        ),
      ).toBeGreaterThan(1);
      for (const b of buildings)
        expect(Math.hypot(p.x - b.x, p.z - b.z)).toBeGreaterThan(8);
    }
  });
  it("keeps meadow open while giving the garden and nursery their own planting rules", () => {
    expect(zoneAt({ x: 20, z: 69 })).toBe("meadow");
    for (const kind of ["tree", "flower", "bench"] as const)
      expect(
        placementError({ x: 20, z: 69 }, [], undefined, kind),
      ).not.toBeNull();
    for (const p of [
      { x: -42, z: 45 },
      { x: 65, z: 27 },
    ]) {
      expect(placementError(p, [], undefined, "tree")).not.toBeNull();
      expect(placementError(p, [], undefined, "flower")).toBeNull();
    }
    for (let seed = 0; seed < 20; seed++) {
      const world = createWorld(seed);
      expect(
        world.entities.filter((e) => zoneAt(e) === "garden").length,
      ).toBeGreaterThan(10);
      expect(
        world.entities.filter((e) => zoneAt(e) === "nursery").length,
      ).toBeGreaterThan(8);
      expect(
        world.entities.filter(
          (e) => zoneAt(e) === "meadow" && e.kind === "tree",
        ),
      ).toHaveLength(0);
    }
  });
  it("connects every destination to one road network and raises a northern ridge", () => {
    const seen = new Set<string>(),
      id = (p: { x: number; z: number }) => `${p.x},${p.z}`;
    const queue = [roadSegments[0]![0]];
    while (queue.length) {
      const p = queue.shift()!;
      if (seen.has(id(p))) continue;
      seen.add(id(p));
      for (const [a, b] of roadSegments) {
        if (id(a) === id(p)) queue.push(b);
        if (id(b) === id(p)) queue.push(a);
      }
    }
    for (const segment of roadSegments)
      for (const p of segment) expect(seen.has(id(p))).toBe(true);
    for (const p of landmarks)
      expect(
        Math.min(
          ...roadSegments.flat().map((q) => Math.hypot(p.x - q.x, p.z - q.z)),
        ),
      ).toBeLessThan(22);
    expect(groundHeight(8, -76)).toBeGreaterThan(35);
    expect(groundHeight(20, 69)).toBeLessThan(8);
  });
  it("uses the new world format and rejects old layouts instead of migrating", () => {
    const world = createWorld();
    expect(world.schemaVersion).toBe(3);
    expect(
      worldSchema.safeParse({
        ...world,
        schemaVersion: 1,
        generatorVersion: "1.0.0",
      }).success,
    ).toBe(false);
  });
});
