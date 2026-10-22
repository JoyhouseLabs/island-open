import RAPIER from "@dimforge/rapier3d-compat";
import {
  identityQuaternion,
  type PhysicsTerrainTile,
  type Vector3,
  type Quaternion,
} from "@island/contracts";

const terrain = new WeakMap<RAPIER.World, Map<number, PhysicsTerrainTile>>();
export function registerTerrain(
  world: RAPIER.World,
  collider: RAPIER.Collider,
  tile: PhysicsTerrainTile,
) {
  let tiles = terrain.get(world);
  if (!tiles) {
    tiles = new Map();
    terrain.set(world, tiles);
  }
  tiles.set(collider.handle, tile);
}
export function forgetTerrain(world: RAPIER.World) {
  terrain.delete(world);
}
function radius(shape: RAPIER.Shape) {
  if (shape instanceof RAPIER.Cuboid)
    return Math.hypot(
      shape.halfExtents.x,
      shape.halfExtents.y,
      shape.halfExtents.z,
    );
  if (shape instanceof RAPIER.Ball) return shape.radius;
  if (shape instanceof RAPIER.Capsule || shape instanceof RAPIER.Cylinder)
    return shape.halfHeight + shape.radius;
  if (shape instanceof RAPIER.ConvexPolyhedron) {
    let r = 0;
    for (let i = 0; i < shape.vertices.length; i += 3)
      r = Math.max(
        r,
        Math.hypot(
          shape.vertices[i]!,
          shape.vertices[i + 1]!,
          shape.vertices[i + 2]!,
        ),
      );
    return r;
  }
  throw new Error("地形接触查询不支持这个活动形状");
}
/** Rapier 0.19 pairwise contact queries do not dispatch against a whole TriMesh.
 * Query only triangles in the convex shape's conservative x/z footprint. Shape casts
 * and world simulation still use Rapier's mesh BVH, never a duplicate collision world.
 */
export function contactWithTerrain(
  world: RAPIER.World,
  collider: RAPIER.Collider,
  shape: RAPIER.Shape,
  position: Vector3,
  rotation: Quaternion,
  prediction = 0,
): RAPIER.ShapeContact | null {
  const tile = terrain.get(world)?.get(collider.handle);
  if (!tile)
    return collider.contactShape(shape, position, rotation, prediction);
  const r = radius(shape) + prediction;
  const minX = Math.max(
      0,
      Math.floor((position.x - r - tile.origin.x) / tile.step),
    ),
    maxX = Math.min(
      tile.columns - 1,
      Math.floor((position.x + r - tile.origin.x) / tile.step),
    ),
    minZ = Math.max(
      0,
      Math.floor((position.z - r - tile.origin.z) / tile.step),
    ),
    maxZ = Math.min(
      tile.rows - 1,
      Math.floor((position.z + r - tile.origin.z) / tile.step),
    );
  let best: RAPIER.ShapeContact | null = null;
  const vertex = (x: number, z: number) => ({
    x: Math.fround(x * tile.step),
    y: Math.fround(tile.heights[z * (tile.columns + 1) + x]!),
    z: Math.fround(z * tile.step),
  });
  for (let z = minZ; z <= maxZ; z++)
    for (let x = minX; x <= maxX; x++) {
      if (tile.cells && !tile.cells[z * tile.columns + x]) continue;
      const a = vertex(x, z),
        b = vertex(x + 1, z),
        c = vertex(x, z + 1),
        d = vertex(x + 1, z + 1);
      for (const triangle of [
        new RAPIER.Triangle(a, c, b),
        new RAPIER.Triangle(b, c, d),
      ]) {
        const hit = triangle.contactShape(
          tile.origin,
          identityQuaternion,
          shape,
          position,
          rotation,
          prediction,
        );
        if (hit && (!best || hit.distance < best.distance)) best = hit;
      }
    }
  return best;
}
