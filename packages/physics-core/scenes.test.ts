import { PhysicsRoom } from "./src/room.js";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { identityQuaternion, physicsSceneSchema } from "@island/contracts";
import {
  assertSceneTemplate,
  createPhysicsScene,
  officialPhysicsObjects,
} from "./src/index.js";

describe("versioned scene templates", () => {
  it("keeps template terrain stable while each scene gets a new identity", () => {
    const a = createPhysicsScene("building-yard", randomUUID),
      b = createPhysicsScene("building-yard", randomUUID);
    expect(a.id).not.toBe(b.id);
    expect(a.terrain).toEqual(b.terrain);
    expect(a.definitions).toEqual(b.definitions);
    expect(assertSceneTemplate(a).template).toEqual({
      id: "core:building-yard",
      version: 2,
    });
    // jsonb is free to reorder object fields; arrays retain their order.
    const reorder = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(reorder)
        : value && typeof value === "object"
          ? Object.fromEntries(
              Object.entries(value)
                .reverse()
                .map(([key, entry]) => [key, reorder(entry)]),
            )
          : value;
    expect(() => assertSceneTemplate(reorder(a) as typeof a)).not.toThrow();
    expect(() => createPhysicsScene("unknown")).toThrow("尚未开放");
    a.template.version = 99;
    expect(() => assertSceneTemplate(a)).toThrow("版本");
  });
  it("rejects changed infrastructure, spawn, bounds, forged motion and duplicated roles", () => {
    for (const change of [
      (s: ReturnType<typeof createPhysicsScene>) => {
        s.spawn.x++;
      },
      (s: ReturnType<typeof createPhysicsScene>) => {
        s.bounds.max.x++;
      },
      (s: ReturnType<typeof createPhysicsScene>) => {
        s.objects[0]!.position.y++;
      },
      (s: ReturnType<typeof createPhysicsScene>) => {
        s.definitions[0]!.parts[0]!.sensor = true;
      },
      (s: ReturnType<typeof createPhysicsScene>) => {
        delete s.objects[0]!.infrastructureKey;
      },
      (s: ReturnType<typeof createPhysicsScene>) => {
        s.objects.push({
          ...s.objects[0]!,
          id: randomUUID(),
          infrastructureKey: undefined,
        });
      },
    ]) {
      const s = createPhysicsScene("playground");
      change(s);
      expect(() => assertSceneTemplate(s)).toThrow();
    }
    const s = createPhysicsScene("playground");
    s.objects[1]!.motion = { offset: { x: 0, y: 1, z: 0 }, periodTicks: 600 };
    expect(() => assertSceneTemplate(s)).toThrow("运动轨迹");
    s.objects[1]!.infrastructureKey = "ground";
    expect(physicsSceneSchema.safeParse(s).success).toBe(false);
  });
  it("protects infrastructure by role and saves independently edited scene geometry", async () => {
    const scene = createPhysicsScene("playground", randomUUID),
      epoch = randomUUID();
    const room = await PhysicsRoom.create(scene, epoch);
    try {
      room.join("owner", true);
      for (let i = 0; i < 120; i++) room.step();
      expect(() =>
        room.prepareEdit("remove", 1, {
          type: "remove",
          objectId: scene.objects[0]!.id,
        }),
      ).toThrow("基础设施");
      const d = officialPhysicsObjects().find((d) => d.id === "core:block")!;
      const object = {
        id: randomUUID(),
        definitionId: d.id,
        definitionVersion: 1,
        position: { x: 10, y: 0.5, z: 7 },
        rotation: identityQuaternion,
      };
      expect(() =>
        room.prepareEdit(
          "forged",
          1,
          {
            type: "place",
            object: { ...object, infrastructureKey: "invented" },
          },
          d,
        ),
      ).toThrow("基础设施");
      room.prepareEdit("place", 1, { type: "place", object }, d);
      room.commitEdit("place");
      expect(() => assertSceneTemplate(room.runtime.scene)).not.toThrow();
      const restored = await PhysicsRoom.create(
        room.runtime.scene,
        epoch,
        2,
        room.checkpoint(1),
      );
      try {
        expect(restored.runtime.state(object.id).position.x).toBe(10);
      } finally {
        restored.dispose();
      }
      expect(
        createPhysicsScene("playground").objects.some(
          (o) => o.id === object.id,
        ),
      ).toBe(false);
    } finally {
      room.dispose();
    }
  });
});
