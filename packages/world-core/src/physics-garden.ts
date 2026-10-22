import {
  homeFeatures,
  meadowFeatures,
  forestTrail,
  pondShape,
  labFeatures,
  beachFeatures,
  beachLagoon,
  starlightFeatures,
} from "./theme-geography.js";
import { pathDistance } from "./geom.js";
import {
  type ObjectDefinition,
  type ObjectInstance,
  type PhysicsScene,
} from "@island/contracts";
import {
  gardenBeds,
  gardenGreenhouse,
  gardenPond,
  nurseryFeatures,
} from "./garden-geography.js";
import { PhysicsSceneBuilder } from "./physics-scene-builder.js";
import { physicsPlants } from "./physics-plants.js";
import { box, cylinder } from "./physics-primitives.js";

export const gardenTable = { x: -17, z: -10, top: 1.75, radius: 2.5 };
export function gardenTerrainHeight(x: number, z: number) {
  const r = Math.hypot(
    (x - gardenPond.x) / gardenPond.rx,
    (z - gardenPond.z) / gardenPond.rz,
  );
  const t = Math.max(0, Math.min(1, (r - 0.55) / 0.45));
  return Math.round(-1.3 * (1 - t * t * (3 - 2 * t)) * 1000) / 1000;
}
export function gardenGroundColor(x: number, z: number) {
  if (gardenTerrainHeight(x, z) < -0.1) return "#9caa92";
  return Math.abs(x) < 3 ||
    (Math.abs(z + 1) < 2 && Math.abs(x) < 34) ||
    (Math.abs(x + 22) < 2 && z < -1 && z > -20)
    ? "#dbd5b7"
    : "#a9bc8b";
}
export function nurseryGroundColor(x: number, z: number) {
  return Math.abs(x) < 3 || Math.abs(z - 1) < 1.5 ? "#d8c69f" : "#a5b78a";
}
const p = (x: number, z: number, y = 0) => ({ x, y, z });
function bed(
  b: PhysicsSceneBuilder,
  key: string,
  x: number,
  z: number,
  w: number,
  d: number,
) {
  b.fixed(key, "种植床", p(x, z), [
    box("soil", 0, 0.12, 0, w, 0.24, d, "#89735b"),
    ...[-1, 1].flatMap((side, i) => [
      box(
        `edge-z-${i}`,
        0,
        0.32,
        (side * d) / 2,
        w + 0.4,
        0.5,
        0.35,
        "#baa27c",
      ),
      box(`edge-x-${i}`, (side * w) / 2, 0.32, 0, 0.35, 0.5, d, "#baa27c"),
    ]),
  ]);
}
function greenhouse(
  b: PhysicsSceneBuilder,
  x: number,
  z: number,
  w: number,
  d: number,
) {
  // Solid slatted walls and an open central entrance: drawing and collision share these exact parts.
  b.fixed("greenhouse", "温室", p(x, z), [
    box("floor", 0, 0.15, 0, w + 0.8, 0.3, d + 0.8, "#c3c3a7"),
    ...[-1, 1].flatMap((side, i) => [
      {
        ...box(`wall-${i}`, (side * w) / 2, 3.3, 0, 0.2, 6, d, "#b7d4ba"),
        opacity: 0.28,
      },
      {
        ...box(
          `front-${i}`,
          side * (w / 4 + 1),
          3.3,
          d / 2,
          w / 2 - 2,
          6,
          0.2,
          "#b7d4ba",
        ),
        opacity: 0.28,
      },
      box(
        `header-${i}`,
        side * (w / 4 + 1),
        6.4,
        d / 2,
        w / 2 - 2,
        0.2,
        0.35,
        "#eee4ca",
      ),
      {
        ...box(
          `roof-${i}`,
          (side * w) / 4,
          6.5 + (w / 4) * Math.tan(0.28),
          0,
          w / 2 + 0.8,
          0.18,
          d + 0.8,
          "#a0bfa4",
        ),
        rotation: { x: 0, y: 0, z: Math.sin(-side * 0.14), w: Math.cos(0.14) },
        opacity: 0.4,
      },
    ]),
    { ...box("back", 0, 3.3, -d / 2, w, 6, 0.2, "#b7d4ba"), opacity: 0.28 },
    ...[-1, 1].flatMap((sx, i) =>
      [-1, 1].map((sz, j) =>
        box(
          `post-${i}-${j}`,
          (sx * w) / 2,
          3.3,
          (sz * d) / 2,
          0.25,
          6.6,
          0.25,
          "#eee4ca",
        ),
      ),
    ),
    box("door-top", 0, 5.8, d / 2, 4, 1.2, 0.25, "#eee4ca"),
  ]);
  for (const [i, side] of [-1, 1].entries()) {
    const sx = x + side * w * 0.29;
    b.fixed(`greenhouse-table-${i}`, "温室育苗台", p(sx, z), [
      box("top", 0, 1.6, 0, 3, 0.35, d - 3, "#9d8061"),
      ...[-1, 1].map((s, j) =>
        box(`leg-${j}`, 0, 0.8, s * (d / 2 - 2), 1, 1.6, 0.3, "#927654"),
      ),
    ]);
    for (let j = 0; j < 3; j++)
      b.fixed(`pot-${i}-${j}`, "温室花盆", p(sx, z + (j - 1) * 3), [
        cylinder("pot", 0, 2.05, 0, 0.6, 0.55, "#bc896b"),
      ]);
  }
}
function entrance(b: PhysicsSceneBuilder, z: number) {
  b.fixed("entrance", "花架入口", p(0, z), [
    ...[-4, 4].map((x, i) =>
      box(`post-${i}`, x, 3.7, 0, 0.5, 7.4, 0.5, "#eee2c5"),
    ),
    box("beam", 0, 7.1, 0, 10, 0.5, 2, "#eee2c5"),
    ...[-4, -2, 0, 2, 4].map((x, i) =>
      box(`slat-${i}`, x, 7.6, 0, 0.25, 0.3, 3.5, "#a5b38a"),
    ),
  ]);
}

export function createGardenPhysicsScene(
  kind: "garden" | "nursery",
): PhysicsScene {
  const garden = kind === "garden",
    b = new PhysicsSceneBuilder(kind, garden ? "30000000" : "40000000");
  const plants = physicsPlants(),
    flower = plants.find((d) => d.id === "core:plant-daisy-1")!,
    tree = plants.find((d) => d.id === "core:plant-oak-2")!;
  const beds = garden
    ? gardenBeds
    : nurseryFeatures.beds.map((bed) => ({ ...bed, w: 9, d: 4 }));
  for (const [i, plot] of beds.entries()) {
    bed(b, `bed-${i}`, plot.x, plot.z, plot.w, plot.d);
    // Leave one plot empty for the first planting. Ordinary plants can grow or be removed.
    if (i === beds.length - 1) continue;
    for (const dx of garden ? [-6, -3, 0, 3, 6] : [-2.5, 0, 2.5])
      for (const dz of garden ? [-2, 2] : [0])
        b.object(flower, p(plot.x + dx, plot.z + dz, 0.24));
  }
  const glass = garden ? gardenGreenhouse : nurseryFeatures.greenhouse;
  greenhouse(b, glass.x, glass.z, glass.w, glass.d);
  for (const side of [-1, 1])
    for (let j = 0; j < 3; j++)
      b.object(
        flower,
        p(glass.x + side * glass.w * 0.29, glass.z + (j - 1) * 3, 2.325),
      );
  entrance(b, garden ? 35 : 30);
  if (garden) {
    for (const side of [-1, 1]) {
      b.fixed(
        `hedge-side-${side < 0 ? "west" : "east"}`,
        "花园围篱",
        p(side * 42, 0),
        [box("hedge", 0, 1.5, 0, 2.5, 3, 76, "#6f8d63")],
      );
      b.fixed(
        `hedge-front-${side < 0 ? "west" : "east"}`,
        "花园围篱",
        p(side * 23, 37),
        [box("hedge", 0, 1.5, 0, 38, 3, 2.5, "#7e986c")],
      );
    }
    b.fixed("hedge-back", "花园围篱", p(0, -37), [
      box("hedge", 0, 1.5, 0, 86, 3, 2.5, "#6f8d63"),
    ]);
    b.fixed("tea-table", "花园圆茶桌", p(gardenTable.x, gardenTable.z), [
      cylinder(
        "top",
        0,
        gardenTable.top - 0.15,
        0,
        gardenTable.radius,
        0.3,
        "#c6aa7c",
      ),
      box("leg", 0, 0.8, 0, 0.6, 1.6, 0.6, "#8c7254"),
      cylinder("cup", 0, 2.05, 0, 0.4, 0.6, "#efdec0"),
    ]);
    b.fixed(
      "tea-steps",
      "茶桌小阶梯",
      p(gardenTable.x, 0),
      [0, 1, 2, 3, 4, 5].map((i) =>
        box(
          `step-${i}`,
          0,
          (i + 1) * 0.125,
          -4.2 - i * 0.6,
          2,
          (i + 1) * 0.25,
          0.6,
          "#c6aa7c",
        ),
      ),
    );
    for (const [i, x] of [-3.5, 3.5].entries())
      b.fixed(
        `tea-stool-${i}`,
        "茶桌坐凳",
        p(gardenTable.x + x, gardenTable.z),
        [box("seat", 0, 0.8, 0, 1.8, 1.6, 1.8, "#a68c67")],
        {
          abilities: ["seat"],
          seat: { partId: "seat", yaw: x < 0 ? Math.PI / 2 : -Math.PI / 2 },
        },
      );
    for (let i = 0; i < 28; i++) {
      const angle = (i * Math.PI * 2) / 28,
        x = gardenPond.x + Math.cos(angle) * (gardenPond.rx + 0.35),
        z = gardenPond.z + Math.sin(angle) * (gardenPond.rz + 0.35);
      b.fixed(
        `pond-stone-${i}`,
        "睡莲池石岸",
        p(x, z),
        [cylinder("stone", 0, 0.4, 0, 0.9, 0.8, "#bdbea4")],
        { material: "stone" },
      );
    }
    for (const x of [-36, 36])
      for (const z of [-29, -18, 12, 29]) b.object(tree, p(x, z));
  } else {
    b.fixed("water-barrel", "浇灌水桶", p(-36, -2), [
      cylinder("barrel", 0, 1.3, 0, 1.6, 2.6, "#90785d"),
      cylinder("rim", 0, 2.6, 0, 1.7, 0.2, "#b0b8a0"),
    ]);
    b.fixed("tool-table", "种植工具台", p(-29, -2), [
      box("top", 0, 1.3, 0, 4, 0.3, 2, "#b2956c"),
      ...[-1.5, 1.5].map((x, i) =>
        box(`leg-${i}`, x, 0.6, 0, 0.25, 1.2, 1.5, "#8e7557"),
      ),
    ]);
    for (const x of [-37, 37])
      for (const z of [-27, 24]) b.object(tree, p(x, z));
  }
  const width = 88,
    depth = garden ? 78 : 72,
    step = 2,
    columns = width / step,
    rows = depth / step;
  const terrain = [
    {
      id: `${kind}-ground`,
      origin: p(-width / 2, -depth / 2),
      columns,
      rows,
      step,
      heights: Array.from({ length: (columns + 1) * (rows + 1) }, (_, i) =>
        garden
          ? gardenTerrainHeight(
              -width / 2 + (i % (columns + 1)) * step,
              -depth / 2 + Math.floor(i / (columns + 1)) * step,
            )
          : 0,
      ),
      material: "stone" as const,
      color: "#a9bc8b",
    },
  ];
  return b.build(
    garden ? "私家花园" : "实验种植园",
    p(0, garden ? 29 : 25, 0.87),
    { min: p(-44, -depth / 2, -6), max: p(44, depth / 2, 24) },
    terrain,
  );
}

/** Theme-specific planting protection shares the same geography with the template and previews. */
export function physicsPlantingError(
  scene: PhysicsScene,
  object: ObjectInstance,
  definition: ObjectDefinition,
): string | null {
  if (!definition.plant) return null;
  const { x, z } = object.position,
    tree = definition.plant.species === "oak";
  if (scene.template.id === "core:garden") {
    if (Math.abs(x) < 4 || (Math.abs(z + 1) < 3 && Math.abs(x) < 33))
      return "请为花园小径和入口留出空间";
    if (Math.hypot((x - gardenPond.x) / 12, (z - gardenPond.z) / 10) < 1)
      return "水池与石岸不能种植";
    if (
      tree &&
      Math.abs(x - gardenGreenhouse.x) < 12 &&
      Math.abs(z - gardenGreenhouse.z) < 9
    )
      return "温室内只种矮小植物";
    if (
      tree &&
      gardenBeds.some(
        (b) =>
          Math.abs(x - b.x) < b.w / 2 + 1 && Math.abs(z - b.z) < b.d / 2 + 1,
      )
    )
      return "花圃里只种花";
  }
  if (scene.template.id === "core:nursery") {
    if (Math.abs(x) < 3) return "请为种植园小径和温室入口留出空间";
    if (tree && Math.abs(x) < 17 && Math.abs(z + 14) < 9)
      return "温室内只种矮小植物";
    if (
      tree &&
      nurseryFeatures.beds.some(
        (b) => Math.abs(x - b.x) < 5.5 && Math.abs(z - b.z) < 2.75,
      )
    )
      return "苗床里只种花";
  }
  const key = scene.template.id;
  if (
    key === "core:home" &&
    (Math.hypot(x, z) < 7.5 ||
      (Math.abs(x) < 3.5 && z > 5) ||
      homeFeatures.cabins.some(
        (c) =>
          Math.abs(x - c.x) < c.w / 2 + 2 && Math.abs(z - c.z) < c.d / 2 + 2,
      ))
  )
    return "请为小广场、屋门和小径留出空间";
  if (
    key === "core:meadow" &&
    ((Math.abs(x) < 3 && z > 28) ||
      (Math.abs(x - meadowFeatures.blanket.x) < 5 &&
        Math.abs(z - meadowFeatures.blanket.z) < 4.5) ||
      (Math.abs(x - 24) < 6 && Math.abs(z + 12) < 3))
  )
    return "请为野餐、吊床和入口留出空间";
  if (key === "core:forest" && pathDistance({ x, z }, forestTrail) < 2.6)
    return "林间小径需要保持通畅";
  if (
    key === "core:pond" &&
    (Math.hypot(
      x / (pondShape.rx + 1.5),
      (z - pondShape.z) / (pondShape.rz + 1.5),
    ) < 1 ||
      (Math.abs(x) < 3 && z > 20))
  )
    return "池塘、拱桥和入口不能种植";
  if (key === "core:lab" && Math.abs(x) < 3 && z > 22)
    return "实验室入口需要留出空间";
  if (
    key === "core:lab" &&
    tree &&
    labFeatures.beds.some((b) => Math.abs(x - b.x) < 5 && Math.abs(z - b.z) < 3)
  )
    return "实验苗床里只种花";
  if (
    key === "core:beach" &&
    (Math.hypot(x - beachLagoon.x, z - beachLagoon.z) < beachLagoon.r + 1.5 ||
      (Math.abs(x - beachFeatures.dock.x) < 2.5 && z < -6) ||
      (Math.abs(x) < 3 && z > 30))
  )
    return "请为海湾、栈桥和入口留出空间";
  if (
    key === "core:starlight" &&
    (Math.hypot(x, z) < 4 ||
      (Math.abs(x) < 5 && z > 22) ||
      starlightFeatures.stones.some((s) => Math.hypot(x - s.x, z - s.z) < 3.2))
  )
    return "请为石盆、立石和洞口留出空间";
  return null;
}
