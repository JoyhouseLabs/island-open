import type { Point } from "./index.js";

export function segmentDistance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    len = dx * dx + dz * dz;
  if (!len) return Math.hypot(p.x - a.x, p.z - a.z);
  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len),
  );
  return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz);
}

export function pathDistance(p: Point, path: Point[], closed = true) {
  let nearest = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const d = segmentDistance(p, path[i]!, path[i + 1]!);
    if (d < nearest) nearest = d;
  }
  if (closed) {
    const d = segmentDistance(p, path[path.length - 1]!, path[0]!);
    if (d < nearest) nearest = d;
  }
  return nearest;
}
