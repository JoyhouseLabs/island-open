import RAPIER from "@dimforge/rapier3d-compat";
import {
  identityQuaternion,
  objectDefinitionSchema,
  physicsBudgets,
  type ObjectDefinition,
  type ObjectInstance,
  type PhysicsBehaviorState,
  type PhysicsSwitchState,
  type BodyState,
} from "@island/contracts";
import type { PhysicsRuntime } from "./index.js";
import type { PhysicsCharacter } from "./character.js";
import { isCharacterCollider } from "./groups.js";

export function officialBehaviorObjects(): ObjectDefinition[] {
  const box = (
    id: string,
    x: number,
    y: number,
    z: number,
    hx: number,
    hy: number,
    hz: number,
    color: string,
    sensor = false,
  ) => ({
    id,
    position: { x, y, z },
    rotation: identityQuaternion,
    shape: { kind: "box" as const, halfExtents: { x: hx, y: hy, z: hz } },
    color,
    sensor,
  });
  const base = { version: 1, source: "official", material: "wood" };
  return [
    {
      ...base,
      id: "core:switch",
      name: "拨动开关",
      bodyType: "fixed",
      abilities: ["switch"],
      behavior: { kind: "switch", version: 1 },
      parts: [box("stand", 0, 0.5, 0, 0.2, 0.5, 0.2, "#bd9a67")],
    },
    {
      ...base,
      id: "core:pressure",
      name: "压力板",
      bodyType: "fixed",
      abilities: ["pressure"],
      behavior: { kind: "pressure", version: 1, partId: "sensor" },
      parts: [
        box("plate", 0, 0.06, 0, 0.7, 0.06, 0.7, "#c6a05c"),
        box("sensor", 0, 0.17, 0, 0.65, 0.1, 0.65, "#f5d38a", true),
      ],
    },
    {
      ...base,
      id: "core:door",
      name: "升降门",
      bodyType: "kinematic",
      abilities: ["door"],
      behavior: { kind: "door", version: 1, travel: 2.5, speed: 1.5 },
      parts: [box("panel", 0, 1.1, 0, 0.8, 1.1, 0.12, "#658f99")],
    },
  ].map((d) => objectDefinitionSchema.parse(d));
}
type Node = { object: ObjectInstance; definition: ObjectDefinition };
/** A typed source→actuator graph: no recursive event queue, at most one visit per link/tick. */
export class PhysicsBehaviors {
  private nodes = new Map<string, Node>();
  private switches = new Map<string, boolean>();
  private active = new Map<string, boolean>();
  private blocked = new Set<string>();
  signalsLastTick = 0;
  constructor(private runtime: PhysicsRuntime) {
    this.refresh();
  }
  refresh() {
    this.nodes.clear();
    this.active.clear();
    this.blocked.clear();
    for (const object of this.runtime.scene.objects) {
      const definition = this.runtime.scene.definitions.find(
        (d) =>
          d.id === object.definitionId &&
          d.version === object.definitionVersion,
      )!;
      if (definition.behavior || definition.light)
        this.nodes.set(object.id, { object, definition });
    }
    for (const id of this.switches.keys())
      if (this.nodes.get(id)?.definition.behavior?.kind !== "switch")
        this.switches.delete(id);
    for (const [id, n] of this.nodes)
      if (n.definition.behavior?.kind === "switch" && !this.switches.has(id))
        this.switches.set(id, false);
    this.evaluate();
  }
  private evaluate() {
    for (const [id, n] of this.nodes) {
      if (n.definition.behavior?.kind === "switch")
        this.active.set(id, this.switches.get(id)!);
      else if (n.definition.behavior?.kind !== "pressure")
        this.active.set(id, !!n.definition.light);
    }
    const links = this.runtime.scene.links;
    if (links.length > physicsBudgets.signalsPerTick)
      throw new Error("机关传播超过单步预算");
    for (const l of links) this.active.set(l.to.objectId, false);
    this.signalsLastTick = 0;
    for (const l of links) {
      this.signalsLastTick++;
      if (this.active.get(l.from.objectId))
        this.active.set(l.to.objectId, true);
    }
  }
  toggle(id: string, character: PhysicsCharacter) {
    const node = this.nodes.get(id),
      body = this.runtime.bodies.get(id);
    if (node?.definition.behavior?.kind !== "switch" || !body)
      throw new Error("这个物品不是开关");
    const from = character.position(),
      target = body.collider(0).translation();
    const delta = {
      x: target.x - from.x,
      y: target.y - from.y,
      z: target.z - from.z,
    };
    const distance = Math.hypot(delta.x, delta.y, delta.z);
    if (distance > 2.5) throw new Error("再靠近一点，才能拨动开关");
    const ray = new RAPIER.Ray(from, delta);
    let obscured = false;
    this.runtime.world.propagateModifiedBodyPositionsToColliders();
    this.runtime.world.colliders.forEach((c: RAPIER.Collider) => {
      if (
        c.isSensor() ||
        c.parent()?.handle === body.handle ||
        isCharacterCollider(c.collisionGroups())
      )
        return;
      if (c.castRay(ray, 1, true) >= 0) obscured = true;
    });
    if (obscured) throw new Error("有东西挡住了，请走到开关旁边");
    this.switches.set(id, !this.switches.get(id));
    this.evaluate();
  }
  step(dt: number) {
    this.runtime.world.propagateModifiedBodyPositionsToColliders();
    const pressureCandidates: RAPIER.Collider[] = this.runtime
      .characterColliders()
      .filter((c) => ((c.collisionGroups() >>> 16) & 4) !== 0);
    if (
      [...this.nodes.values()].some(
        (n) => n.definition.behavior?.kind === "pressure",
      )
    )
      for (const body of this.runtime.bodies.values()) {
        if (!body.isDynamic()) continue;
        for (let i = 0; i < body.numColliders(); i++)
          if (!body.collider(i).isSensor())
            pressureCandidates.push(body.collider(i));
      }
    for (const [id, n] of this.nodes) {
      const config = n.definition.behavior;
      if (config?.kind !== "pressure") continue;
      const sensor = this.runtime.bodies
        .get(id)!
        .collider(n.definition.parts.findIndex((p) => p.id === config.partId));
      let pressed = false;
      for (const c of pressureCandidates) {
        if (sensor.intersectsShape(c.shape, c.translation(), c.rotation())) {
          pressed = true;
          break;
        }
      }
      this.active.set(id, pressed);
    }
    this.evaluate();
    this.blocked.clear();
    const planned = new Map<number, { x: number; y: number; z: number }>();
    for (const [id, n] of this.nodes) {
      const config = n.definition.behavior;
      if (config?.kind !== "door") continue;
      const body = this.runtime.bodies.get(id)!,
        p = body.translation();
      const target =
        n.object.position.y + (this.active.get(id) ? config.travel : 0);
      planned.set(body.handle, {
        x: 0,
        y: Math.max(
          -config.speed * dt,
          Math.min(config.speed * dt, target - p.y),
        ),
        z: 0,
      });
    }
    for (const [id, n] of this.nodes) {
      const config = n.definition.behavior;
      if (config?.kind !== "door") continue;
      const body = this.runtime.bodies.get(id)!,
        p = body.translation();
      const target =
        n.object.position.y + (this.active.get(id) ? config.travel : 0);
      const dy = Math.max(
        -config.speed * dt,
        Math.min(config.speed * dt, target - p.y),
      );
      if (Math.abs(dy) < 1e-6) continue;
      const shape = body.collider(0),
        start = shape.translation(),
        end = { ...start, y: start.y + dy },
        delta = { x: 0, y: dy, z: 0 };
      const bounds = this.runtime.scene.bounds;
      const half = (
        n.definition.parts[0]!.shape as {
          halfExtents: { x: number; y: number; z: number };
        }
      ).halfExtents;
      const radius = Math.hypot(half.x, half.y, half.z);
      let blocked =
        end.y + radius > bounds.max.y || end.y - radius < bounds.min.y;
      this.runtime.world.colliders.forEach((c: RAPIER.Collider) => {
        if (blocked || c.isSensor() || c.parent()?.handle === body.handle)
          return;
        const other = c.parent();
        const movement =
          other &&
          (planned.get(other.handle) ??
            (other.isKinematic()
              ? {
                  x: other.nextTranslation().x - other.translation().x,
                  y: other.nextTranslation().y - other.translation().y,
                  z: other.nextTranslation().z - other.translation().z,
                }
              : undefined));
        if (movement && Math.hypot(movement.x, movement.y, movement.z) > 1e-6) {
          const relative = c.castShape(
            movement,
            shape.shape,
            start,
            shape.rotation(),
            delta,
            0,
            1,
            false,
          );
          if (relative && relative.time_of_impact < 1 - 1e-3) {
            blocked = true;
            return;
          }
        }
        // Also test the current pose: another door may itself be blocked this tick.
        const next = c.contactShape(shape.shape, end, shape.rotation(), 0.001);
        if (next && next.distance < -0.001) {
          blocked = true;
          return;
        }
        // GJK casts can conservatively stop short of a broad flat support. A nonpenetrating
        // arrival on the approaching face is safe; the exit face must never allow tunnelling.
        if (next && next.distance >= -0.0001 && next.normal1.y * dy < 0) return;
        const hit = c.castShape(
          { x: 0, y: 0, z: 0 },
          shape.shape,
          start,
          shape.rotation(),
          delta,
          0,
          1,
          false,
        );
        if (hit && hit.time_of_impact < 1 - 1e-3) {
          const now = c.contactShape(
            shape.shape,
            start,
            shape.rotation(),
            0.001,
          );
          if (!(
            hit.time_of_impact < 1e-5 &&
            now &&
            (next?.distance ?? 1) >= now.distance
          ))
            blocked = true;
        }
      });
      if (blocked) {
        this.blocked.add(id);
        body.setNextKinematicTranslation(p);
      } else body.setNextKinematicTranslation({ ...p, y: p.y + dy });
    }
  }
  states(): PhysicsBehaviorState[] {
    return [...this.nodes.keys()].map((id) => ({
      id,
      active: !!this.active.get(id),
      blocked: this.blocked.has(id),
    }));
  }
  checkpoint(): PhysicsSwitchState[] {
    return [...this.switches].map(([id, on]) => ({ id, on }));
  }
  validateRestore(switches: PhysicsSwitchState[], states: BodyState[]) {
    if (
      switches.length !== this.switches.size ||
      new Set(switches.map((s) => s.id)).size !== switches.length ||
      switches.some((s) => !this.switches.has(s.id))
    )
      throw new Error("开关检查点与布局不符");
    for (const [id, n] of this.nodes) {
      const config = n.definition.behavior,
        state = states.find((s) => s.id === id);
      if (config?.kind !== "door" || !state) continue;
      const o = n.object;
      if (
        Math.abs(state.position.x - o.position.x) > 1e-5 ||
        Math.abs(state.position.z - o.position.z) > 1e-5 ||
        state.position.y < o.position.y - 1e-5 ||
        state.position.y > o.position.y + config.travel + 1e-5 ||
        (["x", "y", "z", "w"] as const).some(
          (k) => Math.abs(state.rotation[k] - o.rotation[k]) > 1e-5,
        )
      )
        throw new Error("门的保存姿态不在合法行程内");
    }
  }
  restore(switches: PhysicsSwitchState[]) {
    for (const s of switches) this.switches.set(s.id, s.on);
    this.active.clear();
    this.evaluate();
    this.blocked.clear();
  }
}
