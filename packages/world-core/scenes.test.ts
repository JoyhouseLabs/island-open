import { expect, test } from "vitest";
import { worldSchema, subSceneIds, type SubSceneId } from "@island/contracts";
import {
  createWorld,
  growWorld,
  landmarks,
  subScenes,
  validatePlacement,
  type Point,
} from "./src/index.js";

const minimumEntities: Record<SubSceneId, number> = {
  garden: 30,
  home: 25,
  meadow: 40,
  forest: 60,
  library: 30,
  pond: 30,
  lab: 30,
  nursery: 60,
  mountain: 30,
  starlight: 45,
  beach: 30,
};

test("every sub-scene is seeded, valid, editable and independent of the island", () => {
  for (const id of subSceneIds) {
    const def = subScenes[id];
    const first = def.create(0);
    expect(first.entities.length, id).toBeGreaterThanOrEqual(
      minimumEntities[id],
    );
    for (let seed = 0; seed < 8; seed++) {
      const scene = def.create(seed);
      expect(scene, id).toEqual(def.create(seed));
      expect(scene.scene, id).toBe(id);
      expect(scene.name, id).toBe(def.title);
      expect(worldSchema.safeParse(scene).success, id).toBe(true);
      expect(validatePlacement(scene), id).toBeNull();
      const main = createWorld(seed),
        before = structuredClone(main);
      growWorld(scene);
      expect(main, id).toEqual(before);
    }
    expect(landmarks.some((l) => l.id === def.landmark), id).toBe(true);
  }
});

test("scene rules protect their signature places", () => {
  const cases: [SubSceneId, Point][] = [
    ["home", { x: 0, z: 0 }],
    ["home", { x: -22, z: -8 }],
    ["home", { x: -9, z: 9 }],
    ["home", { x: 0, z: 10 }],
    ["meadow", { x: -8, z: 8 }],
    ["meadow", { x: 0, z: 30 }],
    ["forest", { x: -8, z: 29 }],
    ["forest", { x: 47, z: 0 }],
    ["library", { x: -18, z: -10 }],
    ["library", { x: 2, z: 0 }],
    ["library", { x: -2, z: 3 }],
    ["pond", { x: 0, z: -6 }],
    ["pond", { x: 14, z: -6 }],
    ["lab", { x: 0, z: -22 }],
    ["lab", { x: 26, z: -2 }],
    ["nursery", { x: 0, z: -14 }],
    ["nursery", { x: -36, z: -2 }],
    ["mountain", { x: 0, z: 1 }],
    ["mountain", { x: 7, z: 28 }],
    ["starlight", { x: 3, z: 0 }],
    ["starlight", { x: 0, z: 27 }],
    ["beach", { x: 0, z: -16 }],
    ["beach", { x: 3, z: -10 }],
    ["beach", { x: 16, z: 10 }],
  ];
  for (const [id, p] of cases)
    expect(subScenes[id].placementError(p), `${id} ${p.x},${p.z}`).not.toBeNull();
});

test("seed beds accept flowers only, and owners keep room to plant", () => {
  expect(
    subScenes.lab.placementError({ x: -16, z: 12 }, [], undefined, "flower"),
  ).toBeNull();
  expect(
    subScenes.lab.placementError({ x: -16, z: 12 }, [], undefined, "tree"),
  ).not.toBeNull();
  expect(
    subScenes.nursery.placementError({ x: -30, z: 6 }, [], undefined, "flower"),
  ).toBeNull();
  expect(
    subScenes.nursery.placementError({ x: -30, z: 6 }, [], undefined, "bench"),
  ).not.toBeNull();
  expect(
    subScenes.mountain.placementError(
      { x: 0, z: 10.2 },
      [],
      undefined,
      "flower",
    ),
  ).not.toBeNull();
  const openSpots: [SubSceneId, Point][] = [
    ["home", { x: 15, z: 22 }],
    ["meadow", { x: 8, z: 24 }],
    ["forest", { x: 0, z: 12 }],
    ["library", { x: 16, z: 6 }],
    ["pond", { x: -24, z: -4 }],
    ["lab", { x: 0, z: -4 }],
    ["nursery", { x: 10, z: -2 }],
    ["mountain", { x: 12, z: 16 }],
    ["starlight", { x: 20, z: 0 }],
    ["beach", { x: 0, z: 22 }],
  ];
  for (const [id, p] of openSpots)
    expect(subScenes[id].placementError(p, [], undefined, "flower")).toBeNull();
});
