import type { Obstacle } from "./physics.js";

/** Rendered tops and walking surfaces share dimensions and heights. */
export const tableTops = {
  garden: { r: 2.5, standY: 1.75, thickness: 0.3 },
  library: {
    r: 1.3,
    halfSize: { x: 1.3, z: 0.8 },
    standY: 0.84,
    thickness: 0.18,
  },
  lab: { r: 4.3, halfSize: { x: 4.3, z: 1.8 }, standY: 1.675, thickness: 0.35 },
} satisfies Record<string, Omit<Obstacle, "x" | "z"> & { thickness: number }>;
