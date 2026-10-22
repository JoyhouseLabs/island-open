import {
  creationSize,
  type CreationPlacement,
  type WorldSnapshot,
} from "@island/contracts";
import { groundHeight, placementError } from "./index.js";
import { furnitureSize } from "./shop.js";
import type { Obstacle } from "./physics.js";
export function creationPlacementError(
  w: WorldSnapshot,
  f: CreationPlacement,
): string | null {
  if (w.scene !== "island") return "造物目前可以摆在主岛。";
  if (
    !(w.creations ?? []).some((p) => p.id === f.id) &&
    (w.creations?.length ?? 0) >= 16
  )
    return "主岛最多摆放 16 件造物，请先收起一些。";
  const size = creationSize(f),
    heights: number[] = [];
  for (let ix = 0; ix <= 6; ix++)
    for (let iz = 0; iz <= 6; iz++) {
      const p = {
        x: f.x + size.x * (ix / 3 - 1),
        z: f.z + size.z * (iz / 3 - 1),
      };
      const error = placementError(p, w.entities, undefined, "bench");
      if (error) return error;
      heights.push(groundHeight(p.x, p.z));
    }
  if (Math.max(...heights) - Math.min(...heights) > 0.65)
    return "这里坡度太大，换一块平坦空地吧。";
  for (const other of w.creations ?? []) {
    if (other.id === f.id) continue;
    const b = creationSize(other);
    if (
      Math.abs(other.x - f.x) < size.x + b.x + 0.35 &&
      Math.abs(other.z - f.z) < size.z + b.z + 0.35
    )
      return "和另一件造物太近啦，请留一点空间。";
  }
  for (const other of w.furniture ?? []) {
    const b = furnitureSize(other);
    if (
      Math.abs(other.x - f.x) < size.x + b.x + 0.35 &&
      Math.abs(other.z - f.z) < size.z + b.z + 0.35
    )
      return "和家具太近啦，请留一点空间。";
  }
  return null;
}
export function creationObstacles(items: CreationPlacement[]): Obstacle[] {
  return items.map((f) => ({
    x: f.x,
    z: f.z,
    r: Math.max(creationSize(f).x, creationSize(f).z),
    halfSize: creationSize(f),
  }));
}
