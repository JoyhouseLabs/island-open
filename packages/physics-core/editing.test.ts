import { describe, expect, it } from "vitest";
import { identityQuaternion } from "@island/contracts";
import { PhysicsRoom } from "./src/room.js";
import {
  createPlayground,
  playgroundIds,
  officialPhysicsObjects,
} from "./src/index.js";
const epoch = "10000000-0000-4000-8000-000000000000";
const id = "10000000-0000-4000-8000-000000000099";
const definition = officialPhysicsObjects().find((d) => d.id === "core:block")!;
const place = (x = 8, y = 0.5, z = 7) => ({
  type: "place" as const,
  object: {
    id,
    definitionId: definition.id,
    definitionVersion: 1,
    position: { x, y, z },
    rotation: identityQuaternion,
  },
});

describe("layout edits at simulation boundaries", () => {
  it("prepares a frozen snapshot, aborts without mutation, commits only changed bodies", async () => {
    const room = await PhysicsRoom.create(createPlayground(), epoch);
    try {
      room.join("host", true);
      const box = room.runtime.bodies.get(playgroundIds.box)!;
      box.setLinvel({ x: 1, y: 2, z: 0 }, true);
      const before = room.runtime.tick;
      const staged = room.prepareEdit("a", 1, place(), definition);
      for (let n = 0; n < 10; n++) room.step();
      expect(room.runtime.tick).toBe(before);
      expect(room.runtime.bodies.has(id)).toBe(false);
      expect(staged.checkpoint.layoutRevision).toBe(2);
      room.abortEdit("a");
      room.step();
      expect(room.runtime.tick).toBe(before + 1);
      const velocity = { ...box.linvel() };
      room.prepareEdit("b", 1, place(), definition);
      room.commitEdit("b");
      expect(room.runtime.bodies.get(playgroundIds.box)).toBe(box);
      expect(box.linvel()).toEqual(velocity);
      expect(room.runtime.state(id).id).toBe(id);
      expect(room.layoutRevision).toBe(2);
      expect(() => room.prepareEdit("c", 1, place(), definition)).toThrow(
        "布局已更新",
      );
      const restored = await PhysicsRoom.create(
        room.runtime.scene,
        epoch,
        2,
        room.checkpoint(1),
      );
      expect(restored.runtime.state(id).id).toBe(id);
      restored.dispose();
    } finally {
      room.dispose();
    }
  });
  it("rejects overlap, player entrapment, bounds and immutable floor without leaking colliders", async () => {
    const room = await PhysicsRoom.create(createPlayground(), epoch);
    try {
      room.join("host", true);
      const count = room.runtime.world.colliders.len();
      for (const operation of [
        place(0, 1, 7),
        place(0, -0.5, 9),
        place(20, 0.5, 7),
      ]) {
        expect(() => room.prepareEdit("x", 1, operation, definition)).toThrow();
        expect(room.runtime.world.colliders.len()).toBe(count);
      }
      expect(() =>
        room.prepareEdit("x", 1, {
          type: "remove",
          objectId: playgroundIds.floor,
        }),
      ).toThrow("基础设施");
      room.prepareEdit("valid", 1, place(), definition);
      room.abortEdit("valid");
    } finally {
      room.dispose();
    }
  });
  it("removing a sleeping support wakes the box and never resurrects the table in checkpoints", async () => {
    const room = await PhysicsRoom.create(createPlayground(), epoch);
    try {
      for (let i = 0; i < 400; i++) room.step();
      const box = room.runtime.bodies.get(playgroundIds.box)!;
      expect(box.translation().y).toBeGreaterThan(2);
      const staged = room.prepareEdit("delete", 1, {
        type: "remove",
        objectId: playgroundIds.table,
      });
      expect(
        staged.checkpoint.states.some((s) => s.id === playgroundIds.table),
      ).toBe(false);
      // A crash after durable commit but before the live apply must also drop unsupported bodies.
      const immediate = await PhysicsRoom.create(
        staged.scene,
        epoch,
        2,
        staged.checkpoint,
      );
      for (let i = 0; i < 180; i++) immediate.step();
      expect(
        immediate.runtime.state(playgroundIds.box).position.y,
      ).toBeLessThan(0.6);
      immediate.dispose();
      room.commitEdit("delete");
      for (let i = 0; i < 180; i++) room.step();
      expect(box.translation().y).toBeLessThan(0.6);
      const restored = await PhysicsRoom.create(
        room.runtime.scene,
        epoch,
        2,
        room.checkpoint(2),
      );
      expect(restored.runtime.bodies.has(playgroundIds.table)).toBe(false);
      restored.dispose();
    } finally {
      room.dispose();
    }
  });
});
