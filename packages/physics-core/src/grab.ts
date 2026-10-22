import { contactWithTerrain } from "./terrain.js";
import RAPIER from "@dimforge/rapier3d-compat";
import type { Vector3, Quaternion } from "@island/contracts";
import type { PhysicsCharacter } from "./character.js";
import { isCharacterCollider } from "./groups.js";

export type DropPreview = {
  valid: boolean;
  position: Vector3;
  rotation: Quaternion;
  reason: string;
};
const claims = new WeakMap<RAPIER.World, Map<number, PhysicsGrab>>();

/** A bounded spring pulls a dynamic body; contacts still control its trajectory. */
export class PhysicsGrab {
  private held: RAPIER.RigidBody | null = null;
  constructor(
    private world: RAPIER.World,
    private player: PhysicsCharacter,
  ) {}
  get body() {
    return this.held;
  }
  take(body: RAPIER.RigidBody) {
    if (this.held) throw new Error("请先放下手里的物品");
    if (!body.isDynamic() || body.mass() > 12)
      throw new Error("这个物体太重，无法拿起");
    if (claims.get(this.world)?.has(body.handle))
      throw new Error("这个物品正被其他人拿着");
    const origin = this.player.position(),
      target = body.translation();
    origin.y += 0.25;
    const diff = {
      x: target.x - origin.x,
      y: target.y - origin.y,
      z: target.z - origin.z,
    };
    const distance = Math.hypot(diff.x, diff.y, diff.z);
    if (distance > 2.5) throw new Error("再靠近一点，才能拿起");
    if (distance < 0.01) throw new Error("请稍微退后一点");
    const ray = new RAPIER.Ray(origin, {
      x: diff.x / distance,
      y: diff.y / distance,
      z: diff.z / distance,
    });
    const hit = this.world.castRay(
      ray,
      distance + 0.1,
      true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      this.player.collider,
      this.player.body,
      (collider: RAPIER.Collider) =>
        !isCharacterCollider(collider.collisionGroups()),
    );
    if (!hit || hit.collider.parent()?.handle !== body.handle)
      throw new Error("有东西挡住了，请走到物品旁边");
    this.held = body;
    let owners = claims.get(this.world);
    if (!owners) {
      owners = new Map();
      claims.set(this.world, owners);
    }
    owners.set(body.handle, this);
    body.wakeUp();
  }
  release() {
    if (this.held && claims.get(this.world)?.get(this.held.handle) === this)
      claims.get(this.world)?.delete(this.held.handle);
    this.held = null;
  }
  push(body: RAPIER.RigidBody) {
    this.take(body);
    this.release();
    const origin = this.player.position(),
      position = body.translation();
    const distance = Math.max(
      0.1,
      Math.hypot(position.x - origin.x, position.z - origin.z),
    );
    body.applyImpulse(
      {
        x: ((position.x - origin.x) / distance) * body.mass() * 2,
        y: body.mass() * 0.2,
        z: ((position.z - origin.z) / distance) * body.mass() * 2,
      },
      true,
    );
  }
  previewDrop(): DropPreview | null {
    const body = this.held;
    if (!body) return null;
    const position = { ...body.translation() },
      rotation = { ...body.rotation() };
    let distance = Infinity;
    for (let i = 0; i < body.numColliders(); i++) {
      const part = body.collider(i);
      if (part.isSensor()) continue;
      let penetrating = false;
      this.world.intersectionsWithShape(
        part.translation(),
        part.rotation(),
        part.shape,
        (other: RAPIER.Collider) => {
          const contact = contactWithTerrain(
            this.world,
            other,
            part.shape,
            part.translation(),
            part.rotation(),
            0,
          );
          if (contact && contact.distance < -0.015) penetrating = true;
          return !penetrating;
        },
        RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
        undefined,
        undefined,
        body,
      );
      if (penetrating)
        return {
          valid: false,
          position,
          rotation,
          reason: "物品还贴着障碍，请移到空处再放下",
        };
      const hit = this.world.castShape(
        part.translation(),
        part.rotation(),
        { x: 0, y: -1, z: 0 },
        part.shape,
        0.005,
        3,
        true,
        RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
        undefined,
        undefined,
        body,
      );
      if (hit) {
        if (isCharacterCollider(hit.collider.collisionGroups()))
          return {
            valid: false,
            position,
            rotation,
            reason: "请避开角色，移到空处再放下",
          };
        distance = Math.min(distance, hit.time_of_impact);
      }
    }
    if (!Number.isFinite(distance))
      return {
        valid: false,
        position,
        rotation,
        reason: "下方没有可放置的表面",
      };
    return {
      valid: true,
      position: { ...position, y: position.y - distance },
      rotation,
      reason: "绿色轮廓是放下后的落点",
    };
  }
  drop(): DropPreview {
    const preview = this.previewDrop();
    if (!preview?.valid) throw new Error(preview?.reason ?? "手里没有物品");
    // Keep contacts authoritative: release above the swept landing pose instead
    // of teleporting through the space between the hand and the surface.
    this.held!.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.held!.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.release();
    return preview;
  }
  toss(facing: Vector3) {
    if (!this.held) throw new Error("手里没有物品");
    const length = Math.hypot(facing.x, facing.z);
    if (!Number.isFinite(length) || length < 0.1)
      throw new Error("抛出方向无效");
    this.held.setLinvel(
      { x: (facing.x / length) * 3, y: 2, z: (facing.z / length) * 3 },
      true,
    );
    this.release();
  }
  step(facing: Vector3, dt: number) {
    if (!this.held) return;
    const player = this.player.position(),
      body = this.held,
      position = body.translation();
    if (
      Math.hypot(
        position.x - player.x,
        position.y - player.y,
        position.z - player.z,
      ) > 3.5
    ) {
      this.release();
      return;
    }
    const length = Math.hypot(facing.x, facing.z);
    if (!Number.isFinite(length) || length < 0.1) return;
    const target = {
      x: player.x + (facing.x / length) * 1.35,
      y: player.y + 0.4,
      z: player.z + (facing.z / length) * 1.35,
    };
    const velocity = body.linvel();
    const acceleration = {
      x: (target.x - position.x) * 45 - velocity.x * 12,
      y: (target.y - position.y) * 45 - velocity.y * 12 + 22,
      z: (target.z - position.z) * 45 - velocity.z * 12,
    };
    const scale =
      Math.min(
        1,
        60 /
          Math.max(
            0.001,
            Math.hypot(acceleration.x, acceleration.y, acceleration.z),
          ),
      ) *
      body.mass() *
      dt;
    body.applyImpulse(
      {
        x: acceleration.x * scale,
        y: acceleration.y * scale,
        z: acceleration.z * scale,
      },
      true,
    );
  }
}
