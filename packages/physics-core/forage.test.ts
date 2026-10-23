import { expect, it } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
import { terrainHeightAt } from "@island/contracts";
import {
  PhysicsRuntime,
  PhysicsRegionWorld,
  createPhysicsScene,
  physicsSceneDefinitions,
} from "./src/index.js";
import { placePhysicsRegion, placeForageSpots } from "@island/world-core";
import { physicalForageSpots, canReachForage } from "./src/forage.js";

it("forage in every themed room uses stable IDs and the actual terrain, never sea or solid infrastructure", async () => {
  for (const def of physicsSceneDefinitions) {
    const runtime = await PhysicsRuntime.create(createPhysicsScene(def.key));
    try {
      runtime.step();
      const spots = physicalForageSpots(runtime);
      if (["building-yard", "playground"].includes(def.key)) {
        expect(spots).toEqual([]);
        continue;
      }
      expect(spots.length, def.key).toBeGreaterThan(0);
      expect(new Set(spots.map((s) => s.id)).size).toBe(spots.length);
      expect(physicalForageSpots(runtime)).toEqual(spots);
      for (const s of spots) {
        expect(
          runtime.scene.terrain.some((t) => {
            const h = terrainHeightAt(t, s.position.x, s.position.z);
            return h !== undefined && Math.abs(h + 0.3 - s.position.y) < 0.001;
          }),
          `${def.key}:${s.id}`,
        ).toBe(true);
        expect(s.position.x).toBeGreaterThan(runtime.scene.bounds.min.x);
        expect(s.position.x).toBeLessThan(runtime.scene.bounds.max.x);
      }
    } finally {
      runtime.dispose();
    }
  }
});

it("a standing capsule can reach a nearby find but cannot pick through walls, above it, or while seated", async () => {
  const runtime = await PhysicsRuntime.create(createPhysicsScene("meadow"));
  try {
    runtime.step();
    const spot = physicalForageSpots(runtime)[0]!;
    const p = spot.position;
    const actor = runtime.createCharacter("collector");
    actor.teleport({ x: p.x - 0.8, y: p.y + 0.6, z: p.z });
    for (let i = 0; i < 60; i++)
      runtime.step((dt) => actor.step({ x: 0, z: 0, jump: false }, dt));
    expect(canReachForage(runtime, actor, spot)).toBe(true);
    actor.seated = true;
    expect(canReachForage(runtime, actor, spot)).toBe(false);
    actor.seated = false;
    const wall = runtime.world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.06, 1, 0.5)
        .setTranslation(p.x - 0.4, p.y + 0.5, p.z)
        .setCollisionGroups(0x0001ffff),
    );
    runtime.step();
    expect(canReachForage(runtime, actor, spot)).toBe(false);
    runtime.world.removeCollider(wall, false);
    actor.body.setTranslation({ x: p.x, y: p.y + 3, z: p.z }, true);
    expect(canReachForage(runtime, actor, spot)).toBe(false);
    actor.body.setTranslation({ x: p.x - 3, y: p.y + 0.55, z: p.z }, true);
    expect(canReachForage(runtime, actor, spot)).toBe(false);
  } finally {
    runtime.dispose();
  }
});

it("published place finds sit on the mounted region and use the same reach rule", async () => {
  const place = {
    id: "quiet-reach",
    name: "测试小天地",
    tagline: "测试",
    eyebrow: "A TEST PLACE",
    accent: "#778855",
    ground: { shape: "disc", size: 40, color: "#aabb88" },
    sky: { day: "#aabbcc", night: "#123456", stars: 100 },
    ambience: { volume: 0.5 },
    props: [{ kind: "rock", x: 7, z: 2, scale: 2 }],
  };
  const spots = placeForageSpots(place);
  expect(spots.length).toBeGreaterThan(0);
  const world = await PhysicsRegionWorld.create({ x: 0, y: 0.9, z: 10 });
  try {
    world.mount(placePhysicsRegion(place));
    world.refreshQueries();
    const spot = spots[0]!,
      p = spot.position;
    world.player.teleport({ x: p.x - 0.8, y: p.y + 0.6, z: p.z });
    for (let i = 0; i < 60; i++)
      world.runtime.step((dt) =>
        world.player.step({ x: 0, z: 0, jump: false }, dt),
      );
    expect(world.player.grounded).toBe(true);
    expect(canReachForage(world.runtime, world.player, spot)).toBe(true);
    world.player.seated = true;
    expect(canReachForage(world.runtime, world.player, spot)).toBe(false);
    world.player.seated = false;
    world.player.body.setTranslation({ x: p.x - 3, y: p.y + 0.55, z: p.z }, true);
    expect(canReachForage(world.runtime, world.player, spot)).toBe(false);
  } finally {
    world.dispose();
  }
});
