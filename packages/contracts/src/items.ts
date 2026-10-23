import { z } from "zod";

/**
 * One definition for everything a person can hold: a picked-up treasure,
 * a star-shop unlock, or a published book, animal or place.
 * Prices and who may sell stay out of this package.
 */
export const itemKindSchema = z.enum([
  "forage",
  "unlock",
  "book",
  "animal",
  "place",
]);
export type ItemKind = z.infer<typeof itemKindSchema>;
export const itemDefinitionSchema = z
  .object({
    id: z.string().min(1).max(80),
    kind: itemKindSchema,
    name: z.string().min(1).max(40),
    /** null means the person either has it or not. A number is the stack cap. */
    stack: z.number().int().positive().max(9999).nullable(),
  })
  .strict();
export type ItemDefinition = z.infer<typeof itemDefinitionSchema>;

export const inventoryStateSchema = z
  .object({
    stars: z.number().int().min(0).max(100000),
    counts: z.record(z.string().max(80), z.number().int().min(0).max(10000)),
    done: z.record(z.string().max(40), z.boolean()),
    deeds: z
      .array(
        z
          .object({
            text: z.string().max(80),
            at: z.number(),
          })
          .strict(),
      )
      .max(40),
    owned: z.record(z.string().max(40), z.literal(true)),
    collected: z.record(z.string().max(40), z.number().int().min(1).max(9999)),
  })
  .strict();
export type InventoryState = z.infer<typeof inventoryStateSchema>;

export const inventoryActionSchema = z.discriminatedUnion("op", [
  z
    .object({
      op: z.literal("event"),
      type: z.string().regex(/^[a-z0-9._-]{1,40}$/),
      detail: z
        .string()
        .min(1)
        .max(40)
        .refine((value) => !/[\u0000-\u001f]/.test(value))
        .optional(),
    })
    .strict(),
  z
    .object({ op: z.literal("collect"), itemId: z.string().min(1).max(40) })
    .strict(),
  z
    .object({ op: z.literal("buy"), itemId: z.string().min(1).max(40) })
    .strict(),
]);
export type InventoryAction = z.infer<typeof inventoryActionSchema>;

export const inventoryActSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    accountId: z.string().uuid().optional(),
    action: inventoryActionSchema,
  })
  .strict();

export const visitPublishedPlaceSchema = z
  .object({ accountId: z.string().uuid() })
  .strict();
