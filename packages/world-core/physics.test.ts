import { describe, expect, it } from "vitest";
import {
  landingY,
  mantleBoost,
  pushOut,
  supportY,
  type Obstacle,
} from "./src/index";

const bench: Obstacle = { x: 0, z: 0, r: 0.95, standY: 0.45 };
const tree: Obstacle = { x: 5, z: 5, r: 0.55 };

describe("pushOut", () => {
  it("blocks a grounded walk into a bench and into a tree", () => {
    expect(pushOut(0.8, 0, 0, [bench], 0.4).x).toBeCloseTo(1.35);
    const pushed = pushOut(5.2, 5, 0, [tree], 0.4);
    expect(Math.hypot(pushed.x - 5, pushed.z - 5)).toBeCloseTo(0.95);
  });
  it("lets a falling player sink onto the bench instead of ejecting them", () => {
    // The regression: standing on a bench must be possible.
    const landed = pushOut(0.5, 0, 0.45, [bench], 0.4);
    expect(landed.x).toBe(0.5);
  });
  it("still blocks below the surface while rising past it", () => {
    expect(pushOut(0.8, 0, 0.2, [bench], 0.4).x).toBeCloseTo(1.35);
  });
});

describe("supportY", () => {
  it("catches a fall onto the bench once the feet reach seat height", () => {
    expect(supportY(0.3, 0, 0, [bench], 0.6)).toBe(0.45);
    expect(supportY(0.3, 0, 0, [bench], 0.2)).toBe(0);
    expect(supportY(3, 3, 0.1, [bench], 1)).toBe(0.1);
  });
});

describe("mantleBoost", () => {
  const crate = { x: 0, z: 0, r: 1.2, standY: 1.6 };
  it("boosts a jump that almost reaches a crate top", () => {
    const out = mantleBoost(-1, 0.8, 0, 1.2, [crate], false);
    expect(out.mantled).toBe(true);
    expect(out.vy).toBeGreaterThanOrEqual(3.4);
  });
  it("does not fire twice in one jump or when far below", () => {
    expect(mantleBoost(-1, 0.8, 0, 1.2, [crate], true).mantled).toBe(true);
    expect(mantleBoost(-1, 0.8, 0, 0.6, [crate], false).mantled).toBe(false);
    expect(mantleBoost(-1, 5, 5, 1.2, [crate], false).mantled).toBe(false);
  });
});

describe("a full jump onto a bench (integration)", () => {
  it("lands on the seat instead of being ejected mid-fall", () => {
    const obstacles = [bench];
    let x = 2.2,
      z = 0,
      y = 0,
      vy = 7.2;
    const dt = 1 / 60;
    for (let step = 0; step < 240; step++) {
      // Walk toward the bench the whole flight, like a running jump.
      x -= 6 * dt;
      const pushed = pushOut(x, z, y, obstacles, 0.4);
      x = pushed.x;
      vy += -22 * dt;
      y += vy * dt;
      const land = landingY(x, z, 0, obstacles, y);
      if (vy <= 0 && y <= land) {
        y = land;
        vy = 0;
        break;
      }
    }
    expect(Math.abs(x)).toBeLessThan(1.4); // ended over the bench
    expect(y).toBeCloseTo(0.45); // standing ON it
  });
});
