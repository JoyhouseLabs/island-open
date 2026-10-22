/** Static island geography, independent of world snapshots and collision controllers. */
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
    id: "dinosaur",
    name: "恐龙公园",
    x: 86,
    z: 56,
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
