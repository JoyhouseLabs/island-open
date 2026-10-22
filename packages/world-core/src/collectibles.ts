import type { SubSceneId } from "@island/contracts";
import { island } from "./index.js";
import { random } from "./random.js";

/** The forageable things scattered around the island. */
export type ForageKind =
  | "petal"
  | "pinecone"
  | "mushroom"
  | "shell"
  | "starfish"
  | "crab"
  | "pebble"
  | "mote";

export const forageCatalog: {
  kind: ForageKind;
  name: string;
  color: string;
  note: string;
  /** Emoji glyph shown in the backpack grid and pick-up toasts. */
  emoji: string;
}[] = [
  { kind: "petal", name: "花瓣", color: "#e8a7b8", note: "风把它从花圃里带出来。", emoji: "🌸" },
  { kind: "pinecone", name: "松果", color: "#8a6238", note: "树下捡到的小塔。", emoji: "🌰" },
  { kind: "mushroom", name: "蘑菇", color: "#c96f5a", note: "森林里悄悄撑起的小伞。", emoji: "🍄" },
  { kind: "shell", name: "贝壳", color: "#efe3cf", note: "海浪送来的礼物。", emoji: "🐚" },
  { kind: "starfish", name: "海星", color: "#e98a6f", note: "趴在湿沙上的五角星。", emoji: "⭐" },
  { kind: "crab", name: "螃蟹", color: "#d95f43", note: "举着钳子横行的小家伙。", emoji: "🦀" },
  { kind: "pebble", name: "鹅卵石", color: "#9aa3a0", note: "被水磨圆的小石头。", emoji: "🪨" },
  { kind: "mote", name: "萤光", color: "#bfe3c8", note: "星光落在草尖上的一点亮。", emoji: "✨" },
];

export type ForageSpot = { id: string; kind: ForageKind; x: number; z: number };

/** Which kinds appear where, and the patch of ground they scatter over. */
const zones: Record<
  string,
  { cx: number; cz: number; rx: number; rz: number; kinds: ForageKind[] }
> = {
  dinosaur: { cx: 0, cz: 0, rx: 76, rz: 61, kinds: ["pinecone", "pebble", "petal"] },
  island: { cx: 0, cz: 16, rx: 104, rz: 78, kinds: ["petal", "pinecone", "pebble"] },
  garden: { cx: 0, cz: 0, rx: 30, rz: 25, kinds: ["petal"] },
  home: { cx: 0, cz: 2, rx: 24, rz: 18, kinds: ["petal"] },
  meadow: { cx: 0, cz: 0, rx: 38, rz: 30, kinds: ["petal", "pebble"] },
  forest: { cx: 0, cz: 0, rx: 34, rz: 30, kinds: ["pinecone", "mushroom"] },
  library: { cx: 0, cz: 0, rx: 22, rz: 17, kinds: ["petal"] },
  pond: { cx: 0, cz: 0, rx: 24, rz: 18, kinds: ["pebble"] },
  lab: { cx: 0, cz: 0, rx: 22, rz: 16, kinds: ["pebble"] },
  nursery: { cx: 0, cz: 0, rx: 24, rz: 20, kinds: ["pinecone"] },
  mountain: { cx: 0, cz: -4, rx: 30, rz: 22, kinds: ["pebble"] },
  starlight: { cx: 0, cz: 0, rx: 32, rz: 26, kinds: ["mote"] },
  beach: { cx: 0, cz: 0, rx: 34, rz: 24, kinds: ["shell", "starfish", "crab"] },
};

/**
 * The main island's sand ring, between the grass line (radial ~0.86) and the
 * walkable wet-sand edge: shore treasures only ever spawn here. The upper
 * bound stays under the smallest shoreline wobble (0.947 - margin) so every
 * spot lands on walkable ground.
 */
/** Scenes with their own forage patch. A new room should add one. */
export const forageSceneIds = Object.keys(zones);

const shoreRing: { from: number; to: number; kinds: ForageKind[] } = {
  from: 0.88,
  to: 0.92,
  kinds: ["shell", "starfish", "crab"],
};

function hashString(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Deterministic forage layout for one scene: same world seed always shows
 * the same little treasures. Unwalkable spots are simply skipped by the
 * caller — the world has plenty more.
 */
export function forageSpots(
  scene: "island" | SubSceneId | (string & {}),
  seed: number,
  size = 60,
): ForageSpot[] {
  const zone = zones[scene] ?? {
    cx: 0,
    cz: 0,
    rx: size / 2 - 6,
    rz: size / 2 - 6,
    kinds: ["petal", "pinecone"] as ForageKind[],
  };
  const rng = random((seed ^ hashString(String(scene))) >>> 0);
  const count = 4 + Math.floor(rng() * 3);
  const spots = Array.from({ length: count }, (_, i) => {
    const kind = zone.kinds[Math.floor(rng() * zone.kinds.length)]!;
    const angle = rng() * Math.PI * 2,
      reach = Math.sqrt(rng());
    return {
      id: `${scene}-${i}`,
      kind,
      x: Math.max(-155, Math.min(155, zone.cx + Math.cos(angle) * reach * zone.rx)),
      z: Math.max(-130, Math.min(130, zone.cz + Math.sin(angle) * reach * zone.rz)),
    };
  });
  if (scene === "island") {
    // A few shore treasures on the sand ring — drawn after the inland batch
    // so existing inland layouts (same seed) stay put.
    for (let i = 0; i < 3 + Math.floor(rng() * 3); i++) {
      const kind = shoreRing.kinds[Math.floor(rng() * shoreRing.kinds.length)]!;
      const angle = rng() * Math.PI * 2,
        rad = shoreRing.from + rng() * (shoreRing.to - shoreRing.from);
      spots.push({
        id: `${scene}-shore-${i}`,
        kind,
        x: Math.cos(angle) * island.radiusX * rad,
        z: Math.sin(angle) * island.radiusZ * rad,
      });
    }
  }
  return spots;
}
