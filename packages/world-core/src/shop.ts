import {
  furnitureCatalog,
  creationSize,
  type FurniturePlacement,
  type WorldSnapshot,
} from "@island/contracts";
import { groundHeight, placementError } from "./index.js";
import type { Obstacle } from "./physics.js";
import { furnitureSurfaces } from "./surfaces.js";

export function furnitureSize(f: FurniturePlacement) {
  const d = furnitureCatalog.find((d) => d.id === f.itemId)!;
  return f.rotation % 2
    ? { x: d.depth / 2, z: d.width / 2 }
    : { x: d.width / 2, z: d.depth / 2 };
}
export function furniturePlacementError(
  w: WorldSnapshot,
  f: FurniturePlacement,
): string | null {
  if (w.scene !== "island") return "家具目前可以摆在主岛，其他场景稍后开放。";
  if (
    !(w.furniture ?? []).some((p) => p.id === f.id) &&
    (w.furniture?.length ?? 0) >= 100
  )
    return "主岛最多摆放 100 件家具，请先收起一些。";
  const size = furnitureSize(f);
  const heights: number[] = [];
  // Sample the whole footprint, including edges, so large furniture cannot straddle a path.
  for (let ix = 0; ix <= 4; ix++)
    for (let iz = 0; iz <= 4; iz++) {
      const p = {
        x: f.x + size.x * (ix / 2 - 1),
        z: f.z + size.z * (iz / 2 - 1),
      };
      const error = placementError(p, w.entities, undefined, "bench");
      if (error) return error;
      heights.push(groundHeight(p.x, p.z));
    }
  if (Math.max(...heights) - Math.min(...heights) > 0.65)
    return "这里坡度有点大，换一块平坦空地吧。";
  for (const other of w.furniture ?? []) {
    if (other.id === f.id) continue;
    const b = furnitureSize(other);
    if (
      Math.abs(other.x - f.x) < size.x + b.x + 0.35 &&
      Math.abs(other.z - f.z) < size.z + b.z + 0.35
    )
      return "和另一件家具太近啦，请留一点空间。";
  }
  for (const other of w.creations ?? []) {
    const b = creationSize(other);
    if (Math.abs(other.x - f.x) < size.x + b.x + 0.35 && Math.abs(other.z - f.z) < size.z + b.z + 0.35)
      return "和造物太近啦，请留一点空间。";
  }
  return null;
}
export function furnitureObstacles(items: FurniturePlacement[]): Obstacle[] {
  return items
    .filter((f) => {
      const d = furnitureCatalog.find((d) => d.id === f.itemId)!;
      return furnitureSurfaces[d.shape].pass !== "through";
    })
    .map((f) => ({
      x: f.x,
      z: f.z,
      r: Math.max(furnitureSize(f).x, furnitureSize(f).z),
      halfSize: furnitureSize(f),
    }));
}
