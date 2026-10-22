import { z } from "zod";

export const quarterTurnSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);
const dimension = z.number().finite().min(0.25).max(6).multipleOf(0.25);
const coordinate = z.number().finite().min(-3).max(3).multipleOf(0.125);
export const creationPartSchema = z
  .object({
    id: z.string().uuid(),
    shape: z.enum(["box", "sphere", "cylinder"]),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    x: coordinate,
    y: z.number().finite().min(0.125).max(6).multipleOf(0.125),
    z: coordinate,
    width: dimension,
    height: dimension,
    depth: dimension,
    rotation: quarterTurnSchema,
    seat: z.literal(true).optional(),
    light: z
      .object({
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        intensity: z.number().finite().min(1).max(8),
        distance: z.number().finite().min(2).max(8),
      })
      .strict()
      .optional(),
  })
  .strict();
export type CreationPart = z.infer<typeof creationPartSchema>;
export const creationBlueprintSchema = z
  .object({
    name: z.string().trim().min(1).max(40),
    parts: z.array(creationPartSchema).min(1).max(24),
    physics: z.literal("parts").optional(),
  })
  .strict()
  .superRefine((b, ctx) => {
    const seats = b.parts.filter((p) => p.seat);
    if (seats.length > 1)
      ctx.addIssue({ code: "custom", message: "一件造物最多设置一个座面" });
    if (b.parts.filter((p) => p.light).length > 1)
      ctx.addIssue({ code: "custom", message: "一件造物最多设置一个发光部件" });
    for (const seat of seats) {
      const top = seat.y + seat.height / 2;
      if (
        b.physics !== "parts" ||
        seat.shape !== "box" ||
        seat.width < 1 ||
        seat.depth < 1 ||
        top < 0.5 ||
        top > 1.75
      )
        ctx.addIssue({
          code: "custom",
          message:
            "座面需要开启按部件碰撞，使用至少 1 × 1 的方块，顶面高度在 0.5–1.75 之间",
        });
      if (
        b.parts.some(
          (p) =>
            p.id !== seat.id &&
            p.y + p.height / 2 > top + 0.001 &&
            p.y - p.height / 2 < top + 1.8 &&
            Math.abs(p.x - seat.x) <
              (p.rotation % 2 ? p.depth : p.width) / 2 + 0.4 &&
            Math.abs(p.z - seat.z) <
              (p.rotation % 2 ? p.width : p.depth) / 2 + 0.4,
        )
      )
        ctx.addIssue({
          code: "custom",
          message: "座面中央上方需要留出空间，请移开挡住身体的部件",
        });
    }
    if (new Set(b.parts.map((p) => p.id)).size !== b.parts.length)
      ctx.addIssue({ code: "custom", message: "部件编号不能重复" });
    for (const p of b.parts) {
      const hx = (p.rotation % 2 ? p.depth : p.width) / 2;
      const hz = (p.rotation % 2 ? p.width : p.depth) / 2;
      if (
        Math.abs(p.x) + hx > 3 ||
        Math.abs(p.z) + hz > 3 ||
        p.y - p.height / 2 < 0 ||
        p.y + p.height / 2 > 6
      )
        ctx.addIssue({
          code: "custom",
          message: "请把所有部件放在 6 × 6 的底座内，高度在 0–6 之间",
        });
    }
    if (!b.parts.some((p) => p.y === p.height / 2))
      ctx.addIssue({ code: "custom", message: "至少一个部件要接触地面" });
  });
export type CreationBlueprint = z.infer<typeof creationBlueprintSchema>;
export const saveCreationSchema = z
  .object({
    id: z.string().uuid(),
    expectedVersion: z.number().int().min(0).max(100),
    idempotencyKey: z.string().uuid(),
    capabilities: z
      .array(z.literal("creationInteractionsV1"))
      .max(1)
      .optional(),
    blueprint: creationBlueprintSchema,
  })
  .strict();
export type SaveCreationRequest = z.infer<typeof saveCreationSchema>;
export interface CreationDefinition {
  id: string;
  version: number;
  blueprint: CreationBlueprint;
  updatedAt: string;
}
export const creationPlacementSchema = z
  .object({
    id: z.string().uuid(),
    definitionId: z.string().uuid(),
    definitionVersion: z.number().int().min(1).max(100),
    // Immutable render cache. The API checks it against the author's stored version.
    blueprint: creationBlueprintSchema,
    x: z.number().finite().min(-160).max(160),
    z: z.number().finite().min(-135).max(135),
    rotation: quarterTurnSchema,
  })
  .strict();
export type CreationPlacement = z.infer<typeof creationPlacementSchema>;
/** Conservative, centered footprint shared by placement, rendering and physics. */
export function creationSize(
  f: Pick<CreationPlacement, "blueprint" | "rotation">,
) {
  let x = 0,
    z = 0;
  for (const p of f.blueprint.parts) {
    x = Math.max(x, Math.abs(p.x) + (p.rotation % 2 ? p.depth : p.width) / 2);
    z = Math.max(z, Math.abs(p.z) + (p.rotation % 2 ? p.width : p.depth) / 2);
  }
  return f.rotation % 2 ? { x: z, z: x } : { x, z };
}

export const creationDraftSchema = z
  .object({
    id: z.string().uuid(),
    version: z.number().int().min(0).max(100),
    blueprint: z
      .object({
        name: z.string().max(40),
        parts: z.array(creationPartSchema).min(1).max(24),
        physics: z.literal("parts").optional(),
      })
      .strict(),
  })
  .strict();
export type CreationDraft = z.infer<typeof creationDraftSchema>;

export function hasCreationInteractions(b: CreationBlueprint): boolean {
  return b.physics === "parts" || b.parts.some((p) => p.seat || p.light);
}
