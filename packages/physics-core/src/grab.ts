import RAPIER from "@dimforge/rapier3d-compat";
import type { Vector3 } from "@island/contracts";
import type { PhysicsCharacter } from "./character.js";

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
    );
    if (!hit || hit.collider.parent()?.handle !== body.handle)
      throw new Error("有东西挡住了，请走到物品旁边");
    this.held = body;
    body.wakeUp();
  }
  release() {
    this.held = null;
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
