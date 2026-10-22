import { creationPlacementError } from "./creations.js";
export * from "./creations.js";
import { furniturePlacementError } from "./shop.js";
export * from "./shop.js";
export {
  createGarden,
  gardenPlacementError,
  gardenBeds,
  gardenHeight,
  gardenPond,
  gardenGreenhouse,
} from "./garden.js";
export { pathDistance } from "./geom.js";
export * from "./dinosaur.js";
export { segmentDistance } from "./geom.js";
import { segmentDistance } from "./geom.js";
import { subScenes } from "./scenes.js";
export {
  subScenes,
  homeFeatures,
  meadowFeatures,
  forestTrail,
  libraryFeatures,
  pondShape,
  pondFeatures,
  labFeatures,
  nurseryFeatures,
  mountainHeight,
  mountainTrail,
  mountainFeatures,
  starlightFeatures,
  beachShore,
  beachLagoon,
  beachFeatures,
} from "./scenes.js";
export type { SubSceneDef } from "./scenes.js";
export { walkSpecs } from "./walk.js";
export { tableTops } from "./furniture.js";
export type { WalkSpec, Gate } from "./walk.js";
export { residents } from "./residents.js";
export type { Species, Interest, Resident } from "./residents.js";
export {
  ECOLOGY_TICK_MS,
  ECOLOGY_SLOT_MS,
  MAX_BORN,
  MAX_REPLAY_TICKS,
  baseEcology,
  ecologyState,
  ecologyPlan,
  stepEcology,
} from "./ecology.js";
export type {
  EcologyMember,
  EcologyEvent,
  EcologyState,
  EcologySeason,
  EcologyEncounter,
} from "./ecology.js";
export {
  starterTasks,
  emptyGrowth,
  applyGrowthEvent,
  taskProgress,
  unlocks,
  buyUnlock,
  collectItem,
} from "./growth.js";
export type {
  GrowthEvent,
  TaskDef,
  GrowthState,
  UnlockDef,
} from "./growth.js";
export {
  forageCatalog,
  forageSceneIds,
  forageSpots,
} from "./collectibles.js";
export type { ForageKind, ForageSpot } from "./collectibles.js";
export { pushOut, supportY, mantleBoost, landingY } from "./physics.js";
export type { Obstacle } from "./physics.js";
import { random } from "./random.js";
export { random } from "./random.js";
export { generateTree } from "./trees.js";
import type { WorldSnapshot, IslandEntity } from "@island/contracts";
export type Point = { x: number; z: number };
export const island = { radiusX: 150, radiusZ: 125 };
export const pond = { x: 52, z: -28, rx: 20, rz: 15, level: 4.5 };
export const buildings = [
  { id: "home", name: "心灵小屋", x: -28, z: 7, style: 0 },
  { id: "guest", name: "来客小屋", x: -48, z: 24, style: 0 },
  { id: "atelier", name: "手作小屋", x: -9, z: 25, style: 1 },
  { id: "library", name: "林间书屋", x: -80, z: 3, style: 1 },
  { id: "lab", name: "自然实验室", x: 72, z: 6, style: 2 },
] as const;
export const landmarks = [
  {
    id: "dinosaur", name: "恐龙公园", x: 86, z: 56,
    description: "沿环园步道寻找翼龙、迅猛龙、蛋巢与现代孔雀。",
  },
  {
    id: "home",
    name: "家园聚落",
    x: -28,
    z: 22,
    description: "三间小屋围着庭院，让相聚与独处都有位置。",
  },
  {
    id: "garden",
    name: "私家花园",
    x: -28,
    z: 49,
    description: "在花圃之间散步，种下你喜欢的颜色。",
  },
  {
    id: "meadow",
    name: "风眠草地",
    x: 20,
    z: 69,
    description: "留一片空地，给野餐、奔跑和什么都不做的午后。",
  },
  {
    id: "forest",
    name: "狐狸森林",
    x: -76,
    z: -30,
    description: "沿林间小径，遇见树影和巡游的小狐狸。",
  },
  {
    id: "library",
    name: "林间书屋",
    x: -80,
    z: 3,
    description: "森林边缘的一间书屋，留给安静的故事。",
  },
  {
    id: "pond",
    name: "静水池塘",
    x: 52,
    z: -28,
    description: "轻触水面，看涟漪走向芦苇与石岸。",
  },
  {
    id: "lab",
    name: "自然实验室",
    x: 72,
    z: 6,
    description: "把好奇带进实验室，把发现种进试验田。",
  },
  {
    id: "nursery",
    name: "实验种植园",
    x: 74,
    z: 31,
    description: "整齐的小苗床，留给不同植物的生长试验。",
  },
  {
    id: "mountain",
    name: "听风山",
    x: 8,
    z: -76,
    description: "沿曲折山路登上观景台，回望自己的家园。",
  },
  {
    id: "cave",
    name: "星光秘境入口",
    x: 34,
    z: -62,
    description: "穿过山洞，走进永远星夜的林间空地。",
  },
  {
    id: "beach",
    name: "月牙沙滩",
    x: 0,
    z: 104,
    description: "从码头踏上小岛，沿沙滩慢慢走回家。",
  },
] as const;
export const zones = [
  { id: "garden", x: -28, z: 49, rx: 23, rz: 16 },
  { id: "nursery", x: 74, z: 31, rx: 19, rz: 14 },
  { id: "village", x: -29, z: 21, rx: 34, rz: 24 },
  { id: "meadow", x: 20, z: 69, rx: 36, rz: 24 },
  { id: "pond", x: 52, z: -28, rx: 24, rz: 19 },
  { id: "mountain", x: 4, z: -73, rx: 65, rz: 39 },
  { id: "forest", x: -76, z: -30, rx: 40, rz: 40 },
] as const;
export type ZoneId = (typeof zones)[number]["id"] | "shore" | "wild";
export function zoneAt(p: Point): ZoneId {
  if (radial(p.x, p.z) > 0.86) return "shore";
  for (const zone of zones)
    if (Math.hypot((p.x - zone.x) / zone.rx, (p.z - zone.z) / zone.rz) < 1)
      return zone.id;
  return "wild";
}
export const route: Point[] = [
  { x: -28, z: 34 },
  { x: -55, z: 36 },
  { x: -67, z: 12 },
  { x: -62, z: -13 },
  { x: -43, z: -34 },
  { x: -18, z: -42 },
  { x: 18, z: -41 },
  { x: 28, z: -15 },
  { x: 52, z: 0 },
  { x: 72, z: 18 },
  { x: 60, z: 46 },
  { x: 41, z: 56 },
  { x: 10, z: 48 },
  { x: -10, z: 36 },
];
export const trails: Point[][] = [
  [
    { x: -62, z: -13 },
    { x: -86, z: -30 },
  ],
  [
    { x: 20, z: 94 },
    { x: 20, z: 87 },
  ],
  [
    { x: -28, z: 34 },
    { x: -28, z: 13 },
  ],
  [
    { x: -55, z: 36 },
    { x: -48, z: 30 },
  ],
  [
    { x: -10, z: 36 },
    { x: -9, z: 31 },
  ],
  [
    { x: -67, z: 12 },
    { x: -80, z: 12 },
    { x: -80, z: 9 },
  ],
  [
    { x: -28, z: 34 },
    { x: -28, z: 65 },
    { x: -4, z: 82 },
    { x: 0, z: 108 },
  ],
  [
    { x: 41, z: 56 },
    { x: 47, z: 80 },
    { x: 20, z: 94 },
    { x: 0, z: 108 },
  ],
  [
    { x: 72, z: 18 },
    { x: 74, z: 42 },
  ],
  [
    { x: 28, z: -15 },
    { x: 31, z: -27 },
  ],
  [
    { x: -18, z: -42 },
    { x: -30, z: -56 },
    { x: -12, z: -64 },
    { x: 12, z: -56 },
    { x: 24, z: -70 },
    { x: 8, z: -76 },
  ],
  [
    { x: 24, z: -70 },
    { x: 34, z: -62 },
  ],
];
export const roadSegments: [Point, Point][] = [
  ...route.map((p, i) => [p, route[(i + 1) % route.length]!] as [Point, Point]),
  ...trails.flatMap((path) =>
    path.slice(1).map((p, i) => [path[i]!, p] as [Point, Point]),
  ),
];
export function radial(x: number, z: number) {
  return Math.hypot(x / island.radiusX, z / island.radiusZ);
}
export function shoreline(angle: number) {
  return 1 + 0.035 * Math.sin(angle * 5) + 0.018 * Math.cos(angle * 3);
}
const smooth = (t: number) => {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
};
export function groundHeight(x: number, z: number) {
  const r = radial(x, z),
    shore = shoreline(Math.atan2(z / island.radiusZ, x / island.radiusX));
  const coast = smooth((shore - r) / 0.17);
  if (r > shore) return -2;
  let h = 5.4 + 0.65 * Math.sin(x * 0.038) * Math.cos(z * 0.04);
  // Broad foothills plus offset peaks create a ridge with a walkable southern face.
  h += 37 * Math.exp(-((x - 5) ** 2 / 1400 + (z + 78) ** 2 / 480));
  h += 17 * Math.exp(-((x + 37) ** 2 / 480 + (z + 72) ** 2 / 520));
  h += 12 * Math.exp(-((x - 43) ** 2 / 440 + (z + 81) ** 2 / 340));
  const water = Math.hypot((x - pond.x) / pond.rx, (z - pond.z) / pond.rz);
  if (water < 1.22) h = 3.7 + smooth((water - 0.83) / 0.39) * 2.3;
  // Blend the settled terrace into the landscape rather than cutting vertical edges.
  const settled = Math.hypot((x + 29) / 39, (z - 22) / 31);
  h =
    h * smooth((settled - 0.85) / 0.25) +
    5.8 * (1 - smooth((settled - 0.85) / 0.25));
  for (const b of buildings) {
    const blend = smooth((Math.hypot(x - b.x, z - b.z) - 8) / 4);
    h = h * blend + 5.8 * (1 - blend);
  }
  return h * coast;
}
export function placementError(
  p: Point,
  entities: IslandEntity[] = [],
  ignoreId?: string,
  kind: IslandEntity["kind"] = "tree",
): string | null {
  if (radial(p.x, p.z) > 0.84) return "请给海岸留一些空间，选择岛内的空地。";
  if (Math.hypot((p.x - pond.x) / 24, (p.z - pond.z) / 19) < 1)
    return "池塘和石岸需要留出通道。";
  if (buildings.some((b) => Math.hypot(p.x - b.x, p.z - b.z) < 10))
    return "这里靠近建筑，请为入口留出空间。";
  if (Math.hypot(p.x + 28, p.z - 27) < 7)
    return "这是聚落的小广场，请保留相聚的空间。";
  if (roadSegments.some(([a, b]) => segmentDistance(p, a, b) < 2.7))
    return "这里是小路，换一块空地试试。";
  const zone = zoneAt(p);
  if (zone === "mountain") return "山地保留给观景和探索，请在山下布置植物。";
  if (zone === "village") return "聚落保留建筑用地，可以到旁边的花园种植。";
  if (zone === "meadow") {
    if (Math.hypot((p.x - 20) / 26, (p.z - 69) / 17) < 1)
      return "把草地中央留给奔跑与野餐，可以在边缘种花。";
    if (kind === "tree") return "草地保持开阔，小树更适合森林边缘。";
  }
  if ((zone === "garden" || zone === "nursery") && kind === "tree")
    return "这里是花圃和苗床，请选择花朵，给阳光留出空间。";
  if (
    entities.some(
      (e) =>
        e.id !== ignoreId &&
        Math.hypot(p.x - e.x, p.z - e.z) <
          (kind === "flower" && e.kind === "flower" ? 1.65 : 3.5),
    )
  )
    return "离旁边的植物太近啦。";
  return null;
}
export const flowerBeds = [
  { x: -42, z: 45, w: 8, d: 5 },
  { x: -14, z: 45, w: 8, d: 5 },
  { x: -42, z: 55, w: 8, d: 5 },
  { x: -14, z: 55, w: 8, d: 5 },
];
export const nurseryBeds = [
  { x: 65, z: 27, w: 7, d: 4 },
  { x: 83, z: 27, w: 7, d: 4 },
  { x: 65, z: 36, w: 7, d: 4 },
  { x: 83, z: 36, w: 7, d: 4 },
];
export function createWorld(
  seed = 20261017,
  name = "我的心灵家园",
): WorldSnapshot {
  const rng = random(seed),
    entities: IslandEntity[] = [];
  const add = (
    id: string,
    kind: IslandEntity["kind"],
    x: number,
    z: number,
    growth = 0.7 + rng() * 0.3,
  ) => {
    if (placementError({ x, z }, entities, undefined, kind)) return;
    entities.push({
      id,
      kind,
      x,
      z,
      seed: Math.floor(rng() * 4294967295),
      growth,
    });
  };
  for (let i = 0; i < 240; i++) {
    const a = rng() * Math.PI * 2,
      r = Math.sqrt(rng());
    const x = -76 + Math.cos(a) * 36 * r,
      z = -30 + Math.sin(a) * 34 * r;
    add(`forest-${i}`, "tree", x, z);
  }
  for (let i = 0; i < 70; i++) {
    const x = (rng() - 0.5) * 230,
      z = (rng() - 0.5) * 180;
    if (zoneAt({ x, z }) === "wild")
      add(`edge-${i}`, "tree", x, z, 0.65 + rng() * 0.25);
  }
  for (const [bedIndex, bed] of [...flowerBeds, ...nurseryBeds].entries())
    for (let x = -2; x <= 2; x += 2)
      for (let z = -1; z <= 1; z += 2)
        add(`bed-${bedIndex}-${x}-${z}`, "flower", bed.x + x, bed.z + z, 1);
  for (let i = 0; i < 35; i++) {
    const a = rng() * Math.PI * 2,
      x = 20 + Math.cos(a) * (29 + rng() * 4),
      z = 69 + Math.sin(a) * (20 + rng() * 2);
    add(`wildflower-${i}`, "flower", x, z, 1);
  }
  for (const [i, p] of [
    { x: 0, z: 87 },
    { x: -45, z: 64 },
    { x: 43, z: -7 },
  ].entries())
    add(`bench-${i}`, "bench", p.x, p.z, 1);
  return {
    schemaVersion: 3,
    scene: "island",
    generatorVersion: "3.0.0",
    name,
    seed,
    environment: { hour: 15, season: "summer" },
    entities,
    contentLock: { core: "1.0.0" },
  };
}
export function validatePlacement(snapshot: WorldSnapshot) {
  for (const f of snapshot.creations ?? []) { const error = creationPlacementError(snapshot, f); if (error) return error; }
  for (const f of snapshot.furniture ?? []) {
    const error = furniturePlacementError(snapshot, f);
    if (error) return error;
  }
  const rule =
    snapshot.scene === "island"
      ? placementError
      : subScenes[snapshot.scene].placementError;
  for (const e of snapshot.entities) {
    const error = rule(e, snapshot.entities, e.id, e.kind);
    if (error) return error;
  }
  return null;
}
export function growWorld(snapshot: WorldSnapshot): WorldSnapshot {
  return {
    ...snapshot,
    entities: snapshot.entities.map((e) => ({
      ...e,
      growth: Math.min(1, e.growth + 0.12),
    })),
  };
}
/** Total length of the island fox loop; lets every client derive the fox's
 *  position from the wall clock alone, so host and visitors agree without
 *  any network sync. */
export function routeLoopLength(): number {
  return route.reduce(
    (sum, p, i) =>
      sum +
      Math.hypot(
        p.x - route[(i + 1) % route.length]!.x,
        p.z - route[(i + 1) % route.length]!.z,
      ),
    0,
  );
}
export function walkRoute(distance: number): Point {
  const lengths = route.map((p, i) =>
    Math.hypot(
      p.x - route[(i + 1) % route.length]!.x,
      p.z - route[(i + 1) % route.length]!.z,
    ),
  );
  const total = routeLoopLength();
  let d = ((distance % total) + total) % total;
  for (let i = 0; i < route.length; i++) {
    const length = lengths[i]!;
    if (d <= length) {
      const a = route[i]!,
        b = route[(i + 1) % route.length]!;
      return {
        x: a.x + ((b.x - a.x) * d) / length,
        z: a.z + ((b.z - a.z) * d) / length,
      };
    }
    d -= length;
  }
  return route[0]!;
}
export {
  TERRAIN_ENTITY_OPS,
  terrainScale,
  operationTargets,
  operationDependencies,
  canRebase,
  diffWorld,
  applyWorldOps,
} from "./patch.js";
export { FORAGE_STACK, builtinItems } from "./items.js";

export * from "./building.js";
export * from "./wilderness.js";
