import { expect, test } from "vitest";
import {
  dinosaurPark,
  dinosaurTrail,
  dinosaurHabitats,
  dinosaurWalkable,
  dinosaurPlacementError,
  createDinosaurPark,
  walkSpecs,
  validatePlacement,
} from "./src/index.js";

test("park seeds regenerate the same layout without mutating another scene", () => {
  expect(createDinosaurPark(42)).toEqual(createDinosaurPark(42));
  expect(createDinosaurPark(42).entities).not.toEqual(
    createDinosaurPark(43).entities,
  );
  for (let seed = 0; seed < 32; seed++) {
    const park = createDinosaurPark(seed);
    expect(validatePlacement(park)).toBeNull();
    expect(park.entities.length).toBeGreaterThan(55);
    expect(park.entities.length).toBeLessThan(180);
  }
});

test("the whole loop and entrance corridor stay walkable and free of editable objects", () => {
  const segments = [...dinosaurTrail, dinosaurTrail[0]!, dinosaurPark.gate];
  for (let i = 1; i < segments.length; i++) {
    const a = segments[i - 1]!,
      b = segments[i]!;
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    for (let d = 0; d <= length; d++) {
      for (const offset of [-2, 0, 2]) {
        const x =
          a.x + ((b.x - a.x) * d) / length + ((b.z - a.z) * offset) / length;
        const z =
          a.z + ((b.z - a.z) * d) / length - ((b.x - a.x) * offset) / length;
        expect(dinosaurWalkable(x, z), `${x},${z}`).toBe(true);
        expect(dinosaurPlacementError({ x, z })).not.toBeNull();
      }
    }
  }
  expect(walkSpecs.dinosaur.gates[0]?.dest).toBe("island");
  expect(dinosaurWalkable(0, 75)).toBe(false);
  expect(dinosaurWalkable(90, 0)).toBe(false);
});

test("water, rocks, nests and animal home ranges cannot be planted over", () => {
  for (const point of [
    dinosaurPark.pond,
    ...dinosaurPark.cliffs,
    ...dinosaurPark.nests,
  ]) {
    expect(dinosaurWalkable(point.x, point.z)).toBe(false);
    for (const kind of ["flower", "tree", "bench"] as const)
      expect(dinosaurPlacementError(point, [], undefined, kind)).not.toBeNull();
  }
  for (const h of dinosaurHabitats)
    expect(dinosaurPlacementError(h)).not.toBeNull();
  expect(
    dinosaurPlacementError({ x: -75, z: 55 }, [], undefined, "flower"),
  ).toBeNull();
});
