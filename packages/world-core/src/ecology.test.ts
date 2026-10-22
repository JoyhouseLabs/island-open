import { describe, expect, it } from "vitest";
import {
  ECOLOGY_SLOT_MS,
  MAX_BORN,
  MAX_REPLAY_TICKS,
  baseEcology,
  ecologyPlan,
  ecologyState,
  stepEcology,
} from "./ecology.js";

const SEED = 20261017;

describe("baseEcology", () => {
  it("mirrors the island roster with stable ids", () => {
    const base = baseEcology();
    expect(base.members.map((m) => m.id)).toEqual([
      "island-团团",
      "island-高高",
      "island-风哨",
    ]);
    expect(base.members.every((m) => m.bornTick === 0)).toBe(true);
  });
});

describe("stepEcology / ecologyState", () => {
  it("is a pure function of (seed, tick, season)", () => {
    const a = ecologyState(SEED, 500, "summer");
    const b = ecologyState(SEED, 500, "summer");
    expect(a).toEqual(b);
    // A different seed is very likely a different little world.
    const c = ecologyState(SEED + 1, 500, "summer");
    expect(JSON.stringify(c.members.slice(3))).not.toBe(
      JSON.stringify(a.members.slice(3)),
    );
  });

  it("never drops a baseline resident and stays within bounds over a year", () => {
    const base = baseEcology();
    let state = base;
    // Four ticks a day (24h / 6h), 365 days.
    for (let tick = 1; tick <= 365 * 4; tick++) {
      const season =
        Math.floor(tick / (91 * 4)) === 0
          ? "spring"
          : Math.floor(tick / (91 * 4)) === 1
            ? "summer"
            : Math.floor(tick / (91 * 4)) === 2
              ? "autumn"
              : "winter";
      state = stepEcology(state, tick, SEED, season);
      const born = state.members.filter((m) => m.bornTick > 0);
      expect(born.length).toBeLessThanOrEqual(MAX_BORN);
      for (const b of base.members)
        expect(state.members.some((m) => m.id === b.id)).toBe(true);
      for (const species of ["panda", "giraffe", "wolf"] as const) {
        const count = state.members.filter((m) => m.species === species).length;
        const baseCount = base.members.filter((m) => m.species === species).length;
        expect(count).toBeLessThanOrEqual(baseCount + 2);
      }
    }
    // A year of gentle drift should have produced some arrivals at all.
    expect(state.log.length).toBeGreaterThan(0);
    expect(state.log.length).toBeLessThanOrEqual(12);
    // Drift actually happened somewhere in the year.
    const states = [ecologyState(SEED, 90, "spring"), ecologyState(SEED, 180, "summer"), ecologyState(SEED, 365 * 4, "winter")];
    expect(
      states.some((s) => s.members.some((m) => m.bornTick > 0)),
    ).toBe(true);
  });

  it("replaying tick-by-tick matches a one-shot replay", () => {
    let stepped = baseEcology();
    for (let tick = 1; tick <= 40; tick++)
      stepped = stepEcology(stepped, tick, SEED, "autumn");
    const oneShot = ecologyState(SEED, 40, "autumn");
    expect(stepped).toEqual(oneShot);
  });

  it("resumes from a cached state and clamps ancient replays", () => {
    const early = ecologyState(SEED, 10, "spring");
    const resumed = ecologyState(SEED, 12, "spring", early);
    expect(resumed.tick).toBe(12);
    expect(resumed).toEqual(ecologyState(SEED, 12, "spring"));
    // A cold derivation far in the future stays within the replay floor.
    const far = ecologyState(SEED, 100_000, "summer");
    expect(far.tick).toBe(100_000);
    // Every event still respects the replay window bound.
    expect(
      far.log.every((e) => e.tick >= 100_000 - MAX_REPLAY_TICKS - 1),
    ).toBe(true);
  });

  it("gives born friends unique names and ids", () => {
    const state = ecologyState(SEED, 2000, "summer");
    const ids = state.members.map((m) => m.id);
    const names = state.members.map((m) => m.name);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(names).size).toBe(names.length);
    for (const m of state.members.filter((x) => x.bornTick > 0))
      expect(m.id).toBe(`eco-${m.species}-${m.bornTick}`);
  });
});

describe("ecologyPlan", () => {
  it("schedules at most one deterministic encounter per slot", () => {
    const members = ecologyState(SEED, 100, "spring").members;
    const slot = Math.floor(1_700_000_000_000 / ECOLOGY_SLOT_MS);
    const a = ecologyPlan(SEED, slot, members);
    const b = ecologyPlan(SEED, slot, members);
    expect(a).toEqual(b);
    if (a) {
      expect(members.some((m) => m.id === a.pair[0])).toBe(true);
      expect(members.some((m) => m.id === a.pair[1])).toBe(true);
      expect(a.pair[0]).not.toBe(a.pair[1]);
      expect(["meet", "chase", "hide"]).toContain(a.behavior);
      expect(Number.isFinite(a.at.x)).toBe(true);
    }
  });
  it("leaves small rosters alone", () => {
    expect(ecologyPlan(SEED, 7, baseEcology().members.slice(0, 1))).toBeNull();
  });
});
