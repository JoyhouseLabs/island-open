import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { libraryTable } from "@island/world-core";
import {
  PhysicsRuntime,
  createPhysicsScene,
  assertSceneTemplate,
  officialPhysicsObjects,
} from "./src/index.js";
import { PhysicsRoom } from "./src/room.js";

describe("physical library", () => {
  it("supports a real loose book on the table, falls to the deck and restores the settled state", async () => {
    const scene = createPhysicsScene("library", randomUUID),
      room = await PhysicsRoom.create(scene, randomUUID());
    const book = scene.objects.find(
      (o) => o.definitionId === "core:reading-book",
    )!;
    try {
      expect(officialPhysicsObjects()).toContainEqual(
        scene.definitions.find((d) => d.id === book.definitionId),
      );
      for (let i = 0; i < 180; i++) room.step();
      expect(room.runtime.state(book.id).position.y).toBeCloseTo(
        libraryTable.top + 0.1,
        2,
      );
      const body = room.runtime.bodies.get(book.id)!;
      body.setTranslation({ x: 5, y: 3, z: 4 }, true);
      for (let i = 0; i < 180; i++) room.step();
      expect(room.runtime.state(book.id).position.y).toBeCloseTo(0.1, 2);
      const saved = room.checkpoint(1);
      const restored = await PhysicsRoom.create(scene, randomUUID(), 1, saved);
      try {
        expect(restored.runtime.state(book.id).position).toEqual(
          room.runtime.state(book.id).position,
        );
        expect(() => assertSceneTemplate(restored.runtime.scene)).not.toThrow();
      } finally {
        restored.dispose();
      }
      const altered = structuredClone(scene);
      altered.objects.find((o) => o.infrastructureKey === "table")!.position
        .y++;
      expect(() => assertSceneTemplate(altered)).toThrow("基础设施");
    } finally {
      room.dispose();
    }
  });
  it("walks through the entrance, stops at the bookcase and jumps onto the actual table", async () => {
    const runtime = await PhysicsRuntime.create(createPhysicsScene("library")),
      player = runtime.createCharacter("reader");
    const step = (x = 0, z = 0, jump = false, count = 1) => {
      for (let i = 0; i < count; i++)
        runtime.step((dt) => player.step({ x, z, jump: jump && i === 0 }, dt));
    };
    try {
      player.teleport({ x: 0, y: 0.87, z: 31 });
      step(0, -1, false, 100);
      expect(player.position().z).toBeLessThan(25);
      player.teleport({ x: -22, y: 0.99, z: -10 });
      step(-1, 0, false, 100);
      expect(player.position().x).toBeGreaterThan(-24.1);
      // Approach the clear eastern half, away from the loose book and seated reading area.
      player.teleport({ x: -1.05, y: 0.87, z: 5 });
      step(0, 0, false, 20);
      step(0, -1, true, 25);
      step(0, 0, false, 90);
      expect(player.grounded).toBe(true);
      expect(player.position().y).toBeCloseTo(libraryTable.top + 0.87, 1);
      expect(runtime.world.colliders.len()).toBeLessThan(200);
    } finally {
      runtime.dispose();
    }
  });
  it("uses the shared seat ownership and safe standing rules on its cushions", async () => {
    const scene = createPhysicsScene("library"),
      seat = scene.objects.find((o) => o.infrastructureKey === "cushion-1")!;
    const room = await PhysicsRoom.create(scene, randomUUID());
    try {
      room.join("reader", true);
      let sequence = 0;
      const walk = (x: number, z: number, steps: number) => {
        for (let i = 0; i < steps; i++) {
          if (i % 10 === 0)
            room.command("reader", {
              type: "input",
              sequence: ++sequence,
              layoutRevision: 1,
              x,
              z,
              yaw: 0,
              jump: false,
            });
          room.step();
        }
      };
      walk(1, 0, 18);
      walk(0, -1, 65);
      walk(0, 0, 30);
      const seated = room.command("reader", {
        type: "sit",
        sequence: 1,
        commandId: randomUUID(),
        layoutRevision: 1,
        objectId: seat.id,
      });
      expect(seated?.ok, seated?.message).toBe(true);
      expect(room.playerState("reader").seatId).toBe(seat.id);
      const stood = room.command("reader", {
        type: "stand",
        sequence: 2,
        commandId: randomUUID(),
        layoutRevision: 1,
      });
      expect(stood?.ok, stood?.message).toBe(true);
      expect(room.playerState("reader").position.y).toBeCloseTo(0.87, 1);
    } finally {
      room.dispose();
    }
  });
});
