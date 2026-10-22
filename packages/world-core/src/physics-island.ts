import {
  PHYSICS_RULES_VERSION,
  physicsSceneSchema,
  terrainHeightAt,
  type ObjectDefinition,
  type ObjectPart,
  type PhysicsScene,
  type PhysicsTerrainTile,
} from "@island/contracts";
import {
  buildings,
  flowerBeds,
  nurseryBeds,
  groundHeight,
  island,
  landmarks,
  pond,
  radial,
  roadSegments,
  shoreline,
  trails,
  zoneAt,
} from "./island-geography.js";
import { segmentDistance } from "./geom.js";
import { random } from "./random.js";

import { box, cylinder, hull } from "./physics-primitives.js";
const rounded = (n: number) => Math.round(n * 1000) / 1000;
const mountainPath = trails.find((path) => path.at(-1)?.z === -76)!;
const mountainDistances = [0];
for (let i = 1; i < mountainPath.length; i++) {
  const a = mountainPath[i - 1]!,
    b = mountainPath[i]!;
  mountainDistances.push(
    mountainDistances[i - 1]! + Math.hypot(b.x - a.x, b.z - a.z),
  );
}
const mountainStart = groundHeight(mountainPath[0]!.x, mountainPath[0]!.z);
const mountainEnd = groundHeight(
  mountainPath.at(-1)!.x,
  mountainPath.at(-1)!.z,
);

/** Grade a broad hiking corridor; the visible triangles carry this slope too. */
export function islandTerrainHeight(x: number, z: number) {
  const original = groundHeight(x, z);
  let nearest = Infinity,
    weightedHeight = 0,
    weights = 0;
  for (let i = 1; i < mountainPath.length; i++) {
    const a = mountainPath[i - 1]!,
      b = mountainPath[i]!;
    const dx = b.x - a.x,
      dz = b.z - a.z;
    const t = Math.max(
      0,
      Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)),
    );
    const distance = Math.hypot(x - a.x - t * dx, z - a.z - t * dz);
    nearest = Math.min(nearest, distance);
    // Blend adjoining grades at switchback corners, avoiding a nearest-segment height discontinuity.
    const weight = Math.exp((-distance * distance) / 18);
    const along =
      mountainDistances[i - 1]! * (1 - t) + mountainDistances[i]! * t;
    const grade =
      mountainStart +
      (mountainEnd - mountainStart) *
        Math.min(1, along / (mountainDistances.at(-1)! - 7));
    weightedHeight += grade * weight;
    weights += weight;
  }
  if (nearest >= 10) return original;
  const road = weightedHeight / weights;
  const blend = Math.max(0, Math.min(1, (nearest - 4) / 6));
  return road + (original - road) * blend * blend * (3 - 2 * blend);
}
/** Canonical static geometry, independent of schema-3 saves, old placement and old walking. */
export function islandTerrain(): PhysicsTerrainTile[] {
  const tiles: PhysicsTerrainTile[] = [];
  for (let tz = 0; tz < 4; tz++)
    for (let tx = 0; tx < 4; tx++) {
      const x0 = -160 + tx * 80,
        z0 = -140 + tz * 70;
      const cells = Array.from({ length: 40 * 35 }, (_, i) => {
        const x = x0 + (i % 40) * 2 + 1,
          z = z0 + Math.floor(i / 40) * 2 + 1;
        return (
          radial(x, z) <=
          shoreline(Math.atan2(z / island.radiusZ, x / island.radiusX))
        );
      });
      if (!cells.some(Boolean)) continue;
      tiles.push({
        id: `island-${tx}-${tz}`,
        origin: { x: x0, y: 0, z: z0 },
        columns: 40,
        rows: 35,
        step: 2,
        heights: Array.from({ length: 41 * 36 }, (_, i) =>
          rounded(
            islandTerrainHeight(x0 + (i % 41) * 2, z0 + Math.floor(i / 41) * 2),
          ),
        ),
        cells,
        material: "stone",
        color: "#9fb882",
      });
    }
  return tiles;
}
/** Render decoration samples the actual triangulation, never the old analytic ground. */
export function islandSurface(
  tiles: PhysicsTerrainTile[],
  x: number,
  z: number,
) {
  for (const tile of tiles) {
    const y = terrainHeightAt(tile, x, z);
    if (y !== undefined) return y;
  }
  throw new Error("主岛地形之外没有落脚面");
}
export function islandGroundColor(x: number, z: number, height: number) {
  if (roadSegments.some(([a, b]) => segmentDistance({ x, z }, a, b) < 1.6))
    return "#dcd1aa";
  if (Math.hypot(x + 28, z - 27) < 7) return "#d3c9aa";
  const zone = zoneAt({ x, z });
  if (zone === "shore") return "#e6d6ac";
  if (height > 30) return "#acaca0";
  if (height > 18) return "#a7aa8e";
  return (
    (
      {
        meadow: "#afc78a",
        garden: "#a0b881",
        nursery: "#a0b881",
        village: "#bcc49c",
        forest: "#859f70",
      } as Record<string, string>
    )[zone] ?? "#9fb882"
  );
}
export type IslandTree = {
  x: number;
  z: number;
  radius: number;
  height: number;
};
export function islandTrees(): IslandTree[] {
  const rng = random(20261023),
    trees: IslandTree[] = [];
  for (let i = 0; i < 1000 && trees.length < 88; i++) {
    const x = rounded(-128 + rng() * 252),
      z = rounded(-95 + rng() * 182);
    const zone = zoneAt({ x, z });
    if (
      radial(x, z) > 0.82 ||
      !["forest", "wild"].includes(zone) ||
      groundHeight(x, z) > 18 ||
      roadSegments.some(([a, b]) => segmentDistance({ x, z }, a, b) < 4) ||
      buildings.some((b) => Math.hypot(x - b.x, z - b.z) < 12) ||
      trees.some((t) => Math.hypot(x - t.x, z - t.z) < 5)
    )
      continue;
    trees.push({
      x,
      z,
      radius: rounded(0.38 + rng() * 0.2),
      height: rounded(4 + rng() * 2),
    });
  }
  return trees;
}
export function createIslandPhysicsScene(): PhysicsScene {
  const terrain = islandTerrain(),
    objects: PhysicsScene["objects"] = [],
    definitions: ObjectDefinition[] = [];
  const surface = (x: number, z: number) => islandSurface(terrain, x, z);
  const add = (
    key: string,
    name: string,
    x: number,
    z: number,
    parts: ObjectPart[],
    material: ObjectDefinition["material"] = "wood",
    yaw = 0,
    y = surface(x, z),
  ) => {
    const id = `core:island-${key}`;
    definitions.push({
      id,
      version: 1,
      name,
      source: "official",
      bodyType: "fixed",
      material,
      parts,
      abilities: [],
    });
    objects.push({
      id: `10000000-0000-4000-8000-${String(objects.length + 1).padStart(12, "0")}`,
      infrastructureKey: key,
      definitionId: id,
      definitionVersion: 1,
      position: { x, y, z },
      rotation: { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) },
    });
  };
  for (const b of buildings) {
    const roofColor = ["#b87856", "#5c7f7b", "#738b72"][b.style]!;
    const parts = [
      box("base", 0, 0.15, 0, 13, 0.3, 11, "#cbbf9d"),
      box(
        "house",
        0,
        3.55,
        0,
        10,
        6.5,
        8,
        b.style === 2 ? "#a9c0af" : "#f0e4c8",
      ),
      hull(
        "roof",
        [-1, 1].flatMap((z) => [
          { x: -6.3, y: 6.8, z: z * 5.1 },
          { x: 6.3, y: 6.8, z: z * 5.1 },
          { x: 0, y: 11, z: z * 5.1 },
        ]),
        roofColor,
      ),
      box("door", 0, 2.2, 4.06, 2.1, 4, 0.2, "#6b7566"),
      box("porch", 0, 0.15, 6.25, 5, 0.3, 1.5, "#b5a17c"),
      ...[-3.1, 3.1].flatMap((x, i) => [
        box(`window-${i}`, x, 4.1, 4.08, 1.8, 2.1, 0.2, "#7daba7"),
        box(`frame-${i}`, x, 4.1, 4.22, 0.12, 2.1, 0.12, "#f0e4c8"),
      ]),
    ];
    if (b.style === 0)
      parts.push(box("chimney", 3.1, 8.4, -1.5, 1.4, 4, 1.4, "#a78b74"));
    if (b.style === 2)
      parts.push(
        box("annex", 6, 2, -1, 2.2, 3.5, 6, "#94b3a6"),
        box("antenna", 0, 11.3, 0, 0.15, 2, 0.15, "#b7b6a2"),
      );
    add(`house-${b.id}`, b.name, b.x, b.z, parts);
  }
  for (const [kind, beds] of [
    ["garden", flowerBeds],
    ["nursery", nurseryBeds],
  ] as const)
    beds.forEach((b, i) => {
      add(`${kind}-bed-${i}`, kind === "garden" ? "花圃" : "苗床", b.x, b.z, [
        box("soil", 0, 0.1, 0, b.w, 0.2, b.d, "#9b856b"),
        ...[-1, 1].flatMap((s, j) => [
          box(
            `edge-x-${j}`,
            s * (b.w / 2 + 0.1),
            0.25,
            0,
            0.24,
            0.5,
            b.d + 0.5,
            "#c0ad88",
          ),
          box(
            `edge-z-${j}`,
            0,
            0.25,
            s * (b.d / 2 + 0.1),
            b.w + 0.5,
            0.5,
            0.24,
            "#c0ad88",
          ),
        ]),
      ]);
    });
  for (const [i, f] of [
    { x: -53, z: 50, length: 22, yaw: Math.PI / 2 },
    { x: -3, z: 51, length: 20, yaw: Math.PI / 2 },
    { x: -42, z: 63, length: 19, yaw: 0 },
    { x: -14, z: 63, length: 19, yaw: 0 },
  ].entries()) {
    add(
      `garden-fence-${i}`,
      "花园围栏",
      f.x,
      f.z,
      [
        ...Array.from({ length: Math.ceil(f.length / 2) + 1 }, (_, j) =>
          box(
            `post-${j}`,
            j * 2 - f.length / 2,
            1,
            0,
            0.22,
            2,
            0.25,
            "#e0dcc2",
          ),
        ),
        ...[0.7, 1.5].map((y, j) =>
          box(`rail-${j}`, 0, y, 0, f.length, 0.16, 0.18, "#e8e2c7"),
        ),
      ],
      "wood",
      f.yaw,
    );
  }
  add("garden-arbor", "花园入口花架", -28, 38, [
    ...[-2.8, 2.8].map((x, i) =>
      box(`post-${i}`, x, 2.6, 0, 0.38, 5.2, 0.38, "#ded7b7"),
    ),
    box("beam", 0, 5.3, 0, 7, 0.35, 2, "#b9b58e"),
    ...[-2.5, -1.25, 0, 1.25, 2.5].map((x, i) =>
      box(`top-${i}`, x, 5.5, 0, 0.25, 0.18, 3, "#d6d0ad"),
    ),
  ]);
  for (const [i, x] of [-48, -8].entries())
    add(
      `building-plot-${i}`,
      "预留建筑地",
      x,
      7,
      [-1, 1].flatMap((s, j) => [
        box(`x-${j}`, s * 5.5, 0.12, 0, 0.3, 0.24, 9, "#a9ac92"),
        box(`z-${j}`, 0, 0.12, s * 4.5, 11, 0.24, 0.3, "#a9ac92"),
      ]),
    );
  add(
    "plaza-fountain",
    "小广场水池",
    -28,
    27,
    [
      cylinder("rim", 0, 0.35, 0, 2.2, 0.7, "#b1b8a1"),
      cylinder("surface", 0, 0.71, 0, 1.8, 0.05, "#7caaa0"),
    ],
    "stone",
  );
  add("nursery-workbench", "种植工作台", 74, 45, [
    box("cabinet", 0, 1.1, 0, 3, 2.2, 1.6, "#99a58a"),
    box("top", 0, 2.3, 0, 3.4, 0.25, 2, "#d1c6a4"),
  ]);
  add(
    "picnic",
    "草地野餐",
    18,
    72,
    [
      box("mat", 0, 0.04, 0, 7, 0.08, 5, "#d6b28b"),
      ...[-2, 0, 2].map((x, i) =>
        box(`stripe-${i}`, x, 0.105, 0, 0.8, 0.05, 5, "#e4d5b3"),
      ),
      box("basket", 2, 0.6, 1, 1.3, 1.2, 1, "#a68c60"),
    ],
    "wood",
    -0.22,
  );
  const peak = landmarks.find((l) => l.id === "mountain")!;
  add("mountain-platform", "听风山观景台", peak.x, peak.z, [
    cylinder("deck", 0, 0.12, 0, 5, 0.24, "#ad9270"),
    ...Array.from({ length: 7 }, (_, i) =>
      box(
        `post-${i}`,
        Math.cos((i / 8) * Math.PI * 2) * 4.5,
        1.2,
        Math.sin((i / 8) * Math.PI * 2) * 4.5,
        0.25,
        2.6,
        0.25,
        "#927e62",
      ),
    ),
    box("scope-support", 0, 1.5, 0, 0.3, 3, 0.3, "#727f70"),
    cylinder("scope", 0, 3, 0, 0.55, 2.5, "#6e827b"),
  ]);
  const cave = landmarks.find((l) => l.id === "cave")!;
  add(
    "cave-arch",
    "星光秘境入口",
    cave.x,
    cave.z,
    [
      box("left", -3.5, 3, 0, 1.8, 6, 2.4, "#92998c"),
      box("right", 3.5, 3, 0, 1.8, 6, 2.4, "#92998c"),
      box("top", 0, 6, 0, 8.8, 1.5, 2.4, "#92998c"),
    ],
    "stone",
  );
  add(
    "dinosaur-gate",
    "恐龙公园入口",
    86,
    56,
    [
      ...[-3.5, 3.5].map((x, i) =>
        box(`post-${i}`, x, 3, 0, 0.8, 6, 0.8, "#8a795b"),
      ),
      box("sign", 0, 5.6, 0, 8.5, 1.5, 0.7, "#55775c"),
      ...[-1.4, 0, 1.4].map((x, i) =>
        cylinder(`crest-${i}`, x, 7, 0, 0.55, 1.2, "#e6d4a9"),
      ),
    ],
    "wood",
    -0.3,
  );
  // Continuous deck avoids a visually hidden crack collider between every plank.
  add(
    "beach-pier",
    "海边木码头",
    8,
    115,
    [
      box("deck", 0, 0, 5.8, 5, 0.35, 13.2, "#a78d67"),
      ...[0, 10].flatMap((z, j) =>
        [-2, 2].map((x, i) =>
          box(`leg-${j}-${i}`, x, -1, z, 0.4, 3, 0.4, "#82755b"),
        ),
      ),
    ],
    "wood",
    -0.28,
    1.3,
  );
  for (const [i, t] of islandTrees().entries())
    add(`tree-${i}`, "林间树木", t.x, t.z, [
      cylinder("trunk", 0, t.height / 2, 0, t.radius, t.height, "#78604b"),
    ]);
  // Shallow pond has a solid bed; water itself is decorative, not a fluid solver.
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2,
      x = pond.x + Math.cos(a) * (pond.rx + 1),
      z = pond.z + Math.sin(a) * (pond.rz + 1);
    add(
      `pond-rock-${i}`,
      "池边石岸",
      rounded(x),
      rounded(z),
      [
        hull(
          "rock",
          [-1, 1].flatMap((x) =>
            [-1, 1].flatMap((z) => [
              { x: x * 0.9, y: 0, z: z * 0.7 },
              { x: x * 0.55, y: 0.7, z: z * 0.45 },
            ]),
          ),
          "#a3a598",
        ),
      ],
      "stone",
    );
  }
  return physicsSceneSchema.parse({
    schemaVersion: 4,
    physicsVersion: PHYSICS_RULES_VERSION,
    id: "physics-island",
    name: "主岛",
    template: { id: "core:island", version: 1 },
    definitions,
    objects,
    terrain,
    links: [],
    spawn: { x: -28, y: surface(-28, 34) + 0.87, z: 34 },
    bounds: {
      min: { x: -160, y: -12, z: -140 },
      max: { x: 160, y: 80, z: 140 },
    },
  });
}
