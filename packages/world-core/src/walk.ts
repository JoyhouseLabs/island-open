import type { SubSceneId } from "@island/contracts";
import type { Point } from "./index.js";
import {
  groundHeight,
  homeFeatures,
  island,
  labFeatures,
  landmarks,
  libraryFeatures,
  meadowFeatures,
  mountainFeatures,
  mountainHeight,
  nurseryFeatures,
  pondFeatures,
  radial,
  shoreline,
  starlightFeatures,
  subScenes,
  beachLagoon,
  beachShore,
} from "./index.js";

export type Gate = {
  x: number;
  z: number;
  radius: number;
  dest: SubSceneId | "island";
};
export type WalkSpec = {
  spawn: Point;
  walkable(x: number, z: number): boolean;
  height(x: number, z: number): number;
  gates: Gate[];
};

const rect = (x: number, z: number, hw: number, hd: number) =>
  Math.abs(x) < hw && Math.abs(z) < hd;
const disc = (x: number, z: number, cx: number, cz: number, r: number) =>
  Math.hypot(x - cx, z - cz) < r;
const roomGate = (z: number): Gate[] => [
  { x: 0, z, radius: 3.2, dest: "island" },
];

/** Island gates are computed lazily: index.js is still loading when this
 *  module first runs, so touching `landmarks` at import time would break. */
let cachedIslandGates: Gate[] | null = null;
function islandGateList(): Gate[] {
  if (cachedIslandGates) return cachedIslandGates;
  const gates: Gate[] = [];
  for (const def of Object.values(subScenes) as {
    id: SubSceneId;
    landmark: string;
  }[]) {
    const spot = landmarks.find((l) => l.id === def.landmark);
    if (spot) gates.push({ x: spot.x, z: spot.z, radius: 7.5, dest: def.id });
  }
  cachedIslandGates = gates;
  return gates;
}

export const walkSpecs: Record<"island" | SubSceneId, WalkSpec> = {
  island: {
    spawn: { x: 0, z: 82 },
    // Walkable to the shoreline's wet-sand edge so the whole beach ring is
    // reachable; the lapping sea (radial past `shoreline`) stays off limits.
    walkable: (x, z) =>
      radial(x, z) <
        shoreline(Math.atan2(z / island.radiusZ, x / island.radiusX)) - 0.015 &&
      Math.hypot((x - 52) / 26, (z + 28) / 21) >= 1 &&
      ![
        [-28, 7],
        [-48, 24],
        [-9, 25],
        [-80, 3],
        [72, 6],
      ].some(([bx, bz]) => disc(x, z, bx!, bz!, 9)),
    height: groundHeight,
    get gates() {
      return islandGateList();
    },
  },
  garden: {
    spawn: { x: 0, z: 30 },
    walkable: (x, z) =>
      Math.abs(x) <= 38 &&
      Math.abs(z) <= 33 &&
      Math.hypot((x - 23) / 13, (z + 10) / 11) >= 1,
    height: () => 0,
    gates: roomGate(35),
  },
  home: {
    spawn: { x: 0, z: 22 },
    walkable: (x, z) =>
      Math.abs(x) <= 34 &&
      Math.abs(z) <= 28 &&
      !homeFeatures.cabins.some((c) =>
        rect(x - c.x, z - c.z, c.w / 2 + 1, c.d / 2 + 1),
      ) &&
      !disc(x, z, homeFeatures.well.x, homeFeatures.well.z, 2.6),
    height: () => 0,
    gates: roomGate(homeFeatures.gate),
  },
  meadow: {
    spawn: { x: 0, z: 25 },
    walkable: (x, z) => Math.abs(x) <= 40 && Math.abs(z) <= 34,
    height: () => 0,
    gates: roomGate(meadowFeatures.gate),
  },
  forest: {
    spawn: { x: 0, z: 27 },
    walkable: (x, z) => Math.abs(x) <= 44 && Math.abs(z) <= 38,
    height: () => 0,
    gates: roomGate(34),
  },
  library: {
    spawn: { x: 0, z: 23 },
    walkable: (x, z) => Math.abs(x) <= 36 && Math.abs(z) <= 30,
    height: () => 0,
    gates: roomGate(libraryFeatures.gate),
  },
  pond: {
    spawn: { x: 0, z: 27 },
    walkable: (x, z) =>
      Math.abs(x) <= 42 &&
      Math.abs(z) <= 36 &&
      (Math.hypot(x / 22.5, (z + 6) / 17.5) >= 1 ||
        (Math.abs(z + 6) < 1.7 && x > 7 && x < 21)),
    height: (x, z) => {
      if (Math.abs(z + 6) < 1.7 && x > 7 && x < 21)
        return Math.sin(((x - 7) / 14) * Math.PI) * 1.1;
      return 0;
    },
    gates: roomGate(pondFeatures.gate),
  },
  lab: {
    spawn: { x: 0, z: 24 },
    walkable: (x, z) =>
      Math.abs(x) <= 38 &&
      Math.abs(z) <= 32 &&
      !labFeatures.benches.some((b) => disc(x, z, b.x, b.z, 5)) &&
      !disc(x, z, labFeatures.armillary.x, labFeatures.armillary.z, 4.5) &&
      !disc(x, z, labFeatures.dome.x, labFeatures.dome.z, 5.6),
    height: () => 0,
    gates: roomGate(labFeatures.gate),
  },
  nursery: {
    spawn: { x: 0, z: 24 },
    walkable: (x, z) =>
      Math.abs(x) <= 40 &&
      Math.abs(z) <= 32 &&
      !rect(
        x,
        z,
        nurseryFeatures.greenhouse.w / 2 + 1,
        nurseryFeatures.greenhouse.d / 2 + 1,
      ),
    height: () => 0,
    gates: roomGate(nurseryFeatures.gate),
  },
  mountain: {
    spawn: { x: 0, z: 27 },
    walkable: (x, z) =>
      Math.hypot(x / 41, z / 35) <= 1 &&
      Math.hypot(x / 6.2, (z - mountainFeatures.platform.z) / 5.2) >= 1,
    height: mountainHeight,
    gates: roomGate(mountainFeatures.gate),
  },
  starlight: {
    // South of the altar, clear of the cave mouth's dark backdrop.
    spawn: { x: 0, z: 10 },
    walkable: (x, z) =>
      Math.hypot(x / 33, z / 29) <= 0.96 &&
      !disc(x, z, 0, 0, 4.2) &&
      !starlightFeatures.stones.some((s) => disc(x, z, s.x, s.z, 2.2)),
    height: () => 0,
    gates: [{ x: 0, z: 27, radius: 3.4, dest: "island" }],
  },
  beach: {
    spawn: { x: 0, z: 28 },
    walkable: (x, z) =>
      Math.hypot(x, z) <= beachShore.r &&
      Math.hypot(x - beachLagoon.x, z - beachLagoon.z) >= beachLagoon.r + 1,
    height: () => 0,
    gates: roomGate(34),
  },
};
