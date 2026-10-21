import type { IslandEntity, WorldSnapshot } from "@island/contracts";
import { random } from "./random.js";

export const gardenPond = { x: 23, z: -10, rx: 9, rz: 7 };
export const gardenGreenhouse = { x: -22, z: -23, w: 18, d: 12 };
export const gardenBeds = [-18, 18].flatMap((x) =>
  [8, 21].map((z) => ({ x, z, w: 19, d: 8 })),
);
export const gardenHeight = (_x: number, _z: number) => 0;
export function gardenPlacementError(
  p: { x: number; z: number },
  entities: IslandEntity[] = [],
  ignoreId?: string,
  kind: IslandEntity["kind"] = "tree",
): string | null {
  if (Math.abs(p.x) > 39 || Math.abs(p.z) > 34) return "请在花园围栏内布置。";
  if (Math.abs(p.x) < 4 || (Math.abs(p.z + 1) < 3 && Math.abs(p.x) < 33))
    return "请留出花园小径和入口。";
  if (Math.hypot((p.x - gardenPond.x) / 12, (p.z - gardenPond.z) / 10) < 1)
    return "水池与石岸需要留出空间。";
  if (Math.abs(p.x + 22) < 12 && Math.abs(p.z + 23) < 9)
    return "温室和门前需要留出空间。";
  if (Math.hypot(p.x + 17, p.z + 10) < 6) return "这里是花园的茶桌。";
  const bed = gardenBeds.find(
    (b) =>
      Math.abs(p.x - b.x) < b.w / 2 + 1 && Math.abs(p.z - b.z) < b.d / 2 + 1,
  );
  if (bed && kind !== "flower") return "花圃里只种花，树木和长椅可以放在旁边。";
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
export function createGarden(seed: number): WorldSnapshot {
  const rng = random((seed ^ 0x7a4d319b) >>> 0),
    entities: IslandEntity[] = [];
  const add = (kind: IslandEntity["kind"], x: number, z: number) => {
    if (gardenPlacementError({ x, z }, entities, undefined, kind)) return;
    entities.push({
      id: `garden-${entities.length}`,
      kind,
      x,
      z,
      seed: Math.floor(rng() * 4294967295),
      growth: kind === "tree" ? 0.7 + rng() * 0.3 : 1,
    });
  };
  // Leave the near-right bed empty for the owner's first planting.
  for (const b of gardenBeds.slice(0, 3))
    for (let dx = -6; dx <= 6; dx += 3)
      for (let dz = -2; dz <= 2; dz += 4) add("flower", b.x + dx, b.z + dz);
  for (const x of [-36, 36])
    for (const z of [-29, -18, 12, 29]) add("tree", x, z);
  for (let i = 0; i < 22; i++) {
    const x = (rng() - 0.5) * 76,
      z = -30 + rng() * 58;
    if (
      gardenBeds.some(
        (b) =>
          Math.abs(x - b.x) < b.w / 2 + 2 && Math.abs(z - b.z) < b.d / 2 + 2,
      )
    )
      continue;
    add("flower", x, z);
  }
  add("bench", -32, 0);
  add("bench", 30, 29);
  return {
    schemaVersion: 3,
    generatorVersion: "3.0.0",
    scene: "garden",
    seed,
    name: "私家花园",
    environment: { hour: 15, season: "summer" },
    entities,
    contentLock: { core: "1.0.0" },
  };
}
