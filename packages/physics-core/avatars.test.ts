import { describe, expect, it } from "vitest";
import { defaultAvatar } from "@island/contracts";
import { PhysicsRoom } from "./src/room.js";
import { createPhysicsScene } from "./src/index.js";

describe("authoritative appearance", () => {
  it("keeps clothing separate from movement and ignores older revisions", async () => {
    const room = await PhysicsRoom.create(
      createPhysicsScene("building-yard"),
      "10000000-0000-4000-8000-000000000001",
    );
    try {
      const appearance = {
        name: "访客",
        avatar: { ...defaultAvatar },
        revision: 1,
      };
      room.join("one", false, appearance);
      room.join("two", false);
      appearance.avatar.hat = "copter";
      expect(room.playerState("one").appearance.avatar.hat).toBe("none");
      const before = room.runtime.world.colliders.len();
      room.setAppearance("one", {
        name: "访客",
        avatar: { form: "bunnybot", accent: "#ABCDEF", hat: "copter" },
        revision: 2,
      });
      for (let i = 0; i < 120; i++) {
        for (const id of ["one", "two"])
          room.command(id, {
            type: "input",
            layoutRevision: 1,
            sequence: i,
            x: 1,
            z: 0,
            yaw: Math.PI / 2,
            jump: i === 10,
          });
        room.step();
      }
      expect(room.playerState("one").position).toEqual(
        room.playerState("two").position,
      );
      expect(room.runtime.world.colliders.len()).toBe(before);
      const one = room.playerState("one");
      expect(one.appearance.avatar.accent).toBe("#abcdef");
      room.setAppearance("one", {
        name: "旧",
        avatar: defaultAvatar,
        revision: 1,
      });
      expect(room.playerState("one").appearance.revision).toBe(2);
      one.appearance.avatar.hat = "none";
      expect(room.playerState("one").appearance.avatar.hat).toBe("copter");
      expect(JSON.stringify(room.checkpoint(1))).not.toContain("appearance");
    } finally {
      room.dispose();
    }
  });
  it("rejects invalid appearances before creating a character", async () => {
    const room = await PhysicsRoom.create(
      createPhysicsScene("building-yard"),
      "10000000-0000-4000-8000-000000000002",
    );
    try {
      const before = room.runtime.world.colliders.len();
      expect(() =>
        room.join("bad", false, {
          name: "bad",
          avatar: { ...defaultAvatar, form: "invisible" as never },
          revision: 0,
        }),
      ).toThrow();
      expect(room.runtime.world.colliders.len()).toBe(before);
    } finally {
      room.dispose();
    }
  });
});
