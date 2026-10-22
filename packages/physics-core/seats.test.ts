import { describe, expect, it } from "vitest";
import {
  physicsChairTemplate,
  physicsCreationAbilities,
  physicsCreationBlueprintSchema,
  objectDefinitionSchema,
  identityQuaternion,
} from "@island/contracts";
import { PhysicsRoom } from "./src/room.js";
import { PhysicsPrediction } from "./src/client.js";
import {
  createPlayground,
  playgroundIds,
  RAPIER,
  PHYSICS_DT,
  shopPhysicsDefinition,
} from "./src/index.js";
const uuid = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const chairId = uuid(50),
  epoch = uuid(0);
function fixture() {
  const scene = createPlayground(),
    b = physicsChairTemplate();
  scene.objects = scene.objects.filter((o) => o.id === playgroundIds.floor);
  const d = objectDefinitionSchema.parse({
    ...b,
    id: "creation:chair",
    version: 1,
    source: "creation",
    abilities: physicsCreationAbilities(b),
  });
  scene.definitions.push(d);
  scene.objects.push({
    id: chairId,
    definitionId: d.id,
    definitionVersion: 1,
    position: { x: 0, y: 0, z: 0 },
    rotation: identityQuaternion,
  });
  scene.spawn = { x: 0, y: 0.87, z: 1.6 };
  return scene;
}
const action = (sequence: number, type = "sit") => ({
  type,
  sequence,
  layoutRevision: 1,
  commandId: uuid(sequence),
  ...(type === "sit" ? { objectId: chairId } : {}),
});
async function ready() {
  const room = await PhysicsRoom.create(fixture(), epoch);
  room.join("host", true);
  for (let i = 0; i < 30; i++) room.step();
  return room;
}
function wall(
  room: PhysicsRoom,
  x: number,
  y: number,
  z: number,
  hx: number,
  hy: number,
  hz: number,
) {
  return room.runtime.world.createCollider(
    RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setTranslation(x, y, z)
      .setCollisionGroups(0x0001ffff),
  );
}
describe("authoritative seated interaction", () => {
  it("validates fixed horizontal support and purchased chair, sofa and stool seats", () => {
    const b = physicsChairTemplate();
    expect(physicsCreationBlueprintSchema.safeParse(b).success).toBe(true);
    expect(
      physicsCreationBlueprintSchema.safeParse({ ...b, bodyType: "dynamic" })
        .success,
    ).toBe(false);
    expect(
      physicsCreationBlueprintSchema.safeParse({
        ...b,
        seat: { partId: "missing", yaw: 0 },
      }).success,
    ).toBe(false);
    const narrow = structuredClone(b);
    narrow.parts[0]!.shape = {
      kind: "box",
      halfExtents: { x: 0.2, y: 0.1, z: 0.5 },
    };
    expect(physicsCreationBlueprintSchema.safeParse(narrow).success).toBe(
      false,
    );
    const tilted = structuredClone(b);
    tilted.parts[0]!.rotation = {
      x: Math.SQRT1_2,
      y: 0,
      z: 0,
      w: Math.SQRT1_2,
    };
    expect(physicsCreationBlueprintSchema.safeParse(tilted).success).toBe(
      false,
    );
    for (const id of ["oak-chair", "mint-sofa", "round-stool"] as const)
      expect(shopPhysicsDefinition(id).abilities).toContain("seat");
  });
  it("can sit on and leave every purchased seat with its actual compound geometry", async () => {
    for (const id of ["oak-chair", "mint-sofa", "round-stool"] as const) {
      const scene = fixture(),
        definition = shopPhysicsDefinition(id),
        object = scene.objects.find((o) => o.id === chairId)!;
      scene.definitions.push(definition);
      object.definitionId = definition.id;
      const room = await PhysicsRoom.create(scene, epoch);
      room.join("host", true);
      room.step();
      try {
        const sit = room.command("host", action(1));
        expect(sit?.ok, sit?.message).toBe(true);
        const stand = room.command("host", action(2, "stand"));
        expect(stand?.ok, stand?.message).toBe(true);
      } finally {
        room.dispose();
      }
    }
  });
  it("claims one seat, deduplicates sit/stand, preserves pose through inputs and restores full capsule on exit", async () => {
    const room = await ready();
    try {
      room.join("guest", true);
      expect(room.command("host", action(1))?.ok).toBe(true);
      expect(room.command("host", action(1))?.ok).toBe(true);
      expect(room.command("guest", action(1))?.message).toContain("已经有人");
      const seated = room.playerState("host");
      expect(seated.seatId).toBe(chairId);
      expect(seated.seated).toBe(true);
      expect(seated.position.y).toBeCloseTo(1.47);
      for (let i = 0; i < 60; i++) {
        room.command("host", {
          type: "input",
          sequence: i,
          layoutRevision: 1,
          x: 1,
          z: 1,
          jump: true,
          yaw: 2,
        });
        room.step();
      }
      expect(room.playerState("host").position).toEqual(seated.position);
      expect(room.playerState("host").yaw).toBe(0);
      room.leave("guest");
      expect(room.command("host", action(2, "stand"))?.ok).toBe(true);
      expect(room.command("host", action(2, "stand"))?.ok).toBe(true);
      expect(room.playerState("host").seated).toBe(false);
      expect(room.playerState("host").position.y).toBeCloseTo(0.87);
      const p = room.playerState("host").position;
      for (let i = 0; i < 15; i++) {
        room.command("host", {
          type: "input",
          sequence: 100 + i,
          layoutRevision: 1,
          x: 1,
          z: 0,
          jump: false,
          yaw: 0,
        });
        room.step();
      }
      expect(room.playerState("host").position.x).toBeGreaterThan(p.x + 0.5);
    } finally {
      room.dispose();
    }
  });
  it("rejects remote or blocked seating and leaves blocked exits seated without teleporting through walls", async () => {
    const room = await ready();
    try {
      const divider = wall(room, 0, 1, 0.8, 2, 1, 0.08);
      expect(room.command("host", action(1))?.message).toContain("挡住");
      room.runtime.world.removeCollider(divider, true);
      const roof = wall(room, 0, 1.8, 0, 1, 0.2, 1);
      expect(room.command("host", action(2))?.message).toContain("头顶");
      room.runtime.world.removeCollider(roof, true);
      expect(room.command("host", action(3))?.ok).toBe(true);
      const obstacles = [
        wall(room, 0, 1, 0.8, 2, 1, 0.1),
        wall(room, 0, 1, -0.8, 2, 1, 0.1),
        wall(room, 0.8, 1, 0, 0.1, 1, 2),
        wall(room, -0.8, 1, 0, 0.1, 1, 2),
      ];
      const before = room.playerState("host").position;
      expect(room.command("host", action(4, "stand"))?.message).toContain(
        "安全落脚点",
      );
      expect(room.playerState("host").position).toEqual(before);
      room.setPermission("host", false);
      expect(room.playerState("host").seatId).toBe(chairId);
      for (const c of obstacles) room.runtime.world.removeCollider(c, true);
      // Revoking interaction never prevents a player from escaping a seat.
      expect(room.command("host", action(5, "stand"))?.ok).toBe(true);
      expect(() => room.command("host", action(6))).toThrow("尚未开放");
    } finally {
      room.dispose();
    }
  });
  it("uses rotated seat direction and rejects distant or tilted seats", async () => {
    const scene = fixture();
    scene.objects.find((o) => o.id === chairId)!.rotation = {
      x: 0,
      y: Math.SQRT1_2,
      z: 0,
      w: Math.SQRT1_2,
    };
    scene.spawn = { x: 1.6, y: 0.87, z: 0 };
    const room = await PhysicsRoom.create(scene, epoch);
    room.join("host", true);
    room.step();
    try {
      expect(room.command("host", action(1))?.ok).toBe(true);
      expect(room.playerState("host").yaw).toBeCloseTo(Math.PI / 2);
      expect(room.command("host", action(2, "stand"))?.ok).toBe(true);
      expect(room.playerState("host").position.x).toBeGreaterThan(0.9);
    } finally {
      room.dispose();
    }
    for (const tilted of [false, true]) {
      const invalid = fixture();
      if (tilted)
        invalid.objects.find((o) => o.id === chairId)!.rotation = {
          x: Math.sin(0.2),
          y: 0,
          z: 0,
          w: Math.cos(0.2),
        };
      else invalid.spawn.x = 8;
      const far = await PhysicsRoom.create(invalid, epoch);
      far.join("host", true);
      far.step();
      try {
        expect(far.command("host", action(1))?.message).toContain(
          tilted ? "摆平" : "靠近",
        );
      } finally {
        far.dispose();
      }
    }
  });
  it("refuses an elevated seat without a safe exit before changing posture", async () => {
    const scene = fixture();
    scene.objects.find((o) => o.id === chairId)!.position.y = 1;
    const room = await PhysicsRoom.create(scene, epoch);
    room.join("host", true);
    room.step();
    try {
      const before = room.playerState("host");
      expect(room.command("host", action(1))?.message).toContain("安全落脚点");
      expect(room.playerState("host").seatId).toBeNull();
      expect(room.playerState("host").position).toEqual(before.position);
    } finally {
      room.dispose();
    }
  });
  it("blocks occupied furniture edits and imports, releases on disconnect, and does not persist occupancy", async () => {
    const room = await ready();
    try {
      expect(room.command("host", action(1))?.ok).toBe(true);
      expect(() =>
        room.prepareEdit(uuid(70), 1, { type: "remove", objectId: chairId }),
      ).toThrow("起身");
      expect(() =>
        room.prepareEdit(uuid(71), 1, {
          type: "move",
          objectId: chairId,
          position: { x: 5, y: 0, z: 0 },
          rotation: identityQuaternion,
        }),
      ).toThrow("起身");
      await expect(
        room.prepareReplacement(uuid(72), 1, fixture(), room.checkpoint(1)),
      ).rejects.toThrow("起身");
      const restored = await PhysicsRoom.create(
        fixture(),
        uuid(90),
        1,
        room.checkpoint(1),
      );
      try {
        restored.join("new", true);
        expect(restored.playerState("new").seatId).toBeNull();
      } finally {
        restored.dispose();
      }
      room.leave("host");
      room.join("next", true);
      expect(room.command("next", action(1))?.ok).toBe(true);
      room.setPermission("next", false);
      expect(room.playerState("next").seatId).toBeNull();
    } finally {
      room.dispose();
    }
  });
  it("predicts the seated capsule without drift and returns to walking on the authoritative stand frame", async () => {
    const room = await ready(),
      prediction = await PhysicsPrediction.create(fixture(), "host");
    try {
      room.command("host", action(1));
      prediction.acknowledge(
        room.playerState("host"),
        room.runtime.states(),
        true,
      );
      const before = prediction.player.position();
      for (let i = 0; i < 20; i++)
        prediction.advance(
          PHYSICS_DT,
          { layoutRevision: 1, x: 1, z: 1, jump: true, yaw: 1 },
          () => {},
        );
      expect(prediction.player.position()).toEqual(before);
      expect(prediction.player.collider.shape).toMatchObject({
        halfHeight: 0.25,
      });
      room.command("host", action(2, "stand"));
      prediction.acknowledge(
        room.playerState("host"),
        room.runtime.states(),
        true,
      );
      expect(prediction.player.collider.shape).toMatchObject({
        halfHeight: 0.55,
      });
      prediction.advance(
        PHYSICS_DT,
        { layoutRevision: 1, x: 1, z: 0, jump: false, yaw: 0 },
        () => {},
      );
      expect(prediction.player.position().x).toBeGreaterThan(
        room.playerState("host").position.x,
      );
    } finally {
      prediction.dispose();
      room.dispose();
    }
  });
});
