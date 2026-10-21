import { expect, test } from "vitest";
import { worldSchema } from "@island/contracts";
import {
  createGarden,
  createWorld,
  gardenPlacementError,
  validatePlacement,
  growWorld,
} from "./src/index.js";

test("independent gardens are seeded, valid and leave space to edit", () => {
  for (let seed = 0; seed < 30; seed++) {
    const garden = createGarden(seed);
    expect(garden).toEqual(createGarden(seed));
    expect(garden.scene).toBe("garden");
    expect(worldSchema.safeParse(garden).success).toBe(true);
    expect(validatePlacement(garden)).toBeNull();
    expect(garden.entities.length).toBeGreaterThan(30);
    expect(
      gardenPlacementError(
        { x: 18, z: 21 },
        garden.entities,
        undefined,
        "flower",
      ),
    ).toBeNull();
    const main = createWorld(seed),
      before = structuredClone(main);
    growWorld(garden);
    expect(main).toEqual(before);
  }
});
test("garden rules protect paths, greenhouse, pond, tea table and flower beds", () => {
  for (const point of [
    { x: 0, z: 30 },
    { x: 20, z: -1 },
    { x: 23, z: -10 },
    { x: -22, z: -23 },
    { x: -17, z: -10 },
    { x: 41, z: 2 },
  ])
    expect(gardenPlacementError(point, [], undefined, "flower")).not.toBeNull();
  expect(
    gardenPlacementError({ x: 18, z: 21 }, [], undefined, "tree"),
  ).not.toBeNull();
  expect(
    gardenPlacementError({ x: 18, z: 21 }, [], undefined, "bench"),
  ).not.toBeNull();
  expect(
    gardenPlacementError({ x: 18, z: 21 }, [], undefined, "flower"),
  ).toBeNull();
  expect(
    gardenPlacementError({ x: 32, z: 20 }, [], undefined, "tree"),
  ).toBeNull();
});
