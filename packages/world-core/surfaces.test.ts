import { expect, test } from "vitest";
import { furnitureCatalog } from "@island/contracts";
import {
  benchGeometry,
  entitySurfaces,
  furnitureObstacles,
  furnitureSurfaces,
  gardenTeaNook,
  islandRocks,
  picnicCrate,
  sceneStatics,
  staticObstacles,
  surfaceObstacle,
  walkObstacles,
} from "./src/index.js";

test("solid surfaces always carry a footprint, through surfaces never do", () => {
  for (const p of Object.values(entitySurfaces)) {
    if (p.pass === "solid")
      expect(p.r !== undefined || p.halfSize !== undefined, p).toBe(true);
  }
  expect(surfaceObstacle(entitySurfaces.flower, 0, 0)).toBeNull();
});

test("the bench surface matches the shared bench geometry", () => {
  const bench = entitySurfaces.bench;
  expect(bench.standY).toBe(benchGeometry.seatY);
  expect(bench.halfSize).toEqual({
    x: benchGeometry.halfLength,
    z: benchGeometry.seatHalfDepth,
  });
});

test("walkObstacles gives a bench its full seat footprint", () => {
  const bench = walkObstacles("meadow", [{ kind: "bench", x: 8, z: 2 }]).find(
    (o) => o.x === 8 && o.z === 2,
  );
  expect(bench).toMatchObject({
    x: 8,
    z: 2,
    standY: benchGeometry.seatY,
    halfSize: { x: benchGeometry.halfLength, z: benchGeometry.seatHalfDepth },
  });
});

test("trees block by the trunk, flowers never block", () => {
  const list = walkObstacles("forest", [
    { kind: "tree", x: 0, z: 0 },
    { kind: "flower", x: 5, z: 5 },
  ]);
  expect(list).toHaveLength(1);
  expect(list[0]).toMatchObject({ x: 0, z: 0, r: 0.55 });
});

test("place props scale footprint and stand height together", () => {
  const [rock] = walkObstacles("place-x", [], {
    props: [{ kind: "rock", x: 0, z: 0, seed: 1, scale: 1.5 }],
  });
  expect(rock).toBeTruthy();
  expect(rock!.r).toBeCloseTo(1.65, 10);
  expect(rock!.standY).toBeCloseTo(0.825, 10);
});

test("place ponds are visual water and never collide", () => {
  expect(
    walkObstacles("place-x", [], {
      props: [{ kind: "pond", x: 0, z: 0, seed: 1, scale: 1 }],
    }),
  ).toHaveLength(0);
});

test("furniture colliders follow the shape registry", () => {
  const obs = furnitureObstacles([
    { id: "a", itemId: "woven-rug", x: 0, z: 0, rotation: 0 },
    { id: "b", itemId: "oak-chair", x: 5, z: 5, rotation: 0 },
  ]);
  expect(obs).toHaveLength(1);
  expect(obs[0]).toMatchObject({ x: 5, z: 5 });
  // The Record type forces registration at compile time; this keeps the
  // catalog and the registry honest about each other at runtime.
  for (const item of furnitureCatalog)
    expect(furnitureSurfaces[item.shape].pass).toBeDefined();
});

test("island fence runs block as full rectangles along their true lines", () => {
  const fences = sceneStatics.island.filter((s) => s.kind === "fence");
  expect(fences).toHaveLength(4);
  expect(fences).toContainEqual(
    expect.objectContaining({ x: -53, z: 50, halfSize: { x: 0.35, z: 11 } }),
  );
  expect(fences).toContainEqual(
    expect.objectContaining({ x: -3, z: 51, halfSize: { x: 0.35, z: 10 } }),
  );
  expect(fences).toContainEqual(
    expect.objectContaining({ x: -42, z: 63, halfSize: { x: 9.5, z: 0.35 } }),
  );
  expect(fences).toContainEqual(
    expect.objectContaining({ x: -14, z: 63, halfSize: { x: 9.5, z: 0.35 } }),
  );
});

test("island structures that used to be walk-through now block", () => {
  const byKind = new Map(sceneStatics.island.map((s) => [s.kind, s]));
  const crate = byKind.get("picnic-crate");
  expect(crate).toMatchObject({
    x: picnicCrate.x,
    z: picnicCrate.z,
    standY: 1.35,
  });
  expect(byKind.get("shed")).toMatchObject({
    x: 74,
    z: 45,
    halfSize: { x: 1.7, z: 1.0 },
  });
  expect(byKind.has("arch-post")).toBe(true);
});

test("the picnic crate world position matches the mat's rotated offset", () => {
  expect(picnicCrate.x).toBeCloseTo(19.734, 2);
  expect(picnicCrate.z).toBeCloseTo(73.412, 2);
});

test("island rocks come from the one shared seeded stream", () => {
  const rocks = sceneStatics.island.filter((s) => s.kind === "rock");
  expect(rocks).toHaveLength(16);
  const first = islandRocks()[0]!;
  expect(rocks[0]).toMatchObject({ x: first.x, z: first.z, r: first.size * 0.8 });
});

test("the mountain trail bench is an entity, never a static", () => {
  expect(sceneStatics.mountain.map((s) => s.kind)).toEqual(["platform"]);
});

test("beach umbrella, driftwood and palms derive from beachFeatures", () => {
  expect(sceneStatics.beach.map((s) => s.kind).sort()).toEqual([
    "driftwood",
    "palm",
    "palm",
    "umbrella",
  ]);
});

test("garden tea-nook crates sit symmetric beside the table", () => {
  const crates = sceneStatics.garden.filter((s) => s.kind === "crate");
  expect(crates.map((c) => c.x)).toEqual([
    gardenTeaNook.table.x - gardenTeaNook.crateOffset,
    gardenTeaNook.table.x + gardenTeaNook.crateOffset,
  ]);
  expect(crates.every((c) => c.z === gardenTeaNook.table.z)).toBe(true);
  expect(crates.every((c) => c.standY === 1.6)).toBe(true);
});

test("walkObstacles stacks statics, entities and place props", () => {
  const list = walkObstacles("starlight", [{ kind: "tree", x: 3, z: 4 }]);
  // cave + nine standing stones + one tree trunk
  expect(list).toHaveLength(1 + 9 + 1);
});

test("unknown scenes fall back to no static obstacles", () => {
  expect(staticObstacles("nowhere")).toEqual([]);
  expect(walkObstacles("nowhere", [])).toEqual([]);
});
