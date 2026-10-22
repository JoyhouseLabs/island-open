import { moveBody, type Box } from "./building.js";
import { pushOut } from "./physics.js";
import type { Cell, BlockValue } from "@island/contracts";
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
  if (
    f.blueprint.parts.some((p) => p.light) &&
    (w.creations ?? []).filter(
      (p) => p.id !== f.id && p.blueprint.parts.some((part) => part.light),
    ).length >= 4
  )
    return "主岛最多同时摆放 4 件发光造物，请先收起一盏灯。";
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
  return items
    .filter((f) => f.blueprint.physics !== "parts")
    .map((f) => ({
      x: f.x,
      z: f.z,
      r: Math.max(creationSize(f).x, creationSize(f).z),
      halfSize: creationSize(f),
    }));
}

/** The same quarter-turn transform used by Three.js rotation.y. */
export function creationPartPosition(
  f: CreationPlacement,
  p: CreationPlacement["blueprint"]["parts"][number],
) {
  const r = f.rotation,
    x = r === 0 ? p.x : r === 1 ? p.z : r === 2 ? -p.x : -p.z,
    z = r === 0 ? p.z : r === 1 ? -p.x : r === 2 ? -p.z : p.x;
  return { x: f.x + x, y: groundHeight(f.x, f.z) + 0.05 + p.y, z: f.z + z };
}
export function creationCollisionBoxes(items: CreationPlacement[]): Box[] {
  return items
    .filter((f) => f.blueprint.physics === "parts")
    .flatMap((f) =>
      f.blueprint.parts.map((p) => {
        const c = creationPartPosition(f, p),
          turn = (f.rotation + p.rotation) % 2;
        const hx = (turn ? p.depth : p.width) / 2,
          hz = (turn ? p.width : p.depth) / 2;
        return {
          min: { x: c.x - hx, y: c.y - p.height / 2, z: c.z - hz },
          max: { x: c.x + hx, y: c.y + p.height / 2, z: c.z + hz },
        };
      }),
    );
}
export type CreationSeat = {
  id: string;
  x: number;
  z: number;
  standY: number;
  yaw: number;
};
export function creationSeats(items: CreationPlacement[]): CreationSeat[] {
  return items
    .filter((f) => f.blueprint.physics === "parts")
    .flatMap((f) =>
      f.blueprint.parts
        .filter((p) => p.seat)
        .map((p) => {
          const c = creationPartPosition(f, p);
          return {
            id: `${f.id}:${p.id}`,
            x: c.x,
            z: c.z,
            standY: c.y + p.height / 2,
            yaw: (((f.rotation + p.rotation) % 4) * Math.PI) / 2,
          };
        }),
    );
}
/** Bounded lift + approach, with both legacy obstacles and 3D geometry checked. */
export function approachCreationSeat(
  start: Cell,
  seat: CreationSeat,
  cells: Map<string, BlockValue>,
  boxes: Box[],
  obstacles: Obstacle[],
): Cell | null {
  const dx = start.x - seat.x,
    dz = start.z - seat.z;
  if (
    Math.hypot(dx, dz) > 2.5 ||
    dx * Math.sin(seat.yaw) + dz * Math.cos(seat.yaw) < 0.1 ||
    Math.abs(start.y - seat.standY) > 1.8
  )
    return null;
  let at = { ...start };
  for (const destination of [
    { ...start, y: seat.standY },
    { x: seat.x, y: seat.standY, z: seat.z },
  ]) {
    const n = Math.max(
      1,
      Math.ceil(
        Math.hypot(
          destination.x - at.x,
          destination.y - at.y,
          destination.z - at.z,
        ) / 0.15,
      ),
    );
    const step = {
      x: (destination.x - at.x) / n,
      y: (destination.y - at.y) / n,
      z: (destination.z - at.z) / n,
    };
    for (let i = 0; i < n; i++) {
      const moved = moveBody(at, step, cells, boxes);
      if (Object.values(moved.blocked).some(Boolean)) return null;
      const pushed = pushOut(
        moved.position.x,
        moved.position.z,
        moved.position.y,
        obstacles,
        0.4,
      );
      if (
        Math.hypot(pushed.x - moved.position.x, pushed.z - moved.position.z) >
        0.001
      )
        return null;
      at = moved.position;
    }
  }
  return at;
}
