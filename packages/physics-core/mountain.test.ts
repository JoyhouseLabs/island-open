import { describe, expect, it } from "vitest";
import { terrainHeightAt, physicsSceneSchema } from "@island/contracts";
import {
  mountainHikingTrail,
  mountainDeck,
  mountainPlantingError,
} from "@island/world-core";
import {
  PhysicsRuntime,
  RAPIER,
  createPhysicsScene,
  assertSceneTemplate,
} from "./src/index.js";

describe("physical listening mountain", () => {
  it("walks the complete ascent, steps onto the summit and descends with the common character rules", async () => {
    const scene = createPhysicsScene("mountain"),
      runtime = await PhysicsRuntime.create(scene);
    const player = runtime.createCharacter("hiker");
    const walk = (x: number, z: number, limit = 900) => {
      for (let i = 0; i < limit; i++) {
        const at = player.position(),
          distance = Math.hypot(x - at.x, z - at.z);
        if (distance < 0.15) break;
        runtime.step((dt) =>
          player.step(
            { x: (x - at.x) / distance, z: (z - at.z) / distance, jump: false },
            dt,
          ),
        );
      }
      const at = player.position();
      expect(
        Math.hypot(x - at.x, z - at.z),
        `towards ${x},${z} from ${JSON.stringify(at)}`,
      ).toBeLessThan(0.25);
    };
    try {
      for (let i = 0; i < 60; i++)
        runtime.step((dt) => player.step({ x: 0, z: 0, jump: false }, dt));
      expect(player.grounded).toBe(true);
      expect(player.position().y).toBeCloseTo(0.87, 1);
      for (const point of mountainHikingTrail) walk(point.x, point.z);
      walk(0, 1);
      expect(player.grounded).toBe(true);
      expect(player.position().y).toBeCloseTo(mountainDeck.top + 0.87, 1);
      // The visible back rail really blocks a player; it is not an invisible broad bounding box.
      for (let i = 0; i < 80; i++)
        runtime.step((dt) => player.step({ x: 0, z: 1, jump: false }, dt));
      expect(player.position().z).toBeGreaterThan(2);
      expect(player.position().z).toBeLessThan(3.5);
      walk(0, -4);
      for (const point of [...mountainHikingTrail].reverse())
        walk(point.x, point.z);
      walk(0, 35);
      expect(player.grounded).toBe(true);
      expect(player.position().y).toBeCloseTo(0.87, 1);
    } finally {
      runtime.dispose();
    }
  });
  it("uses matching tiled geometry at seams and rejects modified terrain or summit facilities", async () => {
    const scene = createPhysicsScene("mountain"),
      runtime = await PhysicsRuntime.create(scene);
    try {
      expect(physicsSceneSchema.safeParse(scene).success).toBe(true);
      expect(() => assertSceneTemplate(scene)).not.toThrow();
      runtime.step();
      for (const [x, z] of [
        [0, 25],
        [13.4, 0],
        [-20, 0],
        [0, -15],
        [0.001, 25.13],
        [-0.001, 25.13],
        [4, 6],
      ]) {
        const expected = scene.terrain
          .map((t) => terrainHeightAt(t, x!, z!))
          .find((y) => y !== undefined)!;
        const hit = runtime.world.castRay(
          new RAPIER.Ray({ x: x!, y: 50, z: z! }, { x: 0, y: -1, z: 0 }),
          100,
          true,
          undefined,
          undefined,
          undefined,
          undefined,
          (c) => c.shape.type === RAPIER.ShapeType.TriMesh,
        );
        expect(hit).not.toBeNull();
        expect(50 - hit!.timeOfImpact).toBeCloseTo(expected, 3);
      }
      expect(runtime.terrainStats.triangles).toBe(44 * 38 * 4 * 2);
      expect(runtime.world.colliders.len()).toBeLessThan(100);
      for (const [x, z] of mountainHikingTrail.map((p) => [p.x, p.z]))
        expect(mountainPlantingError(x!, z!, false)).toBeTruthy();
      expect(mountainPlantingError(-18, 32, true)).toBeNull();
      const changed = structuredClone(scene);
      changed.terrain[0]!.heights[30]! += 0.1;
      expect(() => assertSceneTemplate(changed)).toThrow("地形");
      const moved = structuredClone(scene);
      moved.objects.find((o) => o.infrastructureKey === "summit-deck")!.position
        .y++;
      expect(() => assertSceneTemplate(moved)).toThrow("基础设施");
    } finally {
      runtime.dispose();
    }
  });
});
