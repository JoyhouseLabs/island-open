import { describe, expect, it } from "vitest";
import type { PlaceConfig } from "@island/contracts";
import { placeForageSpots } from "./collectibles.js";

const place = (over: Partial<PlaceConfig> = {}): PlaceConfig => ({
  id: "quiet-test",
  name: "测试小天地",
  tagline: "测试",
  eyebrow: "A TEST PLACE",
  accent: "#778855",
  ground: { shape: "disc", size: 40, color: "#aabb88" },
  sky: { day: "#aabbcc", night: "#123456", stars: 100 },
  ambience: { volume: 0.5 },
  props: [
    { kind: "bench", x: -3, z: -1, scale: 1 },
    { kind: "tree", x: -7, z: -6, scale: 1 },
    { kind: "tree", x: 8, z: -9, scale: 1 },
    { kind: "rock", x: 7, z: 2, scale: 1 },
    { kind: "pond", x: 1, z: -10, scale: 1 },
    { kind: "lamp", x: -8, z: 5, scale: 1 },
    { kind: "flower", x: -5, z: 4, scale: 1 },
  ],
  ...over,
});

describe("placeForageSpots", () => {
  it("is deterministic per place id and independent of prop order", () => {
    const a = placeForageSpots(place()),
      b = placeForageSpots(place());
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
    expect(
      placeForageSpots(place({ props: [...place().props].reverse() })).map(
        (s) => s.id,
      ),
    ).toEqual(a.map((s) => s.id));
    expect(placeForageSpots(place({ id: "another" }))).not.toEqual(a);
  });
  it("keeps spots on open ground away from props, spawn and the gate corridor", () => {
    const config = place(),
      half = config.ground.size / 2;
    for (const spot of placeForageSpots(config)) {
      expect(spot.id).toMatch(/^place-\d+$/);
      expect(spot.position.y).toBeCloseTo(0.3);
      expect(Math.hypot(spot.position.x, spot.position.z)).toBeLessThan(
        half - 3,
      );
      expect(
        Math.hypot(spot.position.x, spot.position.z - half / 2),
      ).toBeGreaterThanOrEqual(3);
      expect(
        Math.abs(spot.position.x) < 2.5 && spot.position.z > half / 2,
      ).toBe(false);
      for (const p of config.props) {
        const clearance =
          p.kind === "rock"
            ? 1.2 * p.scale + 0.45
            : p.kind === "tree"
              ? 0.3 * p.scale + 0.45
              : p.kind === "pond"
                ? 2.5 * p.scale + 0.3
                : p.kind === "bench"
                  ? Number.NaN
                  : p.kind === "lamp"
                    ? 0.09 * p.scale + 0.4
                    : 0.18 * p.scale + 0.3;
        if (Number.isNaN(clearance)) {
          expect(
            Math.abs(spot.position.x - p.x) < 1.2 + 0.35 &&
              Math.abs(spot.position.z - p.z) < 0.4 + 0.35,
          ).toBe(false);
        } else {
          expect(
            Math.hypot(spot.position.x - p.x, spot.position.z - p.z),
          ).toBeGreaterThanOrEqual(clearance);
        }
      }
    }
  });
  it("derives kinds from the place features and stays inside the square bounds", () => {
    const bare = placeForageSpots(
      place({ props: [], ground: { shape: "square", size: 40, color: "#000000" } }),
    );
    expect(bare.length).toBeGreaterThan(0);
    for (const spot of bare) {
      expect(["petal", "pebble"]).toContain(spot.kind);
      expect(Math.abs(spot.position.x)).toBeLessThan(17);
      expect(Math.abs(spot.position.z)).toBeLessThan(17);
    }
    const kinds = new Set(placeForageSpots(place()).map((s) => s.kind));
    expect(kinds).toContain("pinecone");
    expect(kinds).toContain("shell");
  });
});
