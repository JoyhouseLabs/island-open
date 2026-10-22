import { describe, expect, it } from "vitest";
import { PhysicsRegionWorld, RAPIER } from "./src/index.js";
import {
  wildPhysicsRegion,
  wildPropGeometry,
} from "../world-core/src/wilderness-geometry.js";
import {
  generateWildChunk,
  wildRing,
  wildHeight,
  chunkAt,
  CHUNK_SIZE,
} from "../world-core/src/wilderness.js";
import { physicsRegionSchema, type PhysicsRegion } from "@island/contracts";
const region = (x: number, z: number, origin = { x: 0, z: 0 }) =>
  wildPhysicsRegion(717, generateWildChunk(717, { x, z }), origin);
function focus(
  world: PhysicsRegionWorld,
  center: { x: number; z: number },
  previous: { x: number; z: number },
) {
  world.rebase({
    x: (center.x - previous.x) * CHUNK_SIZE,
    y: 0,
    z: (center.z - previous.z) * CHUNK_SIZE,
  });
  const coords = wildRing(center);
  world.retain(new Set(coords.map((c) => `wild:${c.x}:${c.z}`)));
  for (const c of coords)
    if (!world.has(`wild:${c.x}:${c.z}`)) world.mount(region(c.x, c.z, center));
  world.refreshQueries();
}
describe("procedural physical regions", () => {
  it("uses shared hulls and holds native collider counts bounded across distant rebases and eviction", async () => {
    const world = await PhysicsRegionWorld.create({ x: 48, y: 30, z: 40 });
    let old = { x: 0, z: 0 };
    try {
      for (const center of [
        { x: 0, z: 0 },
        { x: 0, z: -1 },
        { x: 0, z: -3 },
        { x: 999990, z: -999990 },
        { x: -999990, z: 999990 },
        { x: 0, z: 0 },
      ]) {
        // Huge travel is a scene reset; bounded increments are used for actual local rebases.
        if (
          Math.abs(center.x - old.x) > 100 ||
          Math.abs(center.z - old.z) > 100
        ) {
          world.retain(new Set());
          world.player.teleport({ x: 48, y: 30, z: 40 });
          old = center;
        }
        focus(world, center, old);
        old = center;
        expect(world.stats.regions).toBe(25);
        expect(world.stats.colliders).toBeLessThanOrEqual(4096);
        expect(world.runtime.world.colliders.len()).toBe(
          world.stats.colliders + 1,
        );
        world.placeOnSurface(48, 40);
        const hit = world.runtime.world.castRay(
          new RAPIER.Ray({ x: 48, y: 100, z: 40 }, { x: 0, y: -1, z: 0 }),
          200,
          true,
          undefined,
          undefined,
          world.player.collider,
          world.player.body,
        );
        expect(hit).not.toBeNull();
      }
      const generated = region(0, 0);
      expect(physicsRegionSchema.safeParse(generated).success).toBe(true);
      expect(wildPropGeometry.rock.vertices).toHaveLength(20);
      expect(wildPropGeometry.tree.vertices).toHaveLength(10);
      world.retain(new Set());
      expect(world.runtime.world.colliders.len()).toBe(1);
      expect(world.runtime.world.bodies.len()).toBe(1);
    } finally {
      world.dispose();
    }
    expect(world.stats.regions).toBe(0);
    expect(() => world.mount(region(0, 0))).toThrow("关闭");
  });
  it("walks both ways through streamed seams with sprint and jump, preserving momentum on origin shifts", async () => {
    const world = await PhysicsRegionWorld.create({ x: 48, y: 30, z: 40 });
    let center = { x: 0, z: 0 },
      jumpPeak = 0;
    try {
      focus(world, center, center);
      world.placeOnSurface(48, 40);
      for (const direction of [-1, 1])
        for (let tick = 0; tick < 2100; tick++) {
          world.runtime.step((dt) =>
            world.player.step(
              { x: 0, z: direction, sprint: true, jump: tick === 60 },
              dt,
            ),
          );
          const local = world.player.position(),
            global = { x: local.x + center.x * 96, z: local.z + center.z * 96 };
          jumpPeak = Math.max(
            jumpPeak,
            local.y - wildHeight(717, global.x, global.z) - 0.85,
          );
          expect(local.y).toBeGreaterThan(-1);
          const next = chunkAt(global.x, global.z);
          if (next.x !== center.x || next.z !== center.z) {
            const before = world.player.snapshot();
            focus(world, next, center);
            expect(world.player.snapshot().velocity).toEqual(before.velocity);
            center = next;
          }
          if (tick === 2099 && direction === -1)
            expect(center.z).toBeLessThanOrEqual(-3);
        }
      expect(center.z).toBe(0);
      expect(jumpPeak).toBeGreaterThan(0.7);
      expect(world.stats.regions).toBe(25);
    } finally {
      world.dispose();
    }
  });
  it("collides with the generated trunk hull and restores onto actual support without variable-step catch-up", async () => {
    const data = region(0, 0),
      trunk = data.parts.find(
        (p) => p.id.startsWith("tree") && p.position.z < 90,
      )!;
    data.parts = [trunk];
    const world = await PhysicsRegionWorld.create({
      x: trunk.position.x,
      y: 30,
      z: trunk.position.z + 2,
    });
    try {
      world.mount(data);
      world.refreshQueries();
      world.placeOnSurface(trunk.position.x, trunk.position.z + 2);
      let contacted = false;
      for (let tick = 0; tick < 90; tick++) {
        world.runtime.step((dt) =>
          world.player.step({ x: 0, z: -1, jump: false }, dt),
        );
        world.runtime.world.colliders.forEach((c: RAPIER.Collider) => {
          if (
            c.parent()?.isFixed() &&
            c.shape.type === RAPIER.ShapeType.ConvexPolyhedron
          ) {
            const contact = c.contactCollider(world.player.collider, 0.1);
            if (contact) {
              expect(contact.distance).toBeGreaterThan(-0.01);
              if (contact.distance < 0.05) contacted = true;
            }
          }
        });
      }
      expect(contacted).toBe(true);
      world.placeOnSurface(trunk.position.x, trunk.position.z);
      const top =
        trunk.shape.kind === "convex"
          ? Math.max(...trunk.shape.vertices.map((v) => v.y)) + trunk.position.y
          : 0;
      expect(world.player.position().y).toBeCloseTo(top + 0.87, 3);
      const start = world.player.position();
      expect(
        world.runtime.advance(5, (dt) =>
          world.player.step({ x: 1, z: 0, jump: false }, dt),
        ),
      ).toBe(4);
      expect(world.player.position().x - start.x).toBeLessThan(0.3);
    } finally {
      world.dispose();
    }
  });
  it("rejects region budgets before replacing live geometry and frees every region during repeated use", async () => {
    const world = await PhysicsRegionWorld.create({ x: 0, y: 2, z: 0 });
    const base = region(0, 0),
      part = base.parts[0]!;
    try {
      for (let i = 0; i < 16; i++)
        world.mount({
          id: `budget:${i}`,
          origin: { x: 0, y: 0, z: 0 },
          terrain: [],
          parts: Array.from({ length: 256 }, (_, n) => ({
            ...part,
            id: `p${n}`,
          })),
        });
      expect(world.stats.colliders).toBe(4096);
      expect(() => world.mount(base)).toThrow("容量");
      expect(world.runtime.world.colliders.len()).toBe(4097);
      world.retain(new Set());
      for (let i = 0; i < 60; i++) {
        world.mount(base);
        world.refreshQueries();
        world.remove(base.id);
        expect(world.runtime.world.colliders.len()).toBe(1);
        expect(world.runtime.world.bodies.len()).toBe(1);
      }
      const invalid = {
        ...base,
        parts: [{ ...part, sensor: true }],
      } as PhysicsRegion;
      expect(() => world.mount(invalid)).toThrow();
      expect(world.stats.colliders).toBe(0);
    } finally {
      world.dispose();
    }
  });
});
