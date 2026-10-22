import { random } from "./random.js";
import { residents, type Interest, type Species } from "./residents.js";

/**
 * The island's bounded ecology: a gentle population drift and one scheduled
 * encounter per ten-minute slot, both pure functions of (world seed, wall
 * clock). Host and visitors derive the identical result with zero syncing —
 * the same trick the fox's clock patrol uses. Baseline residents never
 * leave; at most MAX_BORN friends arrive, and only they ever depart
 * ("去隔壁岛旅行" — nobody dies on this island). The wolf stays behind its
 * growth unlock, which callers apply when rendering.
 */
export const ECOLOGY_TICK_MS = 6 * 3600_000;
export const ECOLOGY_SLOT_MS = 10 * 60_000;
/** A cold cache replays at most this many ticks; before that the world
 *  simply "began" that long ago (arrivals/departures are low-frequency, so
 *  the result stays close to a full replay). */
export const MAX_REPLAY_TICKS = 240;
/** The hard ceiling on ecology-born friends across the island. */
export const MAX_BORN = 6;

export type EcologyMember = {
  /** Baseline ids match the Residents render id (`island-团团`); born
   *  members get `eco-<species>-<bornTick>` (one birth per tick at most). */
  id: string;
  species: Species;
  name: string;
  home: { x: number; z: number; r: number };
  prefer: Interest;
  /** The tick this member appeared; 0 for the baseline roster. */
  bornTick: number;
};
export type EcologyEvent = {
  tick: number;
  kind: "birth" | "departure";
  species: Species;
  name: string;
};
export type EcologyState = {
  tick: number;
  members: EcologyMember[];
  /** Newest last, capped — a little island newspaper. */
  log: EcologyEvent[];
};

export type EcologySeason = "spring" | "summer" | "autumn" | "winter";

/** Per-species name pieces for born friends; flavours match the residents. */
const nameParts: Record<Species, { first: string[]; second: string[] }> = {
  panda: {
    first: ["小", "竹", "圆", "糯", "软"],
    second: ["团子", "滚滚", "圆圆", "宝宝", "乎乎"],
  },
  giraffe: {
    first: ["小", "云", "叶", "星", "金"],
    second: ["高高", "梢梢", "望望", "点点", "长长"],
  },
  wolf: {
    first: ["小", "风", "月", "雪", "影"],
    second: ["哨哨", "牙牙", "步步", "鸣鸣", "影影"],
  },
  fox: {
    first: ["小", "火", "绒"],
    second: ["尾尾", "尖尖", "灵灵"],
  },
};
const prefers: Record<Species, Interest> = {
  panda: "flower",
  giraffe: "tree",
  wolf: "grass",
  fox: "flower",
};

/** Deterministic tick rng: same seed and tick, same little world. */
const tickRng = (seed: number, tick: number) =>
  random((seed ^ Math.imul(tick, 0x9e3779b1)) >>> 0);

/** The static starting roster of the main island. */
export function baseEcology(): EcologyState {
  return {
    tick: 0,
    members: (residents.island ?? []).map((r) => ({
      id: `island-${r.name}`,
      species: r.species,
      name: r.name,
      home: { ...r.home },
      prefer: r.prefer,
      bornTick: 0,
    })),
    log: [],
  };
}

function bornMember(
  species: Species,
  tick: number,
  seed: number,
  taken: Set<string>,
): EcologyMember {
  const rng = random((seed ^ Math.imul(tick, 0x85ebca6b) ^ 0x51ed) >>> 0);
  const parts = nameParts[species];
  let name = "";
  // Try deterministic pairs until one is unused; fall back to a numbered cub.
  for (let i = 0; i < 12 && !name; i++) {
    const candidate =
      parts.first[Math.floor(rng() * parts.first.length)]! +
      parts.second[Math.floor(rng() * parts.second.length)]!;
    if (!taken.has(candidate)) name = candidate;
  }
  if (!name) name = `小家伙${tick}`;
  const base = (residents.island ?? []).find((r) => r.species === species);
  const home = {
    x: (base?.home.x ?? 0) + (rng() - 0.5) * 10,
    z: (base?.home.z ?? 0) + (rng() - 0.5) * 10,
    r: (base?.home.r ?? 10) + 2,
  };
  return {
    id: `eco-${species}-${tick}`,
    species,
    name,
    home,
    prefer: prefers[species],
    bornTick: tick,
  };
}

/** Advances the state tick by tick. Baselines never leave; only born
 *  friends depart, and only while others remain. Seasons tilt arrival
 *  odds (spring/summer friendlier, winter quiet). */
export function stepEcology(
  state: EcologyState,
  toTick: number,
  seed: number,
  season: EcologySeason,
): EcologyState {
  const base = baseEcology();
  let s = state.tick <= toTick ? state : { ...state, tick: toTick };
  for (let tick = s.tick + 1; tick <= toTick; tick++) {
    const rng = tickRng(seed, tick);
    const members = [...s.members];
    const log = [...s.log];
    const bornIdx = members
      .map((m, i) => (m.bornTick > 0 ? i : -1))
      .filter((i) => i >= 0);
    const seasonFactor =
      season === "spring" || season === "summer"
        ? 1.2
        : season === "winter"
          ? 0.5
          : 1;
    if (bornIdx.length > 0 && rng() < 0.06) {
      // A friend goes travelling; the baseline roster always stays.
      const pick = bornIdx[Math.floor(rng() * bornIdx.length)]!;
      const leaver = members[pick]!;
      members.splice(pick, 1);
      log.push({
        tick,
        kind: "departure",
        species: leaver.species,
        name: leaver.name,
      });
    } else if (bornIdx.length < MAX_BORN && rng() < 0.08 * seasonFactor) {
      const speciesList = base.members.map((m) => m.species);
      const species = speciesList[Math.floor(rng() * speciesList.length)]!;
      const count = members.filter((m) => m.species === species).length;
      const baseCount = base.members.filter((m) => m.species === species).length;
      if (count < baseCount + 2) {
        const member = bornMember(
          species,
          tick,
          seed,
          new Set(members.map((m) => m.name)),
        );
        members.push(member);
        log.push({ tick, kind: "birth", species, name: member.name });
      }
    }
    s = { tick, members, log: log.slice(-12) };
  }
  return s;
}

/** Derives the state for a wall-clock tick, replaying from a cached state
 *  when possible (and from the replay floor when the cache is too old). */
export function ecologyState(
  seed: number,
  tick: number,
  season: EcologySeason,
  last?: EcologyState,
): EcologyState {
  const base = baseEcology();
  if (tick <= 0) return base;
  let from: EcologyState = last && last.tick <= tick && last.tick >= 0 ? last : base;
  if (tick - from.tick > MAX_REPLAY_TICKS)
    from = { ...base, tick: Math.max(0, tick - MAX_REPLAY_TICKS) };
  return stepEcology(from, tick, seed, season);
}

export type EcologyEncounter = {
  /** The two member ids meeting this slot. */
  pair: [string, string];
  behavior: "meet" | "chase" | "hide";
  at: { x: number; z: number };
};

/** Zero or one scheduled encounter per ten-minute slot, between the homes
 *  of two members. Everyone idle without a plan keeps its own wander AI. */
export function ecologyPlan(
  seed: number,
  slot: number,
  members: EcologyMember[],
): EcologyEncounter | null {
  if (members.length < 2) return null;
  const rng = random((seed ^ Math.imul(slot, 0x85ebca77)) >>> 0);
  if (rng() < 0.25) return null;
  const sorted = [...members].sort((a, b) => (a.id < b.id ? -1 : 1));
  const i = Math.floor(rng() * sorted.length);
  let j = Math.floor(rng() * (sorted.length - 1));
  if (j >= i) j++;
  const a = sorted[i]!,
    b = sorted[j]!;
  const at = {
    x: (a.home.x + b.home.x) / 2 + (rng() - 0.5) * 6,
    z: (a.home.z + b.home.z) / 2 + (rng() - 0.5) * 6,
  };
  const roll = rng();
  const behavior = roll < 0.5 ? "meet" : roll < 0.8 ? "chase" : "hide";
  return { pair: [a.id, b.id], behavior, at };
}
