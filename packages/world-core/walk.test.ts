import { expect, test } from "vitest";
import { subSceneIds } from "@island/contracts";
import { walkSpecs } from "./src/index.js";

test("every scene spawns on walkable ground near its gate", () => {
  for (const id of ["island", ...subSceneIds] as const) {
    const spec = walkSpecs[id];
    expect(spec.walkable(spec.spawn.x, spec.spawn.z), id).toBe(true);
    // A step inward from spawn must also be walkable, and the scene keeps
    // the player from walking out of its own bounds.
    expect(
      spec.walkable(spec.spawn.x, spec.spawn.z - 1.5) ||
        spec.walkable(spec.spawn.x, spec.spawn.z + 1.5),
      id,
    ).toBe(true);
    expect(spec.gates.length, id).toBeGreaterThan(0);
  }
  expect(walkSpecs.island.gates.length).toBe(subSceneIds.length);
  // Every island gate can be reached on foot from at least one direction.
  for (const gate of walkSpecs.island.gates) {
    const reachable = [0, 12, 24]
      .flatMap((r) =>
        [
          [0, r],
          [0, -r],
          [r, 0],
          [-r, 0],
          [r * 0.7, r * 0.7],
          [-r * 0.7, r * 0.7],
          [r * 0.7, -r * 0.7],
          [-r * 0.7, -r * 0.7],
        ],
      )
      .some(([dx, dz]) =>
        walkSpecs.island.walkable(gate.x + dx, gate.z + dz),
      );
    expect(reachable, gate.dest).toBe(true);
  }
});

test("rooms block water and buildings the resident cannot cross", () => {
  expect(walkSpecs.pond.walkable(0, -6)).toBe(false);
  expect(walkSpecs.pond.walkable(14, -6)).toBe(true);
  expect(walkSpecs.beach.walkable(0, -30)).toBe(false);
  expect(walkSpecs.beach.walkable(0, 20)).toBe(true);
  expect(walkSpecs.home.walkable(-22, -13)).toBe(false);
  expect(walkSpecs.mountain.walkable(0, 0)).toBe(false);
  expect(walkSpecs.mountain.height(0, 0)).toBe(16);
  expect(walkSpecs.island.walkable(0, 0)).toBe(true);
  expect(walkSpecs.island.walkable(0, 130)).toBe(false);
});

test("the island sand ring is walkable down to the wet-sand edge", () => {
  // South sand (radial 0.96), east sand past the old 0.8 bound, and the
  // shoreline wobble itself: south stops just past z=127, east near x=150.
  expect(walkSpecs.island.walkable(0, 118)).toBe(true);
  expect(walkSpecs.island.walkable(138, 0)).toBe(true);
  expect(walkSpecs.island.walkable(0, 129)).toBe(false);
  expect(walkSpecs.island.walkable(152, 0)).toBe(false);
});
