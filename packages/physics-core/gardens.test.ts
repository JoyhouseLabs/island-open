import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { identityQuaternion, objectDefinitionSchema } from "@island/contracts";
import {
  gardenGreenhouse,
  nurseryFeatures,
  physicsPlants,
} from "@island/world-core";
import {
  PhysicsRuntime,
  createPhysicsScene,
  assertSceneTemplate,
  officialPhysicsObjects,
  editedPhysicsScene,
} from "./src/index.js";
import { PhysicsRoom } from "./src/room.js";

describe("physical gardens and manual plant growth", () => {
  it("compares existing official definitions by schema value rather than object key order", () => {
    for (const key of ["garden", "library"] as const) {
      const scene = createPhysicsScene(key),
        source = scene.objects.find((o) => !o.infrastructureKey)!;
      const definition = officialPhysicsObjects().find(
        (d) => d.id === source.definitionId,
      )!;
      const object = { ...source, id: randomUUID() };
      const reordered = {
        ...definition,
        parts: definition.parts.map((part) =>
          Object.fromEntries(Object.entries(part).reverse()),
        ),
      } as typeof definition;
      expect(() =>
        editedPhysicsScene(scene, { type: "place", object }, reordered),
      ).not.toThrow();
      const changed = structuredClone(definition);
      changed.parts[0]!.color = "#123456";
      expect(() =>
        editedPhysicsScene(scene, { type: "place", object }, changed),
      ).toThrow("版本不一致");
    }
  });
  for (const key of ["garden", "nursery"] as const) {
    it(`${key} shares greenhouse walls, accessible entrances and plant geometry with physical queries`, async () => {
      const scene = createPhysicsScene(key),
        runtime = await PhysicsRuntime.create(scene),
        player = runtime.createCharacter("gardener");
      const walk = (x: number, z: number, steps = 200) => {
        for (let i = 0; i < steps; i++) {
          const at = player.position(),
            length = Math.hypot(x - at.x, z - at.z);
          if (length < 0.2) return true;
          runtime.step((dt) =>
            player.step(
              { x: (x - at.x) / length, z: (z - at.z) / length, jump: false },
              dt,
            ),
          );
        }
        return false;
      };
      try {
        const glass =
          key === "garden" ? gardenGreenhouse : nurseryFeatures.greenhouse;
        player.teleport({ x: glass.x, y: 0.87, z: glass.z + glass.d / 2 + 3 });
        expect(walk(glass.x, glass.z)).toBe(true);
        expect(player.position().y).toBeCloseTo(1.17, 1);
        player.teleport({ x: glass.x + glass.w / 2 + 2, y: 0.87, z: glass.z });
        expect(walk(glass.x + glass.w / 2 - 2, glass.z, 120)).toBe(false);
        expect(player.position().x).toBeGreaterThan(glass.x + glass.w / 2);
        player.teleport({ x: 0, y: 0.87, z: key === "garden" ? 38 : 34 });
        expect(walk(0, key === "garden" ? 30 : 26)).toBe(true);
        expect(runtime.world.colliders.len()).toBeLessThan(600);
        expect(() => assertSceneTemplate(scene)).not.toThrow();
        if (key === "garden") {
          player.teleport({ x: -17, y: 0.87, z: -3 });
          expect(walk(-17, -8.3)).toBe(true);
          expect(player.position().y).toBeCloseTo(1.75 + 0.87, 1);
        }
      } finally {
        runtime.dispose();
      }
    });
    it(`${key} grows every authored starter plant without changing its identity, pose or template`, async () => {
      const scene = createPhysicsScene(key, randomUUID),
        room = await PhysicsRoom.create(scene, randomUUID());
      const plants = scene.objects.filter(
        (o) => scene.definitions.find((d) => d.id === o.definitionId)?.plant,
      );
      let revision = 1;
      try {
        for (const plant of plants) {
          const before = structuredClone(plant);
          for (;;) {
            const current = room.runtime.scene.objects.find(
              (o) => o.id === plant.id,
            )!;
            if (
              !room.runtime.scene.definitions.find(
                (d) => d.id === current.definitionId,
              )?.plant?.next
            )
              break;
            room.prepareEdit("grow", revision++, {
              type: "grow",
              objectId: plant.id,
            });
            room.commitEdit("grow");
          }
          const grown = room.runtime.scene.objects.find(
            (o) => o.id === plant.id,
          )!;
          expect(grown.position).toEqual(before.position);
          expect(grown.rotation).toEqual(before.rotation);
          expect(() =>
            room.prepareEdit("again", revision, {
              type: "grow",
              objectId: plant.id,
            }),
          ).toThrow("成熟");
        }
        expect(() => assertSceneTemplate(room.runtime.scene)).not.toThrow();
        const restored = await PhysicsRoom.create(
          room.runtime.scene,
          randomUUID(),
          revision,
          room.checkpoint(1),
        );
        try {
          expect(restored.runtime.scene.objects).toEqual(
            room.runtime.scene.objects,
          );
        } finally {
          restored.dispose();
        }
      } finally {
        room.dispose();
      }
    });
  }
  it("refuses blocked growth, preserves the prior stage on rejection and keeps normal edit semantics", async () => {
    const scene = createPhysicsScene("building-yard"),
      seed = physicsPlants().find((d) => d.id === "core:plant-oak-1")!,
      block = officialPhysicsObjects().find((d) => d.id === "core:block")!;
    const plant = {
        id: randomUUID(),
        definitionId: seed.id,
        definitionVersion: 1,
        position: { x: 4, y: 0, z: 0 },
        rotation: identityQuaternion,
      },
      obstacle = {
        id: randomUUID(),
        definitionId: block.id,
        definitionVersion: 1,
        position: { x: 4, y: 4, z: 0 },
        rotation: identityQuaternion,
      };
    scene.definitions.push(seed, block);
    scene.objects.push(plant, obstacle);
    const room = await PhysicsRoom.create(scene, randomUUID());
    try {
      expect(() =>
        room.prepareEdit("blocked", 1, { type: "grow", objectId: plant.id }),
      ).toThrow("重叠");
      expect(room.runtime.scene.objects[0]!.definitionId).toBe(seed.id);
      room.prepareEdit("remove", 1, { type: "remove", objectId: obstacle.id });
      room.commitEdit("remove");
      room.prepareEdit("grow", 2, { type: "grow", objectId: plant.id });
      room.abortEdit("grow");
      expect(room.runtime.scene.objects[0]!.definitionId).toBe(seed.id);
      room.prepareEdit("retry", 2, { type: "grow", objectId: plant.id });
      room.commitEdit("retry");
      expect(room.runtime.scene.objects[0]!.definitionId).toBe(
        "core:plant-oak-2",
      );
    } finally {
      room.dispose();
    }
    expect(
      objectDefinitionSchema.safeParse({ ...seed, source: "creation" }).success,
    ).toBe(false);
    expect(
      objectDefinitionSchema.safeParse({ ...seed, abilities: [] }).success,
    ).toBe(false);
  });
  it("protects planting paths, pond and flower beds using the same client/server placement rules", async () => {
    const scene = createPhysicsScene("garden"),
      runtime = await PhysicsRuntime.create(scene),
      plants = physicsPlants();
    const seed = plants.find((d) => d.id === "core:plant-oak-1")!,
      flower = plants.find((d) => d.id === "core:plant-daisy-1")!;
    const at = (x: number, z: number, y = 0) => ({
      id: randomUUID(),
      definitionId: seed.id,
      definitionVersion: 1,
      position: { x, y, z },
      rotation: identityQuaternion,
    });
    try {
      expect(() => runtime.validatePlacement(at(0, 10), seed)).toThrow("小径");
      expect(() => runtime.validatePlacement(at(23, -10), seed)).toThrow(
        "水池",
      );
      expect(() => runtime.validatePlacement(at(18, 21, 0.24), seed)).toThrow(
        "只种花",
      );
      expect(() =>
        runtime.validatePlacement(at(18, 21, 0.24), flower),
      ).not.toThrow();
    } finally {
      runtime.dispose();
    }
  });
});
