import type { IslandEntity, PlaceProp } from "@island/contracts";
import { gardenGreenhouse } from "./garden.js";
import { tableTops } from "./furniture.js";
import { random } from "./random.js";
import type { Obstacle } from "./physics.js";
import {
  entitySurfaces,
  placePropSurfaces,
  surfaceObstacle,
} from "./surfaces.js";
import {
  beachFeatures,
  homeFeatures,
  labFeatures,
  libraryFeatures,
  meadowFeatures,
  mountainFeatures,
  nurseryFeatures,
  starlightFeatures,
} from "./scenes.js";

/** Static scene structures: one table per scene saying what stands there
 *  AND what it does to the walking player. Renderers position the visuals
 *  from the same named exports the colliders are derived from, so what you
 *  see is what blocks you — hand-copied coordinates are how this drifts.
 *
 *  Only things that block (or are surprisingly walkable) belong here: soft
 *  scenery — grass tufts, flower-bed borders, reeds, cabin plinths, picnic
 *  mats, the beach dock — needs no entry and stays walkable by default. */
export type SceneStatic = {
  kind: string;
  x: number;
  z: number;
  /** Present only on deliberately walkable entries kept for documentation. */
  pass?: "through";
  r?: number;
  halfSize?: { x: number; z: number };
  standY?: number;
};

/** Island plaza and landmark props, shared by Districts.tsx and the
 *  colliders below. */
export const islandStatics = {
  well: { x: -28, z: 27 },
  arbor: { x: -28, z: 38, postOffset: 2.8 },
  fences: [
    { x: -53, z: 50, length: 22, rotation: Math.PI / 2 },
    { x: -3, z: 51, length: 20, rotation: Math.PI / 2 },
    { x: -42, z: 63, length: 19, rotation: 0 },
    { x: -14, z: 63, length: 19, rotation: 0 },
  ],
  picnicMat: { x: 18, z: 72, rotation: -0.22 },
  shed: { x: 74, z: 45 },
  arch: { x: 86, z: 56, rotation: -0.3, postOffset: 3.5 },
} as const;

/** The crate beside the picnic mat, resolved to world space once so the
 *  renderer and the collider share one position. */
export const picnicCrate = (() => {
  const { x, z, rotation } = islandStatics.picnicMat,
    dx = 2,
    dz = 1;
  return {
    x: x + dx * Math.cos(rotation) + dz * Math.sin(rotation),
    z: z - dx * Math.sin(rotation) + dz * Math.cos(rotation),
  };
})();

/** The island's scattered mountain rocks: one seeded stream feeds both the
 *  Districts renderer and the colliders, so they can never disagree. */
export function islandRocks(): { x: number; z: number; size: number }[] {
  const rng = random(562);
  return Array.from({ length: 16 }, () => {
    const x = -40 + rng() * 90,
      z = -72 - rng() * 19,
      size = 1.8 + rng() * 3;
    return { x, z, size };
  });
}

/** The stump tea nook in the garden: table plus two step-up crates. */
export const gardenTeaNook = {
  table: { x: -17, z: -10 },
  crateOffset: 3.5,
} as const;

/** A fence run blocks along its whole length; the posts every 2 units are
 *  visual rhythm, not gaps to squeeze through. */
function fenceRun(f: {
  x: number;
  z: number;
  length: number;
  rotation: number;
}): SceneStatic {
  const across = Math.abs(Math.sin(f.rotation)) > 0.5;
  return {
    kind: "fence",
    x: f.x,
    z: f.z,
    halfSize: across
      ? { x: 0.35, z: f.length / 2 }
      : { x: f.length / 2, z: 0.35 },
  };
}

const archPosts = ([-1, 1] as const).map((s) => {
  const { x, z, rotation, postOffset } = islandStatics.arch;
  return {
    kind: "arch-post",
    x: x + s * postOffset * Math.cos(rotation),
    z: z - s * postOffset * Math.sin(rotation),
    r: 0.5,
  };
});

export const sceneStatics: Record<string, SceneStatic[]> = {
  island: [
    { kind: "well", x: islandStatics.well.x, z: islandStatics.well.z, r: 2.1 },
    // Posts only: the arbor is a pergola, meant to be walked beneath.
    {
      kind: "arbor-post",
      x: islandStatics.arbor.x - islandStatics.arbor.postOffset,
      z: islandStatics.arbor.z,
      r: 0.45,
    },
    {
      kind: "arbor-post",
      x: islandStatics.arbor.x + islandStatics.arbor.postOffset,
      z: islandStatics.arbor.z,
      r: 0.45,
    },
    ...islandStatics.fences.map(fenceRun),
    { kind: "picnic-crate", ...picnicCrate, r: 0.65, standY: 1.35 },
    {
      kind: "shed",
      x: islandStatics.shed.x,
      z: islandStatics.shed.z,
      halfSize: { x: 1.7, z: 1.0 },
    },
    ...archPosts,
    ...islandRocks().map((rock) => ({
      kind: "rock",
      x: rock.x,
      z: rock.z,
      r: rock.size * 0.8,
    })),
  ],
  meadow: [
    // The hammock slung between two anchor trees.
    {
      kind: "hammock",
      x: (meadowFeatures.hammock.x1 + meadowFeatures.hammock.x2) / 2,
      z: meadowFeatures.hammock.z,
      r: 2,
    },
  ],
  garden: [
    {
      kind: "greenhouse",
      x: gardenGreenhouse.x,
      z: gardenGreenhouse.z,
      halfSize: {
        x: gardenGreenhouse.w / 2 + 0.5,
        z: gardenGreenhouse.d / 2 + 0.5,
      },
    },
    {
      kind: "tea-table",
      x: gardenTeaNook.table.x,
      z: gardenTeaNook.table.z,
      r: tableTops.garden.r,
      standY: tableTops.garden.standY,
    },
    ...([-1, 1] as const).map((s) => ({
      kind: "crate",
      x: gardenTeaNook.table.x + s * gardenTeaNook.crateOffset,
      z: gardenTeaNook.table.z,
      halfSize: { x: 0.9, z: 0.9 },
      standY: 1.6,
    })),
  ],
  home: [
    ...homeFeatures.cabins.map((c) => ({
      kind: "cabin",
      x: c.x,
      z: c.z,
      halfSize: { x: c.w / 2 + 0.5, z: c.d / 2 + 0.5 },
    })),
    { kind: "well", x: homeFeatures.well.x, z: homeFeatures.well.z, r: 1.3 },
  ],
  library: [
    {
      kind: "pavilion",
      x: libraryFeatures.pavilion.x,
      z: libraryFeatures.pavilion.z,
      r: 5.5,
    },
    {
      kind: "table",
      x: libraryFeatures.table.x,
      z: libraryFeatures.table.z,
      r: tableTops.library.r,
      halfSize: tableTops.library.halfSize,
      standY: tableTops.library.standY,
    },
    ...libraryFeatures.lamps.map((l) => ({
      kind: "lamp",
      x: l.x,
      z: l.z,
      r: 0.6,
    })),
  ],
  lab: [
    ...labFeatures.benches.map((b) => ({
      kind: "bench",
      x: b.x,
      z: b.z,
      r: tableTops.lab.r,
      halfSize: tableTops.lab.halfSize,
      standY: tableTops.lab.standY,
    })),
    {
      kind: "armillary",
      x: labFeatures.armillary.x,
      z: labFeatures.armillary.z,
      r: 1.7,
    },
    { kind: "dome", x: labFeatures.dome.x, z: labFeatures.dome.z, r: 4.6 },
    ...labFeatures.beds.map((b) => ({
      kind: "bed",
      x: b.x,
      z: b.z,
      r: 2,
    })),
  ],
  nursery: [
    {
      kind: "greenhouse",
      x: nurseryFeatures.greenhouse.x,
      z: nurseryFeatures.greenhouse.z,
      halfSize: {
        x: nurseryFeatures.greenhouse.w / 2 + 1,
        z: nurseryFeatures.greenhouse.d / 2 + 1,
      },
    },
    ...nurseryFeatures.beds.map((b) => ({
      kind: "bed",
      x: b.x,
      z: b.z,
      r: 1.6,
    })),
    {
      kind: "barrel",
      x: nurseryFeatures.barrel.x,
      z: nurseryFeatures.barrel.z,
      r: 1,
    },
  ],
  mountain: [
    // The summit deck; the trail bench is a generated entity and brings
    // its own collider from entitySurfaces.
    {
      kind: "platform",
      x: mountainFeatures.platform.x,
      z: mountainFeatures.platform.z,
      halfSize: { x: 5.2, z: 4.2 },
    },
  ],
  starlight: [
    { kind: "cave", x: starlightFeatures.cave.x, z: starlightFeatures.cave.z, r: 2.6 },
    ...starlightFeatures.stones.map((s) => ({
      kind: "stone",
      x: s.x,
      z: s.z,
      r: 1.1,
      standY: 0.55,
    })),
  ],
  beach: [
    // The umbrella pole and canopy shade; the dock and shells stay walkable.
    {
      kind: "umbrella",
      x: beachFeatures.umbrella.x,
      z: beachFeatures.umbrella.z,
      r: 0.45,
    },
    {
      kind: "driftwood",
      x: beachFeatures.driftwood.x,
      z: beachFeatures.driftwood.z,
      r: 2.3,
    },
    ...beachFeatures.palms.map((p) => ({
      kind: "palm",
      x: p.x,
      z: p.z,
      r: 0.55,
    })),
  ],
};

/** Colliders for one scene's static structures. */
export function staticObstacles(scene: string): Obstacle[] {
  return (sceneStatics[scene] ?? [])
    .filter((s) => s.pass !== "through")
    .map((s) => ({
      x: s.x,
      z: s.z,
      r: s.r ?? 0,
      ...(s.halfSize ? { halfSize: s.halfSize } : {}),
      ...(s.standY !== undefined ? { standY: s.standY } : {}),
    }));
}

/** Everything the walking player should not pass through in one scene:
 *  the scene's static structures, the world entities and, for published
 *  places, the place props — all resolved through the surface registry. */
export function walkObstacles(
  scene: string,
  entities: Pick<IslandEntity, "kind" | "x" | "z">[],
  place?: { props: PlaceProp[] },
): Obstacle[] {
  const list: Obstacle[] = staticObstacles(scene);
  for (const e of entities) {
    const o = surfaceObstacle(entitySurfaces[e.kind], e.x, e.z);
    if (o) list.push(o);
  }
  if (place)
    for (const p of place.props) {
      const o = surfaceObstacle(
        placePropSurfaces[p.kind],
        p.x,
        p.z,
        p.scale ?? 1,
      );
      if (o) list.push(o);
    }
  return list;
}
