import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  physicsSceneSchema,
  identityQuaternion,
  terrainGeometry,
} from "@island/contracts";
import {
  islandSurface,
  islandTrees,
  landmarks,
  trails,
} from "@island/world-core";
import {
  PhysicsRuntime,
  RAPIER,
  createPhysicsScene,
  assertSceneTemplate,
  officialPhysicsObjects,
} from "./src/index.js";
import { PhysicsRoom } from "./src/room.js";

describe("physical main island", () => {
  it("uses the same bounded terrain and facilities for drawing, casts and saved template identity", async () => {
    const scene = createPhysicsScene("island", randomUUID);
    expect(physicsSceneSchema.safeParse(scene).success).toBe(true);
    expect(assertSceneTemplate(scene).template).toEqual({
      id: "core:island",
      version: 1,
    });
    expect(scene.objects.every((o) => o.infrastructureKey)).toBe(true);
    expect(
      scene.objects.filter((o) => o.infrastructureKey?.startsWith("house-")),
    ).toHaveLength(5);
    expect(
      scene.objects.filter((o) => o.infrastructureKey?.includes("-bed-")),
    ).toHaveLength(8);
    expect(islandTrees().length).toBeGreaterThan(50);
    const runtime = await PhysicsRuntime.create(scene);
    try {
      for (const tile of scene.terrain) {
        const geometry = terrainGeometry(tile);
        expect(geometry.indices.length).toBeGreaterThan(0);
        expect(geometry.positions.length).toBe(tile.heights.length * 3);
      }
      runtime.step();
      for (const [x, z] of [
        [-28, 34],
        [-65, -10],
        [15, 60],
        [-10, -60],
        [120, 0],
      ]) {
        const expected = islandSurface(scene.terrain, x!, z!);
        // Ignore structures to compare the actual native terrain mesh against the shared samples.
        const hit = runtime.world.castRay(
          new RAPIER.Ray({ x: x!, y: 100, z: z! }, { x: 0, y: -1, z: 0 }),
          200,
          true,
          undefined,
          undefined,
          undefined,
          undefined,
          (c) => c.shape.type === RAPIER.ShapeType.TriMesh,
        );
        expect(hit).not.toBeNull();
        expect(100 - hit!.timeOfImpact).toBeCloseTo(expected, 3);
      }
      expect(runtime.terrainStats.triangles).toBeLessThan(50000);
      expect(runtime.world.colliders.len()).toBeLessThan(600);
      const outside = runtime.world.castRay(
        new RAPIER.Ray({ x: 158, y: 100, z: 138 }, { x: 0, y: -1, z: 0 }),
        200,
        true,
      );
      expect(outside).toBeNull();
    } finally {
      runtime.dispose();
    }
    const bad = structuredClone(scene);
    bad.definitions[0]!.parts[0]!.position.x++;
    expect(() => assertSceneTemplate(bad)).toThrow("基础设施");
    const altered = structuredClone(scene);
    altered.terrain[0]!.heights[0]! += 0.1;
    expect(() => assertSceneTemplate(altered)).toThrow("地形");
  });
  it("walks under the garden arbor, stops at a house wall and climbs the actual mountain trail", async () => {
    const scene = createPhysicsScene("island"),
      runtime = await PhysicsRuntime.create(scene),
      player = runtime.createCharacter("walker");
    const set = (x: number, z: number) =>
      player.teleport({ x, y: islandSurface(scene.terrain, x, z) + 0.87, z });
    const walk = (x: number, z: number, max = 2000) => {
      for (let i = 0; i < max; i++) {
        const p = player.position(),
          dx = x - p.x,
          dz = z - p.z,
          len = Math.hypot(dx, dz);
        if (len < 0.35) return true;
        runtime.step((dt) =>
          player.step({ x: dx / len, z: dz / len, jump: false }, dt),
        );
      }
      return false;
    };
    try {
      for (let i = 0; i < 30; i++)
        runtime.step((dt) => player.step({ x: 0, z: 0, jump: false }, dt));
      expect(player.grounded).toBe(true);
      expect(walk(-28, 44)).toBe(true);
      set(-28, 17);
      runtime.step();
      expect(walk(-28, 7, 200)).toBe(false);
      expect(player.position().z).toBeGreaterThan(11.45);
      const mountain = trails.find((path) => path.at(-1)?.z === -76)!;
      set(mountain[0]!.x, mountain[0]!.z);
      runtime.step();
      for (const point of [...mountain.slice(1, -1), { x: 8, z: -74 }])
        expect(walk(point.x, point.z), `path ${point.x},${point.z}`).toBe(true);
      expect(player.position().y).toBeGreaterThan(35);
      for (const point of mountain.slice(0, -1).reverse())
        expect(walk(point.x, point.z), `descent ${point.x},${point.z}`).toBe(
          true,
        );
      expect(player.position().y).toBeLessThan(12);
    } finally {
      runtime.dispose();
    }
  });
  it("allows authored objects while preserving infrastructure on room save and reconstruction", async () => {
    const scene = createPhysicsScene("island", randomUUID),
      room = await PhysicsRoom.create(scene, randomUUID());
    try {
      room.join("owner", true);
      for (let i = 0; i < 30; i++) room.step();
      expect(() =>
        room.prepareEdit("delete", 1, {
          type: "remove",
          objectId: scene.objects[0]!.id,
        }),
      ).toThrow("基础设施");
      const definition = officialPhysicsObjects().find(
        (d) => d.id === "core:block",
      )!;
      const object = {
        id: randomUUID(),
        definitionId: definition.id,
        definitionVersion: 1,
        position: {
          x: -20,
          y: islandSurface(scene.terrain, -20, 34) + 0.5,
          z: 34,
        },
        rotation: identityQuaternion,
      };
      room.prepareEdit("place", 1, { type: "place", object }, definition);
      room.commitEdit("place");
      expect(() => assertSceneTemplate(room.runtime.scene)).not.toThrow();
      const restored = await PhysicsRoom.create(
        room.runtime.scene,
        randomUUID(),
        2,
        room.checkpoint(1),
      );
      try {
        expect(restored.runtime.state(object.id).position).toEqual(
          object.position,
        );
      } finally {
        restored.dispose();
      }
    } finally {
      room.dispose();
    }
  });
});
