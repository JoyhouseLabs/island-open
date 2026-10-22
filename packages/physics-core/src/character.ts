import RAPIER from "@dimforge/rapier3d-compat";
import type { Vector3 } from "@island/contracts";
import { collisionGroups } from "./groups.js";

export const characterProfile = Object.freeze({
  radius: 0.3,
  halfHeight: 0.55,
  seatedHalfHeight: 0.25,
  speed: 4.2,
  sprintSpeed: 7.14,
  jumpSpeed: 7.2,
  gravity: -22,
  stepHeight: 0.3,
});
export interface CharacterInput {
  x: number;
  z: number;
  jump: boolean;
  sprint?: boolean;
}
export interface CharacterState {
  position: Vector3;
  velocity: Vector3;
  grounded: boolean;
  jumpHeld: boolean;
  coyote: number;
  seated: boolean;
}

/** Input is in world axes. The caller advances the world once after all actors. */
export class PhysicsCharacter {
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly controller: RAPIER.KinematicCharacterController;
  private velocity = { x: 0, y: 0, z: 0 };
  private jumpHeld = false;
  private coyote = 0;
  private disposed = false;
  grounded = false;
  seated = false;
  constructor(
    private world: RAPIER.World,
    spawn: Vector3,
    canPush = true,
  ) {
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        spawn.x,
        spawn.y,
        spawn.z,
      ),
    );
    this.collider = world.createCollider(
      RAPIER.ColliderDesc.capsule(
        characterProfile.halfHeight,
        characterProfile.radius,
      ).setCollisionGroups(
        canPush ? collisionGroups.character : collisionGroups.visitor,
      ),
      this.body,
    );
    this.controller = world.createCharacterController(0.015);
    this.controller.enableAutostep(characterProfile.stepHeight, 0.2, false);
    this.controller.enableSnapToGround(0.2);
    this.controller.setMaxSlopeClimbAngle(Math.PI / 4);
    this.controller.setMinSlopeSlideAngle(Math.PI * 0.28);
    this.controller.setApplyImpulsesToDynamicBodies(canPush);
    this.controller.setCharacterMass(1.8);
  }
  step(input: CharacterInput, dt: number) {
    if (this.disposed) throw new Error("角色已经离开场景");
    if (
      !Number.isFinite(input.x) ||
      !Number.isFinite(input.z) ||
      Math.abs(input.x) > 1 ||
      Math.abs(input.z) > 1 ||
      !Number.isFinite(dt) ||
      dt <= 0 ||
      dt > 1 / 30
    )
      throw new Error("无效角色输入");
    if (this.seated) {
      this.body.setNextKinematicTranslation(this.body.translation());
      return;
    }
    const length = Math.max(1, Math.hypot(input.x, input.z));
    const blend = Math.min(1, dt * 16);
    const speed = input.sprint
      ? characterProfile.sprintSpeed
      : characterProfile.speed;
    this.velocity.x += ((input.x / length) * speed - this.velocity.x) * blend;
    this.velocity.z += ((input.z / length) * speed - this.velocity.z) * blend;
    this.coyote = this.grounded ? 0.08 : Math.max(0, this.coyote - dt);
    if (input.jump && !this.jumpHeld && this.coyote > 0) {
      this.velocity.y = characterProfile.jumpSpeed;
      this.coyote = 0;
      this.grounded = false;
    }
    this.jumpHeld = input.jump;
    this.velocity.y = Math.max(
      -20,
      this.velocity.y + characterProfile.gravity * dt,
    );
    const desired = {
      x: this.velocity.x * dt,
      y: this.velocity.y * dt,
      z: this.velocity.z * dt,
    };
    this.controller.computeColliderMovement(
      this.collider,
      desired,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      // Visitors still query dynamic obstacles, but their actual collider
      // cannot impart solver impulses to someone else's objects.
      collisionGroups.character,
    );
    const movement = this.controller.computedMovement(),
      position = this.body.translation();
    this.grounded = this.controller.computedGrounded();
    if (
      (this.grounded && this.velocity.y < 0) ||
      (desired.y > 0 && movement.y < desired.y * 0.5)
    )
      this.velocity.y = 0;
    this.body.setNextKinematicTranslation({
      x: position.x + movement.x,
      y: position.y + movement.y,
      z: position.z + movement.z,
    });
  }
  position(): Vector3 {
    return { ...this.body.translation() };
  }
  setCanPush(enabled: boolean) {
    this.collider.setCollisionGroups(
      enabled ? collisionGroups.character : collisionGroups.visitor,
    );
    this.controller.setApplyImpulsesToDynamicBodies(enabled);
  }
  setSeated(value: boolean) {
    if (this.seated === value) return;
    this.seated = value;
    this.collider.setShape(
      new RAPIER.Capsule(
        value ? characterProfile.seatedHalfHeight : characterProfile.halfHeight,
        characterProfile.radius,
      ),
    );
    this.teleport(this.position());
  }
  snapshot(): CharacterState {
    return {
      position: this.position(),
      velocity: { ...this.velocity },
      grounded: this.grounded,
      jumpHeld: this.jumpHeld,
      coyote: this.coyote,
      seated: this.seated,
    };
  }
  reconcile(state: CharacterState) {
    this.setSeated(state.seated);
    this.teleport(state.position);
    this.velocity = { ...state.velocity };
    this.grounded = state.grounded;
    this.jumpHeld = state.jumpHeld;
    this.coyote = state.coyote;
  }
  teleport(position: Vector3) {
    this.body.setTranslation(position, true);
    this.body.setNextKinematicTranslation(position);
    this.velocity = { x: 0, y: 0, z: 0 };
    this.grounded = false;
    this.coyote = 0;
    this.jumpHeld = false;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.world.removeCharacterController(this.controller);
    this.world.removeRigidBody(this.body);
  }
}
