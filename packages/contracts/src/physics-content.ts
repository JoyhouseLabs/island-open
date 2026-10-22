import { z } from "zod";
export const physicsTextSchema = z
  .object({
    title: z.string().trim().min(1).max(80),
    text: z.string().max(10000),
  })
  .strict();
export const savePhysicsTextSchema = z
  .object({
    id: z.string().uuid(),
    expectedVersion: z.number().int().min(0).max(99),
    idempotencyKey: z.string().uuid(),
    document: physicsTextSchema,
  })
  .strict();
export const physicsTextDraftSchema = z
  .object({
    id: z.string().uuid(),
    version: z.number().int().min(0).max(100),
    document: z
      .object({ title: z.string().max(80), text: z.string().max(10000) })
      .strict(),
  })
  .strict();
export type PhysicsTextRecord = {
  id: string;
  version: number;
  title: string;
  text: string;
  updatedAt: string;
};
export type PhysicsTextSummary = Omit<PhysicsTextRecord, "text">;
