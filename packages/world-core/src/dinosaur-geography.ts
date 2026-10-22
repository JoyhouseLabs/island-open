import { pathDistance } from "./geom.js";

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
export function dinosaurPathDistance(x: number, z: number) {
  return Math.min(
    pathDistance({ x, z }, dinosaurTrail),
    pathDistance({ x, z }, [dinosaurPark.gate, dinosaurTrail[0]!], false),
  );
}
