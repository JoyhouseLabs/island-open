import { describe, expect, it } from "vitest";
import { physicsFrameSchema, physicsCheckpointSchema } from "@island/contracts";
import { PhysicsRoom } from "./src/room.js";
import { createPlayground, playgroundIds } from "./src/index.js";

const epoch = "10000000-0000-4000-8000-000000000000";
const uuid = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const input = (sequence: number, x = 0, z = 0) => ({
  type: "input",
  sequence,
  layoutRevision: 1,
  x,
  z,
  jump: false,
  yaw: 0,
});
const action = (sequence: number, type = "grab") => ({
  type,
  sequence,
  layoutRevision: 1,
  commandId: uuid(sequence),
  objectId: playgroundIds.box,
});
function fixture() {
  const scene = createPlayground();
  scene.objects = scene.objects.filter((o) =>
    [playgroundIds.floor, playgroundIds.box].includes(o.id),
  );
  scene.objects.find((o) => o.id === playgroundIds.box)!.position = {
    x: 0,
    y: 0.5,
    z: 1.5,
  };
  scene.spawn = { x: 0, y: 0.87, z: 0 };
  return scene;
}
async function ready() {
  const room = await PhysicsRoom.create(fixture(), epoch);
  room.join("host", true);
  for (let n = 0; n < 60; n++) room.step();
  return room;
}

describe("authoritative physics room", () => {
  it("tosses with bounded speed and immediately frees the grab claim", async () => {
    const room = await ready();
    try {
      room.join("guest", true);
      expect(room.command("host", action(1))?.ok).toBe(true);
      const toss = {
        type: "toss",
        layoutRevision: 1,
        sequence: 2,
        commandId: uuid(2),
      };
      expect(room.command("host", toss)?.ok).toBe(true);
      const body = room.runtime.bodies.get(playgroundIds.box)!;
      expect(body.linvel()).toEqual({ x: 0, y: 2, z: 3 });
      expect(room.playerState("host").held).toBeNull();
      expect(room.command("guest", action(1))?.ok).toBe(true);
      expect(room.command("host", toss)?.ok).toBe(true);
      expect(room.playerState("guest").held).toBe(playgroundIds.box);
    } finally {
      room.dispose();
    }
  });
  it("moves once per tick, rejects pose injection and ignores reordered input", async () => {
    const room = await ready();
    try {
      const start = room.playerState("host").position;
      for (let n = 0; n < 1000; n++) room.command("host", input(n, 1));
      expect(room.playerState("host").position).toEqual(start);
      room.command("host", input(1, -1));
      room.step();
      const state = room.playerState("host");
      expect(state.position.x - start.x).toBeGreaterThan(0);
      expect(state.position.x - start.x).toBeLessThan(4.2 / 60);
      expect(state.ackInput).toBe(999);
      expect(() =>
        room.command("host", {
          ...input(1000),
          position: { x: 20, y: 20, z: 20 },
        }),
      ).toThrow("格式");
      expect(() =>
        room.command("host", { ...input(1000), x: Infinity }),
      ).toThrow("格式");
      for (let n = 0; n < 80; n++) room.step();
      const stopped = room.playerState("host").position;
      for (let n = 0; n < 30; n++) room.step();
      expect(room.playerState("host").position.x).toBeCloseTo(stopped.x, 3);
    } finally {
      room.dispose();
    }
  });

  it("enforces visitor rights and four players, releasing claims on revoke and leave", async () => {
    const room = await ready();
    try {
      room.join("guest", false);
      room.join("third", true);
      room.join("fourth", false);
      expect(() => room.join("fifth", false)).toThrow("已满");
      expect(() => room.command("guest", action(1))).toThrow("尚未开放");
      expect(room.command("host", action(1))?.ok).toBe(true);
      expect(room.command("third", action(1))?.message).toContain("其他人");
      room.setPermission("host", false);
      expect(room.playerState("host").held).toBeNull();
      expect(room.command("third", action(2))?.ok).toBe(true);
      room.leave("third");
      room.setPermission("guest", true);
      expect(room.command("guest", action(2))?.ok).toBe(true);
      room.leave("guest");
      expect(() => room.command("guest", input(3))).toThrow("重新进入");
      room.join("fifth", false);
      expect(room.size).toBe(3);
    } finally {
      room.dispose();
    }
  });

  it("releases a held object after input timeout", async () => {
    const room = await ready();
    try {
      room.command("host", input(1));
      expect(room.command("host", action(1))?.ok).toBe(true);
      for (let n = 0; n < 20; n++) room.step();
      expect(room.playerState("host").held).toBeNull();
    } finally {
      room.dispose();
    }
  });

  it("replays receipts without another impulse and prevents reuse after cache eviction", async () => {
    const room = await ready();
    try {
      const command = action(1, "push"),
        body = room.runtime.bodies.get(playgroundIds.box)!;
      const receipt = room.command("host", command),
        velocity = { ...body.linvel() };
      expect(receipt?.ok).toBe(true);
      expect(room.command("host", command)).toEqual(receipt);
      expect(body.linvel()).toEqual(velocity);
      expect(() => room.command("host", { ...command, type: "grab" })).toThrow(
        "另一项",
      );
      for (let n = 2; n < 140; n++)
        room.command("host", {
          type: "drop",
          layoutRevision: 1,
          sequence: n,
          commandId: uuid(n),
        });
      expect(() => room.command("host", command)).toThrow("已过期");
      expect(body.linvel()).toEqual(velocity);
      expect(() =>
        room.command("host", { ...input(1), layoutRevision: 2 }),
      ).toThrow("布局已更新");
    } finally {
      room.dispose();
    }
  });

  it("reconstructs a checkpoint with zero velocity, rejects another layout and sends a full rejoin baseline", async () => {
    const room = await ready();
    let restored: PhysicsRoom | undefined;
    try {
      room.command("host", action(1, "push"));
      for (let n = 0; n < 5; n++) room.step();
      const checkpoint = physicsCheckpointSchema.parse(room.checkpoint(3));
      await expect(
        PhysicsRoom.create(fixture(), epoch, 2, checkpoint),
      ).rejects.toThrow("布局版本");
      restored = await PhysicsRoom.create(fixture(), uuid(99), 1, checkpoint);
      expect(restored.runtime.tick).toBe(room.runtime.tick);
      expect(restored.runtime.state(playgroundIds.box)).toEqual(
        room.runtime.state(playgroundIds.box),
      );
      expect(restored.runtime.bodies.get(playgroundIds.box)!.linvel()).toEqual({
        x: 0,
        y: 0,
        z: 0,
      });
      restored.join("rejoined", true);
      const full = physicsFrameSchema.parse(restored.frame(true));
      expect(full.bodies).toHaveLength(2);
      expect(full.players[0]?.held).toBeNull();
      expect(full.epoch).not.toBe(epoch);
      const first = restored.frame(),
        second = restored.frame();
      expect(first.bodies).toHaveLength(1);
      expect(second.bodies).toHaveLength(0);
      expect(second.sequence).toBe(first.sequence + 1);
      expect(restored.frame(true).bodies).toHaveLength(2);
    } finally {
      room.dispose();
      restored?.dispose();
    }
  });
});
