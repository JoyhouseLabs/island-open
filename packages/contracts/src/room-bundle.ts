import { z } from "zod";
import { worldSchema } from "./index.js";
import { plainText, buildingBudgets } from "./building.js";
const id = z.string().uuid(),
  rev = z.number().int().positive();
export const roomBundleSchema = z
  .object({
    format: z.literal("island-room-bundle"),
    version: z.literal(1),
    scene: z.literal("library"),
    sourceSceneId: id,
    exportedAt: z.string().datetime(),
    layoutRevision: rev,
    contentRevision: z.number().int().min(0),
    layout: worldSchema,
    collections: z.array(z.object({ id, revision: rev }).strict()).max(64),
    documents: z
      .array(
        z
          .object({
            id,
            kind: z.enum(["note", "notebook"]),
            title: plainText(60),
            revision: rev,
            createdAt: z.string().datetime(),
            deletedAt: z.string().datetime().nullable(),
          })
          .strict(),
      )
      .max(buildingBudgets.backupEntries),
    documentEntries: z
      .array(
        z
          .object({
            id,
            documentId: id,
            position: z.number().int().min(0),
            text: plainText(4000, true),
            revision: rev,
          })
          .strict(),
      )
      .max(buildingBudgets.backupEntries),
    collectionEntries: z
      .array(
        z
          .object({
            collectionId: id,
            documentId: id,
            position: z.number().int().min(0),
          })
          .strict(),
      )
      .max(buildingBudgets.backupEntries),
    definitionLocks: z
      .array(z.object({ id: z.string(), version: rev }).strict())
      .max(100),
    assetReferences: z.array(z.string().max(200)).max(1000),
    completeness: z
      .object({
        current: z.literal(true),
        trash: z.literal(true),
        history: z.literal(false),
      })
      .strict(),
  })
  .strict();
export type RoomBundle = z.infer<typeof roomBundleSchema>;
