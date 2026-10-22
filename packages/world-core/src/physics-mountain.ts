import { terrainHeightAt, type PhysicsTerrainTile } from "@island/contracts";
import { pathDistance } from "./geom.js";
import { PhysicsSceneBuilder } from "./physics-scene-builder.js";
import { box, cylinder, hull } from "./physics-primitives.js";
import { physicsPlants } from "./physics-plants.js";

/** A graded route, independent of the discontinued terrace-height character controller. */
export const mountainHikingTrail = [
  { x: 0, z: 32 },
  { x: 14, z: 24 },
  { x: 22, z: 6 },
  { x: 10, z: -10 },
  { x: -4, z: -12 },
  { x: -8, z: -2 },
  { x: 0, z: -4 },
];
export const mountainDeck = { x: 0, z: 1, ground: 16, top: 16.24 };
const p = (x: number, z: number, y = 0) => ({ x, y, z });
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => {
  const t = clamp(n);
  return t * t * (3 - 2 * t);
};
const distances = [0];
for (let i = 1; i < mountainHikingTrail.length; i++) {
  const a = mountainHikingTrail[i - 1]!,
    b = mountainHikingTrail[i]!;
  distances.push(distances[i - 1]! + Math.hypot(b.x - a.x, b.z - a.z));
}

/** The renderer and Rapier both consume the sampled triangles, including switchbacks. */
export function mountainTerrainHeight(x: number, z: number) {
  const radius = Math.hypot(x / 40, z / 34);
  const original =
    radius >= 1 ? 0 : Math.min(16, Math.floor((1 - radius) / 0.2) * 4);
  let nearest = Infinity,
    weights = 0,
    height = 0;
  for (let i = 1; i < mountainHikingTrail.length; i++) {
    const a = mountainHikingTrail[i - 1]!,
      b = mountainHikingTrail[i]!;
    const dx = b.x - a.x,
      dz = b.z - a.z;
    const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz));
    const d = Math.hypot(x - a.x - t * dx, z - a.z - t * dz);
    nearest = Math.min(nearest, d);
    const weight = Math.exp((-d * d) / 12);
    const along = distances[i - 1]! * (1 - t) + distances[i]! * t;
    height += 16 * clamp(along / (distances.at(-1)! - 8)) * weight;
    weights += weight;
  }
  const grade = nearest >= 8 ? original : height / weights;
  const corridor = grade + (original - grade) * smooth((nearest - 3) / 5);
  // A level summit joins the last approach; the deck itself is a visible 24 cm step.
  const summit = smooth((9 - Math.hypot(x, z - 1)) / 3);
  const result = (corridor + (16 - corridor) * summit) * smooth((32 - z) / 3);
  return Math.round(result * 1000) / 1000;
}
export function mountainGroundColor(x: number, z: number) {
  if (pathDistance({ x, z }, mountainHikingTrail, false) < 1.8)
    return "#d1c5a8";
  const height = mountainTerrainHeight(x, z);
  return height > 13 ? "#adae9f" : height > 7 ? "#a4ad8c" : "#a9bc8b";
}
export function mountainTerrain(): PhysicsTerrainTile[] {
  return Array.from({ length: 4 }, (_, i) => {
    const x = -44 + (i % 2) * 44,
      z = -38 + Math.floor(i / 2) * 38;
    return {
      id: `mountain-${i}`,
      origin: p(x, z),
      columns: 44,
      rows: 38,
      step: 1,
      heights: Array.from({ length: 45 * 39 }, (_, j) =>
        mountainTerrainHeight(x + (j % 45), z + Math.floor(j / 45)),
      ),
      material: "stone",
      color: "#a9bc8b",
    };
  });
}
export function mountainPlantingError(x: number, z: number, tree: boolean) {
  if (
    pathDistance({ x, z }, mountainHikingTrail, false) < 3 ||
    Math.hypot(x / 6, (z - 1) / 6) < 1 ||
    (Math.abs(x) < 4 && z > 28)
  )
    return "请为登山小径、观景台和山门留出空间";
  if (tree && mountainTerrainHeight(x, z) > 7)
    return "高处保留观景视野，请把树种在山下";
  return null;
}
export function createMountainPhysicsScene() {
  const b = new PhysicsSceneBuilder("mountain", "50000000"),
    terrain = mountainTerrain();
  const surface = (x: number, z: number) => {
    for (const tile of terrain) {
      const y = terrainHeightAt(tile, x, z);
      if (y !== undefined) return y;
    }
    throw new Error("听风山地形之外没有落脚面");
  };
  const at = (x: number, z: number) => p(x, z, surface(x, z));
  b.fixed("gate", "听风山入口", at(0, 32), [
    ...[-2.6, 2.6].map((x, i) =>
      cylinder(`post-${i}`, x, 1.9, 0, 0.22, 3.8, "#8b765c"),
    ),
    box("beam", 0, 3.9, 0, 6.4, 0.38, 0.55, "#a49273"),
  ]);
  b.fixed("summit-deck", "山顶观景台", p(0, 1, 16), [
    box("deck", 0, 0.12, 0, 8, 0.24, 6, "#b6a282"),
    ...[-3.8, 3.8].flatMap((x, i) => [
      box(`side-${i}`, x, 1, 0, 0.16, 0.18, 5.8, "#89795f"),
      ...[-2.8, 2.8].map((z, j) =>
        cylinder(`post-${i}-${j}`, x, 0.7, z, 0.14, 1.4, "#89795f"),
      ),
    ]),
    box("back-rail", 0, 1, 2.8, 7.6, 0.18, 0.16, "#89795f"),
    ...[-2.8, 2.8].map((x, i) =>
      box(`entry-rail-${i}`, x, 1, -2.8, 2, 0.18, 0.16, "#89795f"),
    ),
  ]);
  b.fixed(
    "summit-cairn",
    "山顶石堆",
    p(2, 1, mountainDeck.top),
    [
      cylinder("bottom", 0, 0.3, 0, 0.65, 0.6, "#9fa99c"),
      cylinder("middle", 0, 0.8, 0, 0.43, 0.4, "#b7b7a3"),
      cylinder("top", 0, 1.15, 0, 0.23, 0.3, "#d0c6a7"),
    ],
    { material: "stone" },
  );
  b.fixed("wind-pole", "听风杆", p(-2, 1.7, mountainDeck.top), [
    cylinder("pole", 0, 1.3, 0, 0.07, 2.6, "#9c875c"),
    box("flag", 0.36, 2.35, 0, 0.7, 0.35, 0.06, "#c9ad79"),
  ]);
  for (const [i, [x, z]] of [
    [-16, 26],
    [30, 15],
    [-25, -18],
    [17, -23],
    [-31, 6],
  ].entries()) {
    b.fixed(
      `rock-${i}`,
      "山坡岩石",
      at(x!, z!),
      [
        hull(
          "rock",
          [
            p(-1.8, -1.2),
            p(1.7, -1.1),
            p(1.5, 1.4),
            p(-1.4, 1.3),
            p(-1, -0.7, 2),
            p(0.8, -0.6, 2.4),
            p(0.8, 0.8, 1.9),
            p(-0.8, 0.7, 2.1),
          ],
          "#a6aa9d",
        ),
      ],
      { material: "stone" },
    );
  }
  // The resting seat has clear level ground and uses the common seat/stand contract.
  b.fixed(
    "foot-seat",
    "山脚长椅",
    at(-8, 33),
    [
      box("seat", 0, 0.6, 0, 2.4, 0.2, 1, "#ad936f"),
      ...[-0.9, 0.9].map((x, i) =>
        box(`leg-${i}`, x, 0.25, 0, 0.22, 0.5, 0.75, "#7b6853"),
      ),
      box("back", 0, 1.1, -0.45, 2.4, 0.65, 0.14, "#ad936f"),
    ],
    { abilities: ["seat"], seat: { partId: "seat", yaw: 0 } },
  );
  const tree = physicsPlants().find((d) => d.id === "core:plant-oak-3")!;
  for (const [x, z] of [
    [-32, 26],
    [-26, 31],
    [-18, 32],
    [26, 30],
    [34, 22],
    [-35, -23],
    [33, -25],
  ])
    b.object(tree, at(x!, z!));
  return b.build(
    "听风山",
    p(0, 35, 0.87),
    { min: p(-44, -38, -6), max: p(44, 38, 40) },
    terrain,
  );
}
