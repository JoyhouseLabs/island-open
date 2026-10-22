import type { IslandEntity, WorldSnapshot } from "@island/contracts";
import { random } from "./random.js";

import {
  dinosaurPark,
  dinosaurHabitats,
  dinosaurWater,
  dinosaurPathDistance,
} from "./dinosaur-geography.js";
export * from "./dinosaur-geography.js";

export function dinosaurWalkable(x: number, z: number) {
  return (
    Math.abs(x) < 87 &&
    Math.abs(z) < 72 &&
    !dinosaurWater(x, z, 1.5) &&
    !dinosaurPark.cliffs.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + 1) &&
    !dinosaurPark.nests.some((n) => Math.hypot(x - n.x, z - n.z) < 3.8)
  );
}
export function dinosaurPlacementError(
  p: { x: number; z: number },
  entities: IslandEntity[] = [],
  ignoreId?: string,
  kind: IslandEntity["kind"] = "tree",
): string | null {
  if (!dinosaurWalkable(p.x, p.z))
    return "请避开水面、岩崖和蛋巢，在园内空地布置。";
  if (dinosaurPathDistance(p.x, p.z) < 4.5)
    return "环园步道和入口需要保持通畅。";
  if (dinosaurHabitats.some((h) => Math.hypot(p.x - h.x, p.z - h.z) < h.r))
    return "这里留给动物和蛋巢，请在观察区外布置。";
  if (
    entities.some(
      (e) =>
        e.id !== ignoreId &&
        Math.hypot(p.x - e.x, p.z - e.z) <
          (kind === "flower" && e.kind === "flower" ? 1.65 : 4),
    )
  )
    return "离旁边的植物或长椅太近啦。";
  return null;
}
export function createDinosaurPark(seed: number): WorldSnapshot {
  const rng = random((seed ^ 0xd1705a12) >>> 0),
    entities: IslandEntity[] = [];
  for (let i = 0; i < 230; i++) {
    const x = (rng() - 0.5) * 168,
      z = (rng() - 0.5) * 138;
    const kind = i < 110 ? "tree" : i < 220 ? "flower" : "bench";
    if (dinosaurPlacementError({ x, z }, entities, undefined, kind)) continue;
    entities.push({
      id: `dinosaur-${i}`,
      kind,
      x,
      z,
      seed: Math.floor(rng() * 4294967295),
      growth: kind === "tree" ? 0.65 + rng() * 0.3 : 1,
    });
  }
  return {
    schemaVersion: 3,
    generatorVersion: "3.0.0",
    scene: "dinosaur",
    seed,
    name: "恐龙公园",
    environment: { hour: 15, season: "summer" },
    entities,
    contentLock: { core: "1.0.0" },
  };
}
