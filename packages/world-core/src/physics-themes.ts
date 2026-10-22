import {
  identityQuaternion,
  type ObjectDefinition,
  type ObjectPart,
  type PhysicsTerrainTile,
} from "@island/contracts";
import {
  homeFeatures,
  meadowFeatures,
  forestTrail,
  pondShape,
  labFeatures,
  starlightFeatures,
  beachFeatures,
  beachLagoon,
  beachShore,
} from "./theme-geography.js";
import { pathDistance } from "./geom.js";
import { random } from "./random.js";
import { PhysicsSceneBuilder } from "./physics-scene-builder.js";
import { box, cylinder, hull } from "./physics-primitives.js";
import { physicsPlants } from "./physics-plants.js";

export const physicalThemeSpecs = [
  {
    key: "home",
    name: "家园小院",
    width: 74,
    depth: 62,
    gate: 27,
    ground: "#b7c49b",
    sky: "#cbd8b9",
    description: "三间小屋、井台和相聚的小广场",
  },
  {
    key: "meadow",
    name: "风眠草地",
    width: 86,
    depth: 74,
    gate: 32,
    ground: "#b3c78d",
    sky: "#cfdcc0",
    description: "野餐、吊床与开阔草地",
  },
  {
    key: "forest",
    name: "狐狸森林",
    width: 94,
    depth: 82,
    gate: 34,
    ground: "#829a71",
    sky: "#b9cdb2",
    description: "沿石头小径穿过树林，在树桩上休息",
  },
  {
    key: "pond",
    name: "静水池塘",
    width: 90,
    depth: 78,
    gate: 33,
    ground: "#a6ba8a",
    sky: "#d3e4dc",
    description: "走过拱桥，沿池岸看睡莲",
  },
  {
    key: "lab",
    name: "自然实验室",
    width: 82,
    depth: 70,
    gate: 30,
    ground: "#b5bd98",
    sky: "#d4e1db",
    description: "搬动样品瓶、探索实验台和天文仪器",
  },
  {
    key: "beach",
    name: "月牙沙滩",
    width: 88,
    depth: 88,
    gate: 34,
    ground: "#e5d4ab",
    sky: "#c3dce4",
    description: "沿月牙海岸散步，走上伸入海湾的栈桥",
  },
  {
    key: "starlight",
    name: "星光秘境",
    width: 74,
    depth: 66,
    gate: 27,
    ground: "#74768e",
    sky: "#202d47",
    description: "穿过石拱门，探索立石和星辉石盆",
  },
] as const;
export type PhysicalThemeKey = (typeof physicalThemeSpecs)[number]["key"];
export const labTableTop = 1.68;
export const pondBridge = { x1: -24, x2: 24, z: -6, width: 3 };
const p = (x: number, z: number, y = 0) => ({ x, y, z });
const rounded = (v: number) => Math.round(v * 1000) / 1000;
const ball = (
  id: string,
  x: number,
  y: number,
  z: number,
  radius: number,
  color: string,
): ObjectPart => ({
  id,
  position: { x, y, z },
  rotation: identityQuaternion,
  shape: { kind: "ball", radius },
  color,
  sensor: false,
});
function cone(
  id: string,
  x: number,
  y: number,
  z: number,
  radius: number,
  height: number,
  color: string,
  sides = 12,
) {
  return hull(
    id,
    [
      { x, y: y + height, z },
      ...Array.from({ length: sides }, (_, i) => ({
        x: x + Math.cos((i / sides) * Math.PI * 2) * radius,
        y,
        z: z + Math.sin((i / sides) * Math.PI * 2) * radius,
      })),
    ],
    color,
  );
}
function tree(
  b: PhysicsSceneBuilder,
  key: string,
  x: number,
  z: number,
  height = 6,
) {
  b.fixed(key, "林木", p(x, z), [
    cylinder("trunk", 0, height / 2, 0, 0.4, height, "#8f7356"),
    ball("crown", 0, height, 0, 2, "#648655"),
    ball("crown-side", 1, height - 0.5, 0.3, 1.5, "#7b9b60"),
  ]);
}
function seat(
  b: PhysicsSceneBuilder,
  key: string,
  x: number,
  z: number,
  top = 0.8,
  radius = 0.8,
) {
  b.fixed(
    key,
    "休憩树桩",
    p(x, z),
    [
      cylinder("stump", 0, (top - 0.08) / 2, 0, radius, top - 0.08, "#8e7454"),
      cylinder("seat", 0, top - 0.04, 0, radius, 0.08, "#c6ad83"),
    ],
    { abilities: ["seat"], seat: { partId: "seat", yaw: 0 } },
  );
}
function entrance(b: PhysicsSceneBuilder, z: number, stone = false) {
  const color = stone ? "#93949e" : "#bba27a";
  b.fixed("entrance", stone ? "星光石拱" : "场景入口", p(0, z), [
    box("left", -3.3, 2.1, 0, 0.6, 4.2, 0.8, color),
    box("right", 3.3, 2.1, 0, 0.6, 4.2, 0.8, color),
    box("beam", 0, 4.35, 0, 7.5, 0.5, 1, color),
  ]);
}
function flowers(
  b: PhysicsSceneBuilder,
  positions: Array<{ x: number; z: number; y?: number }>,
) {
  const definition = physicsPlants().find(
    (d) => d.id === "core:plant-daisy-2",
  )!;
  for (const at of positions) b.object(definition, p(at.x, at.z, at.y ?? 0));
}
/** Four sealed sample bottles: rigid solids, not a liquid simulation. */
export function themeMovableObjects(): ObjectDefinition[] {
  return ["#69b7a8", "#b786c0", "#d8a15e", "#8fa8c9"].map((color, i) => ({
    id: `core:sample-bottle-${i + 1}`,
    version: 1,
    name: ["绿", "紫", "橙", "蓝"][i] + "色样品瓶",
    source: "official",
    bodyType: "dynamic",
    material: "stone",
    abilities: ["grabbable"],
    parts: [
      hull(
        "bottle",
        [
          { y: 0, r: 0.34 },
          { y: 0.8, r: 0.34 },
          { y: 1, r: 0.21 },
        ].flatMap((ring) =>
          Array.from({ length: 8 }, (_, i) => ({
            x: Math.cos((i / 4) * Math.PI) * ring.r,
            y: ring.y,
            z: Math.sin((i / 4) * Math.PI) * ring.r,
          })),
        ),
        color,
      ),
      cylinder("cap", 0, 1.05, 0, 0.23, 0.1, "#ddd5bb"),
    ],
  }));
}
export function themeTerrainHeight(
  key: PhysicalThemeKey,
  x: number,
  z: number,
) {
  if (key !== "pond") return 0;
  const r = Math.hypot(x / pondShape.rx, (z - pondShape.z) / pondShape.rz),
    t = Math.max(0, Math.min(1, (r - 0.6) / 0.4));
  return rounded(-1.5 * (1 - t * t * (3 - 2 * t)));
}
export function themeGroundColor(key: PhysicalThemeKey, x: number, z: number) {
  const spec = physicalThemeSpecs.find((s) => s.key === key)!;
  if (key === "forest" && pathDistance({ x, z }, forestTrail) < 2.4)
    return "#b4b29d";
  if (key === "home" && Math.hypot(x, z) < 7) return "#d3c9aa";
  if (Math.abs(x) < 2 && z > spec.gate - 14) return "#d4c7a5";
  if (key === "pond" && themeTerrainHeight(key, x, z) < -0.05) return "#a2ae9a";
  return spec.ground;
}
function terrain(key: PhysicalThemeKey): PhysicsTerrainTile[] {
  const spec = physicalThemeSpecs.find((s) => s.key === key)!,
    columns = spec.width / 2,
    rows = spec.depth / 2;
  return [
    {
      id: `${key}-ground`,
      origin: p(-spec.width / 2, -spec.depth / 2),
      columns,
      rows,
      step: 2,
      heights: Array.from({ length: (columns + 1) * (rows + 1) }, (_, i) =>
        themeTerrainHeight(
          key,
          -spec.width / 2 + (i % (columns + 1)) * 2,
          -spec.depth / 2 + Math.floor(i / (columns + 1)) * 2,
        ),
      ),
      ...(key === "beach"
        ? {
            cells: Array.from({ length: columns * rows }, (_, i) => {
              const x = -spec.width / 2 + (i % columns) * 2 + 1,
                z = -spec.depth / 2 + Math.floor(i / columns) * 2 + 1;
              return (
                Math.hypot(x, z) < beachShore.r &&
                Math.hypot(x - beachLagoon.x, z - beachLagoon.z) >=
                  beachLagoon.r
              );
            }),
          }
        : {}),
      material: "stone",
      color: spec.ground,
    },
  ];
}
function home(b: PhysicsSceneBuilder) {
  for (const [i, c] of homeFeatures.cabins.entries()) {
    const colors = ["#b87856", "#5c7f7b", "#738b72"];
    b.fixed(`cabin-${c.id}`, "小院木屋", p(c.x, c.z), [
      box("foundation", 0, 0.35, 0, c.w + 1.4, 0.7, c.d + 1.4, "#cbbf9d"),
      box("walls", 0, 3.4, 0, c.w, 5.5, c.d, "#f0e4c8"),
      hull(
        "roof",
        [
          { x: -c.w / 2 - 0.8, y: 6.2, z: -c.d / 2 - 0.8 },
          { x: c.w / 2 + 0.8, y: 6.2, z: -c.d / 2 - 0.8 },
          { x: -c.w / 2 - 0.8, y: 6.2, z: c.d / 2 + 0.8 },
          { x: c.w / 2 + 0.8, y: 6.2, z: c.d / 2 + 0.8 },
          { x: 0, y: 9.2, z: 0 },
        ],
        colors[i]!,
      ),
      box("door", 0, 2.2, c.d / 2 + 0.1, 2, 4, 0.2, "#6b7566"),
      ...[-1, 1].map((s, j) =>
        box(
          `window-${j}`,
          s * (c.w / 2 - 2.2),
          4.1,
          c.d / 2 + 0.1,
          1.7,
          2,
          0.2,
          "#7daba7",
        ),
      ),
      box(
        "chimney",
        c.w / 2 - 1.2,
        8,
        -c.d / 2 + 1.4,
        0.9,
        2.4,
        0.9,
        "#a78b74",
      ),
    ]);
  }
  b.fixed("well", "小院水井", p(homeFeatures.well.x, homeFeatures.well.z), [
    cylinder("base", 0, 0.85, 0, 1.8, 1.7, "#a8a391"),
    cylinder("water", 0, 1.75, 0, 1.45, 0.1, "#3f5a68"),
    ...[-1, 1].map((s, i) =>
      box(`post-${i}`, s * 1.6, 2.9, 0, 0.28, 2.4, 0.28, "#8c7254"),
    ),
    cone("roof", 0, 3.7, 0, 2.5, 1.5, "#738b72", 4),
  ]);
  const { x1, x2, z } = homeFeatures.laundry;
  b.fixed("laundry", "晾衣架", p((x1 + x2) / 2, z), [
    box("left", -4, 1.5, 0, 0.16, 3, 0.16, "#9b8a6d"),
    box("right", 4, 1.5, 0, 0.16, 3, 0.16, "#9b8a6d"),
    box("line", 0, 2.95, 0, 8, 0.06, 0.06, "#e6dfc8"),
    ...[-2.6, -0.6, 1.6].map((x, i) =>
      box(
        `cloth-${i}`,
        x,
        2.45,
        0,
        1.5,
        1 + (i % 2) * 0.5,
        0.06,
        ["#c78f84", "#8fb3c7", "#d9c48a"][i]!,
      ),
    ),
  ]);
  for (const [i, [x, z]] of [
    [-2.6, 12],
    [2.6, 12],
    [-2.6, 20],
    [2.6, 20],
  ].entries())
    b.fixed(
      `lantern-${i}`,
      "庭院灯",
      p(x!, z!),
      [
        cylinder("pole", 0, 1.9, 0, 0.12, 3.8, "#6b6350"),
        ball("bulb", 0, 4.15, 0, 0.42, "#f8dfa0"),
      ],
      {
        abilities: ["light"],
        light: { partId: "bulb", color: "#ffe3a7", intensity: 5, distance: 8 },
      },
    );
  for (const [i, [x, z]] of [
    [-30, 24],
    [31, 25],
    [-33, -6],
    [33, -4],
  ].entries())
    tree(b, `tree-${i}`, x!, z!);
  flowers(
    b,
    [-26, -23, -20, -17, 18, 21, 24].map((x) => ({ x, z: -5 })),
  );
  seat(b, "seat", 8, 2);
}
function meadow(b: PhysicsSceneBuilder) {
  const { blanket, hammock } = meadowFeatures;
  b.fixed(
    "picnic",
    "野餐垫",
    p(blanket.x, blanket.z),
    [
      box("cloth", 0, 0.03, 0, 6, 0.06, 5, "#d98a76"),
      ...[-1.5, 0, 1.5].map((x, i) =>
        box(`stripe-${i}`, x, 0.07, 0, 0.7, 0.06, 5, "#f0e6d2"),
      ),
      cylinder("basket", 1.7, 0.6, 1.2, 0.8, 1, "#c9a06a"),
    ],
    {},
    0.4,
  );
  const mid = (hammock.x1 + hammock.x2) / 2;
  tree(b, "anchor-left", hammock.x1, hammock.z, 7);
  tree(b, "anchor-right", hammock.x2, hammock.z, 7);
  // Rigid resting surface. No unsimulated cloth sway or hidden walk support.
  b.fixed(
    "hammock",
    "林间吊床",
    p(mid, hammock.z),
    [
      box("bed", 0, 1.4, 0, 6.6, 0.24, 2.4, "#ecd9ad"),
      box("pillow", -2.1, 1.67, 0, 1.3, 0.3, 1.5, "#d98a76"),
      box("tie-left", -3.65, 1.7, 0, 0.7, 0.12, 0.16, "#c8b187"),
      box("tie-right", 3.65, 1.7, 0, 0.7, 0.12, 0.16, "#c8b187"),
    ],
    { abilities: ["seat"], seat: { partId: "bed", yaw: 0 } },
  );
  b.fixed("hammock-step", "吊床踏步", p(mid, hammock.z + 1.9), [
    box("step", 0, 0.35, 0, 1.6, 0.7, 1, "#b59b74"),
  ]);
  seat(b, "picnic-seat", -12, 12, 0.5);
  seat(b, "seat", -16, 17);
  for (const [i, [x, z]] of [
    [-36, -26],
    [-29, -31],
    [37, -27],
    [31, -31],
    [-39, 17],
    [39, 19],
    [-24, 32],
    [18, 33],
    [33, 25],
    [-33, -8],
  ].entries())
    tree(b, `tree-${i}`, x!, z!);
  flowers(
    b,
    Array.from({ length: 20 }, (_, i) => ({
      x: -27 + (i % 10) * 5,
      z: -23 + Math.floor(i / 10) * 10,
    })),
  );
}
function forest(b: PhysicsSceneBuilder) {
  const stones = random(31);
  for (let leg = 0; leg < forestTrail.length; leg++) {
    const a = forestTrail[leg]!,
      next = forestTrail[(leg + 1) % forestTrail.length]!,
      length = Math.hypot(next.x - a.x, next.z - a.z);
    let stone = 0;
    for (let d = stones() * 1.8; d < length; d += 2.1 + stones() * 0.8) {
      const t = d / length,
        x = a.x + (next.x - a.x) * t,
        z = a.z + (next.z - a.z) * t;
      b.fixed(
        `trail-${leg}-${stone++}`,
        "林间踏石",
        p(x, z),
        [cylinder("stone", 0, 0.09, 0, 0.9, 0.18, "#b5b39e")],
        { material: "stone" },
      );
    }
  }
  const rng = random(731),
    planted: Array<{ x: number; z: number }> = [];
  for (let i = 0; i < 1500 && planted.length < 70; i++) {
    const x = rounded((rng() - 0.5) * 86),
      z = rounded((rng() - 0.5) * 74);
    if (
      pathDistance({ x, z }, forestTrail) < 4 ||
      planted.some((t) => Math.hypot(x - t.x, z - t.z) < 5) ||
      [
        [-19, 14],
        [16, 10],
        [21, 17],
      ].some(([a, c]) => Math.hypot(x - a!, z - c!) < 4)
    )
      continue;
    tree(b, `tree-${planted.length}`, x, z, 5 + rng() * 2);
    planted.push({ x, z });
  }
  for (const [i, [x, z]] of [
    [-19, 14],
    [16, 10],
    [21, 17],
  ].entries())
    seat(b, `stump-${i}`, x!, z!, 0.96);
  for (let i = 0; i < 14; i++) {
    const bend = forestTrail[i % forestTrail.length]!,
      angle = i * 2.4,
      x = bend.x + Math.cos(angle) * 4.5,
      z = bend.z + Math.sin(angle) * 4.5;
    if (pathDistance({ x, z }, forestTrail) < 2.4) continue;
    b.fixed(`mushroom-${i}`, "林间蘑菇", p(x, z), [
      cylinder("stem", 0, 0.3, 0, 0.14, 0.6, "#e8ddc7"),
      ball("cap", 0, 0.7, 0, 0.46, i % 3 ? "#c05656" : "#8f7fc0"),
    ]);
  }
}
function pond(b: PhysicsSceneBuilder) {
  const { x1, x2, z, width } = pondBridge,
    count = 48;
  // A complete bank-to-bank bridge. Each rise is below the common character step limit.
  for (let i = 0; i <= count; i++) {
    const t = i / count,
      x = x1 + (x2 - x1) * t,
      y = 0.16 + Math.sin(t * Math.PI) * 1.4;
    b.fixed(`bridge-${i}`, "池塘拱桥", p(x, z), [
      box("deck", 0, y - 0.08, 0, 1.04, 0.16, width, "#b08a5d"),
      ...[-1, 1].flatMap((s, j) => [
        box(
          `rail-${j}`,
          0,
          y + 1,
          s * (width / 2 - 0.08),
          1.04,
          0.16,
          0.16,
          "#a8814f",
        ),
        ...(i % 4 === 0
          ? [
              cylinder(
                `post-${j}`,
                0,
                y + 0.5,
                s * (width / 2 - 0.08),
                0.09,
                1,
                "#8c7254",
              ),
            ]
          : []),
      ]),
    ]);
  }
  for (const [i, [x, z]] of [
    [-29, 12],
    [29, 15],
    [31, -20],
  ].entries())
    tree(b, `willow-${i}`, x!, z!, 7);
  seat(b, "west-seat", -31, -4);
  seat(b, "east-seat", 32, 6);
  flowers(
    b,
    Array.from({ length: 18 }, (_, i) => {
      const a = (i / 18) * Math.PI * 2;
      return { x: Math.cos(a) * 27, z: -6 + Math.sin(a) * 22 };
    }),
  );
}
function lab(b: PhysicsSceneBuilder) {
  const bottles = themeMovableObjects();
  for (const [i, at] of labFeatures.benches.entries()) {
    b.fixed(`workbench-${i}`, "实验工作台", p(at.x, at.z), [
      box("top", 0, labTableTop - 0.09, 0, 8.4, 0.18, 3.4, "#c8b48c"),
      ...[-1, 1].flatMap((sx, j) =>
        [-1, 1].map((sz, k) =>
          cylinder(
            `leg-${j}-${k}`,
            sx * 3.6,
            0.75,
            sz * 1.3,
            0.18,
            1.5,
            "#8c7254",
          ),
        ),
      ),
    ]);
    for (let step = 0; step < 5; step++)
      b.fixed(
        `bench-${i}-step-${step}`,
        "实验台踏步",
        p(at.x, at.z + 4.6 - step * 0.6),
        [
          box(
            "step",
            0,
            (step + 1) * 0.14,
            0,
            1.4,
            (step + 1) * 0.28,
            0.6,
            "#ad9a78",
          ),
        ],
      );
    for (let j = 0; j < 4; j++)
      b.object(
        bottles[j]!,
        p(at.x - 3 + j * 2, at.z - 0.7, labTableTop + 0.01),
      );
  }
  for (const [i, bed] of labFeatures.beds.entries()) {
    b.fixed(`bed-${i}`, "实验苗床", p(bed.x, bed.z), [
      box("soil", 0, 0.12, 0, 8, 0.24, 4, "#8a7458"),
      ...[-1, 1].map((s, j) =>
        box(`edge-${j}`, 0, 0.35, s * 2, 8.4, 0.4, 0.3, "#baa27c"),
      ),
    ]);
    flowers(
      b,
      [-2, 0, 2].flatMap((dx) =>
        [-1, 1].map((dz) => ({ x: bed.x + dx, z: bed.z + dz, y: 0.25 })),
      ),
    );
  }
  // Stationary armillary rings are short solid bars, not an invisible enclosing sphere.
  const at = labFeatures.armillary;
  b.fixed("armillary-base", "浑天仪底座", p(at.x, at.z), [
    cylinder("base", 0, 0.5, 0, 1.3, 1, "#a8a391"),
    cylinder("pole", 0, 2.6, 0, 0.16, 3.4, "#8c7254"),
    ball("sun", 0, 4.5, 0, 0.5, "#e8c86a"),
  ]);
  for (let ring = 0; ring < 3; ring++) {
    const r = 2.1 - ring * 0.35,
      parts: ObjectPart[] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      let part = box(
        `bar-${i}`,
        Math.cos(a) * r,
        4.5 + Math.sin(a) * r,
        0,
        2 * r * Math.tan(Math.PI / 16) + 0.02,
        0.16,
        0.16,
        ["#b08a5d", "#7d8ea6", "#a8814f"][ring]!,
      );
      part.rotation = {
        x: 0,
        y: 0,
        z: Math.sin((a + Math.PI / 2) / 2),
        w: Math.cos((a + Math.PI / 2) / 2),
      };
      parts.push(part);
    }
    b.fixed(
      `armillary-ring-${ring}`,
      "浑天仪环",
      p(at.x, at.z),
      parts,
      {},
      ring * 1.05,
    );
  }
  const dome = labFeatures.dome;
  b.fixed("observatory", "天文台", p(dome.x, dome.z), [
    box("base", 0, 0.3, 0, 10, 0.6, 8, "#c3c3a7"),
    hull(
      "dome",
      [
        { x: 0, y: 4.8, z: 0 },
        ...Array.from({ length: 12 }, (_, i) => ({
          x: Math.cos((i / 6) * Math.PI) * 4.2,
          y: 0.6,
          z: Math.sin((i / 6) * Math.PI) * 4.2,
        })),
        ...Array.from({ length: 12 }, (_, i) => ({
          x: Math.cos((i / 6) * Math.PI) * 3,
          y: 3.6,
          z: Math.sin((i / 6) * Math.PI) * 3,
        })),
      ],
      "#b8c4b5",
    ),
    {
      ...cylinder("telescope", 1.6, 3.5, 2.6, 0.32, 4.4, "#8b9a95"),
      rotation: { x: 0, y: 0, z: Math.sin(0.35), w: Math.cos(0.35) },
    },
  ]);
  seat(b, "seat", 2, 6);
}
function beach(b: PhysicsSceneBuilder) {
  const { dock, umbrella, driftwood, palms } = beachFeatures;
  b.fixed("dock", "海湾栈桥", p(dock.x, (dock.z1 + dock.z2) / 2), [
    box("deck", 0, 0.81, 0, 2.3, 0.24, 22, "#b08a5d"),
    ...Array.from({ length: 5 }, (_, i) =>
      cylinder(`post-${i}`, 0, -0.2, -10 + i * 5, 0.18, 2, "#8c7254"),
    ),
  ]);
  for (let i = 0; i < 3; i++)
    b.fixed(`dock-step-${i}`, "栈桥踏步", p(dock.x, -5.2 - i * 0.6), [
      box("step", 0, (i + 1) * 0.14, 0, 2.3, (i + 1) * 0.28, 0.6, "#b59b74"),
    ]);
  b.fixed("umbrella", "遮阳伞", p(umbrella.x, umbrella.z), [
    cylinder("pole", 0, 1.7, 0, 0.12, 3.4, "#b59a6f"),
    cone("canopy", 0, 3, 0, 2.9, 1.3, "#d97f6f", 9),
    ball("tip", 0, 4.4, 0, 0.18, "#f0e6d2"),
  ]);
  b.fixed("driftwood", "海边浮木", p(driftwood.x, driftwood.z), [
    {
      ...cylinder("log", 0, 0.55, 0, 0.55, 5, "#ad916b"),
      rotation: { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 },
    },
  ]);
  for (const [i, at] of palms.entries()) {
    const flip = i ? -1 : 1;
    b.fixed(`palm-${i}`, "椰子树", p(at.x, at.z), [
      ...Array.from({ length: 5 }, (_, j) => ({
        ...cylinder(
          `trunk-${j}`,
          Math.sin(flip * 0.1 * j) * j * 1.15,
          1.1 + j * 2.1,
          0,
          0.4 - j * 0.04,
          2.4,
          "#9b7e58",
        ),
        rotation: {
          x: 0,
          y: 0,
          z: Math.sin(-flip * 0.05 * (j + 1)),
          w: Math.cos(flip * 0.05 * (j + 1)),
        },
      })),
      ...Array.from({ length: 7 }, (_, j) => {
        const a = (j / 7) * Math.PI * 2;
        return {
          ...box(
            `frond-${j}`,
            flip * 1.8 + Math.cos(a) * 1.6,
            10.5,
            Math.sin(a) * 1.6,
            4.5,
            0.12,
            0.8,
            j % 2 ? "#6c9a5c" : "#7fae6a",
          ),
          rotation: { x: 0, y: Math.sin(-a / 2), z: 0, w: Math.cos(-a / 2) },
        };
      }),
      ball("coconut", flip * 1.8, 10, 0, 0.4, "#8a6a42"),
    ]);
  }
  seat(b, "seat", 12, 20, 0.5);
  flowers(
    b,
    Array.from({ length: 12 }, (_, i) => {
      const a = 0.3 + (i / 12) * 2.6;
      return { x: Math.cos(a) * 34, z: Math.sin(a) * 34 };
    }).filter((at) => Math.abs(at.x) >= 4 || at.z < 30),
  );
}
function starlight(b: PhysicsSceneBuilder) {
  for (const [i, at] of starlightFeatures.stones.entries())
    b.fixed(`standing-stone-${i}`, "星光立石", p(at.x, at.z), [
      hull(
        "stone",
        [
          { x: -1.1, y: 0, z: -0.9 },
          { x: 1.1, y: 0, z: -0.9 },
          { x: -1.1, y: 0, z: 0.9 },
          { x: 1.1, y: 0, z: 0.9 },
          { x: -0.6, y: 5 + (i % 3), z: -0.4 },
          { x: 0.7, y: 5 + (i % 3), z: -0.4 },
          { x: 0, y: 6 + (i % 3), z: 0.7 },
        ],
        i % 2 ? "#8d90a4" : "#9ba0b0",
      ),
    ]);
  const rim = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 6) * Math.PI;
    return {
      ...box(
        `rim-${i}`,
        Math.cos(a) * 2.6,
        0.8,
        Math.sin(a) * 2.6,
        1.45,
        1.6,
        0.6,
        "#858a9b",
      ),
      rotation: {
        x: 0,
        y: Math.sin((Math.PI / 2 - a) / 2),
        z: 0,
        w: Math.cos((Math.PI / 2 - a) / 2),
      },
    };
  });
  b.fixed(
    "basin",
    "星辉石盆",
    p(0, 0),
    [
      cylinder("floor", 0, 0.1, 0, 2.6, 0.2, "#6c7991"),
      ...rim,
      ball("glow", 0, 0.9, 0, 0.5, "#b7d9f2"),
    ],
    {
      abilities: ["light"],
      light: { partId: "glow", color: "#b7d9f2", intensity: 8, distance: 12 },
    },
  );
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + 0.18,
      x = Math.cos(a) * 32,
      z = Math.sin(a) * 28;
    if (Math.abs(x) < 5 && z > 22) continue;
    tree(b, `tree-${i}`, x, z, 5);
  }
  flowers(
    b,
    Array.from({ length: 24 }, (_, i) => {
      const a = i * 2.399963,
        r = 6 + Math.sqrt(i / 24) * 10;
      return { x: Math.cos(a) * r, z: Math.sin(a) * r };
    }),
  );
  seat(b, "seat-left", -5, 4);
  seat(b, "seat-right", 5, 4);
}
export function createThemePhysicsScene(key: PhysicalThemeKey) {
  const index = physicalThemeSpecs.findIndex((s) => s.key === key),
    spec = physicalThemeSpecs[index]!;
  const b = new PhysicsSceneBuilder(key, `4${String(index).padStart(7, "0")}`);
  entrance(b, spec.gate, key === "starlight");
  ({ home, meadow, forest, pond, lab, beach, starlight })[key](b);
  return b.build(
    spec.name,
    p(0, spec.gate - 4, 0.87),
    {
      min: p(-spec.width / 2, -spec.depth / 2, -6),
      max: p(spec.width / 2, spec.depth / 2, 32),
    },
    terrain(key),
  );
}
