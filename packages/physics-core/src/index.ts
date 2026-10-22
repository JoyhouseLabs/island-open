import { BlockChunks, isConstructionBlock } from "./block-chunks.js";
import { createPlayground } from "./playground.js";
import RAPIER from "@dimforge/rapier3d-compat";
import { PhysicsCharacter } from "./character.js";
import { collisionGroups } from "./groups.js";
import {
  physicsSceneSchema,
  physicsBudgets,
  physicsMaterials,
  physicsCheckpointSchema,
  type PhysicsScene,
  type ColliderShape,
  type BodyState,
  type Vector3,
  type ObjectDefinition,
  type ObjectInstance,
} from "@island/contracts";
export interface PhysicsImpact {
  id: string;
  material: ObjectDefinition["material"];
  strength: number;
  position: Vector3;
  tick: number;
}
export { RAPIER };
export * from "./playground.js";
export * from "./editing.js";
export * from "./character.js";
export * from "./grab.js";

let initialization: Promise<void> | undefined;
export function initializePhysics(): Promise<void> {
  return (initialization ??= RAPIER.init().catch((error: unknown) => {
    initialization = undefined;
    throw error;
  }));
}
export const PHYSICS_DT = 1 / physicsBudgets.tickRate;

export function colliderDescription(shape: ColliderShape): RAPIER.ColliderDesc {
  switch (shape.kind) {
    case "box":
      return RAPIER.ColliderDesc.cuboid(
        shape.halfExtents.x,
        shape.halfExtents.y,
        shape.halfExtents.z,
      );
    case "ball":
      return RAPIER.ColliderDesc.ball(shape.radius);
    case "cylinder":
      return RAPIER.ColliderDesc.cylinder(shape.halfHeight, shape.radius);
    case "capsule":
      return RAPIER.ColliderDesc.capsule(shape.halfHeight, shape.radius);
    case "convex": {
      const desc = RAPIER.ColliderDesc.convexHull(
        new Float32Array(shape.vertices.flatMap((v) => [v.x, v.y, v.z])),
      );
      if (!desc) throw new Error("凸体顶点无法形成有效的立体碰撞形状");
      return desc;
    }
  }
}

/** One clock and one world for both browser and headless simulations. */
export class PhysicsRuntime {
  readonly world: RAPIER.World;
  readonly scene: PhysicsScene;
  /** Individually simulated objects. Construction blocks are represented by blockChunks. */
  readonly bodies = new Map<string, RAPIER.RigidBody>();
  private blockChunks!: BlockChunks;
  get blockStats() {
    return this.blockChunks.stats();
  }
  private characters = new Map<string, PhysicsCharacter>();
  private previous = new Map<string, BodyState>();
  private ccdThresholds = new Map<string, number>();
  private recoveryAnchors = new Map<string, BodyState>();
  private events: RAPIER.EventQueue;
  private colliderObjects = new Map<
    number,
    { id: string; material: ObjectDefinition["material"] }
  >();
  private impactCooldown = new Map<string, number>();
  private impacts: PhysicsImpact[] = [];
  private accumulator = 0;
  private disposed = false;
  tick = 0;
  droppedSeconds = 0;
  recoveries = 0;
  private constructor(input: PhysicsScene) {
    this.scene = physicsSceneSchema.parse(input);
    this.world = new RAPIER.World({ x: 0, y: -22, z: 0 });
    this.events = new RAPIER.EventQueue(true);
    this.world.timestep = PHYSICS_DT;
    try {
      const definitions = new Map(
        this.scene.definitions.map((d) => [`${d.id}@${d.version}`, d]),
      );
      const blocks: ObjectInstance[] = [];
      for (const instance of this.scene.objects) {
        const def = definitions.get(
          `${instance.definitionId}@${instance.definitionVersion}`,
        )!;
        if (isConstructionBlock(def)) blocks.push(instance);
        else this.addBody(instance, def);
      }
      this.blockChunks = new BlockChunks(this.world, blocks, (handle, id) => {
        if (id) this.colliderObjects.set(handle, { id, material: "wood" });
        else this.colliderObjects.delete(handle);
      });
      this.capturePrevious();
    } catch (error) {
      this.dispose();
      throw error;
    }
  }
  private addBody(instance: ObjectInstance, def: ObjectDefinition) {
    const desc =
      def.bodyType === "dynamic"
        ? RAPIER.RigidBodyDesc.dynamic()
        : def.bodyType === "kinematic"
          ? RAPIER.RigidBodyDesc.kinematicPositionBased()
          : RAPIER.RigidBodyDesc.fixed();
    const body = this.world.createRigidBody(
      desc
        .setTranslation(
          instance.position.x,
          instance.position.y,
          instance.position.z,
        )
        .setRotation(instance.rotation)
        .setLinearDamping(0.15)
        .setAngularDamping(0.25)
        .setCanSleep(true),
    );
    const material = physicsMaterials[def.material];
    for (const part of def.parts) {
      const collider = this.world.createCollider(
        colliderDescription(part.shape)
          .setTranslation(part.position.x, part.position.y, part.position.z)
          .setRotation(part.rotation)
          .setFriction(material.friction)
          .setRestitution(material.restitution)
          .setDensity(part.sensor ? 0 : material.density)
          .setCollisionGroups(
            def.bodyType === "dynamic"
              ? collisionGroups.dynamic
              : collisionGroups.fixed,
          )
          .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
          .setContactForceEventThreshold(1)
          .setSensor(part.sensor),
        body,
      );
      this.colliderObjects.set(collider.handle, {
        id: instance.id,
        material: def.material,
      });
    }
    this.bodies.set(instance.id, body);
    const minimum = Math.min(
      ...def.parts
        .filter((p) => !p.sensor)
        .map((p) =>
          p.shape.kind === "box"
            ? Math.min(
                p.shape.halfExtents.x,
                p.shape.halfExtents.y,
                p.shape.halfExtents.z,
              )
            : p.shape.kind === "convex"
              ? 0.025
              : p.shape.radius,
        ),
    );
    this.ccdThresholds.set(instance.id, minimum / PHYSICS_DT);
    this.recoveryAnchors.set(instance.id, this.state(instance.id));
  }
  static async create(scene: PhysicsScene): Promise<PhysicsRuntime> {
    await initializePhysics();
    return new PhysicsRuntime(scene);
  }
  private checkAlive() {
    if (this.disposed) throw new Error("物理场景已经关闭");
  }
  createCharacter(
    id: string,
    spawn = this.scene.spawn,
    canPush = true,
  ): PhysicsCharacter {
    this.checkAlive();
    if (this.characters.has(id)) throw new Error("角色已经存在");
    const character = new PhysicsCharacter(this.world, spawn, canPush);
    this.characters.set(id, character);
    return character;
  }
  removeCharacter(id: string) {
    this.characters.get(id)?.dispose();
    this.characters.delete(id);
  }
  state(id: string): BodyState {
    this.checkAlive();
    const block = this.blockChunks?.instances.get(id);
    if (block)
      return {
        id,
        position: { ...block.position },
        rotation: { ...block.rotation },
        sleeping: false,
      };
    const body = this.bodies.get(id);
    if (!body) throw new Error("物体不存在");
    return {
      id,
      position: { ...body.translation() },
      rotation: { ...body.rotation() },
      sleeping: body.isSleeping(),
    };
  }
  states(movingOnly = false): BodyState[] {
    return movingOnly
      ? [...this.bodies]
          .filter(([, body]) => !body.isFixed())
          .map(([id]) => this.state(id))
      : this.scene.objects.map((o) => this.state(o.id));
  }
  private capturePrevious() {
    for (const [id, body] of this.bodies)
      if (!body.isFixed()) this.previous.set(id, this.state(id));
  }
  previousState(id: string) {
    return this.previous.get(id) ?? this.state(id);
  }
  get alpha() {
    return this.accumulator / PHYSICS_DT;
  }
  takeImpacts(): PhysicsImpact[] {
    const events = this.impacts;
    this.impacts = [];
    return events;
  }
  surfaceMaterial(
    position: Vector3,
    excluded?: RAPIER.RigidBody,
  ): ObjectDefinition["material"] {
    const hit = this.world.castRay(
      new RAPIER.Ray(position, { x: 0, y: -1, z: 0 }),
      2,
      true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      undefined,
      excluded,
    );
    return hit
      ? (this.colliderObjects.get(hit.collider.handle)?.material ?? "stone")
      : "stone";
  }
  /** Simulation authority calls this with a fixed clock. */
  step(beforeStep?: (dt: number) => void) {
    this.checkAlive();
    this.capturePrevious();
    for (const instance of this.scene.objects) {
      if (!instance.motion) continue;
      const phase =
        ((this.tick + 1) % instance.motion.periodTicks) /
        instance.motion.periodTicks;
      const factor = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
      this.bodies.get(instance.id)!.setNextKinematicTranslation({
        x: instance.position.x + instance.motion.offset.x * factor,
        y: instance.position.y + instance.motion.offset.y * factor,
        z: instance.position.z + instance.motion.offset.z * factor,
      });
    }
    beforeStep?.(PHYSICS_DT);
    const velocities = new Map<number, Vector3>();
    for (const [id, body] of this.bodies) {
      if (!body.isDynamic()) continue;
      const v = body.linvel(),
        speed = Math.hypot(v.x, v.y, v.z);
      velocities.set(body.handle, { ...v });
      body.enableCcd(
        speed + 22 * PHYSICS_DT > (this.ccdThresholds.get(id) ?? Infinity),
      );
      if (speed > 20)
        body.setLinvel(
          {
            x: (v.x * 20) / speed,
            y: (v.y * 20) / speed,
            z: (v.z * 20) / speed,
          },
          true,
        );
      const a = body.angvel(),
        spin = Math.hypot(a.x, a.y, a.z);
      if (spin > 20)
        body.setAngvel(
          { x: (a.x * 20) / spin, y: (a.y * 20) / spin, z: (a.z * 20) / spin },
          true,
        );
    }
    this.world.step(this.events);
    this.events.drainContactForceEvents(
      (event: RAPIER.TempContactForceEvent) => {
        const a = event.collider1(),
          b = event.collider2();
        const key = a < b ? `${a}:${b}` : `${b}:${a}`;
        if (this.tick - (this.impactCooldown.get(key) ?? -100) < 15) return;
        const normal = event.maxForceDirection();
        const candidates = [a, b]
          .map((handle) => {
            const body = this.world.getCollider(handle)?.parent();
            const velocity = body && velocities.get(body.handle);
            return {
              handle,
              body,
              speed: velocity
                ? Math.abs(
                    velocity.x * normal.x +
                      velocity.y * normal.y +
                      velocity.z * normal.z,
                  )
                : 0,
            };
          })
          .sort((left, right) => right.speed - left.speed);
        const impact = candidates[0],
          object = impact && this.colliderObjects.get(impact.handle);
        if (
          !impact?.body ||
          !object ||
          impact.speed < 0.7 ||
          this.impacts.length >= 64
        )
          return;
        this.impacts.push({
          ...object,
          strength: Math.min(1, impact.speed / 8),
          position: { ...impact.body.translation() },
          tick: this.tick,
        });
        this.impactCooldown.set(key, this.tick);
      },
    );
    if (this.tick % 120 === 0)
      for (const [key, tick] of this.impactCooldown)
        if (this.tick - tick > 120) this.impactCooldown.delete(key);
    for (const [id, body] of this.bodies) {
      if (!body.isDynamic()) continue;
      const state = this.state(id);
      const out = (["x", "y", "z"] as const).some(
        (axis) =>
          !Number.isFinite(state.position[axis]) ||
          state.position[axis] < this.scene.bounds.min[axis] ||
          state.position[axis] > this.scene.bounds.max[axis],
      );
      if (out) {
        const anchor = this.recoveryAnchors.get(id)!;
        body.setTranslation(anchor.position, true);
        body.setRotation(anchor.rotation, true);
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        this.previous.set(id, anchor);
        this.recoveries++;
      } else if (body.isSleeping()) this.recoveryAnchors.set(id, state);
    }
    this.tick++;
  }
  /** Render clock: bounded catch-up, never variable physical timesteps. */
  advance(seconds: number, beforeStep?: (dt: number) => void): number {
    this.checkAlive();
    if (!Number.isFinite(seconds) || seconds < 0)
      throw new Error("无效时间间隔");
    const max = PHYSICS_DT * physicsBudgets.maxCatchUpSteps;
    const total = this.accumulator + seconds;
    this.accumulator = Math.min(total, max);
    this.droppedSeconds += Math.max(0, total - max);
    let steps = 0;
    while (
      this.accumulator + 1e-10 >= PHYSICS_DT &&
      steps < physicsBudgets.maxCatchUpSteps
    ) {
      this.step(beforeStep);
      this.accumulator = Math.max(0, this.accumulator - PHYSICS_DT);
      steps++;
    }
    return steps;
  }
  pauseClock() {
    this.accumulator = 0;
    this.capturePrevious();
  }
  impulse(id: string, impulse: Vector3) {
    this.checkAlive();
    const body = this.bodies.get(id);
    if (!body?.isDynamic()) throw new Error("只能推动活动物体");
    const length = Math.hypot(impulse.x, impulse.y, impulse.z);
    if (!Number.isFinite(length) || length > 20)
      throw new Error("推动力度超出范围");
    body.applyImpulse(impulse, true);
  }
  /** Validate at a frozen tick against actual bodies and every connected capsule. */
  validatePlacement(
    instance: ObjectInstance,
    definition: ObjectDefinition,
    excluding?: string,
  ) {
    const temporary = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(
          instance.position.x,
          instance.position.y,
          instance.position.z,
        )
        .setRotation(instance.rotation),
    );
    try {
      const shapes: RAPIER.Collider[] = [];
      for (const part of definition.parts) {
        if (part.sensor) continue;
        const collider = this.world.createCollider(
          colliderDescription(part.shape)
            .setTranslation(part.position.x, part.position.y, part.position.z)
            .setRotation(part.rotation),
          temporary,
        );
        shapes.push(collider);
      }
      this.world.propagateModifiedBodyPositionsToColliders();
      for (const shape of shapes) {
        // Conservative enclosing radius also accounts for rotated local offsets.
        const p = shape.translation();
        const part = definition.parts.filter((p) => !p.sensor)[
          shapes.indexOf(shape)
        ]!;
        const sh = part.shape;
        const radius =
          sh.kind === "box"
            ? Math.hypot(sh.halfExtents.x, sh.halfExtents.y, sh.halfExtents.z)
            : sh.kind === "ball"
              ? sh.radius
              : sh.kind === "convex"
                ? Math.max(...sh.vertices.map((v) => Math.hypot(v.x, v.y, v.z)))
                : sh.radius + sh.halfHeight;
        if (
          (["x", "y", "z"] as const).some(
            (axis) =>
              p[axis] - radius < this.scene.bounds.min[axis] ||
              p[axis] + radius > this.scene.bounds.max[axis],
          )
        )
          throw new Error("物品超出可布置范围");
        for (const [id, body] of this.bodies) {
          if (id === excluding) continue;
          for (let i = 0; i < body.numColliders(); i++) {
            const other = body.collider(i);
            if (
              !other.isSensor() &&
              (shape.contactCollider(other, 0)?.distance ?? 0) < -0.02
            )
              throw new Error("物品与现有物体重叠，请换一个位置");
          }
        }
        if (this.blockChunks.overlaps(shape, radius, excluding))
          throw new Error("物品与现有方块重叠，请换一个位置");
        for (const character of this.characters.values())
          if (
            (shape.contactCollider(character.collider, 0)?.distance ?? 0) <
            -0.005
          )
            throw new Error("这里有人，请让开后再放置");
      }
    } finally {
      this.world.removeRigidBody(temporary);
    }
  }
  /** Whole-layout import: check new geometry and every live capsule before atomic replacement. */
  validateReplacement() {
    const template = createPlayground();
    for (const object of this.scene.objects) {
      const definition = this.scene.definitions.find(
        (d) =>
          d.id === object.definitionId &&
          d.version === object.definitionVersion,
      )!;
      const state = this.state(object.id);
      // The authored ground and embedded ramp intentionally intersect. Only their exact template poses are exempt.
      const base = template.objects.find(
        (o) =>
          o.definitionId === object.definitionId &&
          ["core:floor", "core:ramp"].includes(o.definitionId),
      );
      const samePose =
        base &&
        JSON.stringify(base.position) === JSON.stringify(object.position) &&
        JSON.stringify(base.rotation) === JSON.stringify(object.rotation);
      if (!samePose)
        this.validatePlacement(
          { ...object, position: state.position, rotation: state.rotation },
          definition,
          object.id,
        );
    }
    this.world.propagateModifiedBodyPositionsToColliders();
    const shapes = [...this.bodies.values()]
      .flatMap((body) =>
        Array.from({ length: body.numColliders() }, (_, i) => body.collider(i)),
      )
      .concat(this.blockChunks.colliders());
    for (const character of this.characters.values())
      for (const shape of shapes) {
        if (
          !shape.isSensor() &&
          (shape.contactCollider(character.collider, 0)?.distance ?? 0) < -0.005
        )
          throw new Error("导入布局会挡住正在场景中的人，请移到空地再试");
      }
  }

  /** Called only after durable commit, between simulation steps. Unchanged bodies keep velocity. */
  applyLayout(next: PhysicsScene, changedId: string) {
    const existing = this.bodies.get(changedId);
    if (existing) {
      for (let i = 0; i < existing.numColliders(); i++)
        this.colliderObjects.delete(existing.collider(i).handle);
      this.world.removeRigidBody(existing);
      this.bodies.delete(changedId);
      this.previous.delete(changedId);
      this.recoveryAnchors.delete(changedId);
      this.ccdThresholds.delete(changedId);
    }
    this.scene.objects = next.objects;
    this.scene.definitions = next.definitions;
    const instance = next.objects.find((o) => o.id === changedId);
    const definition =
      instance &&
      next.definitions.find(
        (d) =>
          d.id === instance.definitionId &&
          d.version === instance.definitionVersion,
      )!;
    const block = definition && isConstructionBlock(definition);
    this.blockChunks.replace(changedId, block ? instance : undefined);
    if (instance && definition && !block) this.addBody(instance, definition);
    // Supporting geometry can disappear under sleeping objects.
    for (const body of this.bodies.values())
      if (body.isDynamic()) body.wakeUp();
    this.world.propagateModifiedBodyPositionsToColliders();
    this.pauseClock();
  }
  restore(input: unknown) {
    this.checkAlive();
    const checkpoint = physicsCheckpointSchema.parse(input);
    if (
      checkpoint.states.length !== this.scene.objects.length ||
      checkpoint.states.some(
        (s) => !this.bodies.has(s.id) && !this.blockChunks.instances.has(s.id),
      )
    )
      throw new Error("检查点不属于当前布局");
    if (
      checkpoint.states.some((state) =>
        (["x", "y", "z"] as const).some(
          (axis) =>
            state.position[axis] < this.scene.bounds.min[axis] ||
            state.position[axis] > this.scene.bounds.max[axis],
        ),
      )
    )
      throw new Error("检查点超出场景边界");
    for (const state of checkpoint.states) {
      const block = this.blockChunks.instances.get(state.id);
      if (
        block &&
        ((["x", "y", "z"] as const).some(
          (axis) =>
            Math.abs(block.position[axis] - state.position[axis]) > 1e-5,
        ) ||
          (["x", "y", "z", "w"] as const).some(
            (axis) =>
              Math.abs(block.rotation[axis] - state.rotation[axis]) > 1e-5,
          ))
      )
        throw new Error("建造方块状态必须与布局一致");
    }
    for (const state of checkpoint.states) {
      if (this.blockChunks.instances.has(state.id)) continue;
      const body = this.bodies.get(state.id)!;
      body.setTranslation(state.position, true);
      body.setRotation(state.rotation, true);
      if (body.isKinematic()) {
        body.setNextKinematicTranslation(state.position);
        body.setNextKinematicRotation(state.rotation);
      }
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      if (state.sleeping && body.isDynamic()) body.sleep();
      this.recoveryAnchors.set(state.id, state);
    }
    this.tick = checkpoint.tick;
    this.pauseClock();
  }
  dispose() {
    if (this.disposed) return;
    for (const character of this.characters.values()) character.dispose();
    this.characters.clear();
    this.disposed = true;
    this.blockChunks?.dispose();
    this.bodies.clear();
    this.previous.clear();
    this.ccdThresholds.clear();
    this.recoveryAnchors.clear();
    this.colliderObjects.clear();
    this.impactCooldown.clear();
    this.impacts = [];
    this.events.free();
    this.world.free();
  }
}
export * from "./furniture.js";

export {
  BLOCK_CHUNK_SIZE,
  blockChunkKey,
  snapBlockPosition,
} from "./block-chunks.js";
