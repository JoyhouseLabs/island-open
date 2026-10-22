import { test, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  worldSchema,
  sameWorld,
  deviceSchema,
  visibleLength,
  plainText,
  type WorldSnapshot,
  type DeviceInstance,
} from "@island/contracts";
import {
  subScenes,
  applyWorldOps,
  diffWorld,
  canRebase,
  terrainScale,
} from "./src/index.js";
import {
  cellKey,
  chunkCell,
  hitCell,
  readCells,
  packCells,
  validateBuilding,
  bodyBlocked,
  moveBody,
  cellMin,
  settleDevices,
  entityCollisionBoxes,
} from "./src/building.js";
import { houseFixture } from "./fixtures/building.js";
const stone = {
  definitionId: "island:stone",
  definitionVersion: 1,
  rotation: 0,
} as const;
const blank = (): WorldSnapshot => ({
  ...subScenes.library.create(20261017),
  entities: [],
});
test("legacy snapshots, empty extensions and palette ordering have semantic equality", () => {
  const old = blank();
  expect(worldSchema.parse(old)).toEqual(old);
  expect(sameWorld(old, { ...old, devices: [], entityPlacements: [] })).toBe(
    true,
  );
  const w = { ...old, construction: houseFixture() };
  const reversed = structuredClone(w);
  const p = reversed.construction.blockPalette;
  p.reverse();
  for (const c of reversed.construction.chunks)
    for (const v of c.cells) v.palette = p.length - 1 - v.palette;
  expect(sameWorld(w, reversed)).toBe(true);
  expect(diffWorld(w, reversed)).toEqual([]);
});
test("negative chunk math and face picking share exact grid boundaries", () => {
  expect(chunkCell({ x: -1, y: -1, z: -1 })).toEqual({
    cx: -1,
    cy: -1,
    cz: -1,
    index: 4095,
  });
  const cells = new Map([
    ["-17,15,16", stone],
    ["0,0,0", stone],
  ]);
  expect(readCells(packCells(cells))).toEqual(cells);
  for (const n of [
    { x: 1, y: 0, z: 0 },
    { x: -1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: 0, y: -1, z: 0 },
    { x: 0, y: 0, z: 1 },
    { x: 0, y: 0, z: -1 },
  ]) {
    const p = { x: 12.5 + n.x * 0.5, y: 0.5 + n.y * 0.5, z: -21.5 + n.z * 0.5 };
    expect(hitCell(p, n, false)).toEqual({ x: 0, y: 0, z: 0 });
    expect(hitCell(p, n, true)).toEqual(n);
  }
});
test("independent cells merge, same cells conflict, nine targets require lease", () => {
  const a = {
      op: "block.set",
      cell: { x: 0, y: 0, z: 0 },
      expected: null,
      value: stone,
    } as const,
    b = { ...a, cell: { x: 1, y: 0, z: 0 } };
  expect(canRebase([a], [b])).toBe(true);
  expect(canRebase([a], [a])).toBe(false);
  expect(
    terrainScale(
      Array.from({ length: 9 }, (_, x) => ({ ...a, cell: { x, y: 0, z: 0 } })),
    ),
  ).toBe(true);
  const r = applyWorldOps(blank(), [a, b]);
  expect(r.ok).toBe(true);
  if (r.ok) {
    expect(validateBuilding(r.snapshot, blank())).toBe(null);
    expect(readCells(r.snapshot.construction).size).toBe(2);
  }
});
test("house permits doorway, stops sprint through wall/glass, catches floor and ceiling", () => {
  const cells = readCells(houseFixture()),
    inside = { x: 18, y: 1.001, z: -16 };
  expect(bodyBlocked(inside, cells)).toBe(false);
  const moved = moveBody(inside, { x: 20, y: 0, z: 0 }, cells);
  expect(moved.blocked.x).toBe(true);
  expect(moved.position.x).toBeLessThan(20.61);
  const jump = moveBody(inside, { x: 0, y: 10, z: 0 }, cells);
  expect(jump.blocked.y).toBe(true);
  expect(jump.position.y).toBeLessThan(2.21);
  const fall = moveBody({ ...inside, y: 2 }, { x: 0, y: -20, z: 0 }, cells);
  expect(fall.blocked.y).toBe(true);
  expect(fall.position.y).toBeGreaterThanOrEqual(1);
  const door = moveBody(
    { x: 17.5, y: 1.001, z: -20 },
    { x: 0, y: 0, z: 5 },
    cells,
  );
  expect(door.blocked.z).toBe(false);
});
test("support removal stores devices but rejects unsupported ordinary furniture", () => {
  const w = blank();
  w.construction = packCells(new Map([["0,0,0", stone]]));
  const d: DeviceInstance = {
    id: randomUUID(),
    definitionId: "island:nameplate",
    definitionVersion: 1,
    dataVersion: 1,
    placement: {
      state: "placed",
      x: 12.5,
      y: 1,
      z: -21.5,
      rotation: 0,
      support: { type: "blockTop", x: 0, y: 0, z: 0 },
    },
    payload: { kind: "nameplate", name: "我的小屋" },
  };
  w.devices = [d];
  expect(validateBuilding(w)).toBe(null);
  const next = settleDevices({ ...w, construction: packCells(new Map()) });
  expect(next.devices![0]!.placement.state).toBe("stored");
  expect(next.devices![0]!.payload).toEqual(d.payload);
  expect(
    deviceSchema.safeParse({
      ...d,
      payload: { kind: "sign", lines: ["", "", "", ""] },
    }).success,
  ).toBe(false);
});
test("full plot bounds, protection and grapheme limits", () => {
  expect(
    validateBuilding({
      ...blank(),
      construction: packCells(new Map([["18,0,0", stone]])),
    }),
  ).toMatch(/地块/);
  expect(
    validateBuilding({
      ...blank(),
      construction: packCells(new Map([["0,16,0", stone]])),
    }),
  ).toMatch(/高度/);
  expect(visibleLength("👨‍👩‍👧‍👦á")).toBe(2);
  expect(plainText(2).safeParse("👨‍👩‍👧‍👦á").success).toBe(true);
  expect(plainText(20, true).safeParse("第一行\n第二行").success).toBe(true);
  expect(plainText(20, true).safeParse("a\u0000").success).toBe(false);
});

test("new floating components cannot support each other; existing overhangs remain editable", () => {
  const w = blank(),
    floating = {
      ...w,
      construction: packCells(
        new Map([
          ["1,5,1", stone],
          ["2,5,1", stone],
        ]),
      ),
    };
  expect(validateBuilding(floating, w)).toMatch(/地面/);
  expect(validateBuilding(floating, floating)).toBe(null);
});

test("raised bench has a usable seat and solid back; a ceiling prevents sitting", () => {
  const bench = {
    id: randomUUID(),
    kind: "bench",
    x: 26,
    z: -8,
    seed: 1,
    growth: 1,
  } as const;
  const boxes = entityCollisionBoxes(bench, 1),
    cells = new Map();
  const start = { x: 26, y: 1, z: -6.5 };
  const lift = moveBody(start, { x: 0, y: 1.575, z: 0 }, cells, boxes);
  const seat = moveBody(lift.position, { x: 0, y: 0, z: -1.5 }, cells, boxes);
  expect(seat.position.y).toBeCloseTo(2.575);
  expect(seat.position.z).toBeCloseTo(-8);
  expect(bodyBlocked(seat.position, cells, boxes)).toBe(false);
  const back = moveBody(seat.position, { x: 0, y: 0, z: -3 }, cells, boxes);
  expect(back.blocked.z).toBe(true);
  expect(back.position.z).toBeGreaterThan(-8.126);
  const roof = { min: { x: 24, y: 4, z: -10 }, max: { x: 28, y: 5, z: -5 } };
  const blocked = moveBody(start, { x: 0, y: 1.575, z: 0 }, cells, [
    ...boxes,
    roof,
  ]);
  expect(blocked.blocked.y).toBe(true);
  expect(blocked.position.y).toBeLessThan(2.21);
});

test("device access clearance rotates and a raised bench retains its approach space", () => {
  const w = blank();
  w.devices = [
    {
      id: randomUUID(),
      definitionId: "island:nameplate",
      definitionVersion: 1,
      dataVersion: 1,
      placement: {
        state: "placed",
        x: 15.5,
        y: 0,
        z: -18.5,
        rotation: 0,
        support: { type: "ground" },
      },
      payload: { kind: "nameplate", name: "门牌" },
    },
  ];
  w.construction = packCells(new Map([["3,0,4", stone]]));
  expect(validateBuilding(w)).toMatch(/前方/);
  w.devices[0]!.placement = {
    ...w.devices[0]!.placement,
    rotation: 1,
  } as (typeof w.devices)[0]["placement"];
  expect(validateBuilding(w)).toBe(null);
  const bench = {
    id: randomUUID(),
    kind: "bench",
    x: 26,
    z: -8,
    seed: 1,
    growth: 1,
  } as const;
  const floor = new Map<string, typeof stone>();
  for (let x = 12; x < 16; x++)
    for (let z = 13; z < 16; z++) floor.set(`${x},0,${z}`, stone);
  const raised = {
    ...blank(),
    entities: [bench],
    construction: packCells(floor),
    entityPlacements: [
      {
        entityId: bench.id,
        y: 1,
        support: { type: "blockTop" as const, x: 13, y: 0, z: 14 },
      },
    ],
  };
  expect(validateBuilding(raised)).toBe(null);
  floor.set("13,1,15", stone);
  expect(
    validateBuilding({ ...raised, construction: packCells(floor) }),
  ).toMatch(/就坐/);
});
