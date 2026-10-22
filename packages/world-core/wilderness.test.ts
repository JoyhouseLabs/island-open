import { describe, expect, it } from "vitest";
import {
  CAMP,
  chunkAt,
  chunkKey,
  generateWildChunk,
  wildHeight,
  wildVertexHeight,
  wildRing,
  wildBlocked,
  WildStream,
} from "./src/wilderness";
describe("wilderness generation v1", () => {
  it("is repeatable after eviction and changes with seed", () => {
    const c = { x: -12, z: 83 },
      a = generateWildChunk(717, c);
    expect(generateWildChunk(717, c)).toEqual(a);
    expect(generateWildChunk(718, c)).not.toEqual(a);
    expect(a.props.length).toBeLessThanOrEqual(144);
  });
  it("normalizes negative boundaries", () => {
    expect(chunkAt(-0.01, -96)).toEqual({ x: -1, z: -1 });
    expect(chunkAt(96, -96.01)).toEqual({ x: 1, z: -2 });
  });
  it("samples rendered triangles continuously across every chunk edge", () => {
    for (const edge of [-960, -96, 0, 96, 960])
      for (let t = -96; t <= 96; t += 3) {
        expect(
          Math.abs(
            wildHeight(717, edge - 1e-7, t) - wildHeight(717, edge + 1e-7, t),
          ),
        ).toBeLessThan(1e-6);
        expect(
          Math.abs(
            wildHeight(717, t, edge - 1e-7) - wildHeight(717, t, edge + 1e-7),
          ),
        ).toBeLessThan(1e-6);
      }
    expect(wildHeight(717, 6, 12)).toBe(wildVertexHeight(717, 6, 12));
  });
  it("keeps the camp and continuous trail unobstructed", () => {
    for (let z = -500; z < 500; z++)
      expect(
        wildBlocked(generateWildChunk(717, chunkAt(CAMP.x, z)), CAMP.x, z),
      ).toBe(false);
  });
  it("keeps resident chunks and pending work bounded during long travel and reversal", () => {
    const s = new WildStream();
    for (let x = -200; x <= 200; x++) {
      s.focus({ x, z: -x });
      while (s.tick(717)) expect(s.chunks.size).toBeLessThanOrEqual(25);
      expect([...s.chunks.keys()].sort()).toEqual(
        wildRing({ x, z: -x }).map(chunkKey).sort(),
      );
    }
    s.focus({ x: 0, z: 0 });
    s.tick(717);
    s.focus({ x: -1, z: 0 });
    expect(s.waiting + s.chunks.size).toBe(25);
    while (s.tick(717)) {
      /* drain */
    }
    expect(s.chunks.get("0,0")).toEqual(generateWildChunk(717, { x: 0, z: 0 }));
  });
});
