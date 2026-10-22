import type { Point } from "./index.js";

/** Static geography shared by scene authors; no saved-world conversion. */
export const homeFeatures = {
  gate: 27,
  plaza: { x: 0, z: 0, r: 7 },
  well: { x: -9, z: 9 },
  cabins: [
    { id: "main", x: -22, z: -13, w: 12, d: 10 },
    { id: "guest", x: 22, z: -13, w: 10, d: 9 },
    { id: "atelier", x: 0, z: -25, w: 11, d: 9 },
  ],
  laundry: { x1: 10, x2: 18, z: 8 },
} as const;

export const meadowFeatures = {
  gate: 32,
  blanket: { x: -8, z: 8 },
  hammock: { x1: 20, x2: 28, z: -12 },
} as const;

export const forestTrail: Point[] = [
  { x: 0, z: 34 },
  { x: -16, z: 24 },
  { x: -22, z: 6 },
  { x: -12, z: -10 },
  { x: 4, z: -18 },
  { x: 20, z: -10 },
  { x: 24, z: 6 },
  { x: 14, z: 20 },
];

export const pondShape = { x: 0, z: -6, rx: 21, rz: 16 };

export const pondFeatures = {
  gate: 33,
  bridge: { x1: 8, x2: 20, z: -6 },
} as const;

export const labFeatures = {
  gate: 30,
  benches: [
    { x: -14, z: -20 },
    { x: 0, z: -22 },
    { x: 14, z: -20 },
  ],
  armillary: { x: 26, z: -2 },
  dome: { x: 30, z: -18 },
  beds: [
    { x: -16, z: 12 },
    { x: -2, z: 14 },
    { x: 12, z: 12 },
  ],
} as const;

export const starlightFeatures = {
  cave: { x: 0, z: 27 },
  stones: Array.from({ length: 9 }, (_, i) => {
    const a = 0.35 + (i / 9) * Math.PI * 2;
    return {
      x: Math.round(Math.cos(a) * 25.7),
      z: Math.round(Math.sin(a) * 22.6),
    };
  }),
} as const;

export const beachShore = { r: 42 };

export const beachLagoon = { x: 0, z: -30, r: 18 };

export const beachFeatures = {
  gate: 34,
  dock: { x: 3, z1: -8, z2: -28 },
  umbrella: { x: 16, z: 10 },
  driftwood: { x: -20, z: 14 },
  palms: [
    { x: 26, z: 22 },
    { x: -26, z: 20 },
  ],
} as const;
