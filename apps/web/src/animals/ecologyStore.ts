import { useEffect, useState } from "react";
import {
  ECOLOGY_SLOT_MS,
  ECOLOGY_TICK_MS,
  ecologyPlan,
  ecologyState,
  type EcologyEncounter,
  type EcologyMember,
  type EcologySeason,
  type EcologyState,
} from "@island/world-core";
import { featuresStatus, type FeatureFlags } from "../contentStore";
import { emitGrowth, growth } from "../progress/store";

/**
 * The main island's bounded ecology, derived per frame-family from the
 * world seed and the wall clock — the host and every visitor compute the
 * same population with nothing synced (the fox's clock patrol, one layer
 * up). A localStorage cache keeps the replay short and the arrival log
 * readable across sessions; it is never authoritative.
 */
const CACHE_KEY = "island-ecology-v1";
type Cache = { seed: number; tick: number; state: EcologyState };

let flags: FeatureFlags = { cards: false, speakingEntities: false, ecology: false };
void featuresStatus().then((f) => {
  flags = f;
});

/** The currently derived roster, for the encounter lookup below. */
let current: { seed: number; members: EcologyMember[] } | null = null;
/** Seen log entries, so a tick change announces only what is new. */
let seenLog: EcologyState["log"] | null = null;

function readCache(seed: number): Cache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Cache) : null;
    return parsed && parsed.seed === seed ? parsed : null;
  } catch {
    return null;
  }
}

function derive(seed: number, season: EcologySeason): EcologyState {
  const tick = Math.floor(Date.now() / ECOLOGY_TICK_MS);
  const cached = readCache(seed);
  const state = ecologyState(seed, tick, season, cached?.state);
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ seed, tick, state } satisfies Cache),
    );
  } catch {
    /* the cache is an optimisation, nothing more */
  }
  return state;
}

/** Announces events that happened since the last look. The first look only
 *  seeds the journal — a page load must not replay last week's news. */
function announce(state: EcologyState) {
  if (seenLog === null) {
    seenLog = [...state.log];
    return;
  }
  const known = new Set(seenLog.map((e) => `${e.tick}:${e.kind}:${e.name}`));
  for (const event of state.log) {
    const key = `${event.tick}:${event.kind}:${event.name}`;
    if (known.has(key)) continue;
    seenLog.push(event);
    if (event.kind === "birth") {
      growth.pushToast(`🎉 岛上迎来了新朋友「${event.name}」`);
      emitGrowth({ type: "ecology.birth", detail: event.name });
    } else {
      growth.pushToast(`🌊 「${event.name}」去隔壁岛旅行了`);
      emitGrowth({ type: "ecology.departure", detail: event.name });
    }
  }
  seenLog = seenLog.slice(-24);
}

/** The ecology roster of one island, refreshed as wall-clock ticks pass.
 *  Null whenever there is no seed (non-island scenes) or the feature flag
 *  is off (or not yet known). */
export function useEcology(
  seed: number | null,
  season: EcologySeason,
): EcologyMember[] | null {
  const [members, setMembers] = useState<EcologyMember[] | null>(null);
  useEffect(() => {
    if (!flags.ecology || seed === null) {
      current = null;
      return;
    }
    const update = () => {
      const state = derive(seed, season);
      current = { seed, members: state.members };
      announce(state);
      setMembers(state.members);
    };
    update();
    const timer = window.setInterval(update, 30_000);
    return () => {
      window.clearInterval(timer);
      current = null;
    };
  }, [seed, season]);
  return flags.ecology && seed !== null ? members : null;
}

let planCache: { slot: number; seed: number; plan: EcologyEncounter | null } | null =
  null;

/** This animal's scheduled encounter for the current ten-minute slot, if
 *  any. Deterministic per (seed, slot), so host and visitors agree. */
export function activeEncounter(
  id: string,
): { behavior: EcologyEncounter["behavior"]; at: { x: number; z: number }; partnerId: string } | null {
  if (!flags.ecology || !current) return null;
  const slot = Math.floor(Date.now() / ECOLOGY_SLOT_MS);
  if (!planCache || planCache.slot !== slot || planCache.seed !== current.seed) {
    planCache = {
      slot,
      seed: current.seed,
      plan: ecologyPlan(current.seed, slot, current.members),
    };
  }
  const plan = planCache.plan;
  if (!plan) return null;
  const [a, b] = plan.pair;
  if (id === a) return { behavior: plan.behavior, at: plan.at, partnerId: b! };
  if (id === b) return { behavior: plan.behavior, at: plan.at, partnerId: a! };
  return null;
}
