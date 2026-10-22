import { sitCharacter, standCharacter } from "./src/seats.js";
import { shopPhysicsDefinition, officialBehaviorObjects } from "./src/index.js";
import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  identityQuaternion,
  physicsSceneSchema,
  physicsTerrainTileSchema,
  physicsTerrainSchema,
  terrainGeometry,
  terrainHeightAt,
  type PhysicsTerrainTile,
} from "@island/contracts";
import {
  PhysicsRuntime,
  RAPIER,
  assertSceneTemplate,
  createPhysicsScene,
  officialPhysicsObjects,
} from "./src/index.js";
import { PhysicsPrediction } from "./src/client.js";

const tile = (): PhysicsTerrainTile => ({
  id: "slope",
  origin: { x: -4, y: 0, z: -4 },
  columns: 2,
  rows: 2,
  step: 4,
  heights: [0, 1, 2, 1, 2, 3, 2, 3, 4],
  material: "stone",
  color: "#aabbcc",
});
function terrainScene(tiles = [tile()]) {
  const scene = createPhysicsScene("building-yard");
  scene.terrain = tiles;
  scene.spawn = { x: -2, y: 4, z: -2 };
  return physicsSceneSchema.parse(scene);
}
function rayHeight(runtime: PhysicsRuntime, x: number, z: number) {
  const hit = runtime.world.castRay(
    new RAPIER.Ray({ x, y: 20, z }, { x: 0, y: -1, z: 0 }),
    40,
    true,
  );
  return hit ? 20 - hit.timeOfImpact : undefined;
}
describe("shared terrain surfaces", () => {
  it("matches render triangles, downward physics rays and exact interpolation on both halves of every cell", async () => {
    const t = tile(),
      runtime = await PhysicsRuntime.create(terrainScene([t]));
    try {
      runtime.step();
      const mesh = terrainGeometry(t);
      expect([...mesh.indices.slice(0, 6)]).toEqual([0, 3, 1, 1, 3, 4]);
      expect(runtime.terrainStats).toEqual({ colliders: 1, triangles: 8 });
      for (const [x, z] of [
        [-3.7, -3.8],
        [-0.3, -0.6],
        [1.2, 2.1],
        [3.7, 3.8],
        [0, 0],
      ])
        expect(rayHeight(runtime, x!, z!)).toBeCloseTo(
          terrainHeightAt(t, x!, z!)!,
          4,
        );
      expect(terrainHeightAt(t, 5, 0)).toBeUndefined();
    } finally {
      runtime.dispose();
    }
    expect(runtime.terrainStats.colliders).toBe(0);
  });
  it("leaves actual holes and joins adjacent non-flat tiles without a height seam", async () => {
    const a = tile();
    a.cells = [false, true, true, true];
    const b = tile();
    b.id = "east";
    b.origin.x = 4;
    b.heights = b.heights.map((h) => h + 2);
    const runtime = await PhysicsRuntime.create(terrainScene([a, b]));
    try {
      runtime.step();
      expect(rayHeight(runtime, -2, -2)).toBeUndefined();
      expect(terrainHeightAt(a, -2, -2)).toBeUndefined();
      expect(terrainGeometry(a).indices.length).toBe(18);
      for (const z of [-3.8, -1.3, 1.6, 3.7]) {
        expect(terrainHeightAt(a, 4, z)).toBe(terrainHeightAt(b, 4, z));
        expect(rayHeight(runtime, 4 - 0.001, z)).toBeCloseTo(
          rayHeight(runtime, 4 + 0.001, z)!,
          3,
        );
      }
    } finally {
      runtime.dispose();
    }
  });
  it("supports a falling body and capsule, rejects buried placement and protects canonical terrain", async () => {
    const scene = createPhysicsScene("building-yard"),
      d = officialPhysicsObjects().find((d) => d.id === "core:box")!;
    const object = {
      id: randomUUID(),
      definitionId: d.id,
      definitionVersion: d.version,
      position: { x: 3, y: 4, z: 3 },
      rotation: identityQuaternion,
    };
    scene.definitions.push(d);
    scene.objects.push(object);
    const runtime = await PhysicsRuntime.create(scene);
    try {
      const player = runtime.createCharacter("walker", { x: 0, y: 4, z: 0 });
      for (let i = 0; i < 240; i++)
        runtime.step((dt) => player.step({ x: 0, z: 0, jump: false }, dt));
      expect(runtime.state(object.id).position.y).toBeCloseTo(0.45, 1);
      expect(player.position().y).toBeGreaterThan(0);
      expect(player.position().y).toBeLessThan(1.5);
      for (const y of [-1, 0])
        expect(() =>
          runtime.validatePlacement(
            { ...object, position: { x: 5, y, z: 5 } },
            d,
          ),
        ).toThrow(/地形/);
      expect(() =>
        runtime.validatePlacement(
          { ...object, position: { x: 5, y: 0.45, z: 5 } },
          d,
        ),
      ).not.toThrow();
      expect(() => assertSceneTemplate(scene)).not.toThrow();
      const changed = structuredClone(scene);
      changed.terrain[0]!.heights[0] = 1;
      expect(() => assertSceneTemplate(changed)).toThrow("地形");
      const prediction = await PhysicsPrediction.create(scene, "prediction");
      try {
        expect(prediction.updateLayout(changed)).toBe(false);
      } finally {
        prediction.dispose();
      }
    } finally {
      runtime.dispose();
    }
  });
  it("walks uphill across a tile seam, closes a door to the mesh and finds a safe seat exit", async () => {
    const a = tile(),
      b = tile();
    b.id = "east";
    b.origin.x = 4;
    b.heights = b.heights.map((h) => h + 2);
    const slope = await PhysicsRuntime.create(terrainScene([a, b]));
    try {
      const walker = slope.createCharacter("walk", { x: 2, y: 5, z: 0 });
      for (let i = 0; i < 60; i++)
        slope.step((dt) => walker.step({ x: 0, z: 0, jump: false }, dt));
      for (let i = 0; i < 80; i++)
        slope.step((dt) => walker.step({ x: 1, z: 0, jump: false }, dt));
      expect(walker.position().x).toBeGreaterThan(6);
      expect(walker.position().y).toBeCloseTo(
        terrainHeightAt(b, walker.position().x, walker.position().z)! + 0.85,
        1,
      );
    } finally {
      slope.dispose();
    }
    const scene = createPhysicsScene("building-yard");
    const defs = [
      ...officialBehaviorObjects(),
      shopPhysicsDefinition("oak-chair")!,
    ];
    const add = (definitionId: string, x: number) => {
      const d = defs.find((d) => d.id === definitionId)!;
      const o = {
        id: randomUUID(),
        definitionId: d.id,
        definitionVersion: d.version,
        position: { x, y: 0, z: 0 },
        rotation: identityQuaternion,
      };
      scene.definitions.push(d);
      scene.objects.push(o);
      return o;
    };
    const sw = add("core:switch", 0),
      door = add("core:door", 5),
      chair = add("shop:oak-chair", -6);
    scene.links.push({
      id: randomUUID(),
      from: { objectId: sw.id, port: "signal" },
      to: { objectId: door.id, port: "open" },
    });
    const runtime = await PhysicsRuntime.create(scene);
    try {
      const player = runtime.createCharacter("host", { x: 0, y: 0.87, z: 1.6 });
      runtime.step();
      runtime.behaviors.toggle(sw.id, player);
      for (let i = 0; i < 140; i++) runtime.step();
      expect(runtime.state(door.id).position.y).toBeCloseTo(2.5, 3);
      runtime.behaviors.toggle(sw.id, player);
      for (let i = 0; i < 140; i++) runtime.step();
      expect(runtime.state(door.id).position.y).toBeCloseTo(0, 3);
      player.teleport({ x: -6, y: 0.87, z: 1.6 });
      runtime.world.propagateModifiedBodyPositionsToColliders();
      const claim = sitCharacter(runtime, player, chair.id);
      expect(player.seated).toBe(true);
      standCharacter(runtime, player, claim);
      expect(player.seated).toBe(false);
      expect(player.position().y).toBeCloseTo(0.87, 1);
    } finally {
      runtime.dispose();
    }
  });
  it("rejects malformed samples, masks, duplicate tiles, out-of-bounds and oversized geometry before allocation", () => {
    const t = tile();
    for (const change of [
      { heights: [0, 1, 2, 3] },
      { heights: t.heights.map(() => NaN) },
      { cells: [false, false, false, false] },
      { cells: [true] },
      { rows: 65 },
      { step: 0 },
    ])
      expect(
        physicsTerrainTileSchema.safeParse({ ...t, ...change }).success,
      ).toBe(false);
    expect(physicsTerrainSchema.safeParse([t, t]).success).toBe(false);
    const large = { ...t, columns: 64, rows: 64, heights: Array(4225).fill(0) };
    expect(
      physicsTerrainSchema.safeParse(
        Array.from({ length: 16 }, (_, i) => ({ ...large, id: `t${i}` })),
      ).success,
    ).toBe(false);
    const s = terrainScene();
    s.terrain[0]!.origin.x = 25;
    expect(physicsSceneSchema.safeParse(s).success).toBe(false);
  });
});
