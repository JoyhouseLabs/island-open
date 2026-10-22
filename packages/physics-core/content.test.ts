import { expect, it } from "vitest";
import { identityQuaternion } from "@island/contracts";
import { PhysicsRoom } from "./src/room.js";
import { createPlayground, officialPhysicsObjects } from "./src/index.js";
const id = "10000000-0000-4000-8000-000000000099",
  epoch = "10000000-0000-4000-8000-000000000000";
it("content devices retain physical geometry and exact version through binding, movement, clearing and restore", async () => {
  for (const kind of ["sign", "bookshelf"]) {
    const room = await PhysicsRoom.create(createPlayground(), epoch);
    try {
      const definition = officialPhysicsObjects().find(
        (d) => d.id === `core:${kind}`,
      )!;
      room.prepareEdit(
        "place",
        1,
        {
          type: "place",
          object: {
            id,
            definitionId: definition.id,
            definitionVersion: 1,
            position: { x: 8, y: 0, z: 7 },
            rotation: identityQuaternion,
          },
        },
        definition,
      );
      room.commitEdit("place");
      const count = room.runtime.world.colliders.len();
      const ref = { id: "20000000-0000-4000-8000-000000000099", version: 1 };
      room.prepareEdit("content", 2, {
        type: "content",
        objectId: id,
        contentRef: ref,
      });
      room.commitEdit("content");
      expect(room.runtime.world.colliders.len()).toBe(count);
      room.prepareEdit("move", 3, {
        type: "move",
        objectId: id,
        position: { x: 9, y: 0, z: 7 },
        rotation: identityQuaternion,
      });
      room.commitEdit("move");
      expect(
        room.runtime.scene.objects.find((o) => o.id === id)!.contentRef,
      ).toEqual(ref);
      const restored = await PhysicsRoom.create(
        room.runtime.scene,
        epoch,
        4,
        room.checkpoint(1),
      );
      try {
        expect(
          restored.runtime.scene.objects.find((o) => o.id === id)!.contentRef,
        ).toEqual(ref);
      } finally {
        restored.dispose();
      }
      room.prepareEdit("clear", 4, {
        type: "content",
        objectId: id,
        contentRef: null,
      });
      room.commitEdit("clear");
      expect(
        room.runtime.scene.objects.find((o) => o.id === id)!.contentRef,
      ).toBeUndefined();
      const box = room.runtime.scene.objects.find(
        (o) => o.definitionId === "core:box",
      )!;
      expect(() =>
        room.prepareEdit("invalid", 5, {
          type: "content",
          objectId: box.id,
          contentRef: ref,
        }),
      ).toThrow("固定内容装置");
    } finally {
      room.dispose();
    }
  }
});
