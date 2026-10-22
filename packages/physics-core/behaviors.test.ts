import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import {
  identityQuaternion,
  physicsSceneSchema,
  physicsCheckpointSchema,
} from "@island/contracts";
import {
  createPhysicsScene,
  createPlayground,
  officialPhysicsObjects,
  shopPhysicsDefinition,
} from "./src/index.js";
import { PhysicsRoom } from "./src/room.js";
function fixture() {
  const s = createPhysicsScene("building-yard");
  const ids = {
    switch: randomUUID(),
    plate: randomUUID(),
    door: randomUUID(),
    lamp: randomUUID(),
    ball: randomUUID(),
  };
  const defs = officialPhysicsObjects();
  for (const [id, def, pos] of [
    [
      ids.switch,
      defs.find((d) => d.id === "core:switch")!,
      { x: 0, y: 0, z: 5 },
    ],
    [
      ids.plate,
      defs.find((d) => d.id === "core:pressure")!,
      { x: -4, y: 0, z: 4 },
    ],
    [ids.door, defs.find((d) => d.id === "core:door")!, { x: 4, y: 0, z: 4 }],
    [ids.lamp, shopPhysicsDefinition("garden-lamp"), { x: 6, y: 0, z: 7 }],
    [ids.ball, defs.find((d) => d.id === "core:ball")!, { x: -4, y: 2, z: 4 }],
  ] as const) {
    s.definitions.push(def);
    s.objects.push({
      id,
      definitionId: def.id,
      definitionVersion: 1,
      position: pos,
      rotation: identityQuaternion,
    });
  }
  s.links = [
    {
      id: randomUUID(),
      from: { objectId: ids.switch, port: "signal" },
      to: { objectId: ids.door, port: "open" },
    },
    {
      id: randomUUID(),
      from: { objectId: ids.plate, port: "signal" },
      to: { objectId: ids.door, port: "open" },
    },
    {
      id: randomUUID(),
      from: { objectId: ids.plate, port: "signal" },
      to: { objectId: ids.lamp, port: "on" },
    },
  ];
  return { scene: physicsSceneSchema.parse(s), ids };
}
const step = (room: PhysicsRoom, n: number) => {
  for (let i = 0; i < n; i++) room.step();
};
const command = (id: string, sequence = 0) => ({
  type: "toggle",
  objectId: id,
  commandId: randomUUID(),
  layoutRevision: 1,
  sequence,
});
it("pressure observes physical bodies, drives a shared door and lamp, and recomputes after release", async () => {
  const { scene, ids } = fixture(),
    room = await PhysicsRoom.create(scene, randomUUID());
  try {
    expect(
      room.frame(true).behaviors!.find((s) => s.id === ids.lamp)?.active,
    ).toBe(false);
    step(room, 240);
    expect(
      room.runtime.behaviors.states().find((s) => s.id === ids.plate)?.active,
    ).toBe(true);
    expect(room.runtime.state(ids.door).position.y).toBeCloseTo(2.5, 3);
    expect(room.runtime.behaviors.signalsLastTick).toBe(3);
    const ball = room.runtime.bodies.get(ids.ball)!;
    ball.setTranslation({ x: -8, y: 1, z: 4 }, true);
    ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
    step(room, 240);
    expect(room.runtime.state(ids.door).position.y).toBeCloseTo(0, 3);
    expect(
      room.runtime.behaviors.states().find((s) => s.id === ids.lamp)?.active,
    ).toBe(false);
  } finally {
    room.dispose();
  }
});
it("switch intents enforce permission, range, obstruction and replay; checkpoints keep latch but not pressure", async () => {
  const { scene, ids } = fixture(),
    room = await PhysicsRoom.create(scene, randomUUID());
  try {
    room.join("host", true);
    room.join("visitor", false);
    expect(() => room.command("visitor", command(ids.switch))).toThrow(
      "尚未开放",
    );
    const request = command(ids.switch);
    expect(room.command("host", request)?.ok).toBe(true);
    expect(room.command("host", request)?.ok).toBe(true);
    expect(room.runtime.behaviors.checkpoint()).toEqual([
      { id: ids.switch, on: true },
    ]);
    step(room, 150);
    const checkpoint = room.checkpoint(1),
      restored = await PhysicsRoom.create(scene, randomUUID(), 1, checkpoint);
    try {
      expect(restored.runtime.behaviors.checkpoint()).toEqual([
        { id: ids.switch, on: true },
      ]);
      expect(
        restored.runtime.behaviors.states().find((s) => s.id === ids.plate)
          ?.active,
      ).toBe(false);
      expect(restored.runtime.state(ids.door).position.y).toBeCloseTo(2.5, 3);
    } finally {
      restored.dispose();
    }
    const far = scene.objects.find((o) => o.id === ids.switch)!;
    far.position.x = 10;
    const remote = await PhysicsRoom.create(scene, randomUUID());
    try {
      remote.join("host", true);
      expect(remote.command("host", command(ids.switch))?.message).toContain(
        "靠近",
      );
    } finally {
      remote.dispose();
    }
    checkpoint.switches = [];
    expect(() => room.runtime.restore(checkpoint)).toThrow("开关检查点");
    checkpoint.switches = [{ id: ids.switch, on: true }];
    checkpoint.states.find((s) => s.id === ids.door)!.position.y = 10;
    expect(() => room.runtime.restore(checkpoint)).toThrow("合法行程");
    expect(
      physicsCheckpointSchema.safeParse({
        ...checkpoint,
        switches: [
          { id: ids.switch, on: true },
          { id: ids.switch, on: false },
        ],
      }).success,
    ).toBe(false);
  } finally {
    room.dispose();
  }
});
it("doors stop before a capsule while closing and resume when its path clears", async () => {
  const { scene, ids } = fixture();
  scene.objects = scene.objects.filter((o) => o.id !== ids.ball);
  const room = await PhysicsRoom.create(scene, randomUUID());
  try {
    room.join("host", true);
    expect(room.command("host", command(ids.switch))?.ok).toBe(true);
    step(room, 120);
    const blocker = room.runtime.createCharacter(
      "blocker",
      { x: 4, y: 1, z: 4 },
      false,
    );
    expect(room.command("host", command(ids.switch, 1))?.ok).toBe(true);
    step(room, 120);
    expect(
      room.runtime.behaviors.states().find((s) => s.id === ids.door)?.blocked,
    ).toBe(true);
    expect(room.runtime.state(ids.door).position.y).toBeGreaterThan(1.5);
    expect(blocker.position().y).toBeCloseTo(1);
    room.runtime.removeCharacter("blocker");
    step(room, 180);
    expect(room.runtime.state(ids.door).position.y).toBeCloseTo(0, 3);
  } finally {
    room.dispose();
  }
});
it("typed links reject feedback, duplicate and missing endpoints; delete and abort handle relationships atomically", async () => {
  const { scene, ids } = fixture();
  for (const link of [
    { ...scene.links[0]!, from: { objectId: ids.door, port: "signal" } },
    { ...scene.links[0]!, to: { objectId: ids.switch, port: "on" } },
    { ...scene.links[0]!, from: { objectId: randomUUID(), port: "signal" } },
  ])
    expect(
      physicsSceneSchema.safeParse({ ...scene, links: [link] }).success,
    ).toBe(false);
  expect(
    physicsSceneSchema.safeParse({
      ...scene,
      links: [...scene.links, { ...scene.links[0]!, id: randomUUID() }],
    }).success,
  ).toBe(false);
  const room = await PhysicsRoom.create(scene, randomUUID());
  try {
    const prepared = room.prepareEdit("remove", 1, {
      type: "remove",
      objectId: ids.plate,
    });
    expect(prepared.scene.links).toHaveLength(1);
    expect(room.runtime.scene.links).toHaveLength(3);
    room.abortEdit("remove");
    expect(room.runtime.scene.links).toHaveLength(3);
    room.prepareEdit("unlink", 1, {
      type: "unlink",
      linkId: scene.links[2]!.id,
    });
    room.commitEdit("unlink");
    expect(
      room.runtime.behaviors.states().find((s) => s.id === ids.lamp)?.active,
    ).toBe(true);
    room.prepareEdit("remove", 2, { type: "remove", objectId: ids.switch });
    room.commitEdit("remove");
    expect(room.checkpoint(1).switches).toHaveLength(0);
    expect(room.runtime.scene.links).toHaveLength(1);
  } finally {
    room.dispose();
  }
});

it("read-only visitors cannot press plates and walls block switch interaction", async () => {
  const { scene, ids } = fixture();
  scene.objects = scene.objects.filter((o) => o.id !== ids.ball);
  const room = await PhysicsRoom.create(scene, randomUUID());
  try {
    room.runtime.createCharacter("read-only", { x: -4, y: 1, z: 4 }, false);
    step(room, 2);
    expect(
      room.runtime.behaviors.states().find((s) => s.id === ids.plate)?.active,
    ).toBe(false);
    room.runtime.removeCharacter("read-only");
    room.runtime.createCharacter("interactive", { x: -4, y: 1, z: 4 }, true);
    step(room, 2);
    expect(
      room.runtime.behaviors.states().find((s) => s.id === ids.plate)?.active,
    ).toBe(true);
    room.join("host", true);
    const def = officialPhysicsObjects().find((d) => d.id === "core:block")!;
    room.prepareEdit(
      "wall",
      1,
      {
        type: "place",
        object: {
          id: randomUUID(),
          definitionId: def.id,
          definitionVersion: 1,
          position: { x: 0, y: 0.5, z: 6 },
          rotation: identityQuaternion,
        },
      },
      def,
    );
    room.commitEdit("wall");
    expect(
      room.command("host", { ...command(ids.switch), layoutRevision: 2 })
        ?.message,
    ).toContain("挡住");
  } finally {
    room.dispose();
  }
});
it("node and link budgets reject oversized graphs before simulation", () => {
  const { scene, ids } = fixture();
  const source = scene.objects.find((o) => o.id === ids.switch)!;
  for (let i = 0; i < 61; i++)
    scene.objects.push({ ...source, id: randomUUID() });
  expect(physicsSceneSchema.safeParse(scene).success).toBe(false);
  const minimal = fixture().scene;
  minimal.links = Array.from({ length: 129 }, () => ({
    ...minimal.links[0]!,
    id: randomUUID(),
  }));
  expect(physicsSceneSchema.safeParse(minimal).success).toBe(false);
});

it("a freely rolling playground ball activates a placed pressure plate without scripted triggers", async () => {
  const scene = createPlayground(),
    defs = officialPhysicsObjects(),
    plate = randomUUID(),
    door = randomUUID();
  for (const [id, key, position] of [
    [plate, "core:pressure", { x: 0.5, y: 0, z: -2 }],
    [door, "core:door", { x: 8, y: 0, z: 0 }],
  ] as const) {
    scene.definitions.push(defs.find((d) => d.id === key)!);
    scene.objects.push({
      id,
      definitionId: key,
      definitionVersion: 1,
      position,
      rotation: identityQuaternion,
    });
  }
  scene.links = [
    {
      id: randomUUID(),
      from: { objectId: plate, port: "signal" },
      to: { objectId: door, port: "open" },
    },
  ];
  const room = await PhysicsRoom.create(scene, randomUUID());
  try {
    let pressed = false,
      opened = false;
    for (let i = 0; i < 600; i++) {
      room.step();
      pressed ||= room.runtime.behaviors
        .states()
        .some((s) => s.id === plate && s.active);
      opened ||= room.runtime.state(door).position.y > 0.1;
    }
    expect(pressed).toBe(true);
    expect(opened).toBe(true);
  } finally {
    room.dispose();
  }
});
