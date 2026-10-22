import { expect, it } from "vitest";
import { identityQuaternion } from "@island/contracts";
import { PhysicsRoom } from "./src/room.js";
import { createPlayground, officialPhysicsObjects } from "./src/index.js";
const epoch = "10000000-0000-4000-8000-000000000000";
it("atomic scene replacement freezes, aborts cleanly, clears grabs and preserves player identity and platform phase", async () => {
  const room = await PhysicsRoom.create(createPlayground(), epoch);
  try {
    room.join("owner", true);
    for (let i = 0; i < 30; i++) room.step();
    const old = room.runtime,
      scene = structuredClone(old.scene),
      checkpoint = room.checkpoint(0),
      position = room.playerState("owner").position;
    const remap = new Map(
      scene.objects.map((o, i) => [
        o.id,
        `20000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      ]),
    );
    scene.objects.forEach((o) => (o.id = remap.get(o.id)!));
    checkpoint.states.forEach((s) => (s.id = remap.get(s.id)!));
    const result = await room.prepareReplacement("a", 1, scene, checkpoint);
    room.step();
    expect(room.runtime.tick).toBe(30);
    expect(result.backupCheckpoint.tick).toBe(30);
    room.abortEdit("a");
    expect(room.runtime).toBe(old);
    room.step();
    expect(room.runtime.tick).toBe(31);
    await room.prepareReplacement("b", 1, scene, checkpoint);
    room.commitEdit("b");
    expect(room.runtime).not.toBe(old);
    expect(room.layoutRevision).toBe(2);
    expect(room.runtime.tick).toBe(30);
    expect(room.playerState("owner").position.x).toBeCloseTo(position.x, 4);
    expect(room.playerState("owner").held).toBeNull();
    expect(room.size).toBe(1);
    room.step();
    const restored = await PhysicsRoom.create(
      scene,
      epoch,
      2,
      room.checkpoint(1),
    );
    restored.dispose();
  } finally {
    room.dispose();
  }
});
it("replacement rejects interpenetration and a box enclosing a live player without changing the world", async () => {
  const room = await PhysicsRoom.create(createPlayground(), epoch);
  try {
    room.join("owner", true);
    const definition = officialPhysicsObjects().find(
      (d) => d.id === "core:block",
    )!;
    for (const position of [
      { x: 0, y: 1, z: 7 },
      { x: 3, y: 1.5, z: 0 },
    ]) {
      const scene = structuredClone(room.runtime.scene),
        checkpoint = room.checkpoint(0),
        object = {
          id: "30000000-0000-4000-8000-000000000099",
          definitionId: definition.id,
          definitionVersion: 1,
          position,
          rotation: identityQuaternion,
        };
      scene.definitions.push(definition);
      scene.objects.push(object);
      checkpoint.states.push({
        id: object.id,
        position,
        rotation: identityQuaternion,
        sleeping: false,
      });
      await expect(
        room.prepareReplacement("bad", 1, scene, checkpoint),
      ).rejects.toThrow();
      expect(room.layoutRevision).toBe(1);
      expect(room.runtime.bodies.has(object.id)).toBe(false);
      room.step();
    }
  } finally {
    room.dispose();
  }
});
