/** Shared player-physics primitives: push-out against round or rectangular obstacles,
 *  standable surface lookup and a little climb assist. Pure and tested so
 *  the walking controller stays thin. */

export type Obstacle = {
  x: number;
  z: number;
  /** Blocking radius; the player is pushed out to r + playerR. */
  r: number;
  /** Axis-aligned rectangular footprint, when the surface is not circular. */
  halfSize?: { x: number; z: number };
  /** Top surface height when the thing can be jumped or climbed onto. */
  standY?: number;
};

/** Signed distance to the footprint: negative inside, positive outside. */
function surfaceDistance(x: number, z: number, o: Obstacle): number {
  if (!o.halfSize) return Math.hypot(x - o.x, z - o.z) - o.r;
  const dx = Math.abs(x - o.x) - o.halfSize.x;
  const dz = Math.abs(z - o.z) - o.halfSize.z;
  return (
    Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0)
  );
}

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
    if (o.halfSize) {
      const dx = x - o.x,
        dz = z - o.z;
      const nearX = Math.max(-o.halfSize.x, Math.min(o.halfSize.x, dx));
      const nearZ = Math.max(-o.halfSize.z, Math.min(o.halfSize.z, dz));
      const dist = Math.hypot(dx - nearX, dz - nearZ);
      if (dist > 0 && dist < playerR) {
        x = o.x + nearX + ((dx - nearX) / dist) * playerR;
        z = o.z + nearZ + ((dz - nearZ) / dist) * playerR;
      } else if (dist === 0) {
        if (o.halfSize.x - Math.abs(dx) < o.halfSize.z - Math.abs(dz))
          x = o.x + (dx < 0 ? -1 : 1) * (o.halfSize.x + playerR);
        else z = o.z + (dz < 0 ? -1 : 1) * (o.halfSize.z + playerR);
      }
      continue;
    }
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
      surfaceDistance(x, z, o) <= 0
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
  if (alreadyMantled || vy > 1.2) return { vy, mantled: alreadyMantled };
  for (const o of obstacles) {
    if (o.standY === undefined) continue;
    if (surfaceDistance(x, z, o) > 0.45) continue;
    if (y >= o.standY - 0.75 && y < o.standY - 0.02)
      // Enough lift to clear the remaining height under the controller's gravity.
      return {
        vy: Math.max(vy, Math.sqrt(44 * (o.standY - y + 0.22))),
        mantled: true,
      };
  }
  return { vy, mantled: alreadyMantled };
}

/** Landing uses the same footprint as standing, avoiding phantom ledges.
 *  The previous height catches crossings even on a slow frame. */
export function landingY(
  x: number,
  z: number,
  base: number,
  obstacles: Obstacle[],
  feetY: number,
  previousFeetY = feetY,
): number {
  let top = base;
  for (const o of obstacles)
    if (
      o.standY !== undefined &&
      previousFeetY >= o.standY - 0.05 &&
      surfaceDistance(x, z, o) <= 0
    )
      top = Math.max(top, o.standY);
  return top;
}
