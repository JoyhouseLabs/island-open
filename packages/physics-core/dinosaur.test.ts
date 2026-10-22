import { describe, expect, it } from "vitest";
import {
  dinosaurPark,
  dinosaurTrail,
  dinosaurPlantingError,
} from "@island/world-core";
import { terrainHeightAt } from "@island/contracts";
import {
  PhysicsRuntime,
  RAPIER,
  createPhysicsScene,
  assertSceneTemplate,
} from "./src/index.js";

describe("physical dinosaur park", () => {
  it("walks the entire park loop between signs, cliffs and seats without a second walking mask", async () => {
    const runtime = await PhysicsRuntime.create(createPhysicsScene("dinosaur")),
      player = runtime.createCharacter("visitor");
    const walk = (x: number, z: number, limit = 1500) => {
      for (let i = 0; i < limit; i++) {
        const at = player.position(),
          d = Math.hypot(x - at.x, z - at.z);
        if (d < 0.2) break;
        runtime.step((dt) =>
          player.step(
            { x: (x - at.x) / d, z: (z - at.z) / d, jump: false },
            dt,
          ),
        );
      }
      const at = player.position();
      expect(
        Math.hypot(x - at.x, z - at.z),
        `target ${x},${z}, actual ${JSON.stringify(at)}`,
      ).toBeLessThan(0.3);
    };
    try {
      for (const at of [...dinosaurTrail, dinosaurTrail[0]!]) walk(at.x, at.z);
      walk(0, 61);
      expect(player.grounded).toBe(true);
      expect(player.position().y).toBeCloseTo(0.87, 1);
      const cliff = dinosaurPark.cliffs[0];
      player.teleport({ x: cliff.x + 14, y: 0.87, z: cliff.z });
      for (let i = 0; i < 240; i++)
        runtime.step((dt) => player.step({ x: -1, z: 0, jump: false }, dt));
      expect(player.position().x).toBeGreaterThan(cliff.x + 5);
      expect(player.position().y).toBeLessThan(3);
    } finally {
      runtime.dispose();
    }
  });
  it("models a real wetland depression, hollow nest rim and eggs using the rendered geometry", async () => {
    const scene = createPhysicsScene("dinosaur"),
      runtime = await PhysicsRuntime.create(scene);
    try {
      runtime.step();
      const cast = (x: number, z: number, terrainOnly = false) =>
        runtime.world.castRay(
          new RAPIER.Ray({ x, y: 40, z }, { x: 0, y: -1, z: 0 }),
          60,
          true,
          undefined,
          undefined,
          undefined,
          undefined,
          terrainOnly
            ? (c) => c.shape.type === RAPIER.ShapeType.TriMesh
            : undefined,
        );
      for (const [x, z] of [
        [43, 22],
        [50, 25],
        [0, -18],
        [19, 0],
        [-0.001, 37],
        [0.001, 37],
      ]) {
        const expected = scene.terrain
          .map((t) => terrainHeightAt(t, x!, z!))
          .find((y) => y !== undefined)!;
        expect(40 - cast(x!, z!, true)!.timeOfImpact).toBeCloseTo(expected, 3);
      }
      expect(40 - cast(43, 22)!.timeOfImpact).toBeCloseTo(-1.2, 2);
      const nest = dinosaurPark.nests[0];
      expect(40 - cast(nest.x, nest.z)!.timeOfImpact).toBeCloseTo(0.3, 2);
      expect(40 - cast(nest.x + 2.4, nest.z)!.timeOfImpact).toBeCloseTo(
        1.15,
        2,
      );
      expect(40 - cast(nest.x, nest.z + 1.2)!.timeOfImpact).toBeCloseTo(1.9, 2);
      expect(runtime.terrainStats.triangles).toBe(24000);
      expect(runtime.world.colliders.len()).toBeLessThan(600);
      expect(dinosaurPlantingError(0, 60)).toContain("步道");
      expect(dinosaurPlantingError(43, -32)).toContain("观察区");
      expect(() => assertSceneTemplate(scene)).not.toThrow();
      const bad = structuredClone(scene);
      bad.definitions
        .find((d) => d.id.includes("nest-0"))!
        .parts.find((p) => p.id === "egg-0")!.color = "#ffffff";
      expect(() => assertSceneTemplate(bad)).toThrow("基础设施");
    } finally {
      runtime.dispose();
    }
  });
});
