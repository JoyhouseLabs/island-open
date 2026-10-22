import RAPIER from "@dimforge/rapier3d-compat";
import {
  identityQuaternion,
  type Vector3,
  type Quaternion,
} from "@island/contracts";
import type { PhysicsRuntime } from "./index.js";
import { characterProfile, type PhysicsCharacter } from "./character.js";
import { isCharacterCollider } from "./groups.js";
export interface SeatClaim {
  objectId: string;
  yaw: number;
}
const rotate = (v: Vector3, q: Quaternion): Vector3 => {
  const tx = 2 * (q.y * v.z - q.z * v.y),
    ty = 2 * (q.z * v.x - q.x * v.z),
    tz = 2 * (q.x * v.y - q.y * v.x);
  return {
    x: v.x + q.w * tx + q.y * tz - q.z * ty,
    y: v.y + q.w * ty + q.z * tx - q.x * tz,
    z: v.z + q.w * tz + q.x * ty - q.y * tx,
  };
};
const zero = { x: 0, y: 0, z: 0 };
const standing = new RAPIER.Capsule(
  characterProfile.halfHeight,
  characterProfile.radius,
);
const sitting = new RAPIER.Capsule(
  characterProfile.seatedHalfHeight,
  characterProfile.radius,
);
function pose(runtime: PhysicsRuntime, id: string) {
  const o = runtime.scene.objects.find((o) => o.id === id),
    d =
      o &&
      runtime.scene.definitions.find(
        (d) => d.id === o.definitionId && d.version === o.definitionVersion,
      ),
    p = d?.seat && d.parts.find((p) => p.id === d.seat!.partId);
  if (!o || !d?.seat || !p || d.bodyType !== "fixed")
    throw new Error("这个物品没有可用座面");
  const normal = rotate({ x: 0, y: 1, z: 0 }, o.rotation);
  if (normal.y < 0.999) throw new Error("请先把座面摆平");
  const height =
    p.shape.kind === "box"
      ? p.shape.halfExtents.y
      : p.shape.kind === "cylinder"
        ? p.shape.halfHeight
        : 0;
  const offset = rotate(
    { ...p.position, y: p.position.y + height },
    o.rotation,
  );
  const surface = {
    x: o.position.x + offset.x,
    y: o.position.y + offset.y,
    z: o.position.z + offset.z,
  };
  const facing = rotate(
    rotate(
      { x: Math.sin(d.seat.yaw), y: 0, z: Math.cos(d.seat.yaw) },
      p.rotation,
    ),
    o.rotation,
  );
  return {
    surface,
    yaw: Math.atan2(facing.x, facing.z),
    body: runtime.bodies.get(id)!,
  };
}
/** Explicit collider contacts also see geometry added since the most recent world step. */
function clear(
  runtime: PhysicsRuntime,
  character: PhysicsCharacter,
  position: Vector3,
  shape: RAPIER.Shape,
) {
  const extent = shape === standing ? 0.85 : 0.55,
    bounds = runtime.scene.bounds;
  if (
    position.x - 0.3 < bounds.min.x ||
    position.x + 0.3 > bounds.max.x ||
    position.z - 0.3 < bounds.min.z ||
    position.z + 0.3 > bounds.max.z ||
    position.y - extent < bounds.min.y ||
    position.y + extent > bounds.max.y
  )
    return false;
  let free = true;
  runtime.world.colliders.forEach((c: RAPIER.Collider) => {
    if (c.handle === character.collider.handle || c.isSensor()) return;
    if (
      (c.contactShape(shape, position, identityQuaternion, 0)?.distance ?? 0) <
      -0.005
    )
      free = false;
  });
  return free;
}
function pathClear(
  runtime: PhysicsRuntime,
  character: PhysicsCharacter,
  from: Vector3,
  to: Vector3,
  seatBody: RAPIER.RigidBody,
) {
  const delta = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
  let free = true;
  runtime.world.colliders.forEach((c: RAPIER.Collider) => {
    if (
      c.handle === character.collider.handle ||
      c.isSensor() ||
      isCharacterCollider(c.collisionGroups()) ||
      c.parent()?.handle === seatBody.handle
    )
      return;
    if (c.castShape(zero, sitting, from, identityQuaternion, delta, 0, 1, true))
      free = false;
  });
  return free;
}
export function sitCharacter(
  runtime: PhysicsRuntime,
  character: PhysicsCharacter,
  objectId: string,
): SeatClaim {
  runtime.world.propagateModifiedBodyPositionsToColliders();
  const seat = pose(runtime, objectId),
    origin = character.position();
  const target = { ...seat.surface, y: seat.surface.y + 0.57 };
  if (
    Math.hypot(target.x - origin.x, target.y - origin.y, target.z - origin.z) >
    2.5
  )
    throw new Error("再靠近一点，才能坐下");
  if (!clear(runtime, character, target, sitting))
    throw new Error("座位或头顶空间被挡住了");
  if (!pathClear(runtime, character, origin, target, seat.body))
    throw new Error("有东西挡住了，请走到座位旁边");
  findExit(runtime, character, { objectId, yaw: seat.yaw }, target);
  character.setSeated(true);
  character.teleport(target);
  runtime.world.propagateModifiedBodyPositionsToColliders();
  return { objectId, yaw: seat.yaw };
}
function ground(
  runtime: PhysicsRuntime,
  x: number,
  z: number,
  top: number,
  character: PhysicsCharacter,
) {
  const ray = new RAPIER.Ray({ x, y: top, z }, { x: 0, y: -1, z: 0 });
  let best: { y: number; normal: number; fixed: boolean } | null = null;
  runtime.world.colliders.forEach((c: RAPIER.Collider) => {
    if (
      c.handle === character.collider.handle ||
      c.isSensor() ||
      isCharacterCollider(c.collisionGroups())
    )
      return;
    const hit = c.castRayAndGetNormal(ray, 2, true);
    if (hit && (!best || top - hit.timeOfImpact > best.y))
      best = {
        y: top - hit.timeOfImpact,
        normal: hit.normal.y,
        fixed: !!c.parent()?.isFixed(),
      };
  });
  return best as { y: number; normal: number; fixed: boolean } | null;
}
function findExit(
  runtime: PhysicsRuntime,
  character: PhysicsCharacter,
  claim: SeatClaim,
  originOverride?: Vector3,
): Vector3 {
  runtime.world.propagateModifiedBodyPositionsToColliders();
  const seat = pose(runtime, claim.objectId),
    origin = originOverride ?? character.position();
  for (const radius of [1, 1.5, 2, 2.5])
    for (const angle of [
      0,
      Math.PI / 4,
      -Math.PI / 4,
      Math.PI / 2,
      -Math.PI / 2,
      Math.PI * 0.75,
      -Math.PI * 0.75,
      Math.PI,
    ]) {
      const x = seat.surface.x + Math.sin(seat.yaw + angle) * radius,
        z = seat.surface.z + Math.cos(seat.yaw + angle) * radius;
      const floor = ground(runtime, x, z, seat.surface.y + 0.3, character);
      if (!floor?.fixed || floor.normal < 0.7 || floor.y < seat.surface.y - 1.5)
        continue;
      const target = { x, y: floor.y + 0.87, z };
      if (!clear(runtime, character, target, standing)) continue;
      if (
        ![
          [-0.2, 0],
          [0.2, 0],
          [0, -0.2],
          [0, 0.2],
        ].every(([dx, dz]) => {
          const edge = ground(
            runtime,
            x + dx!,
            z + dz!,
            seat.surface.y + 0.3,
            character,
          );
          return (
            edge?.fixed &&
            edge.normal >= 0.7 &&
            Math.abs(edge.y - floor.y) < 0.1
          );
        })
      )
        continue;
      if (!pathClear(runtime, character, origin, target, seat.body)) continue;
      return target;
    }
  throw new Error("周围没有安全落脚点，请先移开障碍物再起身");
}

export function standCharacter(
  runtime: PhysicsRuntime,
  character: PhysicsCharacter,
  claim: SeatClaim,
) {
  const target = findExit(runtime, character, claim);
  character.setSeated(false);
  character.teleport(target);
  runtime.world.propagateModifiedBodyPositionsToColliders();
}
