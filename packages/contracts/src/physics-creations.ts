import { z } from "zod";
import {
  objectPartSchema,
  identityQuaternion,
  type ObjectPart,
  type Vector3,
  type Quaternion,
  type ObjectDefinition,
} from "./physics.js";

/** Bounds from the actual part geometry, including local rotation. */
export function physicsPartsBounds(parts: ObjectPart[]) {
  const min = { x: Infinity, y: Infinity, z: Infinity },
    max = { x: -Infinity, y: -Infinity, z: -Infinity };
  const rotate = (v: Vector3, q: Quaternion): Vector3 => {
    const tx = 2 * (q.y * v.z - q.z * v.y),
      ty = 2 * (q.z * v.x - q.x * v.z),
      tz = 2 * (q.x * v.y - q.y * v.x);
    return {
      x: v.x + q.w * tx + q.y * tz - q.z * ty,
      y: v.y + q.w * ty + q.z * tx - q.x * tz,
      z: v.z + q.w * tz + q.x * ty - q.y * tx,
    };
  };
  for (const p of parts) {
    const s = p.shape;
    const basis = [
      rotate({ x: 1, y: 0, z: 0 }, p.rotation),
      rotate({ x: 0, y: 1, z: 0 }, p.rotation),
      rotate({ x: 0, y: 0, z: 1 }, p.rotation),
    ];
    for (const axis of ["x", "y", "z"] as const) {
      let lo: number, hi: number;
      if (s.kind === "convex") {
        const values = s.vertices.map((v) => rotate(v, p.rotation)[axis]);
        lo = Math.min(...values);
        hi = Math.max(...values);
      } else {
        const radius =
          s.kind === "box"
            ? Math.abs(basis[0]![axis]) * s.halfExtents.x +
              Math.abs(basis[1]![axis]) * s.halfExtents.y +
              Math.abs(basis[2]![axis]) * s.halfExtents.z
            : s.kind === "ball"
              ? s.radius
              : s.kind === "capsule"
                ? s.radius + Math.abs(basis[1]![axis]) * s.halfHeight
                : s.radius * Math.hypot(basis[0]![axis], basis[2]![axis]) +
                  s.halfHeight * Math.abs(basis[1]![axis]);
        lo = -radius;
        hi = radius;
      }
      min[axis] = Math.min(min[axis], p.position[axis] + lo);
      max[axis] = Math.max(max[axis], p.position[axis] + hi);
    }
  }
  return { min, max };
}
export const physicsCreationBlueprintSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    material: z.enum(["wood", "stone", "rubber", "ice"]),
    bodyType: z.enum(["fixed", "dynamic"]),
    parts: z.array(objectPartSchema).min(1).max(24),
  })
  .strict()
  .superRefine((b, ctx) => {
    if (new Set(b.parts.map((p) => p.id)).size !== b.parts.length)
      ctx.addIssue({ code: "custom", message: "部件编号不能重复" });
    if (
      b.parts.some(
        (p) => p.sensor || !["box", "ball", "cylinder"].includes(p.shape.kind),
      )
    )
      ctx.addIssue({ code: "custom", message: "工坊只接受实体方块、球和圆柱" });
    const bounds = physicsPartsBounds(b.parts);
    if (
      bounds.min.x < -3.001 ||
      bounds.max.x > 3.001 ||
      bounds.min.z < -3.001 ||
      bounds.max.z > 3.001 ||
      Math.abs(bounds.min.y) > 0.001 ||
      bounds.max.y > 6.001
    )
      ctx.addIssue({
        code: "custom",
        message: "作品须在 6 × 6 × 6 范围内，底部接触底座",
      });
  });
export type PhysicsCreationBlueprint = z.infer<
  typeof physicsCreationBlueprintSchema
>;
export const savePhysicsCreationSchema = z
  .object({
    id: z.string().uuid(),
    expectedVersion: z.number().int().min(0).max(100),
    idempotencyKey: z.string().uuid(),
    blueprint: physicsCreationBlueprintSchema,
  })
  .strict();
export interface PhysicsCreationRecord {
  id: string;
  version: number;
  definition: ObjectDefinition;
  updatedAt: string;
}
export const physicsCreationDraftSchema = z
  .object({
    id: z.string().uuid(),
    version: z.number().int().min(0).max(100),
    blueprint: z
      .object({
        name: z.string().max(60),
        material: z.enum(["wood", "stone", "rubber", "ice"]),
        bodyType: z.enum(["fixed", "dynamic"]),
        parts: z.array(objectPartSchema).min(1).max(24),
      })
      .strict(),
  })
  .strict();
export function physicsTableTemplate(): PhysicsCreationBlueprint {
  const box = (
    id: string,
    x: number,
    y: number,
    z: number,
    hx: number,
    hy: number,
    hz: number,
  ): ObjectPart => ({
    id,
    position: { x, y, z },
    rotation: identityQuaternion,
    shape: { kind: "box", halfExtents: { x: hx, y: hy, z: hz } },
    color: "#bb8958",
    sensor: false,
  });
  return {
    name: "我的木桌",
    material: "wood",
    bodyType: "fixed",
    parts: [
      box("top", 0, 1.5, 0, 1.5, 0.125, 1),
      ...[-1.2, 1.2].flatMap((x) =>
        [-0.7, 0.7].map((z) =>
          box(`leg-${x}-${z}`, x, 0.7, z, 0.11, 0.7, 0.11),
        ),
      ),
    ],
  };
}
export interface PhysicsAssetCatalog {
  items: ObjectDefinition[];
  shop: {
    itemId: import("./shop.js").FurnitureId;
    price: number;
    definition: ObjectDefinition;
  }[];
  creations: PhysicsCreationRecord[];
  inventory: {
    id: string;
    itemId: import("./shop.js").FurnitureId;
    worldId: string | null;
    physicsSceneId: string | null;
  }[];
}
