import { describe, expect, it } from "vitest";
import { forageCatalog, forageSpots, walkSpecs } from "./src/index";
import { subSceneIds } from "@island/contracts";

describe("forageSpots", () => {
  it("is deterministic per scene and seed", () => {
    expect(forageSpots("forest", 20261018)).toEqual(forageSpots("forest", 20261018));
    expect(forageSpots("forest", 1)).not.toEqual(forageSpots("forest", 2));
  });
  it("scatters 4–6 spots inside the scene bounds for every scene", () => {
    for (const scene of ["island", ...subSceneIds]) {
      const spots = forageSpots(scene, 42);
      // The island adds a shore batch on its sand ring on top of the inland 4–6.
      const max = scene === "island" ? 12 : 6;
      expect(spots.length).toBeGreaterThanOrEqual(4);
      expect(spots.length).toBeLessThanOrEqual(max);
      for (const s of spots) {
        expect(Math.abs(s.x)).toBeLessThanOrEqual(155);
        expect(Math.abs(s.z)).toBeLessThanOrEqual(130);
      }
    }
  });
  it("keeps shore treasures on the island's walkable sand ring only", () => {
    const shoreKinds = ["shell", "starfish", "crab"] as const;
    for (const seed of [7, 42, 20261020]) {
      const spots = forageSpots("island", seed);
      const shore = spots.filter((s) =>
        (shoreKinds as readonly string[]).includes(s.kind),
      );
      expect(shore.length).toBeGreaterThanOrEqual(3);
      for (const s of shore) {
        const r = Math.hypot(s.x / 150, s.z / 125);
        expect(r, `${s.kind} on sand`).toBeGreaterThan(0.86);
        expect(r, `${s.kind} dry side`).toBeLessThan(0.93);
        expect(walkSpecs.island.walkable(s.x, s.z), `${s.kind} walkable`).toBe(
          true,
        );
      }
      // Inland kinds never drift onto the sand.
      for (const s of spots.filter(
        (s) => !(shoreKinds as readonly string[]).includes(s.kind),
      ))
        expect(Math.hypot(s.x / 150, s.z / 125)).toBeLessThan(0.86);
    }
  });
  it("only offers kinds from the catalog", () => {
    const kinds = new Set(forageCatalog.map((c) => c.kind));
    for (const s of forageSpots("island", 7))
      expect(kinds.has(s.kind)).toBe(true);
    for (const c of forageCatalog)
      expect(c.emoji, `${c.kind} emoji`).toMatch(/^\P{L}+$/u);
  });
  it("gives places a ring inside their ground size", () => {
    const spots = forageSpots("place-moon-valley", 9, 60);
    expect(spots.length).toBeGreaterThanOrEqual(4);
    for (const s of spots) {
      expect(Math.hypot(s.x, s.z)).toBeLessThanOrEqual(24 + 0.5);
    }
  });
});
