import RAPIER from "@dimforge/rapier3d-compat";
import {
  identityQuaternion,
  physicsMaterials,
  type ObjectDefinition,
  type ObjectInstance,
  type Vector3,
  type Quaternion,
} from "@island/contracts";
import { collisionGroups } from "./groups.js";
export const BLOCK_CHUNK_SIZE = 8;
const near = (a: number, b: number) => Math.abs(a - b) < 1e-7;
/** Only the unit construction block is batched; furniture and creations keep compound bodies. */
export function isConstructionBlock(definition: ObjectDefinition): boolean {
  const p = definition.parts[0],
    s = p?.shape;
  return (
    definition.id === "core:block" &&
    definition.version === 1 &&
    definition.source === "official" &&
    definition.bodyType === "fixed" &&
    definition.material === "wood" &&
    definition.abilities.length === 0 &&
    definition.parts.length === 1 &&
    !!p &&
    !p.sensor &&
    s?.kind === "box" &&
    [s.halfExtents.x, s.halfExtents.y, s.halfExtents.z].every(
      (v) => v === 0.5,
    ) &&
    [p.position.x, p.position.y, p.position.z].every((v) => v === 0) &&
    p.rotation.x === 0 &&
    p.rotation.y === 0 &&
    p.rotation.z === 0 &&
    Math.abs(p.rotation.w) === 1
  );
}
export const blockChunkKey = (p: Vector3) =>
  [p.x, p.y, p.z].map((v) => Math.floor(v / BLOCK_CHUNK_SIZE)).join(":");
/** Snap against the clicked surface, including negative-facing sides of blocks. */
export function snapBlockPosition(
  point: Vector3,
  normal: Vector3 = { x: 0, y: 1, z: 0 },
): Vector3 {
  return {
    x: Math.round(point.x + normal.x * 0.5),
    y: Math.round(point.y + normal.y * 0.5 - 0.5) + 0.5,
    z: Math.round(point.z + normal.z * 0.5),
  };
}
function aligned(q: Quaternion) {
  const { x, y, z, w } = q;
  const matrix = [
    1 - 2 * (y * y + z * z),
    2 * (x * y - z * w),
    2 * (x * z + y * w),
    2 * (x * y + z * w),
    1 - 2 * (x * x + z * z),
    2 * (y * z - x * w),
    2 * (x * z - y * w),
    2 * (y * z + x * w),
    1 - 2 * (x * x + y * y),
  ];
  return matrix.every((v) => near(v, Math.round(v)));
}
const cellKey = (x: number, y: number, z: number) => `${x}:${y}:${z}`;
interface BlockBox {
  position: Vector3;
  rotation: Quaternion;
  halfExtents: Vector3;
  ids: string[];
}
/** Deterministic greedy boxes never span a chunk, bridge a gap, or merge duplicate cells. */
export function mergeBlockBoxes(objects: Iterable<ObjectInstance>): BlockBox[] {
  const cells = new Map<string, ObjectInstance[]>(),
    boxes: BlockBox[] = [];
  for (const o of objects) {
    const p = o.position;
    if (
      aligned(o.rotation) &&
      near(p.x, Math.round(p.x)) &&
      near(p.y - 0.5, Math.round(p.y - 0.5)) &&
      near(p.z, Math.round(p.z))
    ) {
      const key = cellKey(
        Math.round(p.x),
        Math.round(p.y - 0.5),
        Math.round(p.z),
      );
      const list = cells.get(key) ?? [];
      list.push(o);
      cells.set(key, list);
    } else
      boxes.push({
        position: p,
        rotation: o.rotation,
        halfExtents: { x: 0.5, y: 0.5, z: 0.5 },
        ids: [o.id],
      });
  }
  for (const [key, list] of cells)
    if (list.length !== 1) {
      for (const o of list)
        boxes.push({
          position: o.position,
          rotation: o.rotation,
          halfExtents: { x: 0.5, y: 0.5, z: 0.5 },
          ids: [o.id],
        });
      cells.delete(key);
    }
  const order = [...cells.keys()]
    .map((k) => k.split(":").map(Number) as [number, number, number])
    .sort((a, b) => a[1] - b[1] || a[2] - b[2] || a[0] - b[0]);
  for (const [x, y, z] of order) {
    if (!cells.has(cellKey(x, y, z))) continue;
    let width = 1,
      depth = 1,
      height = 1;
    while (cells.has(cellKey(x + width, y, z))) width++;
    const row = (dy: number, dz: number) => {
      for (let dx = 0; dx < width; dx++)
        if (!cells.has(cellKey(x + dx, y + dy, z + dz))) return false;
      return true;
    };
    while (row(0, depth)) depth++;
    const layer = (dy: number) => {
      for (let dz = 0; dz < depth; dz++) if (!row(dy, dz)) return false;
      return true;
    };
    while (layer(height)) height++;
    const ids: string[] = [];
    for (let dy = 0; dy < height; dy++)
      for (let dz = 0; dz < depth; dz++)
        for (let dx = 0; dx < width; dx++) {
          const key = cellKey(x + dx, y + dy, z + dz);
          ids.push(cells.get(key)![0]!.id);
          cells.delete(key);
        }
    boxes.push({
      position: {
        x: x + (width - 1) / 2,
        y: y + height / 2,
        z: z + (depth - 1) / 2,
      },
      rotation: identityQuaternion,
      halfExtents: { x: width / 2, y: height / 2, z: depth / 2 },
      ids,
    });
  }
  return boxes;
}
interface Chunk {
  members: Map<string, ObjectInstance>;
  body?: RAPIER.RigidBody;
  colliders: Array<{ collider: RAPIER.Collider; ids: string[] }>;
}
export class BlockChunks {
  readonly instances = new Map<string, ObjectInstance>();
  private chunks = new Map<string, Chunk>();
  private unit = new RAPIER.Cuboid(0.5, 0.5, 0.5);
  private rebuilds = 0;
  private lastRebuilt: string[] = [];
  constructor(
    private world: RAPIER.World,
    objects: ObjectInstance[],
    private onCollider: (handle: number, id: string | null) => void,
  ) {
    for (const object of objects) this.addMember(object);
    this.rebuild([...this.chunks.keys()]);
  }
  private addMember(object: ObjectInstance) {
    const key = blockChunkKey(object.position);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = { members: new Map(), colliders: [] };
      this.chunks.set(key, chunk);
    }
    chunk.members.set(object.id, object);
    this.instances.set(object.id, object);
    return key;
  }
  private rebuild(keys: string[]) {
    this.lastRebuilt = [...new Set(keys)].sort();
    for (const key of this.lastRebuilt) {
      const chunk = this.chunks.get(key);
      if (!chunk) continue;
      this.rebuilds++;
      for (const { collider } of chunk.colliders)
        this.onCollider(collider.handle, null);
      if (chunk.body) this.world.removeRigidBody(chunk.body);
      if (!chunk.members.size) {
        this.chunks.delete(key);
        continue;
      }
      // A local origin keeps collider offsets small even in far-away world chunks.
      const [x, y, z] = key
        .split(":")
        .map((v) => Number(v) * BLOCK_CHUNK_SIZE) as [number, number, number];
      chunk.body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z),
      );
      chunk.colliders = [];
      const material = physicsMaterials.wood;
      for (const box of mergeBlockBoxes(chunk.members.values())) {
        const collider = this.world.createCollider(
          RAPIER.ColliderDesc.cuboid(
            box.halfExtents.x,
            box.halfExtents.y,
            box.halfExtents.z,
          )
            .setTranslation(
              box.position.x - x,
              box.position.y - y,
              box.position.z - z,
            )
            .setRotation(box.rotation)
            .setFriction(material.friction)
            .setRestitution(material.restitution)
            .setDensity(material.density)
            .setCollisionGroups(collisionGroups.fixed)
            .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
            .setContactForceEventThreshold(1),
          chunk.body,
        );
        chunk.colliders.push({ collider, ids: box.ids });
        this.onCollider(collider.handle, box.ids[0]!);
      }
    }
  }
  replace(id: string, next?: ObjectInstance) {
    const keys: string[] = [],
      old = this.instances.get(id);
    if (old) {
      const key = blockChunkKey(old.position);
      this.chunks.get(key)!.members.delete(id);
      this.instances.delete(id);
      keys.push(key);
    }
    if (next) keys.push(this.addMember(next));
    this.rebuild(keys);
  }
  stats() {
    return {
      blocks: this.instances.size,
      chunks: this.chunks.size,
      colliders: [...this.chunks.values()].reduce(
        (n, c) => n + c.colliders.length,
        0,
      ),
      rebuilds: this.rebuilds,
      lastRebuilt: [...this.lastRebuilt],
    };
  }
  colliders() {
    return [...this.chunks.values()].flatMap((c) =>
      c.colliders.map((v) => v.collider),
    );
  }
  overlaps(shape: RAPIER.Collider, radius: number, excluding?: string) {
    const p = shape.translation(),
      padding = 1;
    for (const [key, chunk] of this.chunks) {
      const minimum = key.split(":").map((v) => Number(v) * BLOCK_CHUNK_SIZE);
      if (
        (["x", "y", "z"] as const).some(
          (axis, i) =>
            p[axis] + radius < minimum[i]! - padding ||
            p[axis] - radius > minimum[i]! + BLOCK_CHUNK_SIZE + padding,
        )
      )
        continue;
      for (const entry of chunk.colliders) {
        if ((shape.contactCollider(entry.collider, 0)?.distance ?? 0) >= -0.02)
          continue;
        if (!excluding || !entry.ids.includes(excluding)) return true;
        // Removing/moving one member must not exclude its still-solid neighbours.
        for (const id of entry.ids) {
          if (id === excluding) continue;
          const other = this.instances.get(id)!;
          if (
            (["x", "y", "z"] as const).some(
              (axis) =>
                Math.abs(p[axis] - other.position[axis]) >
                radius + Math.sqrt(3) / 2,
            )
          )
            continue;
          if (
            (shape.contactShape(this.unit, other.position, other.rotation, 0)
              ?.distance ?? 0) < -0.02
          )
            return true;
        }
      }
    }
    return false;
  }
  dispose() {
    for (const chunk of this.chunks.values()) {
      for (const entry of chunk.colliders)
        this.onCollider(entry.collider.handle, null);
      if (chunk.body) this.world.removeRigidBody(chunk.body);
    }
    this.chunks.clear();
    this.instances.clear();
    this.lastRebuilt = [];
  }
}
