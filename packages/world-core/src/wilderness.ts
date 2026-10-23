import type { PhysicsForageSpot } from "@island/contracts";
import type { ForageKind } from "./collectibles.js";
/** Independent from editable world snapshots. Bump this version if generation changes. */
export const WILDERNESS_VERSION = 2;
export const CHUNK_SIZE = 96;
export const TERRAIN_STEP = 6;
export const CAMP = { x: 48, z: 48 };
export type ChunkCoord = { x: number; z: number };
export type WildProp = {
  x: number;
  z: number;
  scale: number;
  kind: "tree" | "rock";
};
export type WildChunk = ChunkCoord & { key: string; props: WildProp[] };
export const chunkKey = ({ x, z }: ChunkCoord) => `${x},${z}`;
export const chunkAt = (x: number, z: number): ChunkCoord => ({
  x: Math.floor(x / CHUNK_SIZE),
  z: Math.floor(z / CHUNK_SIZE),
});
function hash(seed: number, x: number, z: number) {
  let n = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ seed;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
const smooth = (t: number) => t * t * (3 - 2 * t);
function noise(seed: number, x: number, z: number, size: number) {
  const ix = Math.floor(x / size),
    iz = Math.floor(z / size),
    u = smooth(x / size - ix),
    v = smooth(z / size - iz);
  const a = hash(seed, ix, iz),
    b = hash(seed, ix + 1, iz),
    c = hash(seed, ix, iz + 1),
    d = hash(seed, ix + 1, iz + 1);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}
export function wildBiome(seed: number, x: number, z: number) {
  const n = noise(seed ^ 891, x, z, 180);
  return n < 0.34 ? "rock" : n > 0.56 ? "forest" : "meadow";
}
export function wildVertexHeight(seed: number, x: number, z: number) {
  const campFade = smooth(
    Math.max(0, Math.min(1, (Math.hypot(x - CAMP.x, z - CAMP.z) - 12) / 24)),
  );
  return (
    campFade * (noise(seed, x, z, 192) * 11 + noise(seed ^ 331, x, z, 48) * 3)
  );
}
/** Matches the rendered triangles, including negative coordinates and chunk edges. */
export function wildHeight(seed: number, x: number, z: number) {
  const gx = Math.floor(x / TERRAIN_STEP) * TERRAIN_STEP,
    gz = Math.floor(z / TERRAIN_STEP) * TERRAIN_STEP;
  const u = (x - gx) / TERRAIN_STEP,
    v = (z - gz) / TERRAIN_STEP;
  const a = wildVertexHeight(seed, gx, gz),
    b = wildVertexHeight(seed, gx + TERRAIN_STEP, gz),
    c = wildVertexHeight(seed, gx, gz + TERRAIN_STEP),
    d = wildVertexHeight(seed, gx + TERRAIN_STEP, gz + TERRAIN_STEP);
  return u + v <= 1
    ? a + (b - a) * u + (c - a) * v
    : d + (c - d) * (1 - u) + (b - d) * (1 - v);
}
export function generateWildChunk(seed: number, coord: ChunkCoord): WildChunk {
  const props: WildProp[] = [];
  // World-aligned cells guarantee stable identity and spacing across chunk borders.
  for (let i = 0; i < 12; i++)
    for (let j = 0; j < 12; j++) {
      const gx = coord.x * 12 + i,
        gz = coord.z * 12 + j;
      const x = gx * 8 + 2 + hash(seed ^ 12, gx, gz) * 4,
        z = gz * 8 + 2 + hash(seed ^ 23, gx, gz) * 4;
      const biome = wildBiome(seed, x, z);
      // A clear camp and a continuous north/south exploration trail.
      if (Math.hypot(x - CAMP.x, z - CAMP.z) < 18 || Math.abs(x - CAMP.x) < 5)
        continue;
      if (
        hash(seed ^ 34, gx, gz) >
        (biome === "forest" ? 0.7 : biome === "rock" ? 0.25 : 0.12)
      )
        continue;
      props.push({
        x,
        z,
        scale: 0.8 + hash(seed ^ 45, gx, gz) * 1.2,
        kind: biome === "rock" ? "rock" : "tree",
      });
    }
  return { ...coord, key: chunkKey(coord), props };
}
export function wildRing(center: ChunkCoord, radius = 2): ChunkCoord[] {
  const result: ChunkCoord[] = [];
  for (let x = -radius; x <= radius; x++)
    for (let z = -radius; z <= radius; z++)
      result.push({ x: center.x + x, z: center.z + z });
  return result.sort(
    (a, b) =>
      Math.hypot(a.x - center.x, a.z - center.z) -
      Math.hypot(b.x - center.x, b.z - center.z),
  );
}
/** Retains only the desired window. One generation per tick bounds main-thread work. */
export class WildStream {
  readonly chunks = new Map<string, WildChunk>();
  private pending: ChunkCoord[] = [];
  focus(center: ChunkCoord) {
    const ring = wildRing(center),
      wanted = new Set(ring.map(chunkKey));
    for (const key of this.chunks.keys())
      if (!wanted.has(key)) this.chunks.delete(key);
    this.pending = ring.filter((c) => !this.chunks.has(chunkKey(c)));
  }
  tick(seed: number) {
    const coord = this.pending.shift();
    if (!coord) return false;
    const chunk = generateWildChunk(seed, coord);
    this.chunks.set(chunk.key, chunk);
    return true;
  }
  get waiting() {
    return this.pending.length;
  }
}
export type WildSpecies = "raptor" | "pterosaur" | "peacock" | "nest";
export type WildEncounter = {
  id: string;
  kind: WildSpecies;
  x: number;
  z: number;
  phase: number;
  chunk: ChunkCoord;
};
/** Stable, sparse encounters; no runtime randomness or unbounded populations. */
export function wildEncounters(
  seed: number,
  coord: ChunkCoord,
): WildEncounter[] {
  const chunk = generateWildChunk(seed, coord),
    result: WildEncounter[] = [];
  for (let slot = 0; slot < 3; slot++) {
    const h = hash(seed ^ (771 + slot * 137), coord.x, coord.z);
    if (slot === 2 && h < 0.65) continue;
    for (let attempt = 0; attempt < 16; attempt++) {
      const x =
        coord.x * CHUNK_SIZE +
        12 +
        hash(seed ^ (811 + attempt * 67 + slot * 997), coord.x, coord.z) * 72;
      const z =
        coord.z * CHUNK_SIZE +
        12 +
        hash(seed ^ (918 + attempt * 97 + slot * 971), coord.x, coord.z) * 72;
      if (
        Math.hypot(x - CAMP.x, z - CAMP.z) < 18 ||
        Math.abs(x - CAMP.x) < 7 ||
        chunk.props.some((p) => Math.hypot(x - p.x, z - p.z) < 7) ||
        result.some((p) => Math.hypot(x - p.x, z - p.z) < 14)
      )
        continue;
      const biome = wildBiome(seed, x, z);
      const kind: WildSpecies =
        slot === 2
          ? "nest"
          : h < 0.22
            ? "pterosaur"
            : biome === "rock"
              ? "pterosaur"
              : biome === "forest"
                ? "raptor"
                : "peacock";
      result.push({
        id: `wild2:${coord.x}:${coord.z}:${slot}:${kind}`,
        kind,
        x,
        z,
        phase: h * 6.28,
        chunk: coord,
      });
      break;
    }
  }
  // The departure trail always offers a first observation, still selected by seed.
  if (coord.x === 0 && coord.z === 0) {
    const kind = hash(seed ^ 219, 0, 0) > 0.5 ? "peacock" : "raptor";
    result.splice(0, 1, {
      id: `wild2:0:0:0:${kind}`,
      kind,
      x: CAMP.x + 9,
      z: CAMP.z - 12,
      phase: hash(seed, 0, 0) * 6.28,
      chunk: coord,
    });
  }
  return result;
}

/** Display identity is scoped to the current home; storage keeps the existing stable id. */
export function wildIdentity(id: string) {
  const match =
    /^wild2:(-?\d{1,6}):(-?\d{1,6}):([0-2]):(raptor|pterosaur|peacock|nest)$/.exec(
      id,
    );
  if (!match) return null;
  const x = Number(match[1]),
    z = Number(match[2]);
  if (String(x) !== match[1] || String(z) !== match[2]) return null;
  const kind = match[4] as WildSpecies,
    slot = Number(match[3]);
  const prefix = {
    raptor: "RAP",
    pterosaur: "PTE",
    peacock: "PEA",
    nest: "NEST",
  }[kind];
  return {
    id,
    kind,
    chunk: { x, z },
    number: `${prefix}-2-${x < 0 ? "W" : "E"}${Math.abs(x).toString(36).toUpperCase()}-${z > 0 ? "S" : "N"}${Math.abs(z).toString(36).toUpperCase()}-${String(slot + 1).padStart(2, "0")}`,
  };
}

/** The little finds scattered across exploration chunks. Same seed and chunk
 * always yield the same spots on walkable ground, clear of the camp, the
 * departure trail and solid props; ids parse back to their chunk so the server
 * can verify a pickup without trusting browser coordinates. */
export function wildForageSpots(
  seed: number,
  coord: ChunkCoord,
): PhysicsForageSpot[] {
  const chunk = generateWildChunk(seed, coord),
    spots: PhysicsForageSpot[] = [];
  for (let slot = 0; slot < 2; slot++) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const x =
        coord.x * CHUNK_SIZE +
        10 +
        hash(seed ^ (501 + attempt * 71 + slot * 877), coord.x, coord.z) * 76;
      const z =
        coord.z * CHUNK_SIZE +
        10 +
        hash(seed ^ (613 + attempt * 89 + slot * 787), coord.x, coord.z) * 76;
      if (Math.hypot(x - CAMP.x, z - CAMP.z) < 18 || Math.abs(x - CAMP.x) < 7)
        continue;
      if (
        chunk.props.some((p) => Math.hypot(x - p.x, z - p.z) < 1.3 * p.scale + 0.45)
      )
        continue;
      if (
        spots.some((s) => Math.hypot(x - s.position.x, z - s.position.z) < 12)
      )
        continue;
      const biome = wildBiome(seed, x, z),
        kind: ForageKind =
          biome === "forest"
            ? hash(seed ^ 71, coord.x, coord.z) < 0.5
              ? "pinecone"
              : "mushroom"
            : biome === "rock"
              ? "pebble"
              : "petal";
      spots.push({
        id: `wfind:${coord.x}:${coord.z}:${slot}`,
        kind,
        position: { x, y: wildHeight(seed, x, z) + 0.3, z },
      });
      break;
    }
  }
  return spots;
}

/** Collect ids parse back to their chunk for server-side verification. */
export function wildForageChunk(id: string): ChunkCoord | null {
  const match = /^wfind:(-?\d{1,6}):(-?\d{1,6}):[01]$/.exec(id);
  if (!match) return null;
  const x = Number(match[1]),
    z = Number(match[2]);
  if (String(x) !== match[1] || String(z) !== match[2]) return null;
  return { x, z };
}
