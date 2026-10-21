import type { PlaceConfig } from "@island/contracts";
import { walkSpecs, type WalkSpec } from "@island/world-core";

/** Every published place is addressed by the scene key "place-<id>". */
export const placeSceneId = (id: string) => `place-${id}`;

const specs = new Map<string, WalkSpec>();

/** Flat walk spec for one place: its ground shape minus the pond, and a
 *  single doorway home. Registered when the content feed arrives. */
export function placeWalkSpec(config: PlaceConfig): WalkSpec {
  const { size, shape } = config.ground,
    half = size / 2 - 1.5;
  const pond = config.props.find((p) => p.kind === "pond");
  return {
    spawn: { x: 0, z: Math.round(size * 0.25) },
    walkable: (x, z) => {
      const inside =
        shape === "disc"
          ? Math.hypot(x, z) < half
          : Math.abs(x) < half && Math.abs(z) < half;
      if (!inside) return false;
      return pond
        ? Math.hypot(x - pond.x, z - pond.z) >= 3 + pond.scale * 2.5
        : true;
    },
    height: () => 0,
    gates: [{ x: 0, z: half - 0.5, radius: 3.2, dest: "island" }],
  };
}

export function registerPlaces(places: PlaceConfig[]) {
  specs.clear();
  for (const place of places)
    specs.set(placeSceneId(place.id), placeWalkSpec(place));
}

/** Built-in scenes come from world-core; places from the registry above. */
export function specFor(scene: string): WalkSpec {
  return (
    walkSpecs[scene as keyof typeof walkSpecs] ??
    specs.get(scene) ??
    walkSpecs.island
  );
}
