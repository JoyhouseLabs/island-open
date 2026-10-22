import { expect, it } from "vitest";
import { identityQuaternion, type ObjectInstance } from "@island/contracts";
import {
  PhysicsRuntime,
  RAPIER,
  createPlayground,
  officialPhysicsObjects,
} from "./src/index.js";
import { PhysicsRoom } from "./src/room.js";
import { PhysicsPrediction } from "./src/client.js";
import { mergeBlockBoxes } from "./src/block-chunks.js";
const definition = officialPhysicsObjects().find((d) => d.id === "core:block")!;
let sequence = 0;
const block = (x: number, y: number, z: number): ObjectInstance => ({
  id: `10000000-0000-4000-8000-${String(sequence++).padStart(12, "0")}`,
  definitionId: definition.id,
  definitionVersion: 1,
  position: { x, y, z },
  rotation: identityQuaternion,
});
function scene(objects: ObjectInstance[]) {
  const scene = createPlayground();
  scene.objects = scene.objects.filter((o) => o.definitionId === "core:floor");
  scene.definitions = scene.definitions.filter((d) => d.id === "core:floor");
  scene.definitions.push(definition);
  scene.objects.push(...objects);
  return scene;
}
it("merges a solid chunk deterministically and retains holes, fractional and rotated shapes", () => {
  const objects = [];
  for (let y = 0; y < 3; y++)
    for (let z = 0; z < 3; z++)
      for (let x = 0; x < 3; x++) objects.push(block(x, y + 0.5, z));
  const boxes = mergeBlockBoxes(objects);
  expect(boxes).toHaveLength(1);
  expect(boxes[0]!.halfExtents).toEqual({ x: 1.5, y: 1.5, z: 1.5 });
  expect(mergeBlockBoxes([...objects].reverse())).toEqual(boxes);
  const hole = objects.find(
    (o) => o.position.x === 1 && o.position.y === 1.5 && o.position.z === 1,
  )!;
  const hollow = mergeBlockBoxes(objects.filter((o) => o !== hole));
  expect(hollow.length).toBeGreaterThan(1);
  expect(
    hollow.reduce(
      (v, b) => v + 8 * b.halfExtents.x * b.halfExtents.y * b.halfExtents.z,
      0,
    ),
  ).toBe(26);
  expect(
    hollow.some(
      (b) =>
        Math.abs(b.position.x - 1) < b.halfExtents.x &&
        Math.abs(b.position.y - 1.5) < b.halfExtents.y &&
        Math.abs(b.position.z - 1) < b.halfExtents.z,
    ),
  ).toBe(false);
  const fractional = block(0.25, 0.5, 0),
    rotated = {
      ...block(5, 0.5, 0),
      rotation: {
        x: 0,
        y: Math.sin(Math.PI / 8),
        z: 0,
        w: Math.cos(Math.PI / 8),
      },
    };
  const mixed = mergeBlockBoxes([block(0, 0.5, 0), fractional, rotated]);
  expect(mixed).toHaveLength(3);
  expect(mixed.find((b) => b.ids[0] === rotated.id)!.rotation).toEqual(
    rotated.rotation,
  );
  const duplicate = { ...objects[0]!, id: block(0, 0.5, 0).id };
  expect(mergeBlockBoxes([objects[0]!, duplicate])).toHaveLength(2);
});
it("preserves every logical block through frames, checkpoints and prediction without per-block rigid bodies", async () => {
  const objects = [];
  for (let x = 8; x < 12; x++)
    for (let z = 8; z < 12; z++) objects.push(block(x, 0.5, z));
  const room = await PhysicsRoom.create(
    scene(objects),
    "20000000-0000-4000-8000-000000000000",
  );
  try {
    expect(room.runtime.blockStats).toMatchObject({
      blocks: 16,
      chunks: 1,
      colliders: 1,
    });
    expect(room.runtime.bodies.size).toBe(1);
    expect(room.runtime.world.bodies.len()).toBe(2);
    expect(room.frame(true).bodies).toHaveLength(17);
    expect(room.frame().bodies).toHaveLength(0);
    const checkpoint = room.checkpoint(1),
      restored = await PhysicsRoom.create(
        room.runtime.scene,
        room.epoch,
        1,
        checkpoint,
      );
    try {
      expect(restored.runtime.states()).toEqual(room.runtime.states());
      expect(restored.runtime.blockStats.colliders).toBe(1);
    } finally {
      restored.dispose();
    }
    const invalid = structuredClone(checkpoint);
    invalid.states.find((s) => s.id === objects[0]!.id)!.position.y += 1;
    expect(() => room.runtime.restore(invalid)).toThrow("必须与布局一致");
    room.join("owner", true);
    const frame = room.frame(true),
      prediction = await PhysicsPrediction.create(room.runtime.scene, "owner");
    try {
      prediction.acknowledge(frame.players[0]!, frame.bodies, true);
      expect(prediction.runtime.blockStats.colliders).toBe(1);
      expect(prediction.runtime.state(objects[0]!.id).position).toEqual(
        objects[0]!.position,
      );
    } finally {
      prediction.dispose();
    }
  } finally {
    room.dispose();
  }
});
it("single-block edits rebuild only old/new chunks and never exclude neighbouring geometry during preview", async () => {
  const a = block(8, 0.5, 8),
    b = block(9, 0.5, 8),
    far = block(-8, 0.5, -8),
    runtime = await PhysicsRuntime.create(scene([a, b, far]));
  try {
    expect(runtime.blockStats.colliders).toBe(2);
    runtime.step();
    expect(runtime.surfaceMaterial({ x: 8, y: 1.4, z: 8 })).toBe("wood");
    const farHandle = runtime.world
      .castRay(
        new RAPIER.Ray({ x: -8, y: 3, z: -8 }, { x: 0, y: -1, z: 0 }),
        10,
        true,
      )!
      .collider.parent()!.handle;
    const farBody = runtime.world.getRigidBody(farHandle);
    expect(() => runtime.validatePlacement(a, definition, a.id)).not.toThrow();
    expect(() =>
      runtime.validatePlacement(
        { ...a, position: { x: 8.25, y: 0.5, z: 8 } },
        definition,
        a.id,
      ),
    ).toThrow("方块重叠");
    expect(() =>
      runtime.validatePlacement({ ...a, id: block(8, 0.5, 8).id }, definition),
    ).toThrow("方块重叠");
    const oldCount = runtime.blockStats.rebuilds,
      next = structuredClone(runtime.scene);
    next.objects = next.objects.filter((o) => o.id !== a.id);
    runtime.applyLayout(next, a.id);
    expect(runtime.blockStats.lastRebuilt).toEqual(["1:0:1"]);
    expect(runtime.world.getRigidBody(farHandle)).toBe(farBody);
    expect(runtime.blockStats.rebuilds).toBe(oldCount + 1);
    runtime.step();
    expect(runtime.surfaceMaterial({ x: 8, y: 1.4, z: 8 })).toBe("stone");
    expect(runtime.state(b.id).position).toEqual(b.position);
    expect(runtime.state(far.id).position).toEqual(far.position);
    runtime.validatePlacement(a, definition);
    const moved = structuredClone(runtime.scene);
    moved.objects.find((o) => o.id === b.id)!.position = {
      x: -7,
      y: 0.5,
      z: -8,
    };
    runtime.applyLayout(moved, b.id);
    expect(runtime.blockStats.lastRebuilt).toEqual(["-1:0:-1", "1:0:1"]);
    expect(runtime.blockStats).toMatchObject({
      blocks: 2,
      chunks: 1,
      colliders: 1,
    });
    runtime.dispose();
    expect(() => runtime.state(b.id)).toThrow("已经关闭");
    expect(runtime.blockStats.blocks).toBe(0);
  } finally {
    runtime.dispose();
  }
});
it("removing the middle of a merged floor opens a real hole and dropping support wakes an object", async () => {
  const floor = [];
  for (let x = 8; x < 11; x++)
    for (let z = 8; z < 11; z++) floor.push(block(x, 1.5, z));
  const middle = floor.find((o) => o.position.x === 9 && o.position.z === 9)!,
    s = scene(floor),
    playground = createPlayground(),
    boxDef = playground.definitions.find((d) => d.id === "core:box")!;
  const box = { ...block(9, 3, 9), definitionId: boxDef.id };
  s.definitions.push(boxDef);
  s.objects.push(box);
  const room = await PhysicsRoom.create(
    s,
    "20000000-0000-4000-8000-000000000001",
  );
  try {
    for (let i = 0; i < 400; i++) room.step();
    const body = room.runtime.bodies.get(box.id)!;
    expect(body.translation().y).toBeCloseTo(2.45, 1);
    expect(body.isSleeping()).toBe(true);
    const staged = room.prepareEdit("hole", 1, {
      type: "remove",
      objectId: middle.id,
    });
    room.commitEdit("hole");
    expect(body.isSleeping()).toBe(false);
    expect(room.runtime.blockStats.colliders).toBeGreaterThan(1);
    const restored = await PhysicsRoom.create(
      staged.scene,
      room.epoch,
      2,
      staged.checkpoint,
    );
    try {
      for (let i = 0; i < 180; i++) {
        room.step();
        restored.step();
      }
      expect(body.translation().y).toBeLessThan(0.6);
      expect(restored.runtime.state(box.id).position.y).toBeLessThan(0.6);
    } finally {
      restored.dispose();
    }
    // A vertical ray at each original floor cell sees the preserved cells, with a real opening in the middle.
    for (const o of floor) {
      if (o === middle) continue;
      const hit = room.runtime.world.castRay(
        new RAPIER.Ray(
          { x: o.position.x, y: 5, z: o.position.z },
          { x: 0, y: -1, z: 0 },
        ),
        10,
        true,
      );
      expect(hit!.timeOfImpact).toBeCloseTo(3, 3);
    }
  } finally {
    room.dispose();
  }
});
it("walks across positive and negative chunk seams without a gap or artificial step", async () => {
  const blocks = [];
  for (let x = -10; x <= 10; x++)
    for (let z = 8; z <= 9; z++) blocks.push(block(x, 0.5, z));
  const runtime = await PhysicsRuntime.create(scene(blocks));
  try {
    const player = runtime.createCharacter("walker", {
      x: -9.5,
      y: 1.9,
      z: 8.5,
    });
    for (let i = 0; i < 270; i++) {
      runtime.step((dt) => player.step({ x: 1, z: 0, jump: false }, dt));
      expect(player.position().y).toBeGreaterThan(1.8);
      expect(player.position().y).toBeLessThan(2);
    }
    expect(player.position().x).toBeGreaterThan(8.5);
    expect(runtime.blockStats.chunks).toBe(4);
  } finally {
    runtime.dispose();
  }
});
it("surface snapping handles negative faces and stacking, while client edits reuse unaffected chunks", async () => {
  const { snapBlockPosition } = await import("./src/block-chunks.js");
  expect(
    snapBlockPosition({ x: -8.5, y: 0.2, z: 1 }, { x: -1, y: 0, z: 0 }),
  ).toEqual({ x: -9, y: 0.5, z: 1 });
  expect(
    snapBlockPosition({ x: -8.2, y: 1, z: 1.1 }, { x: 0, y: 1, z: 0 }),
  ).toEqual({ x: -8, y: 1.5, z: 1 });
  const a = block(8, 0.5, 8),
    b = block(9, 0.5, 8),
    far = block(-8, 0.5, -8),
    prediction = await PhysicsPrediction.create(scene([a, far]), "viewer");
  try {
    const original = prediction.runtime,
      next = structuredClone(original.scene);
    next.objects.push(b);
    expect(prediction.updateLayout(next)).toBe(true);
    expect(prediction.runtime).toBe(original);
    expect(original.blockStats.lastRebuilt).toEqual(["1:0:1"]);
    expect(original.blockStats).toMatchObject({
      blocks: 3,
      chunks: 2,
      colliders: 2,
    });
    const bulk = structuredClone(next);
    bulk.objects = bulk.objects.filter((o) => o.id !== a.id && o.id !== far.id);
    expect(prediction.updateLayout(bulk)).toBe(false);
    expect(original.blockStats.blocks).toBe(3);
  } finally {
    prediction.dispose();
  }
});
