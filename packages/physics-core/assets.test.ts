import { describe, expect, it } from "vitest";
import {
  furnitureCatalog,
  physicsCreationBlueprintSchema,
  physicsTableTemplate,
  physicsPartsBounds,
  identityQuaternion,
  type ObjectDefinition,
} from "@island/contracts";
import {
  PhysicsRuntime,
  createPlayground,
  playgroundIds,
  shopPhysicsDefinition,
} from "./src/index.js";

const id = "10000000-0000-4000-8000-000000000099";
function tableScene(definition: ObjectDefinition) {
  const s = createPlayground();
  s.objects = s.objects.filter((o) =>
    [playgroundIds.floor, playgroundIds.box].includes(o.id),
  );
  s.definitions.push(definition);
  s.objects.push({
    id,
    definitionId: definition.id,
    definitionVersion: definition.version,
    position: { x: 3, y: 0, z: 0 },
    rotation: identityQuaternion,
  });
  return s;
}
describe("shared shop and workshop object geometry", () => {
  it("builds every purchased furniture with matching finite compound shapes", async () => {
    for (const item of furnitureCatalog) {
      const d = shopPhysicsDefinition(item.id),
        s = tableScene(d);
      const runtime = await PhysicsRuntime.create(s);
      try {
        const bounds = physicsPartsBounds(d.parts);
        expect(bounds.min.y).toBeGreaterThanOrEqual(-0.001);
        expect(d.parts.length).toBeLessThanOrEqual(24);
        expect(runtime.bodies.get(id)!.numColliders()).toBe(d.parts.length);
        for (let i = 0; i < 5; i++) runtime.step();
      } finally {
        runtime.dispose();
      }
    }
  });
  it("supports a box on purchased and creator tables, including an open gap between legs", async () => {
    const template = physicsCreationBlueprintSchema.parse(
      physicsTableTemplate(),
    );
    const handmade: ObjectDefinition = {
      ...template,
      id: "creation:test-table",
      version: 1,
      source: "creation",
      abilities: [],
    };
    for (const d of [shopPhysicsDefinition("oak-table"), handmade]) {
      const runtime = await PhysicsRuntime.create(tableScene(d));
      try {
        for (let i = 0; i < 300; i++) runtime.step();
        expect(runtime.state(playgroundIds.box).position.y).toBeGreaterThan(2);
        const shape = {
          id: "probe",
          version: 1,
          source: "official" as const,
          name: "探针",
          bodyType: "fixed" as const,
          material: "wood" as const,
          abilities: [],
          parts: [
            {
              id: "b",
              shape: { kind: "ball" as const, radius: 0.2 },
              position: { x: 0, y: 0, z: 0 },
              rotation: identityQuaternion,
              color: "#ffffff",
              sensor: false,
            },
          ],
        };
        expect(() =>
          runtime.validatePlacement(
            {
              id: "10000000-0000-4000-8000-000000000098",
              definitionId: shape.id,
              definitionVersion: 1,
              position: { x: 3, y: 0.5, z: 0 },
              rotation: identityQuaternion,
            },
            shape,
          ),
        ).not.toThrow();
      } finally {
        runtime.dispose();
      }
    }
  });
  it("rejects hidden sensors, oversized rotated parts and ungrounded creator geometry", () => {
    const b = physicsTableTemplate();
    b.parts[0]!.sensor = true;
    expect(physicsCreationBlueprintSchema.safeParse(b).success).toBe(false);
    const oversized = physicsTableTemplate();
    oversized.parts[0]!.shape = {
      kind: "box",
      halfExtents: { x: 3, y: 0.1, z: 3 },
    };
    oversized.parts[0]!.rotation = {
      x: 0,
      y: Math.sin(Math.PI / 8),
      z: 0,
      w: Math.cos(Math.PI / 8),
    };
    expect(physicsCreationBlueprintSchema.safeParse(oversized).success).toBe(
      false,
    );
    const floating = physicsTableTemplate();
    for (const p of floating.parts) p.position.y++;
    expect(physicsCreationBlueprintSchema.safeParse(floating).success).toBe(
      false,
    );
    expect(
      physicsCreationBlueprintSchema.safeParse(physicsTableTemplate()).success,
    ).toBe(true);
  });
});
