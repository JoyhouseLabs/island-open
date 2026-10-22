import {
  physicsRegionSchema,
  type PhysicsRegion,
  physicsTerrainSchema,
  terrainGeometry,
  physicsBudgets,
  PHYSICS_RULES_VERSION,
  vector3Schema,
  physicsMaterials,
  identityQuaternion,
  type PhysicsTerrainTile,
  type Vector3,
} from "@island/contracts";
import { PhysicsRuntime, RAPIER, colliderDescription } from "./index.js";
import { collisionGroups } from "./groups.js";
import {
  registerTerrain,
  unregisterTerrain,
  contactWithTerrain,
} from "./terrain.js";

type Mounted = {
  data: PhysicsRegion;
  body: RAPIER.RigidBody;
  terrain: PhysicsTerrainTile[];
};
/** A procedural, local exploration world. One shared Runtime/clock/controller; regions
 * are generated infrastructure, not editable instances or a saved-layout adapter. */
export class PhysicsRegionWorld {
  readonly player;
  private regions = new Map<string, Mounted>();
  private disposed = false;
  private constructor(readonly runtime: PhysicsRuntime) {
    this.player = runtime.createCharacter("explorer");
  }
  static async create(spawn: Vector3) {
    return new PhysicsRegionWorld(
      await PhysicsRuntime.create({
        schemaVersion: 4,
        physicsVersion: PHYSICS_RULES_VERSION,
        id: "procedural-exploration",
        name: "外围探索",
        template: { id: "core:procedural-exploration", version: 1 },
        definitions: [],
        objects: [],
        links: [],
        terrain: [],
        spawn,
        bounds: {
          min: { x: -1024, y: -256, z: -1024 },
          max: { x: 1024, y: 256, z: 1024 },
        },
      }),
    );
  }
  get stats() {
    return {
      regions: this.regions.size,
      colliders: [...this.regions.values()].reduce(
        (n, r) => n + r.body.numColliders(),
        0,
      ),
      triangles: [...this.regions.values()].reduce(
        (n, r) =>
          n +
          r.terrain.reduce(
            (n, t) =>
              n +
              2 *
                (t.cells ? t.cells.filter(Boolean).length : t.rows * t.columns),
            0,
          ),
        0,
      ),
    };
  }
  has(id: string) {
    return this.regions.has(id);
  }
  private alive() {
    if (this.disposed) throw new Error("探索物理场景已经关闭");
  }
  mount(input: PhysicsRegion) {
    this.alive();
    const data = physicsRegionSchema.parse(input);
    const all = [
      ...[...this.regions.values()]
        .filter((r) => r.data.id !== data.id)
        .map((r) => r.data),
      data,
    ];
    if (
      all.length > 64 ||
      all.reduce((n, r) => n + r.parts.length + r.terrain.length, 0) >
        physicsBudgets.staticColliders
    )
      throw new Error("探索区块超过物理容量，请留在已加载区域");
    physicsTerrainSchema.parse(
      all.flatMap((r) =>
        r.terrain.map((t) => ({ ...t, id: `${r.id}:${t.id}` })),
      ),
    );
    const body = this.runtime.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(
        data.origin.x,
        data.origin.y,
        data.origin.z,
      ),
    );
    const tiles: PhysicsTerrainTile[] = [];
    try {
      for (const tile of data.terrain) {
        const mesh = terrainGeometry(tile),
          m = physicsMaterials[tile.material];
        const collider = this.runtime.world.createCollider(
          RAPIER.ColliderDesc.trimesh(
            mesh.positions,
            mesh.indices,
            RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES,
          )
            .setTranslation(tile.origin.x, tile.origin.y, tile.origin.z)
            .setFriction(m.friction)
            .setRestitution(m.restitution)
            .setCollisionGroups(collisionGroups.fixed),
          body,
        );
        const absolute = {
          ...tile,
          origin: {
            x: tile.origin.x + data.origin.x,
            y: tile.origin.y + data.origin.y,
            z: tile.origin.z + data.origin.z,
          },
        };
        tiles.push(absolute);
        registerTerrain(this.runtime.world, collider, absolute);
      }
      for (const part of data.parts) {
        const m = physicsMaterials[part.material];
        this.runtime.world.createCollider(
          colliderDescription(part.shape)
            .setTranslation(part.position.x, part.position.y, part.position.z)
            .setRotation(part.rotation)
            .setFriction(m.friction)
            .setRestitution(m.restitution)
            .setCollisionGroups(collisionGroups.fixed),
          body,
        );
      }
    } catch (error) {
      this.release(body);
      throw error;
    }
    this.remove(data.id);
    this.regions.set(data.id, { data, body, terrain: tiles });
    this.runtime.world.propagateModifiedBodyPositionsToColliders();
  }
  private release(body: RAPIER.RigidBody) {
    for (let i = 0; i < body.numColliders(); i++)
      unregisterTerrain(this.runtime.world, body.collider(i));
    this.runtime.world.removeRigidBody(body);
  }
  remove(id: string) {
    this.alive();
    const old = this.regions.get(id);
    if (old) {
      this.release(old.body);
      this.regions.delete(id);
    }
  }
  retain(ids: Set<string>) {
    for (const id of this.regions.keys()) if (!ids.has(id)) this.remove(id);
  }
  /** Rebase every physical resource and preserve momentum; caller applies the same delta to drawing. */
  rebase(delta: Vector3) {
    this.alive();
    vector3Schema.parse(delta);
    const subtract = (p: Vector3) => ({
      x: p.x - delta.x,
      y: p.y - delta.y,
      z: p.z - delta.z,
    });
    for (const r of this.regions.values()) {
      r.data.origin = subtract(r.data.origin);
      r.body.setTranslation(r.data.origin, true);
      for (const tile of r.terrain) tile.origin = subtract(tile.origin);
    }
    const state = this.player.snapshot();
    this.player.reconcile({ ...state, position: subtract(state.position) });
    this.runtime.world.propagateModifiedBodyPositionsToColliders();
    this.runtime.pauseClock();
  }
  /** Synchronize Rapier's query structures after region changes, with the capsule held still. */
  refreshQueries() {
    this.alive();
    this.runtime.step();
    this.runtime.pauseClock();
  }
  /** Restored journals store horizontal location; choose a real, unoccupied physical support. */
  placeOnSurface(x: number, z: number) {
    this.alive();
    for (const [dx, dz] of [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [2, 0],
      [-2, 0],
      [0, 2],
      [0, -2],
    ]) {
      // Sweep the capsule, not a point: its rounded base needs extra clearance on slopes.
      const hit = this.runtime.world.castShape(
        { x: x + dx!, y: 128, z: z + dz! },
        identityQuaternion,
        { x: 0, y: -1, z: 0 },
        this.player.collider.shape,
        0,
        256,
        true,
        RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
        undefined,
        this.player.collider,
        this.player.body,
      );
      if (!hit) continue;
      const position = {
        x: x + dx!,
        y: 128 - hit.time_of_impact + 0.02,
        z: z + dz!,
      };
      let free = true;
      this.runtime.world.colliders.forEach((c: RAPIER.Collider) => {
        if (
          c.handle !== this.player.collider.handle &&
          (contactWithTerrain(
            this.runtime.world,
            c,
            this.player.collider.shape,
            position,
            identityQuaternion,
          )?.distance ?? 0) < -0.005
        )
          free = false;
      });
      if (free) {
        this.player.teleport(position);
        this.runtime.world.propagateModifiedBodyPositionsToColliders();
        this.refreshQueries();
        return;
      }
    }
    throw new Error("当前位置没有安全落脚点，请返回营地");
  }
  dispose() {
    if (this.disposed) return;
    for (const r of this.regions.values()) this.release(r.body);
    this.regions.clear();
    this.runtime.dispose();
    this.disposed = true;
  }
}
