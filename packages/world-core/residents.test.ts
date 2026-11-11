import { expect, test } from "vitest";
import { residents } from "./src/index.js";
import { walkSpecs } from "./src/index.js";

test("every resident lives and roams on walkable ground", () => {
  for (const [scene, list] of Object.entries(residents)) {
    for (const r of list!) {
      const spec = walkSpecs[scene as keyof typeof walkSpecs];
      expect(spec, `${scene}/${r.name}`).toBeTruthy();
      expect(
        spec.walkable(r.home.x, r.home.z),
        `${scene}/${r.name} home center`,
      ).toBe(true);
      // The whole roam disc must stay inside the scene's own bounds.
      for (const [dx, dz] of [
        [r.home.r, 0],
        [-r.home.r, 0],
        [0, r.home.r],
        [0, -r.home.r],
      ])
        expect(
          spec.walkable(r.home.x + dx!, r.home.z + dz!),
          `${scene}/${r.name} rim ${dx},${dz}`,
        ).toBe(true);
    }
  }
});

test("Pikachu's summit home stays above the foothills and clear of gates and rocks", async () => {
  const { groundHeight, islandRocks } = await import("./src/index.js");
  const pikachu = residents.island!.find(r => r.species === "pikachu")!;
  expect(pikachu).toBeDefined();
  const { x, z, r } = pikachu.home;
  // Includes the initial +/-2-unit jitter as well as the complete roam disc.
  for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 16) {
    const px = x + Math.cos(angle) * r, pz = z + Math.sin(angle) * r;
    expect(groundHeight(px, pz)).toBeGreaterThan(39);
    expect(walkSpecs.island.walkable(px, pz)).toBe(true);
  }
  for (const gate of walkSpecs.island.gates)
    expect(Math.hypot(x - gate.x, z - gate.z) - r).toBeGreaterThan(gate.radius + 0.5);
  for (const rock of islandRocks())
    expect(Math.hypot(x - rock.x, z - rock.z) - r).toBeGreaterThan(rock.size + 0.6);
});
