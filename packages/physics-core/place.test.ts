import { describe, expect, it } from "vitest";
import { placeSchema } from "@island/contracts";
import { placePhysicsRegion } from "../world-core/src/physics-place.js";
import { PhysicsRegionWorld, RAPIER } from "./src/index.js";
const place = placeSchema.parse({
  id: "quiet-garden",
  name: "小花园",
  tagline: "散步",
  accent: "#668844",
  ground: { shape: "disc", size: 60, color: "#aabb88" },
  sky: { day: "#aaccee", night: "#123456", stars: 200 },
  props: [
    { kind: "bench", x: 0, z: 0, scale: 1 },
    { kind: "tree", x: -8, z: -4, scale: 1.5 },
    { kind: "rock", x: 8, z: -4, scale: 1 },
    { kind: "lamp", x: -8, z: 5, scale: 1 },
    { kind: "pond", x: 8, z: 5, scale: 1 },
    { kind: "flower", x: 5, z: 0, scale: 1 },
  ],
});
describe("published place solid geometry", () => {
  it("rejects off-island props, blocked entry paths and excessive lights", () => {
    for (const props of [
      [{ kind: "tree", x: 29, z: 0, scale: 1 }],
      [{ kind: "rock", x: 0, z: 15, scale: 1 }],
      Array.from({ length: 5 }, (_, i) => ({
        kind: "lamp",
        x: 5 + i,
        z: 0,
        scale: 1,
      })),
    ])
      expect(placeSchema.safeParse({ ...place, props }).success).toBe(false);
    const dense = {
      ...place,
      props: Array.from({ length: 60 }, () => ({
        kind: "bench" as const,
        x: 5,
        z: 0,
        scale: 1,
      })),
    };
    expect(placePhysicsRegion(dense).parts).toHaveLength(244);
    expect(placePhysicsRegion(place)).toEqual(placePhysicsRegion(place));
  });
  for (const shape of ["disc", "square"] as const)
    it(`${shape}: stands, collides with bench and tree, jumps and falls beyond real edges`, async () => {
      const w = await PhysicsRegionWorld.create({ x: 0, y: 1, z: 15 });
      try {
        const region = placePhysicsRegion({
          ...place,
          ground: { ...place.ground, shape },
        });
        w.mount(region);
        w.refreshQueries();
        w.placeOnSurface(0, 15);
        const step = (x = 0, z = 0, jump = false) => {
          w.player.step({ x, z, jump }, 1 / 60);
          w.runtime.step();
        };
        for (let i = 0; i < 60; i++) step();
        expect(w.player.grounded).toBe(true);
        expect(w.player.position().y).toBeCloseTo(0.87, 1);
        for (let i = 0; i < 260; i++) step(0, -1);
        expect(w.player.position().z).toBeGreaterThan(0.65);
        expect(w.player.position().z).toBeLessThan(0.9);
        let peak = w.player.position().y;
        for (let i = 0; i < 35; i++) {
          step(0, -1, i === 0);
          peak = Math.max(peak, w.player.position().y);
        }
        expect(peak).toBeGreaterThan(1.6);
        w.player.teleport({ x: -8, y: 0.9, z: 0 });
        let closest = Infinity;
        for (let i = 0; i < 140; i++) {
          step(0, -1);
          const p = w.player.position();
          closest = Math.min(closest, Math.hypot(p.x + 8, p.z + 4));
        }
        // Rounded trunks permit sliding around them, but never through their solid radius.
        expect(closest).toBeGreaterThan(0.74);
        expect(closest).toBeLessThan(0.85);
        w.player.teleport({ x: 31, y: 1, z: 0 });
        for (let i = 0; i < 80; i++) step();
        expect(w.player.position().y).toBeLessThan(-8);
        w.placeOnSurface(0, 15);
        for (let i = 0; i < 60; i++) step();
        expect(w.player.grounded).toBe(true);
        // Only the visible footprint supports a player: disc corners have no hidden floor.
        const ray = w.runtime.world.castRay(
          new RAPIER.Ray({ x: 25, y: 10, z: 25 }, { x: 0, y: -1, z: 0 }),
          20,
          true,
        );
        expect(!!ray).toBe(shape === "square");
        const edge = w.runtime.world.castRay(
          new RAPIER.Ray(
            {
              x: Math.cos(Math.PI / 32) * 29.95,
              y: 10,
              z: Math.sin(Math.PI / 32) * 29.95,
            },
            { x: 0, y: -1, z: 0 },
          ),
          20,
          true,
        );
        expect(!!edge).toBe(shape === "square");
        w.remove(region.id);
        expect(w.runtime.world.colliders.len()).toBe(1);
      } finally {
        w.dispose();
      }
    });
});
