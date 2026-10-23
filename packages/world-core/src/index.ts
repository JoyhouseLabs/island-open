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
export type { GrowthEvent, TaskDef, GrowthState, UnlockDef } from "./growth.js";
export {
  forageCatalog,
  forageSceneIds,
  forageSpots,
  placeForageSpots,
} from "./collectibles.js";
export type { ForageKind, ForageSpot } from "./collectibles.js";
export { pushOut, supportY, mantleBoost, landingY } from "./physics.js";
export type { Obstacle } from "./physics.js";
import { random } from "./random.js";
export { random } from "./random.js";
export { generateTree } from "./trees.js";
import type { WorldSnapshot, IslandEntity } from "@island/contracts";
export * from "./island-geography.js";
import {
  pond,
  buildings,
  zoneAt,
  route,
  roadSegments,
  radial,
  flowerBeds,
  nurseryBeds,
  type Point,
} from "./island-geography.js";
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
  for (const f of snapshot.creations ?? []) {
    const error = creationPlacementError(snapshot, f);
    if (error) return error;
  }
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

export * from "./wilderness-geometry.js";

export * from "./physics-island.js";

export * from "./physics-library.js";

export * from "./physics-plants.js";
export * from "./physics-garden.js";

export * from "./physics-themes.js";
export * from "./physics-mountain.js";

export * from "./physics-dinosaur.js";
export * from "./physics-place.js";
