import { describe, expect, it } from "vitest";
import {
  PhysicsRuntime,
  PhysicsGrab,
  createPlayground,
  playgroundIds,
  PHYSICS_DT,
} from "./src/index.js";
import { identityQuaternion, type PhysicsScene } from "@island/contracts";

function floor(): PhysicsScene {
  const scene = createPlayground();
  scene.objects = scene.objects.filter((o) => o.id === playgroundIds.floor);
  scene.definitions = scene.definitions.filter((d) => d.id === "core:floor");
  return scene;
}
function addBox(
  scene: PhysicsScene,
  id: number,
  position: { x: number; y: number; z: number },
  halfExtents: { x: number; y: number; z: number },
  dynamic = false,
) {
  const definitionId = `test:box-${id}`,
    uuid = `10000000-0000-4000-8000-${String(id).padStart(12, "0")}`;
  scene.definitions.push({
    id: definitionId,
    version: 1,
    source: "official",
    name: "测试方块",
    bodyType: dynamic ? "dynamic" : "fixed",
    material: "wood",
    abilities: dynamic ? ["grabbable"] : [],
    parts: [
      {
        id: "body",
        shape: { kind: "box", halfExtents },
        position: { x: 0, y: 0, z: 0 },
        rotation: identityQuaternion,
        color: "#aaaaaa",
        sensor: false,
      },
    ],
  });
  scene.objects.push({
    id: uuid,
    definitionId,
    definitionVersion: 1,
    position,
    rotation: identityQuaternion,
  });
  return uuid;
}
const idle = { x: 0, z: 0, jump: false };
describe("physical interaction acceptance", () => {
  it("lets a read-only visitor approach a box without moving it through solver contacts", async () => {
    const scene = floor(),
      id = addBox(
        scene,
        1,
        { x: 0, y: 0.4, z: 0 },
        { x: 0.4, y: 0.4, z: 0.4 },
        true,
      );
    const runtime = await PhysicsRuntime.create(scene),
      visitor = runtime.createCharacter(
        "visitor",
        { x: -2, y: 1, z: 0 },
        false,
      );
    try {
      for (let n = 0; n < 180; n++)
        runtime.step((dt) => visitor.step({ ...idle, x: 1 }, dt));
      expect(Math.abs(runtime.state(id).position.x)).toBeLessThan(0.01);
      expect(visitor.position().x).toBeLessThan(-0.65);
      visitor.setCanPush(true);
      for (let n = 0; n < 120; n++)
        runtime.step((dt) => visitor.step({ ...idle, x: 1 }, dt));
      expect(runtime.state(id).position.x).toBeGreaterThan(1);
    } finally {
      runtime.dispose();
    }
  });
  it("prevents a minimum-size fast ball passing through a thin wall", async () => {
    const scene = floor();
    addBox(scene, 1, { x: 0, y: 1, z: 0 }, { x: 0.025, y: 1, z: 2 });
    const ball = createPlayground().definitions.find(
      (d) => d.id === "core:ball",
    )!;
    ball.parts[0]!.shape = { kind: "ball", radius: 0.025 };
    scene.definitions.push(ball);
    scene.objects.push({
      id: playgroundIds.ball,
      definitionId: ball.id,
      definitionVersion: 1,
      position: { x: -1, y: 1, z: 0 },
      rotation: identityQuaternion,
    });
    const runtime = await PhysicsRuntime.create(scene);
    try {
      runtime.bodies
        .get(playgroundIds.ball)!
        .setLinvel({ x: 20, y: 0, z: 0 }, true);
      for (let n = 0; n < 10; n++) {
        runtime.step();
        expect(runtime.state(playgroundIds.ball).position.x).toBeLessThan(
          -0.025,
        );
      }
    } finally {
      runtime.dispose();
    }
  });
  it("keeps jump height within 5 cm at 20, 30, 60 and 120 rendering fps", async () => {
    const heights = [];
    for (const fps of [20, 30, 60, 120]) {
      const runtime = await PhysicsRuntime.create(floor()),
        player = runtime.createCharacter("player");
      try {
        let apex = 0;
        for (let n = 0; n < fps * 3; n++) {
          runtime.advance(1 / fps, (dt) =>
            player.step({ ...idle, jump: n >= fps && n < fps * 2 }, dt),
          );
          apex = Math.max(apex, player.position().y);
        }
        heights.push(apex);
        expect(player.grounded).toBe(true);
      } finally {
        runtime.dispose();
      }
    }
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(0.05);
  });
  it("repeats 100 jumps without sinking, floating or holding-to-bounce", async () => {
    const runtime = await PhysicsRuntime.create(floor()),
      player = runtime.createCharacter("player");
    try {
      for (let n = 0; n < 60; n++) runtime.step((dt) => player.step(idle, dt));
      for (let attempt = 0; attempt < 100; attempt++) {
        let apex = 0;
        for (let n = 0; n < 90; n++) {
          runtime.step((dt) => player.step({ ...idle, jump: n < 80 }, dt));
          apex = Math.max(apex, player.position().y);
        }
        expect(apex).toBeGreaterThan(1.8);
        expect(apex).toBeLessThan(2.2);
        expect(player.position().y).toBeCloseTo(0.865, 2);
        expect(player.grounded).toBe(true);
      }
    } finally {
      runtime.dispose();
    }
  });
  it("climbs a low step, stops at a tall wall and collides with a ceiling", async () => {
    const scene = floor();
    addBox(scene, 1, { x: 0, y: 0.1, z: 0 }, { x: 1.5, y: 0.1, z: 1 });
    addBox(scene, 2, { x: 2, y: 1, z: 0 }, { x: 0.1, y: 1, z: 2 });
    addBox(scene, 3, { x: 0, y: 2.3, z: 0 }, { x: 1.5, y: 0.1, z: 1 });
    const runtime = await PhysicsRuntime.create(scene),
      player = runtime.createCharacter("player", { x: -2, y: 1, z: 0 });
    try {
      for (let n = 0; n < 30; n++)
        runtime.step((dt) => player.step({ ...idle, x: 1 }, dt));
      expect(player.position().y).toBeGreaterThan(1.03);
      let apex = 0;
      for (let n = 0; n < 60; n++) {
        runtime.step((dt) => player.step({ ...idle, jump: n < 30 }, dt));
        apex = Math.max(apex, player.position().y);
      }
      expect(apex).toBeLessThan(1.38);
      for (let n = 0; n < 120; n++)
        runtime.step((dt) => player.step({ ...idle, x: 1 }, dt));
      expect(player.position().x).toBeLessThan(1.61);
    } finally {
      runtime.dispose();
    }
  });
  it("follows a slope and can stand on a raised box after jumping", async () => {
    const runtime = await PhysicsRuntime.create(createPlayground()),
      player = runtime.createCharacter("player", { x: 1, y: 1, z: -2 });
    try {
      let apex = 0;
      for (let n = 0; n < 120; n++) {
        runtime.step((dt) => player.step({ ...idle, x: -1 }, dt));
        apex = Math.max(apex, player.position().y);
      }
      expect(apex).toBeGreaterThan(2.2);
    } finally {
      runtime.dispose();
    }
    const scene = floor();
    addBox(scene, 1, { x: 0, y: 0.45, z: 0 }, { x: 0.45, y: 0.45, z: 0.45 });
    const second = await PhysicsRuntime.create(scene),
      jumper = second.createCharacter("player", { x: -1.1, y: 1, z: 0 });
    try {
      for (let n = 0; n < 30; n++) second.step((dt) => jumper.step(idle, dt));
      // Stop before crossing the 0.9 m box; the deceleration remains physical.
      for (let n = 0; n < 20; n++)
        second.step((dt) => jumper.step({ ...idle, x: 1, jump: true }, dt));
      for (let n = 0; n < 90; n++) second.step((dt) => jumper.step(idle, dt));
      expect(jumper.position().y).toBeCloseTo(1.765, 1);
    } finally {
      second.dispose();
    }
  });
  it("previews a supported landing, rejects penetration and retains the grabbed item on failure", async () => {
    const scene = floor(),
      id = addBox(
        scene,
        1,
        { x: 0, y: 1.4, z: 0 },
        { x: 0.4, y: 0.4, z: 0.4 },
        true,
      );
    const runtime = await PhysicsRuntime.create(scene),
      player = runtime.createCharacter("player", { x: 0, y: 1, z: 1.6 });
    const grab = new PhysicsGrab(runtime.world, player),
      body = runtime.bodies.get(id)!;
    try {
      runtime.step();
      grab.take(body);
      const preview = grab.previewDrop();
      expect(preview?.valid).toBe(true);
      expect(preview?.position.y).toBeCloseTo(0.405, 2);
      body.setTranslation({ x: 0, y: 0.1, z: 0 }, true);
      runtime.world.propagateModifiedBodyPositionsToColliders();
      expect(() => grab.drop()).toThrow("障碍");
      expect(grab.body).toBe(body);
      body.setTranslation({ x: 0, y: 1.4, z: 0 }, true);
      runtime.world.propagateModifiedBodyPositionsToColliders();
      grab.drop();
      expect(grab.body).toBeNull();
      expect(body.translation().y).toBeCloseTo(1.4, 3);
      for (let n = 0; n < 180; n++) runtime.step();
      expect(body.translation().y).toBeCloseTo(0.4, 2);
    } finally {
      grab.release();
      runtime.dispose();
    }
  });
  it("refuses dropping into the void and arbitrates grabbing before releasing a claim", async () => {
    const scene = floor(),
      id = addBox(
        scene,
        1,
        { x: 0, y: 1.4, z: 0 },
        { x: 0.3, y: 0.3, z: 0.3 },
        true,
      );
    const runtime = await PhysicsRuntime.create(scene);
    const one = runtime.createCharacter("one", { x: 0, y: 1, z: 1.5 }),
      two = runtime.createCharacter("two", { x: 0, y: 1, z: -1.5 });
    const first = new PhysicsGrab(runtime.world, one),
      second = new PhysicsGrab(runtime.world, two),
      body = runtime.bodies.get(id)!;
    try {
      runtime.step();
      first.take(body);
      expect(() => second.take(body)).toThrow("其他人");
      first.release();
      second.take(body);
      expect(second.body).toBe(body);
      body.setTranslation({ x: 18, y: 2, z: 0 }, true);
      runtime.world.propagateModifiedBodyPositionsToColliders();
      expect(() => second.drop()).toThrow("表面");
      expect(second.body).toBe(body);
      second.release();
    } finally {
      first.release();
      second.release();
      runtime.dispose();
    }
  });
  it("has no player-to-player pushing and bounds collision feedback while at rest", async () => {
    const runtime = await PhysicsRuntime.create(createPlayground());
    const a = runtime.createCharacter("a", { x: -1, y: 1, z: 7 }),
      b = runtime.createCharacter("b", { x: 0, y: 1, z: 7 });
    try {
      const impacts = [];
      for (let n = 0; n < 180; n++) {
        runtime.step((dt) => {
          a.step({ ...idle, x: 1 }, dt);
          b.step(idle, dt);
        });
        impacts.push(...runtime.takeImpacts());
      }
      expect(a.position().x).toBeGreaterThan(2);
      expect(Math.abs(b.position().x)).toBeLessThan(0.01);
      expect(
        impacts.some((e) => e.material === "wood" || e.material === "rubber"),
      ).toBe(true);
      for (let n = 0; n < 600; n++) runtime.step();
      expect(runtime.takeImpacts().length).toBeLessThanOrEqual(64);
    } finally {
      runtime.dispose();
    }
  });
  it("reconciles character state for replay without losing jump or horizontal velocity", async () => {
    const runtime = await PhysicsRuntime.create(floor()),
      a = runtime.createCharacter("a"),
      b = runtime.createCharacter("b");
    try {
      for (let n = 0; n < 60; n++) runtime.step((dt) => a.step(idle, dt));
      for (let n = 0; n < 10; n++)
        runtime.step((dt) => a.step({ x: 1, z: 0, jump: true }, dt));
      b.reconcile(a.snapshot());
      for (let n = 0; n < 20; n++)
        runtime.step((dt) => {
          a.step(idle, dt);
          b.step(idle, dt);
        });
      expect(b.position().x).toBeCloseTo(a.position().x, 4);
      expect(b.position().y).toBeCloseTo(a.position().y, 4);
    } finally {
      runtime.dispose();
    }
  });
});
