import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  creationBlueprintSchema,
  hasCreationInteractions,
  type CreationPart,
  type CreationPlacement,
} from "@island/contracts";
import {
  creationCollisionBoxes,
  creationSeats,
  creationObstacles,
  creationPlacementError,
  approachCreationSeat,
  bodyBlocked,
  moveBody,
  groundHeight,
  createWorld,
} from "./src/index.js";
const part = (changes: Partial<CreationPart> = {}): CreationPart => ({
  id: randomUUID(),
  shape: "box",
  color: "#8bb8a2",
  x: 0,
  y: 0.5,
  z: 0,
  width: 1,
  height: 1,
  depth: 1,
  rotation: 0,
  ...changes,
});
const instance = (parts: CreationPart[]): CreationPlacement => ({
  id: randomUUID(),
  definitionId: randomUUID(),
  definitionVersion: 1,
  x: 10,
  z: 30,
  rotation: 0,
  blueprint: { name: "test", physics: "parts", parts },
});
describe("interactive authored items", () => {
  it("validates one reachable flat seat, clear headroom, light limits and unchanged legacy data", () => {
    const p = part({ seat: true });
    const b = instance([p]).blueprint;
    expect(creationBlueprintSchema.safeParse(b).success).toBe(true);
    for (const patch of [
      { shape: "sphere" },
      { width: 0.75 },
      { y: 2 },
      { height: 0.25, y: 0.125 },
    ])
      expect(
        creationBlueprintSchema.safeParse({ ...b, parts: [{ ...p, ...patch }] })
          .success,
      ).toBe(false);
    expect(
      creationBlueprintSchema.safeParse({ ...b, physics: undefined }).success,
    ).toBe(false);
    expect(
      creationBlueprintSchema.safeParse({
        ...b,
        parts: [p, part({ seat: true, x: 2 })],
      }).success,
    ).toBe(false);
    expect(
      creationBlueprintSchema.safeParse({ ...b, parts: [p, part({ y: 2 })] })
        .success,
    ).toBe(false);
    const light = { color: "#ffffff", intensity: 4, distance: 6 };
    expect(
      creationBlueprintSchema.safeParse({ ...b, parts: [{ ...p, light }] })
        .success,
    ).toBe(true);
    for (const patch of [
      { intensity: 9 },
      { distance: 9 },
      { intensity: Infinity },
      { color: "red" },
    ])
      expect(
        creationBlueprintSchema.safeParse({
          ...b,
          parts: [{ ...p, light: { ...light, ...patch } }],
        }).success,
      ).toBe(false);
    expect(
      creationBlueprintSchema.safeParse({
        ...b,
        parts: [{ ...p, light }, part({ light, x: 2 })],
      }).success,
    ).toBe(false);
    const legacy = { name: "old", parts: [part()] };
    expect(creationBlueprintSchema.parse(legacy)).toEqual(legacy);
    expect(hasCreationInteractions(legacy)).toBe(false);
    const old = { ...instance(legacy.parts), blueprint: legacy };
    expect(creationCollisionBoxes([old])).toHaveLength(0);
    expect(creationObstacles([old])).toHaveLength(1);
  });
  it("matches all quarter-turn positions, seat facing and collision sizes", () => {
    const p = part({
        x: 1,
        z: 0.5,
        width: 1.5,
        depth: 1,
        seat: true,
        rotation: 1,
      }),
      f = instance([p]);
    const centers = [
      [11, 30.5],
      [10.5, 29],
      [9, 29.5],
      [9.5, 31],
    ];
    for (const rotation of [0, 1, 2, 3] as const) {
      const item = { ...f, rotation },
        box = creationCollisionBoxes([item])[0]!,
        seat = creationSeats([item])[0]!;
      expect([
        (box.min.x + box.max.x) / 2,
        (box.min.z + box.max.z) / 2,
      ]).toEqual(centers[rotation]);
      expect([seat.x, seat.z]).toEqual(centers[rotation]);
      expect(seat.yaw).toBe((((rotation + 1) % 4) * Math.PI) / 2);
      expect(box.max.x - box.min.x).toBe(rotation % 2 ? 1.5 : 1);
      expect(seat.standY).toBeCloseTo(groundHeight(f.x, f.z) + 1.05);
    }
  });
  it("blocks legs and undersides, leaves genuine headroom and supports a solid tabletop", () => {
    const f = instance([
      part({ width: 3, depth: 3, height: 0.25, y: 2.625 }),
      ...[-1.25, 1.25].flatMap((x) =>
        [-1.25, 1.25].map((z) =>
          part({ x, z, width: 0.25, depth: 0.25, height: 2.5, y: 1.25 }),
        ),
      ),
    ]);
    const boxes = creationCollisionBoxes([f]),
      base = groundHeight(f.x, f.z) + 0.05,
      cells = new Map();
    expect(creationObstacles([f])).toHaveLength(0);
    expect(bodyBlocked({ x: f.x, y: base, z: f.z }, cells, boxes)).toBe(false);
    expect(
      bodyBlocked({ x: f.x + 1.25, y: base, z: f.z + 1.25 }, cells, boxes),
    ).toBe(true);
    expect(
      moveBody({ x: f.x, y: base, z: f.z }, { x: 0, y: 2, z: 0 }, cells, boxes)
        .blocked.y,
    ).toBe(true);
    const top = base + 2.75;
    expect(bodyBlocked({ x: f.x, y: top, z: f.z }, cells, boxes)).toBe(false);
    expect(
      moveBody(
        { x: f.x, y: top + 0.1, z: f.z },
        { x: 0, y: -0.5, z: 0 },
        cells,
        boxes,
      ).blocked.y,
    ).toBe(true);
  });
  it("approaches a rotated seat from its front without passing through walls or ceilings", () => {
    const f = {
      ...instance([part({ width: 1.5, depth: 1.5, seat: true })]),
      rotation: 1 as const,
    };
    const seat = creationSeats([f])[0]!,
      boxes = creationCollisionBoxes([f]),
      base = groundHeight(f.x, f.z);
    const start = { x: seat.x + 1.6, y: base, z: seat.z },
      cells = new Map();
    const end = approachCreationSeat(start, seat, cells, boxes, []);
    expect(end?.x).toBeCloseTo(seat.x);
    expect(end?.y).toBeCloseTo(seat.standY);
    expect(
      approachCreationSeat(
        { ...start, x: seat.x - 1.6 },
        seat,
        cells,
        boxes,
        [],
      ),
    ).toBeNull();
    expect(
      approachCreationSeat({ ...start, x: seat.x + 3 }, seat, cells, boxes, []),
    ).toBeNull();
    expect(
      approachCreationSeat(
        start,
        seat,
        cells,
        [
          ...boxes,
          {
            min: { x: seat.x + 0.8, y: base, z: seat.z - 2 },
            max: { x: seat.x + 0.9, y: base + 4, z: seat.z + 2 },
          },
        ],
        [],
      ),
    ).toBeNull();
    expect(
      approachCreationSeat(start, seat, cells, boxes, [
        { x: seat.x + 1, z: seat.z, r: 0.3 },
      ]),
    ).toBeNull();
  });
  it("limits world lighting while allowing movement and removal of existing lamps", () => {
    const w = createWorld(14),
      f = instance([
        part({ light: { color: "#fffbbb", intensity: 4, distance: 6 } }),
      ]);
    const lamps = Array.from({ length: 4 }, () => ({ ...f, id: randomUUID() }));
    expect(creationPlacementError({ ...w, creations: lamps }, f)).toContain(
      "4",
    );
    expect(
      creationPlacementError({ ...w, creations: lamps }, lamps[0]!),
    ).not.toContain("4 件发光");
  });
});
