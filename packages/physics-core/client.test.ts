import { describe, expect, it } from "vitest";
import { PhysicsFrameBuffer, PhysicsPrediction } from "./src/client.js";
import { PhysicsRoom } from "./src/room.js";
import { createPlayground, PHYSICS_DT } from "./src/index.js";

const epoch = "10000000-0000-4000-8000-000000000000";
describe("authoritative physics client", () => {
  it("smooths small visual corrections while applying collision authority immediately", async () => {
    const scene = createPlayground(),
      room = await PhysicsRoom.create(scene, epoch),
      prediction = await PhysicsPrediction.create(scene, "self");
    try {
      room.join("self", false);
      const state = room.playerState("self");
      state.position.x = 0.2;
      prediction.acknowledge(state, room.runtime.states(), true);
      expect(prediction.player.position().x).toBeCloseTo(0.2);
      prediction.updateVisual(PHYSICS_DT);
      expect(prediction.visualPosition.x).toBeGreaterThan(0);
      expect(prediction.visualPosition.x).toBeLessThan(0.07);
      for (let n = 0; n < 60; n++) prediction.updateVisual(PHYSICS_DT);
      expect(prediction.visualPosition.x).toBeCloseTo(0.2, 4);
      state.position.x = 3;
      prediction.acknowledge(state, room.runtime.states(), true);
      prediction.updateVisual(PHYSICS_DT);
      expect(prediction.visualPosition.x).toBeCloseTo(3);
    } finally {
      prediction.dispose();
      room.dispose();
    }
  });
  it("keeps a predicted rider within eight centimeters of the authoritative moving platform", async () => {
    const scene = createPlayground();
    scene.spawn = { x: -4, y: 1.3, z: 4 };
    const room = await PhysicsRoom.create(scene, epoch),
      prediction = await PhysicsPrediction.create(scene, "self");
    try {
      room.join("self", false);
      prediction.acknowledge(
        room.playerState("self"),
        room.runtime.states(),
        true,
      );
      const pending: Array<{
        at: number;
        frame: ReturnType<PhysicsRoom["frame"]>;
      }> = [];
      for (let tick = 0; tick < 700; tick++) {
        prediction.advance(
          PHYSICS_DT,
          { layoutRevision: 1, x: 0, z: 0, jump: false, yaw: 0 },
          (command) => room.command("self", command),
        );
        room.step();
        if (tick % 4 === 0)
          pending.push({ at: tick + 8, frame: room.frame(true) });
        while (pending[0] && pending[0].at <= tick) {
          const frame = pending.shift()!.frame;
          prediction.acknowledge(frame.players[0]!, frame.bodies, false);
        }
        if (tick > 30)
          expect(
            Math.abs(
              prediction.player.position().y -
                room.playerState("self").position.y,
            ),
            `tick ${tick}`,
          ).toBeLessThan(0.08);
      }
    } finally {
      prediction.dispose();
      room.dispose();
    }
  });
  it("requires full baselines, merges deltas and ignores reordered or mismatched frames", async () => {
    const room = await PhysicsRoom.create(createPlayground(), epoch);
    try {
      room.join("self", false);
      const buffer = new PhysicsFrameBuffer(),
        baseline = room.frame(true);
      expect(buffer.accept({ ...baseline, full: false }, 0)).toBe(false);
      expect(buffer.accept(baseline, 0)).toBe(true);
      const changed = {
        ...baseline.bodies[3]!,
        position: { x: 10, y: 1, z: 2 },
      };
      const delta = {
        ...baseline,
        full: false,
        sequence: baseline.sequence + 1,
        bodies: [changed],
      };
      expect(buffer.accept(delta, 100)).toBe(true);
      expect(buffer.latest?.bodies.length).toBe(baseline.bodies.length);
      expect(
        buffer.latest?.bodies.find((body) => body.id === changed.id)?.position
          .x,
      ).toBe(10);
      expect(buffer.accept(baseline, 120)).toBe(false);
      expect(
        buffer.accept({ ...delta, sequence: 2, layoutRevision: 2 }, 130),
      ).toBe(false);
      expect(
        buffer.accept(
          {
            ...delta,
            sequence: 2,
            epoch: "20000000-0000-4000-8000-000000000000",
          },
          130,
        ),
      ).toBe(false);
      expect(buffer.sample(50, 0)?.alpha).toBe(0.5);
      expect(buffer.sample(1000)?.alpha).toBe(1);
      expect(
        buffer.accept({ ...delta, sequence: 8, baseSequence: 7 }, 200),
      ).toBe(false);
      expect(buffer.accept({ ...baseline, sequence: 9 }, 220)).toBe(true);
      expect(
        buffer.accept({ ...delta, sequence: 10, baseSequence: 8 }, 240),
      ).toBe(true);
    } finally {
      room.dispose();
    }
  });
  it("reconciles eight ticks of latency by replaying only unacknowledged capsule inputs", async () => {
    const scene = createPlayground(),
      room = await PhysicsRoom.create(scene, epoch),
      prediction = await PhysicsPrediction.create(scene, "self");
    try {
      room.join("self", false);
      prediction.acknowledge(
        room.playerState("self"),
        room.runtime.states(),
        true,
      );
      const pending: Array<{
        at: number;
        frame: ReturnType<PhysicsRoom["frame"]>;
      }> = [];
      for (let tick = 0; tick < 180; tick++) {
        prediction.advance(
          PHYSICS_DT,
          {
            layoutRevision: 1,
            x: tick < 80 ? 1 : 0,
            z: 0,
            jump: tick === 40,
            yaw: 0,
          },
          (command) => room.command("self", command),
        );
        room.step();
        if (tick % 4 === 0)
          pending.push({ at: tick + 8, frame: room.frame(true) });
        while (pending[0] && pending[0].at <= tick) {
          const frame = pending.shift()!.frame;
          prediction.acknowledge(frame.players[0]!, frame.bodies, false);
        }
        const actual = room.playerState("self").position,
          predicted = prediction.player.position();
        expect(
          Math.hypot(
            actual.x - predicted.x,
            actual.y - predicted.y,
            actual.z - predicted.z,
          ),
          JSON.stringify({
            tick,
            actual,
            predicted,
            state: prediction.player.snapshot(),
            authority: room.playerState("self"),
          }),
        ).toBeLessThan(0.06);
      }
    } finally {
      prediction.dispose();
      room.dispose();
    }
  });
  it("caps catch-up, freezes after a second without acknowledgement and never simulates object gravity", async () => {
    const scene = createPlayground(),
      prediction = await PhysicsPrediction.create(scene, "self");
    try {
      const initial = prediction.runtime.states(),
        sent: number[] = [];
      const input = { layoutRevision: 1, x: 0, z: 0, jump: false, yaw: 0 };
      prediction.advance(10, input, (command) => sent.push(command.sequence));
      expect(sent).toHaveLength(4);
      for (let n = 0; n < 100; n++)
        prediction.advance(PHYSICS_DT, input, (command) =>
          sent.push(command.sequence),
        );
      expect(sent).toHaveLength(60);
      expect(prediction.runtime.states().map((body) => body.position)).toEqual(
        initial.map((body) => body.position),
      );
    } finally {
      prediction.dispose();
    }
  });
});
