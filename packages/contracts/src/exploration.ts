import { z } from "zod";
export const explorationChunkSchema = z
  .object({
    x: z.number().int().min(-999999).max(999999),
    z: z.number().int().min(-999999).max(999999),
  })
  .strict();
export const explorationStateSchema = z
  .object({
    generatorVersion: z.literal(2),
    seed: z.number().int(),
    position: z
      .object({
        chunk: explorationChunkSchema,
        x: z.number().min(0).lt(96),
        z: z.number().min(0).lt(96),
      })
      .strict(),
    explored: z.array(explorationChunkSchema).max(256),
    discoveries: z
      .array(
        z
          .string()
          .regex(
            /^wild2:-?\d{1,6}:-?\d{1,6}:[0-2]:(raptor|pterosaur|peacock|nest)$/,
          ),
      )
      .max(256),
  })
  .strict();
export const saveExplorationSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    mutationId: z.string().uuid(),
    state: explorationStateSchema,
  })
  .strict();
export type ExplorationState = z.infer<typeof explorationStateSchema>;
export type ExplorationRecord = {
  revision: number;
  state: ExplorationState | null;
  mutationId: string | null;
};
export type SaveExploration = z.infer<typeof saveExplorationSchema>;

export const physicsExplorationRecordSchema = z
  .object({
    seed: z.number().int(),
    revision: z.number().int().nonnegative(),
    state: explorationStateSchema.nullable(),
    mutationId: z.string().uuid().nullable(),
  })
  .strict()
  .refine(
    (record) => !record.state || record.state.seed === record.seed,
    "探索种子不一致",
  );
export type PhysicsExplorationRecord = z.infer<
  typeof physicsExplorationRecordSchema
>;
