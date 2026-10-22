import { describe, it, expect } from "vitest";
import {
  createPlayground,
  PhysicsRuntime,
  PhysicsCharacter,
  PhysicsGrab,
  playgroundIds,
  PHYSICS_DT,
} from "./src/index.js";
import { physicsSceneSchema, PHYSICS_RULES_VERSION } from "@island/contracts";

describe("Rapier simulation", () => {
  it("carries the player on an elevator without losing support", async () => {
    const runtime = await PhysicsRuntime.create(createPlayground());
    const player = runtime.createCharacter("owner", { x: -4, y: 1.3, z: 4 });
    try {
      for (let n = 0; n < 650; n++) {
        runtime.step((dt) => player.step({ x: 0, z: 0, jump: false }, dt));
        if (n > 30) {
          const top = runtime.state(playgroundIds.platform).position.y + 0.125;
          expect(Math.abs(player.position().y - 0.85 - top)).toBeLessThan(0.08);
        }
      }
    } finally {
      runtime.dispose();
    }
  });
  it("recovers out-of-bounds objects without deleting their instance", async () => {
    const runtime = await PhysicsRuntime.create(createPlayground());
    try {
      const box = runtime.bodies.get(playgroundIds.box)!;
      box.setTranslation({ x: 100, y: -10, z: 0 }, true);
      runtime.step();
      expect(runtime.recoveries).toBe(1);
      expect(runtime.state(playgroundIds.box).position.x).toBe(3);
      expect(runtime.bodies.size).toBe(runtime.scene.objects.length);
    } finally {
      runtime.dispose();
    }
  });
  it("only grabs nearby visible bodies and pulls using physical impulses", async () => {
    const runtime = await PhysicsRuntime.create(createPlayground());
    const player = runtime.createCharacter("owner", { x: 3, y: 2.5, z: 1.8 });
    const grab = new PhysicsGrab(runtime.world, player),
      box = runtime.bodies.get(playgroundIds.box)!;
    try {
      runtime.step();
      expect(() => grab.take(runtime.bodies.get(playgroundIds.ball)!)).toThrow(
        "靠近",
      );
      grab.take(box);
      const before = { ...box.translation() };
      grab.step({ x: 0, y: 0, z: -1 }, PHYSICS_DT);
      expect(box.translation()).toEqual(before);
      expect(box.linvel().y).toBeGreaterThan(-1);
      grab.release();
      player.teleport({ x: 3, y: 0.9, z: 0 });
      runtime.step();
      expect(() => grab.take(box)).toThrow("挡住");
    } finally {
      runtime.dispose();
    }
  });
  it("supports a capsule, jumps once when held, and returns to ground", async () => {
    const runtime = await PhysicsRuntime.create(createPlayground());
    const player = new PhysicsCharacter(runtime.world, runtime.scene.spawn);
    try {
      const idle = { x: 0, z: 0, jump: false };
      for (let n = 0; n < 60; n++) runtime.step((dt) => player.step(idle, dt));
      const floor = player.position().y;
      expect(floor).toBeCloseTo(0.865, 1);
      expect(player.grounded).toBe(true);
      let apex = floor;
      for (let n = 0; n < 120; n++) {
        runtime.step((dt) => player.step({ ...idle, jump: true }, dt));
        apex = Math.max(apex, player.position().y);
      }
      expect(apex - floor).toBeGreaterThan(0.9);
      expect(apex - floor).toBeLessThan(1.3);
      expect(player.position().y).toBeCloseTo(floor, 2);
      for (let n = 0; n < 60; n++)
        runtime.step((dt) => player.step({ ...idle, x: 1 }, dt));
      expect(player.position().x).toBeGreaterThan(3);
      expect(() => player.step({ ...idle, x: Infinity }, PHYSICS_DT)).toThrow();
    } finally {
      player.dispose();
      runtime.dispose();
    }
  });
  it("rolls a ball down a slope and supports a box on a compound table", async () => {
    const runtime = await PhysicsRuntime.create(createPlayground());
    try {
      let furthest = -6.5;
      for (let n = 0; n < 600; n++) {
        runtime.step();
        furthest = Math.max(
          furthest,
          runtime.state(playgroundIds.ball).position.x,
        );
      }
      // Recovery brings escaped balls back to the ramp; observe the trajectory,
      // not an arbitrary final position after a possible recovery.
      expect(furthest).toBeGreaterThan(0);
      const resting = runtime.state(playgroundIds.box).position;
      expect(resting.y).toBeCloseTo(2.075, 1);
      for (let n = 0; n < 600; n++) runtime.step();
      expect(
        Math.abs(runtime.state(playgroundIds.box).position.y - resting.y),
      ).toBeLessThan(0.01);
    } finally {
      runtime.dispose();
    }
  });
  it("runs the same physics at 30, 60 and 120 rendering frames per second", async () => {
    const results = [];
    for (const fps of [30, 60, 120]) {
      const runtime = await PhysicsRuntime.create(createPlayground());
      try {
        for (let n = 0; n < fps * 4; n++) runtime.advance(1 / fps);
        expect(runtime.tick).toBe(240);
        results.push(runtime.state(playgroundIds.ball).position);
      } finally {
        runtime.dispose();
      }
    }
    expect(results[0]).toEqual(results[1]);
    expect(results[1]).toEqual(results[2]);
  });
  it("caps catch-up and clears hidden-tab time without exploding velocities", async () => {
    const runtime = await PhysicsRuntime.create(createPlayground());
    try {
      expect(runtime.advance(60)).toBe(4);
      expect(runtime.droppedSeconds).toBeGreaterThan(59);
      runtime.advance(PHYSICS_DT / 2);
      runtime.pauseClock();
      expect(runtime.alpha).toBe(0);
      expect(() => runtime.advance(NaN)).toThrow();
      expect(() =>
        runtime.impulse(playgroundIds.box, { x: Infinity, y: 0, z: 0 }),
      ).toThrow();
    } finally {
      runtime.dispose();
    }
  });
  it("restores a layout checkpoint at rest and rejects mismatched objects atomically", async () => {
    const runtime = await PhysicsRuntime.create(createPlayground());
    try {
      for (let n = 0; n < 120; n++) runtime.step();
      const checkpoint = {
        schemaVersion: 4,
        physicsVersion: PHYSICS_RULES_VERSION,
        layoutRevision: 1,
        revision: 1,
        tick: runtime.tick,
        states: runtime.states(),
      };
      runtime.impulse(playgroundIds.box, { x: 2, y: 2, z: 0 });
      for (let n = 0; n < 60; n++) runtime.step();
      runtime.restore(checkpoint);
      for (const expected of checkpoint.states) {
        const actual = runtime.state(expected.id);
        for (const axis of ["x", "y", "z"] as const)
          expect(actual.position[axis]).toBeCloseTo(expected.position[axis], 4);
        const dot =
          actual.rotation.x * expected.rotation.x +
          actual.rotation.y * expected.rotation.y +
          actual.rotation.z * expected.rotation.z +
          actual.rotation.w * expected.rotation.w;
        expect(2 * Math.acos(Math.min(1, Math.abs(dot)))).toBeLessThan(
          Math.PI / 180,
        );
      }
      expect(runtime.bodies.get(playgroundIds.box)!.linvel()).toEqual({
        x: 0,
        y: 0,
        z: 0,
      });
      const restored = runtime.states();
      expect(() =>
        runtime.restore({ ...checkpoint, states: checkpoint.states.slice(1) }),
      ).toThrow();
      expect(runtime.states()).toEqual(restored);
    } finally {
      runtime.dispose();
    }
  });
  it("frees worlds idempotently and refuses use after disposal", async () => {
    for (let n = 0; n < 60; n++) {
      const runtime = await PhysicsRuntime.create(createPlayground());
      runtime.step();
      runtime.dispose();
      runtime.dispose();
      expect(runtime.bodies.size).toBe(0);
      expect(() => runtime.step()).toThrow("关闭");
    }
  });
  it("rejects old formats, missing definitions, duplicated IDs and excessive dynamic objects", () => {
    const scene = createPlayground();
    expect(
      physicsSceneSchema.safeParse({ ...scene, schemaVersion: 3 }).success,
    ).toBe(false);
    expect(
      physicsSceneSchema.safeParse({ ...scene, definitions: [] }).success,
    ).toBe(false);
    expect(
      physicsSceneSchema.safeParse({
        ...scene,
        objects: [...scene.objects, scene.objects[0]],
      }).success,
    ).toBe(false);
    const ball = scene.objects.find((o) => o.id === playgroundIds.ball)!;
    const objects = Array.from({ length: 33 }, (_, n) => ({
      ...ball,
      id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    }));
    expect(physicsSceneSchema.safeParse({ ...scene, objects }).success).toBe(
      false,
    );
    expect(
      physicsSceneSchema.safeParse({ ...scene, spawn: { x: NaN, y: 0, z: 0 } })
        .success,
    ).toBe(false);
  });
});
