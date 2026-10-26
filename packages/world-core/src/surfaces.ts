import type {
  FurnitureDefinition,
  IslandEntity,
  PlaceProp,
} from "@island/contracts";
import type { Obstacle } from "./physics.js";

/** How the walking player interacts with a kind of thing.
 *
 *  One registry per kind domain (world entities, place props, furniture
 *  shapes): every consumer resolves the kind here instead of re-deciding —
 *  and quietly forgetting — passability at each call site. Adding a kind to
 *  the contracts breaks these Records at compile time until it is
 *  registered, so "walks straight through" can never again be the default
 *  accident. */
export type SurfaceProfile = {
  /** "solid" pushes the player out of the footprint; "through" never blocks. */
  pass: "solid" | "through";
  /** Blocking radius for round things (trunks, poles, rocks). */
  r?: number;
  /** Half extents for rectangular things (benches, tables, fence runs). */
  halfSize?: { x: number; z: number };
  /** Top height above the local ground when the thing can be jumped or
   *  climbed onto; the footprint stops blocking once the player is on top. */
  standY?: number;
};

/** Raised-bench geometry, shared by the seat interaction, the collision
 *  boxes and the walk surface. Mirrors the Bench renderer in Plants.tsx:
 *  seat top at 1.575, backrest solid up to 2.9, seat 4 long and 1.4 deep. */
export const benchGeometry = {
  seatY: 1.575,
  backTopY: 2.9,
  halfLength: 2,
  halfWidth: 0.78,
  seatHalfDepth: 0.7,
  backInnerZ: 0.525,
  backOuterZ: 0.775,
} as const;

/** Entities placed in the world snapshot (island and sub-scenes). */
export const entitySurfaces: Record<IslandEntity["kind"], SurfaceProfile> = {
  // Trunk only: the canopy is overhead and never blocks.
  tree: { pass: "solid", r: 0.55 },
  // The full seat footprint; standing and sitting happen at the seat surface.
  bench: {
    pass: "solid",
    halfSize: { x: benchGeometry.halfLength, z: benchGeometry.seatHalfDepth },
    standY: benchGeometry.seatY,
  },
  // Soft underfoot: flowers never block.
  flower: { pass: "through" },
};

/** Props inside published places; footprints and stand heights scale with
 *  the prop's own scale. */
export const placePropSurfaces: Record<PlaceProp["kind"], SurfaceProfile> = {
  tree: entitySurfaces.tree,
  bench: entitySurfaces.bench,
  rock: { pass: "solid", r: 1.1, standY: 0.55 },
  lamp: { pass: "solid", r: 0.35 },
  flower: entitySurfaces.flower,
  // Place ponds are visual water; the place's own ground shape defines the
  // actual shoreline the player cannot cross.
  pond: { pass: "through" },
};

/** Shop furniture, by shape. Footprints come from each catalog item's own
 *  width and depth; the registry decides only whether the shape blocks. */
export const furnitureSurfaces: Record<
  FurnitureDefinition["shape"],
  SurfaceProfile
> = {
  chair: { pass: "solid" },
  table: { pass: "solid" },
  sofa: { pass: "solid" },
  stool: { pass: "solid" },
  // Laid flat on the ground: walk and picnic across it.
  rug: { pass: "through" },
  lamp: { pass: "solid" },
  pot: { pass: "solid" },
  fence: { pass: "solid" },
  birdhouse: { pass: "solid" },
};

/** Turn a profile at a position into a walking obstacle, scaling the
 *  footprint and the stand height together. Through-profiles return null:
 *  deliberately walkable things get no collider at all. */
export function surfaceObstacle(
  profile: SurfaceProfile,
  x: number,
  z: number,
  scale = 1,
): Obstacle | null {
  if (profile.pass === "through") return null;
  const o: Obstacle = { x, z, r: (profile.r ?? 0) * scale };
  if (profile.halfSize)
    o.halfSize = {
      x: profile.halfSize.x * scale,
      z: profile.halfSize.z * scale,
    };
  if (profile.standY !== undefined) o.standY = profile.standY * scale;
  return o;
}
