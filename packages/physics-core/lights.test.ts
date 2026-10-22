import { describe, expect, it } from "vitest";
import {
  identityQuaternion,
  objectDefinitionSchema,
  physicsCreationBlueprintSchema,
  physicsCreationDraftSchema,
  physicsCreationAbilities,
  physicsLampTemplate,
  physicsSceneSchema,
  physicsBudgets,
  type ObjectDefinition,
} from "@island/contracts";
import {
  PhysicsRuntime,
  createPlayground,
  shopPhysicsDefinition,
} from "./src/index.js";
import { editedPhysicsScene } from "./src/editing.js";
const blueprint = physicsLampTemplate();
const definition: ObjectDefinition = objectDefinitionSchema.parse({
  ...blueprint,
  id: "creation:lamp",
  version: 1,
  source: "creation",
  abilities: physicsCreationAbilities(blueprint),
});
const instance = (n: number) => ({
  id: `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  definitionId: definition.id,
  definitionVersion: 1,
  position: { x: n * 2, y: 0, z: 7 },
  rotation: identityQuaternion,
});
describe("bounded, versioned object lighting", () => {
  it("requires a real solid emitter and matching capability, rejecting unbounded light settings", () => {
    expect(physicsCreationBlueprintSchema.parse(blueprint).light).toEqual(
      blueprint.light,
    );
    expect(
      physicsCreationDraftSchema.safeParse({
        id: instance(1).id,
        version: 0,
        blueprint: {
          ...blueprint,
          light: { ...blueprint.light!, intensity: 31 },
        },
      }).success,
    ).toBe(true);
    expect(objectDefinitionSchema.parse(definition).abilities).toEqual([
      "light",
    ]);
    for (const light of [
      { ...blueprint.light!, partId: "missing" },
      { ...blueprint.light!, intensity: 31 },
      { ...blueprint.light!, distance: 13 },
      { ...blueprint.light!, color: "red" },
      { ...blueprint.light!, shadow: true },
    ])
      expect(
        physicsCreationBlueprintSchema.safeParse({ ...blueprint, light })
          .success,
      ).toBe(false);
    expect(
      objectDefinitionSchema.safeParse({ ...definition, abilities: [] })
        .success,
    ).toBe(false);
    expect(
      objectDefinitionSchema.safeParse({ ...definition, light: undefined })
        .success,
    ).toBe(false);
    const hidden = structuredClone(definition);
    hidden.parts.find((p) => p.id === hidden.light!.partId)!.sensor = true;
    expect(objectDefinitionSchema.safeParse(hidden).success).toBe(false);
    const shop = shopPhysicsDefinition("garden-lamp");
    expect(shop.light?.partId).toBe("globe");
    expect(shop.abilities).toContain("light");
  });
  it("counts lit instances across versions and sources, releases budget on removal and rejects over-budget imports", () => {
    let scene = createPlayground();
    for (let i = 1; i <= physicsBudgets.lights; i++)
      scene = editedPhysicsScene(
        scene,
        { type: "place", object: instance(i) },
        definition,
      );
    expect(() =>
      editedPhysicsScene(
        scene,
        { type: "place", object: instance(5) },
        definition,
      ),
    ).toThrow(/光源/);
    const malformed = structuredClone(scene);
    malformed.objects.push(instance(5));
    expect(physicsSceneSchema.safeParse(malformed).success).toBe(false);
    scene = editedPhysicsScene(scene, {
      type: "remove",
      objectId: instance(1).id,
    });
    scene = editedPhysicsScene(
      scene,
      { type: "place", object: instance(5) },
      definition,
    );
    expect(
      scene.objects.filter((o) => o.definitionId === definition.id),
    ).toHaveLength(4);
    const shop = shopPhysicsDefinition("garden-lamp");
    expect(() =>
      editedPhysicsScene(
        scene,
        { type: "place", object: { ...instance(6), definitionId: shop.id } },
        shop,
      ),
    ).toThrow(/光源/);
  });
  it("keeps the light's local anchor through dynamic motion and checkpoint restore without adding physics bodies", async () => {
    const lamp = {
      ...definition,
      bodyType: "dynamic" as const,
      abilities: physicsCreationAbilities({
        ...blueprint,
        bodyType: "dynamic",
      }),
    };
    const scene = createPlayground();
    scene.definitions.push(lamp);
    scene.objects.push({ ...instance(1), position: { x: 8, y: 3, z: 7 } });
    const runtime = await PhysicsRuntime.create(scene);
    try {
      const body = runtime.bodies.get(instance(1).id)!;
      expect(body.numColliders()).toBe(lamp.parts.length);
      body.applyImpulse({ x: 2, y: 1, z: 0 }, true);
      for (let i = 0; i < 60; i++) runtime.step();
      expect(runtime.state(instance(1).id).position.y).toBeLessThan(3);
      const checkpoint = {
          schemaVersion: 4,
          physicsVersion: scene.physicsVersion,
          layoutRevision: 1,
          revision: 1,
          tick: runtime.tick,
          states: runtime.states(),
        },
        restored = await PhysicsRuntime.create(scene);
      try {
        restored.restore(checkpoint);
        expect(restored.state(instance(1).id).position).toEqual(
          runtime.state(instance(1).id).position,
        );
        expect(
          restored.scene.definitions.find((d) => d.id === lamp.id)?.light,
        ).toEqual(blueprint.light);
      } finally {
        restored.dispose();
      }
    } finally {
      runtime.dispose();
    }
  });
});
