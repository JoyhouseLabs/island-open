/** Shared player-physics primitives: circle push-out against obstacles,
 *  standable surface lookup and a little climb assist. Pure and tested so
 *  the walking controller stays thin. */

export type Obstacle = {
  x: number;
  z: number;
  /** Blocking radius; the player is pushed out to r + playerR. */
  r: number;
  /** Top surface height when the thing can be jumped or climbed onto. */
  standY?: number;
};

/** Push the player out of solid obstacles. An obstacle with a standY stops
 *  blocking once the player is at (or above, mid-jump) its top surface —
 *  otherwise you could never land on a bench, only bounce off its side. */
export function pushOut(
  x: number,
  z: number,
  y: number,
  obstacles: Obstacle[],
  playerR: number,
): { x: number; z: number } {
  for (const o of obstacles) {
    if (o.r <= 0) continue;
    if (o.standY !== undefined && y >= o.standY - 0.05) continue;
    const dx = x - o.x,
      dz = z - o.z,
      d = Math.hypot(dx, dz),
      min = o.r + playerR;
    if (d < min) {
      if (d < 1e-4) x = o.x + min;
      else {
        x = o.x + (dx / d) * min;
        z = o.z + (dz / d) * min;
      }
    }
  }
  return { x, z };
}

/** The highest surface under the player: terrain plus any standable top
 *  whose height the feet have already reached (so benches catch a fall). */
export function supportY(
  x: number,
  z: number,
  base: number,
  obstacles: Obstacle[],
  feetY: number,
): number {
  let top = base;
  for (const o of obstacles)
    if (
      o.standY !== undefined &&
      feetY + 0.05 >= o.standY &&
      Math.hypot(x - o.x, z - o.z) < o.r
    )
      top = Math.max(top, o.standY);
  return top;
}

/** Climb assist: jumping against a standable top you can almost reach
 *  gives one small upward boost, so kids can mantle crates and platforms. */
export function mantleBoost(
  vy: number,
  x: number,
  z: number,
  y: number,
  obstacles: Obstacle[],
  alreadyMantled: boolean,
): { vy: number; mantled: boolean } {
  if (alreadyMantled || vy > 0.5) return { vy, mantled: alreadyMantled };
  for (const o of obstacles) {
    if (o.standY === undefined) continue;
    if (Math.hypot(x - o.x, z - o.z) > o.r + 0.4) continue;
    if (y >= o.standY - 0.55 && y < o.standY - 0.02)
      return { vy: Math.max(vy, 3.4), mantled: true };
  }
  return { vy, mantled: alreadyMantled };
}

/** Landing check while falling: a generous rim so a running jump that is
 *  merely near the seat still settles onto it (supportY stays strict for
 *  standing, so nobody hovers on air beside the bench). */
export function landingY(
  x: number,
  z: number,
  base: number,
  obstacles: Obstacle[],
  feetY: number,
): number {
  let top = base;
  for (const o of obstacles)
    if (
      o.standY !== undefined &&
      feetY >= o.standY - 0.3 &&
      Math.hypot(x - o.x, z - o.z) < o.r + 0.45
    )
      top = Math.max(top, o.standY);
  return top;
}
