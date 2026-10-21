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
