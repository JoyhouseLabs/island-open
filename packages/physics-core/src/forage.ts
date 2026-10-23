import RAPIER from "@dimforge/rapier3d-compat";
import {
  identityQuaternion,
  terrainHeightAt,
  type PhysicsForageSpot,
} from "@island/contracts";
import { forageSceneIds, forageSpots } from "@island/world-core";
import type { PhysicsRuntime } from "./index.js";
import type { PhysicsCharacter } from "./character.js";
import { isCharacterCollider } from "./groups.js";

/** Stable candidates use the scene identity, then the actual shared terrain and solid geometry. */
export function physicalForageSpots(
  runtime: PhysicsRuntime,
): PhysicsForageSpot[] {
  const scene = runtime.scene,
    key = scene.template.id.replace(/^core:/, "");
  if (!forageSceneIds.includes(key)) return [];
  let seed = 2166136261;
  for (const c of scene.id) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619);
  return forageSpots(key, seed >>> 0).flatMap((s) => {
    if (Math.hypot(s.x - scene.spawn.x, s.z - scene.spawn.z) < 3) return [];
    const heights = scene.terrain.flatMap((t) => {
      const h = terrainHeightAt(t, s.x, s.z);
      return h === undefined ? [] : [h];
    });
    if (!heights.length) return [];
    const position = { x: s.x, y: Math.max(...heights) + 0.3, z: s.z };
    let blocked = false;
    runtime.world.intersectionsWithShape(
      position,
      identityQuaternion,
      new RAPIER.Ball(0.25),
      () => {
        blocked = true;
        return false;
      },
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      undefined,
      undefined,
      (collider: RAPIER.Collider) =>
        !isCharacterCollider(collider.collisionGroups()) &&
        !collider.parent()?.isDynamic(),
    );
    return blocked ? [] : [{ id: s.id, kind: s.kind, position }];
  });
}

/** A pickup is a short, unobstructed reach from the authoritative standing capsule. */
export function canReachForage(
  runtime: PhysicsRuntime,
  character: PhysicsCharacter,
  spot: PhysicsForageSpot,
) {
  if (!character.grounded || character.seated) return false;
  const p = character.body.translation(),
    q = spot.position;
  if (
    Math.hypot(p.x - q.x, p.z - q.z) > 1.15 ||
    Math.abs(p.y - q.y - 0.55) > 0.55
  )
    return false;
  const direction = { x: q.x - p.x, y: q.y - p.y, z: q.z - p.z };
  return !runtime.world.castRay(
    new RAPIER.Ray(p, direction),
    1,
    true,
    RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
    undefined,
    undefined,
    character.body,
    (collider: RAPIER.Collider) =>
      !isCharacterCollider(collider.collisionGroups()),
  );
}
