import type { IslandEntity, PlaceConfig } from "@island/contracts";
import type { Obstacle } from "@island/world-core";
import {
  gardenGreenhouse,
  homeFeatures,
  labFeatures,
  libraryFeatures,
  mountainFeatures,
  nurseryFeatures,
  random,
  starlightFeatures,
} from "@island/world-core";

/**
 * Object "surface attributes": everything the walking player can bump into
 * or stand on. One table per source — entity kinds, each scene's static
 * structures, published-place props — all expressed as circles with an
 * optional standable top (standY).
 */

/** The island's scattered mountain rocks, regenerated from the same seed
 *  the Districts renderer uses so the colliders match the visuals. */
function islandRocks(): Obstacle[] {
  const rng = random(562);
  return Array.from({ length: 16 }, () => {
    const x = -40 + rng() * 90,
      z = -72 - rng() * 19,
      size = 1.8 + rng() * 3;
    return { x, z, r: size * 0.8 };
  });
}

/** Static structures per scene, from the same feature tables the scenes
 *  and placement rules use. standY marks jump-on-able tops. */
const sceneStatics: Record<string, Obstacle[]> = {
  island: [
    // The well and the arbor on the plaza lawn.
    { x: -28, z: 27, r: 1.5 },
    { x: -28, z: 38, r: 3.2 },
    // The fenced beds along the south lawn (fence runs, two circles each).
    { x: -53, z: 50, r: 2.6 },
    { x: -43, z: 50, r: 2.6 },
    { x: -3, z: 51, r: 2.6 },
    { x: -13, z: 51, r: 2.6 },
    { x: -34, z: 63, r: 2.6 },
    { x: -24, z: 63, r: 2.6 },
    { x: -10, z: 63, r: 2.6 },
    { x: 0, z: 63, r: 2.6 },
    ...islandRocks(),
  ],
  meadow: [{ x: 24, z: -12, r: 2 }],
  garden: [
    { x: gardenGreenhouse.x, z: gardenGreenhouse.z, r: 9.5 },
    // The stump tea table and its two crates: jump onto a crate, then up.
    { x: -17, z: -10, r: 1.3, standY: 1.75 },
    { x: -20.5, z: -10, r: 1.1, standY: 1.6 },
    { x: -13.5, z: -10, r: 1.1, standY: 1.6 },
  ],
  home: [
    ...homeFeatures.cabins.map((c) => ({
      x: c.x,
      z: c.z,
      r: Math.max(c.w, c.d) / 2 + 0.5,
    })),
    { x: homeFeatures.well.x, z: homeFeatures.well.z, r: 1.3 },
  ],
  library: [
    { x: libraryFeatures.pavilion.x, z: libraryFeatures.pavilion.z, r: 5.5 },
    { x: libraryFeatures.table.x, z: libraryFeatures.table.z, r: 2.2, standY: 0.72 },
    ...libraryFeatures.lamps.map((l) => ({ x: l.x, z: l.z, r: 0.6 })),
  ],
  lab: [
    ...labFeatures.benches.map((b) => ({ x: b.x, z: b.z, r: 2.2, standY: 0.78 })),
    { x: labFeatures.armillary.x, z: labFeatures.armillary.z, r: 1.7 },
    { x: labFeatures.dome.x, z: labFeatures.dome.z, r: 4.6 },
    ...labFeatures.beds.map((b) => ({ x: b.x, z: b.z, r: 2 })),
  ],
  nursery: [
    {
      x: nurseryFeatures.greenhouse.x,
      z: nurseryFeatures.greenhouse.z,
      r: Math.max(nurseryFeatures.greenhouse.w, nurseryFeatures.greenhouse.d) / 2 + 1,
    },
    ...nurseryFeatures.beds.map((b) => ({ x: b.x, z: b.z, r: 1.6 })),
    { x: nurseryFeatures.barrel.x, z: nurseryFeatures.barrel.z, r: 1 },
  ],
  mountain: [
    { x: mountainFeatures.platform.x, z: mountainFeatures.platform.z, r: 5.2 },
    { x: mountainFeatures.bench.x, z: mountainFeatures.bench.z, r: 1, standY: 0.45 },
  ],
  starlight: [
    { x: starlightFeatures.cave.x, z: starlightFeatures.cave.z, r: 2.6 },
    ...starlightFeatures.stones.map((s) => ({ x: s.x, z: s.z, r: 1.1, standY: 0.55 })),
  ],
};

/** User-placed entities: flowers are soft, trees block, benches hold you. */
const entitySurfaces: Record<IslandEntity["kind"], Obstacle | null> = {
  tree: { x: 0, z: 0, r: 0.55 },
  bench: { x: 0, z: 0, r: 0.95, standY: 0.45 },
  flower: null,
};

/** Everything the walking player should not pass through in one scene. */
export function obstaclesFor(
  scene: string,
  entities: IslandEntity[],
  place?: PlaceConfig,
): Obstacle[] {
  const list: Obstacle[] = [...(sceneStatics[scene] ?? [])];
  for (const e of entities) {
    const surface = entitySurfaces[e.kind];
    if (surface) list.push({ ...surface, x: e.x, z: e.z });
  }
  if (place)
    for (const p of place.props) {
      if (p.kind === "tree") list.push({ x: p.x, z: p.z, r: 0.55 });
      else if (p.kind === "bench")
        list.push({ x: p.x, z: p.z, r: 0.95, standY: 0.45 });
      else if (p.kind === "rock")
        list.push({ x: p.x, z: p.z, r: 1.1 * p.scale, standY: 0.55 * p.scale });
      else if (p.kind === "lamp") list.push({ x: p.x, z: p.z, r: 0.35 });
    }
  return list;
}
