import type { IslandEntity, WorldSnapshot } from "@island/contracts";
import { pathDistance } from "./geom.js";
import { random } from "./random.js";

/** The finite park core. Keep generation and habitat masks independent of rendering. */
export const dinosaurPark = {
  width: 180,
  depth: 150,
  gate: { x: 0, z: 65 },
  pond: { x: 43, z: 22, rx: 14, rz: 10 },
  cliffs: [
    { x: -51, z: -48, r: 10, h: 15 },
    { x: -32, z: -57, r: 8, h: 20 },
    { x: -64, z: -30, r: 7, h: 10 },
  ],
  nests: [
    { x: 43, z: -32 },
    { x: 55, z: -40 },
    { x: 58, z: -23 },
  ],
} as const;

export const dinosaurTrail = [
  { x: 0, z: 55 },
  { x: -36, z: 39 },
  { x: -49, z: 8 },
  { x: -38, z: -26 },
  { x: 0, z: -45 },
  { x: 32, z: -30 },
  { x: 61, z: -4 },
  { x: 64, z: 29 },
  { x: 30, z: 47 },
];

export const dinosaurHabitats = [
  {
    id: "pterosaur",
    title: "翼龙岩崖",
    x: -40,
    z: -40,
    r: 25,
    color: "#c48357",
  },
  { id: "raptor", title: "迅猛龙林地", x: -27, z: 5, r: 19, color: "#7d9861" },
  { id: "nest", title: "蛋巢观察区", x: 49, z: -31, r: 20, color: "#ccaa69" },
  { id: "peacock", title: "孔雀湿地", x: 37, z: 27, r: 24, color: "#4d9b9e" },
] as const;
export type DinosaurHabitatId = (typeof dinosaurHabitats)[number]["id"];

export function dinosaurWater(x: number, z: number, pad = 0) {
  const p = dinosaurPark.pond;
  return Math.hypot((x - p.x) / (p.rx + pad), (z - p.z) / (p.rz + pad)) < 1;
}
export function dinosaurWalkable(x: number, z: number) {
  return (
    Math.abs(x) < 87 &&
    Math.abs(z) < 72 &&
    !dinosaurWater(x, z, 1.5) &&
    !dinosaurPark.cliffs.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + 1) &&
    !dinosaurPark.nests.some((n) => Math.hypot(x - n.x, z - n.z) < 3.8)
  );
}
export function dinosaurPathDistance(x: number, z: number) {
  return Math.min(
    pathDistance({ x, z }, dinosaurTrail),
    pathDistance({ x, z }, [dinosaurPark.gate, dinosaurTrail[0]!], false),
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
