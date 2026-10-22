import { nurseryFeatures } from "./garden-geography.js";
export { nurseryFeatures } from "./garden-geography.js";
import type {
  IslandEntity,
  SubSceneId,
  WorldSnapshot,
} from "@island/contracts";
import type { Point } from "./index.js";
import { createGarden, gardenPlacementError } from "./garden.js";
import { random } from "./random.js";
import { pathDistance } from "./geom.js";
import { createDinosaurPark, dinosaurPlacementError } from "./dinosaur.js";

/** A walkable sub-scene: its own generator, placement rules and island entrance. */
export interface SubSceneDef {
  id: SubSceneId;
  landmark: string;
  title: string;
  create(seed: number): WorldSnapshot;
  placementError(
    p: Point,
    entities?: IslandEntity[],
    ignoreId?: string,
    kind?: IslandEntity["kind"],
  ): string | null;
}
type Rule = SubSceneDef["placementError"];
type Add = (
  kind: IslandEntity["kind"],
  x: number,
  z: number,
  growth?: number,
) => void;

const nearby = (
  p: Point,
  entities: IslandEntity[],
  ignoreId: string | undefined,
  kind: IslandEntity["kind"],
) =>
  entities.some(
    (e) =>
      e.id !== ignoreId &&
      Math.hypot(p.x - e.x, p.z - e.z) <
        (kind === "flower" && e.kind === "flower" ? 1.65 : 4),
  )
    ? "离旁边的植物或长椅太近啦。"
    : null;

const inside = (
  p: Point,
  x: number,
  z: number,
  w: number,
  d: number,
  pad = 0,
) => Math.abs(p.x - x) < w + pad && Math.abs(p.z - z) < d + pad;

function define(
  id: SubSceneId,
  landmark: string,
  title: string,
  mask: number,
  rule: Rule,
  fill: (rng: () => number, add: Add) => void,
): SubSceneDef {
  return {
    id,
    landmark,
    title,
    placementError: rule,
    create(seed: number): WorldSnapshot {
      const rng = random((seed ^ mask) >>> 0);
      const entities: IslandEntity[] = [];
      fill(rng, (kind, x, z, growth) => {
        if (rule({ x, z }, entities, undefined, kind)) return;
        entities.push({
          id: `${id}-${entities.length}`,
          kind,
          x,
          z,
          seed: Math.floor(rng() * 4294967295),
          growth: growth ?? (kind === "tree" ? 0.7 + rng() * 0.3 : 1),
        });
      });
      return {
        schemaVersion: 3,
        generatorVersion: "3.0.0",
        scene: id,
        seed,
        name: title,
        environment: { hour: 15, season: "summer" },
        entities,
        contentLock: { core: "1.0.0" },
      };
    },
  };
}

/* ---------------------------------- home --------------------------------- */

export const homeFeatures = {
  gate: 27,
  plaza: { x: 0, z: 0, r: 7 },
  well: { x: -9, z: 9 },
  cabins: [
    { id: "main", x: -22, z: -13, w: 12, d: 10 },
    { id: "guest", x: 22, z: -13, w: 10, d: 9 },
    { id: "atelier", x: 0, z: -25, w: 11, d: 9 },
  ],
  laundry: { x1: 10, x2: 18, z: 8 },
} as const;
const home: Rule = (p, entities = [], ignoreId, kind = "tree") => {
  if (Math.abs(p.x) > 36 || Math.abs(p.z) > 30) return "请在小院围栏内布置。";
  if (homeFeatures.cabins.some((c) => inside(p, c.x, c.z, c.w / 2, c.d / 2, 2)))
    return "小屋和门前需要留出空间。";
  if (Math.hypot(p.x, p.z) < 7.5) return "小广场留给相聚和晒太阳。";
  if (Math.abs(p.x) < 3.5 && p.z > 5 && p.z < 29)
    return "这里是回家的石板路。";
  if (Math.hypot(p.x + 9, p.z - 9) < 4) return "水井和井台需要留出空间。";
  if (
    inside(p, (homeFeatures.laundry.x1 + homeFeatures.laundry.x2) / 2, 8, 4.5, 2)
  )
    return "晾衣绳下要能自由走过。";
  return nearby(p, entities, ignoreId, kind);
};

/* --------------------------------- meadow -------------------------------- */

export const meadowFeatures = {
  gate: 32,
  blanket: { x: -8, z: 8 },
  hammock: { x1: 20, x2: 28, z: -12 },
} as const;
const meadow: Rule = (p, entities = [], ignoreId, kind = "tree") => {
  if (Math.abs(p.x) > 42 || Math.abs(p.z) > 36) return "请在草地范围内布置。";
  if (Math.abs(p.x) < 3 && p.z > 28) return "这里是进草地的小径。";
  if (inside(p, meadowFeatures.blanket.x, meadowFeatures.blanket.z, 5, 4.5))
    return "野餐垫上不放东西，坐下来就好。";
  if (Math.abs(p.x - 24) < 6 && Math.abs(p.z + 12) < 2.5)
    return "吊床轻轻晃着，别碰它。";
  return nearby(p, entities, ignoreId, kind);
};

/* --------------------------------- forest -------------------------------- */

export const forestTrail: Point[] = [
  { x: 0, z: 34 },
  { x: -16, z: 24 },
  { x: -22, z: 6 },
  { x: -12, z: -10 },
  { x: 4, z: -18 },
  { x: 20, z: -10 },
  { x: 24, z: 6 },
  { x: 14, z: 20 },
];
const forest: Rule = (p, entities = [], ignoreId, kind = "tree") => {
  if (Math.abs(p.x) > 46 || Math.abs(p.z) > 40) return "请在林间空地内布置。";
  if (pathDistance(p, forestTrail) < 2.6) return "狐狸的小径要保持通畅。";
  return nearby(p, entities, ignoreId, kind);
};

/* -------------------------------- library -------------------------------- */

export const libraryFeatures = {
  gate: 28,
  pavilion: { x: -18, z: -10 },
  lamps: [
    { x: 2, z: 0 },
    { x: 10, z: 12 },
  ],
  table: { x: -2, z: 3 },
} as const;
const library: Rule = (p, entities = [], ignoreId, kind = "tree") => {
  if (Math.abs(p.x) > 38 || Math.abs(p.z) > 32) return "请在书屋露台内布置。";
  if (inside(p, -18, -10, 10, 9)) return "书屋和阅读区需要留出空间。";
  if (Math.abs(p.x) < 3 && p.z > 6) return "这里是进书屋的木栈道。";
  if (libraryFeatures.lamps.some((l) => Math.hypot(p.x - l.x, p.z - l.z) < 2.5))
    return "落地灯旁留个位置，别撞到它。";
  if (Math.hypot(p.x + 2, p.z - 3) < 4.5) return "矮桌和坐垫周围要能坐下。";
  return nearby(p, entities, ignoreId, kind);
};

/* ---------------------------------- pond --------------------------------- */

export const pondShape = { x: 0, z: -6, rx: 21, rz: 16 };
export const pondFeatures = { gate: 33, bridge: { x1: 8, x2: 20, z: -6 } } as const;
const pond: Rule = (p, entities = [], ignoreId, kind = "tree") => {
  if (Math.abs(p.x) > 44 || Math.abs(p.z) > 38) return "请在池塘岸边布置。";
  if (Math.hypot(p.x / 22.5, (p.z + 6) / 17.5) < 1)
    return "水面、石岸和睡莲需要留出空间。";
  if (Math.abs(p.z + 6) < 2.2 && p.x > 6 && p.x < 22)
    return "小木桥上要能走过去。";
  if (Math.abs(p.x) < 3 && p.z > 20) return "这里是来池塘的小路。";
  return nearby(p, entities, ignoreId, kind);
};

/* ----------------------------------- lab --------------------------------- */

export const labFeatures = {
  gate: 30,
  benches: [
    { x: -14, z: -20 },
    { x: 0, z: -22 },
    { x: 14, z: -20 },
  ],
  armillary: { x: 26, z: -2 },
  dome: { x: 30, z: -18 },
  beds: [
    { x: -16, z: 12 },
    { x: -2, z: 14 },
    { x: 12, z: 12 },
  ],
} as const;
const lab: Rule = (p, entities = [], ignoreId, kind = "tree") => {
  if (Math.abs(p.x) > 40 || Math.abs(p.z) > 34) return "请在实验场内布置。";
  if (labFeatures.benches.some((b) => Math.hypot(p.x - b.x, p.z - b.z) < 4.5))
    return "工作台上摆着实验，请留出位置。";
  if (Math.hypot(p.x - 26, p.z + 2) < 4) return "浑天仪在慢慢转，别挡住它。";
  if (Math.hypot(p.x - 30, p.z + 18) < 5) return "天文台圆顶需要留出空间。";
  if (Math.abs(p.x) < 3 && p.z > 22) return "这里是来实验室的小路。";
  if (
    labFeatures.beds.some((b) => inside(p, b.x, b.z, 5, 3)) &&
    kind !== "flower"
  )
    return "试验田里只种花，工具可以放在田边。";
  return nearby(p, entities, ignoreId, kind);
};

/* -------------------------------- nursery -------------------------------- */

const nursery: Rule = (p, entities = [], ignoreId, kind = "tree") => {
  if (Math.abs(p.x) > 42 || Math.abs(p.z) > 34) return "请在种植园内布置。";
  if (
    inside(p, 0, -14, 15, 6) ||
    (Math.abs(p.x) < 4.5 && Math.abs(p.z + 14) < 10)
  )
    return "温室玻璃和苗床需要留出空间。";
  if (Math.abs(p.x) < 3 && p.z > 20) return "这里是来种植园的小路。";
  if (Math.hypot(p.x + 36, p.z + 2) < 3.5) return "水桶和洒水壶放在这里。";
  if (
    nurseryFeatures.beds.some((b) => inside(p, b.x, b.z, 5, 2.75)) &&
    kind !== "flower"
  )
    return "苗床里只种花，小树可以种在花盆里。";
  return nearby(p, entities, ignoreId, kind);
};

/* -------------------------------- mountain ------------------------------- */

export function mountainHeight(x: number, z: number) {
  const r = Math.hypot(x / 40, z / 34);
  if (r >= 1) return 0;
  if (r < 0.2) return 16;
  return Math.max(0, Math.floor((1 - r) / 0.2) * 4);
}
export const mountainTrail: Point[] = [
  { x: 0, z: 32 },
  { x: 14, z: 24 },
  { x: 22, z: 6 },
  { x: 10, z: -10 },
  { x: -4, z: -12 },
  { x: -8, z: -2 },
  { x: 0, z: -4 },
];
export const mountainFeatures = {
  gate: 32,
  platform: { x: 0, z: 1 },
  bench: { x: 2, z: 22 },
} as const;
const mountain: Rule = (p, entities = [], ignoreId, kind = "tree") => {
  if (Math.abs(p.x) > 42 || Math.abs(p.z) > 36) return "请在山坡台阶内布置。";
  if (Math.hypot(p.x / 5.5, (p.z - 1) / 4.5) < 1)
    return "观景台要留给看风景的人。";
  if (pathDistance(p, mountainTrail, false) < 2.6)
    return "上山的石阶要保持通畅。";
  if (
    mountainHeight(p.x, p.z) >= 12 &&
    mountainHeight(p.x, p.z) < 16 &&
    kind === "flower"
  )
    return "高处的风太大，小花在低几层的台阶更安稳。";
  return nearby(p, entities, ignoreId, kind);
};

/* -------------------------------- starlight ------------------------------ */

export const starlightFeatures = {
  cave: { x: 0, z: 27 },
  stones: Array.from({ length: 9 }, (_, i) => {
    const a = 0.35 + (i / 9) * Math.PI * 2;
    return { x: Math.round(Math.cos(a) * 25.7), z: Math.round(Math.sin(a) * 22.6) };
  }),
} as const;
const starlight: Rule = (p, entities = [], ignoreId, kind = "tree") => {
  if (Math.abs(p.x) > 36 || Math.abs(p.z) > 32) return "请在星光空地内布置。";
  if (Math.hypot(p.x, p.z) < 3.5) return "石盆中的星辉要保持完整。";
  if (starlightFeatures.stones.some((s) => Math.hypot(p.x - s.x, p.z - s.z) < 3.2))
    return "立石有自己的位置，让它们安静站着。";
  if (Math.abs(p.x) < 5 && Math.abs(p.z - 27) < 4) return "山洞口要能走回主岛。";
  return nearby(p, entities, ignoreId, kind);
};

/* ---------------------------------- beach -------------------------------- */

/** The sand is a true crescent: outer circle minus an offset lagoon that
 *  crosses the rim, so the bay stays open to the sea at the north. */
export const beachShore = { r: 42 };
export const beachLagoon = { x: 0, z: -30, r: 18 };
export const beachFeatures = {
  gate: 34,
  dock: { x: 3, z1: -8, z2: -28 },
  umbrella: { x: 16, z: 10 },
  driftwood: { x: -20, z: 14 },
  palms: [
    { x: 26, z: 22 },
    { x: -26, z: 20 },
  ],
} as const;
const onSand = (p: Point) =>
  Math.hypot(p.x, p.z) <= beachShore.r &&
  Math.hypot(p.x - beachLagoon.x, p.z - beachLagoon.z) >= beachLagoon.r + 1.5;
const beach: Rule = (p, entities = [], ignoreId, kind = "tree") => {
  if (!onSand(p)) return "请在沙滩上布置，给海水留出空间。";
  if (Math.abs(p.x - 3) < 2.5 && p.z < -6 && p.z > -29)
    return "栈桥要能一直走到水里。";
  if (Math.abs(p.x) < 3 && p.z > 30) return "这里是回主岛的小路。";
  if (Math.hypot(p.x - 16, p.z - 10) < 3) return "遮阳伞下面留着阴凉。";
  if (Math.hypot(p.x + 20, p.z - 14) < 3.5) return "浮木是海浪送的礼物。";
  if (beachFeatures.palms.some((t) => Math.hypot(p.x - t.x, p.z - t.z) < 4))
    return "椰子树旁容易被果子砸到，换一块沙滩吧。";
  return nearby(p, entities, ignoreId, kind);
};

/* ------------------------------- the registry ----------------------------- */

export const subScenes: Record<SubSceneId, SubSceneDef> = {
  dinosaur: {
    id: "dinosaur", landmark: "dinosaur", title: "恐龙公园",
    create: createDinosaurPark, placementError: dinosaurPlacementError,
  },
  garden: {
    id: "garden",
    landmark: "garden",
    title: "私家花园",
    create: createGarden,
    placementError: gardenPlacementError,
  },
  home: define("home", "home", "家园小院", 0x68f2ca11, home, (rng, add) => {
    for (const x of [-26, -23, -20, -17]) add("flower", x, -5);
    for (const x of [18, 21, 24]) add("flower", x, -6);
    for (const x of [-3, 0, 3]) add("flower", x, -18);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      add("flower", Math.cos(a) * 9.2, Math.sin(a) * 9.2);
    }
    add("tree", -30, 24, 0.85 + rng() * 0.15);
    add("tree", 31, 25, 0.85 + rng() * 0.15);
    add("tree", -33, -6, 0.7 + rng() * 0.2);
    add("tree", 33, -4, 0.7 + rng() * 0.2);
    add("bench", 8, 2);
    for (let i = 0; i < 12; i++)
      add("flower", (rng() - 0.5) * 64, (rng() - 0.5) * 52);
  }),
  meadow: define(
    "meadow",
    "meadow",
    "风眠草地",
    0x3ab9d8e2,
    meadow,
    (rng, add) => {
      const grove: [number, number][] = [
        [-36, -26],
        [-29, -31],
        [37, -27],
        [31, -31],
        [-39, 17],
        [39, 19],
        [-24, 32],
        [18, 33],
        [33, 25],
        [-33, -8],
      ];
      for (const [x, z] of grove) add("tree", x, z, 0.8 + rng() * 0.2);
      add("tree", 20, -12, 0.95 + rng() * 0.05);
      add("tree", 28, -12, 0.95 + rng() * 0.05);
      for (let i = 0; i < 44; i++)
        add("flower", (rng() - 0.5) * 78, (rng() - 0.5) * 64);
      add("bench", -16, 14);
    },
  ),
  forest: define(
    "forest",
    "forest",
    "狐狸森林",
    0x1d7e6f33,
    forest,
    (rng, add) => {
      for (let i = 0; i < 130; i++)
        add("tree", (rng() - 0.5) * 88, (rng() - 0.5) * 76, 0.75 + rng() * 0.25);
      for (let i = 0; i < 26; i++)
        add("flower", (rng() - 0.5) * 84, (rng() - 0.5) * 72);
      add("bench", -18, 18);
      add("bench", 26, 14);
    },
  ),
  library: define(
    "library",
    "library",
    "林间书屋",
    0x5c91a4b7,
    library,
    (rng, add) => {
      for (let i = 0; i < 30; i++) {
        const a = (i / 30) * Math.PI * 2,
          r = 0.88 + rng() * 0.1;
        add("tree", Math.cos(a) * 34 * r, Math.sin(a) * 27 * r, 0.6 + rng() * 0.4);
      }
      const pots: [number, number][] = [
        [-13, 1],
        [-9, 1],
        [-5, 1],
        [6, -2],
        [6, 2],
      ];
      for (const [x, z] of pots) add("flower", x, z);
      add("bench", 4, -2);
      for (let i = 0; i < 12; i++)
        add("flower", (rng() - 0.5) * 66, (rng() - 0.5) * 56);
    },
  ),
  pond: define("pond", "pond", "静水池塘", 0x2e4d7fc5, pond, (rng, add) => {
    const willows: [number, number][] = [
      [-26, 10],
      [26, 12],
      [31, -14],
    ];
    for (const [x, z] of willows) add("tree", x, z, 0.85 + rng() * 0.15);
    for (let i = 0; i < 26; i++) {
      const a = rng() * Math.PI * 2,
        f = 1.14 + rng() * 0.22;
      add("flower", Math.cos(a) * 21 * f, -6 + Math.sin(a) * 16 * f);
    }
    add("bench", 32, 6);
    add("bench", -31, -4);
    for (let i = 0; i < 10; i++)
      add("flower", (rng() - 0.5) * 80, (rng() - 0.5) * 68);
  }),
  lab: define("lab", "lab", "自然实验室", 0x9af1c860, lab, (rng, add) => {
    for (const bed of labFeatures.beds)
      for (const dx of [-2, 0, 2])
        for (const dz of [-1, 1]) add("flower", bed.x + dx, bed.z + dz);
    add("tree", 24, -13, 0.32 + rng() * 0.1);
    add("tree", 27, -9, 0.3 + rng() * 0.1);
    add("bench", 2, 6);
    for (let i = 0; i < 16; i++)
      add("flower", (rng() - 0.5) * 74, (rng() - 0.5) * 60);
  }),
  nursery: define(
    "nursery",
    "nursery",
    "实验种植园",
    0x74d3e5a9,
    nursery,
    (rng, add) => {
      for (const bed of nurseryFeatures.beds)
        for (const dx of [-2, 0, 2])
          for (const dz of [-1, 1]) add("flower", bed.x + dx, bed.z + dz);
      for (const x of [-28, -21, -14, 14, 21, 28])
        add("tree", x, 26, 0.3 + rng() * 0.15);
      add("bench", -36, 8);
      for (let i = 0; i < 14; i++)
        add("flower", (rng() - 0.5) * 78, (rng() - 0.5) * 62);
    },
  ),
  mountain: define(
    "mountain",
    "mountain",
    "听风山",
    0x4b8c96d4,
    mountain,
    (rng, add) => {
      for (let i = 0; i < 42; i++) {
        const a = rng() * Math.PI * 2,
          r = 0.24 + rng() * 0.7;
        add("tree", Math.cos(a) * 38 * r, Math.sin(a) * 32 * r, 0.55 + rng() * 0.4);
      }
      for (let i = 0; i < 24; i++) {
        const a = rng() * Math.PI * 2,
          r = 0.3 + rng() * 0.62;
        add("flower", Math.cos(a) * 38 * r, Math.sin(a) * 32 * r);
      }
      add("bench", 2, 22);
    },
  ),
  starlight: define(
    "starlight",
    "cave",
    "星光秘境",
    0x8e7f5b2c,
    starlight,
    (rng, add) => {
      for (let i = 2; i < 42; i++) {
        const a = i * 2.399963,
          rad = 16.5 * Math.sqrt(i / 42);
        add("flower", Math.cos(a) * rad, Math.sin(a) * rad * 0.92);
      }
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 + 0.18,
          r = 0.9 + rng() * 0.07;
        add("tree", Math.cos(a) * 33 * r, Math.sin(a) * 29 * r, 0.7 + rng() * 0.3);
      }
    },
  ),
  beach: define("beach", "beach", "月牙沙滩", 0xd4c5a3f7, beach, (rng, add) => {
    for (let i = 0; i < 24; i++) {
      const a = 0.1 + (i / 24) * (Math.PI - 0.2) + rng() * 0.08,
        f = 0.84 + rng() * 0.1;
      add("flower", Math.cos(a) * 42 * f, Math.sin(a) * 42 * f);
    }
    for (let i = 0; i < 6; i++) {
      const side = i % 2 ? 1 : -1,
        a = side * (0.12 + rng() * 0.5),
        f = 0.72 + rng() * 0.14;
      add("flower", Math.cos(a) * 42 * f, Math.sin(a) * 42 * f);
    }
    for (let i = 0; i < 12; i++)
      add("flower", (rng() - 0.5) * 66, 4 + (rng() - 0.5) * 24);
    add("bench", 12, 20);
  }),
};
