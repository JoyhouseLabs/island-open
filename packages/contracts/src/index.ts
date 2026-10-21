import { z } from "zod";
export * from "./books.js";
export * from "./content.js";
export * from "./presence.js";
export * from "./studio.js";
export const seasonSchema = z.enum(["spring", "summer", "autumn", "winter"]);
export type Season = z.infer<typeof seasonSchema>;
/** Scenes a world can live in besides the island itself. New sub-scenes
 *  register here; worlds, API and rendering all derive from this list. */
export const subSceneIds = [
  "garden",
  "home",
  "meadow",
  "forest",
  "library",
  "pond",
  "lab",
  "nursery",
  "mountain",
  "starlight",
  "beach",
] as const;
export type SubSceneId = (typeof subSceneIds)[number];
/** Weather is part of the shared environment; unset means a calm sunny day. */
export const weatherSchema = z.enum(["sun", "rain", "thunder", "wind"]);
export type Weather = z.infer<typeof weatherSchema>;
export const entitySchema = z
  .object({
    id: z.string().min(1).max(100),
    kind: z.enum(["tree", "flower", "bench"]),
    x: z.number().finite().min(-160).max(160),
    z: z.number().finite().min(-135).max(135),
    seed: z.number().int().min(0).max(4294967295),
    growth: z.number().min(0).max(1),
  })
  .strict();
export type IslandEntity = z.infer<typeof entitySchema>;
export const worldSchema = z
  .object({
    schemaVersion: z.literal(3),
    scene: z.enum(["island", ...subSceneIds]),
    generatorVersion: z.literal("3.0.0"),
    name: z.string().trim().min(1).max(40),
    seed: z.number().int().min(0).max(4294967295),
    environment: z
      .object({
        hour: z.number().min(0).max(24),
        season: seasonSchema,
        weather: weatherSchema.optional(),
      })
      .strict(),
    entities: z.array(entitySchema).max(800),
    contentLock: z.object({ core: z.literal("1.0.0") }).strict(),
  })
  .strict()
  .superRefine((w, ctx) => {
    if (new Set(w.entities.map((e) => e.id)).size !== w.entities.length)
      ctx.addIssue({
        code: "custom",
        message: "实体 ID 不能重复",
        path: ["entities"],
      });
  });
export type WorldSnapshot = z.infer<typeof worldSchema>;
// PostgreSQL JSONB does not preserve object key order. Compare schema-normalized
// snapshots so a successful save settles even after placing a new entity.
export function sameWorld(a: WorldSnapshot, b: WorldSnapshot): boolean {
  return (
    JSON.stringify(worldSchema.parse(a)) ===
    JSON.stringify(worldSchema.parse(b))
  );
}
export const createWorldSchema = z
  .object({
    name: z.string().trim().min(1).max(40).default("我的心灵家园"),
    seed: z.number().int().min(0).max(4294967295).default(20261017),
  })
  .strict();
export const leaseSchema = z
  .object({ deviceId: z.string().uuid(), takeover: z.boolean().default(false) })
  .strict();
export const saveWorldSchema = z
  .object({
    baseRevision: z.number().int().min(1),
    leaseToken: z.number().int().positive(),
    deviceId: z.string().uuid(),
    idempotencyKey: z.string().uuid(),
    snapshot: worldSchema,
  })
  .strict();
export type SaveWorldRequest = z.infer<typeof saveWorldSchema>;
export interface WorldRecord {
  id: string;
  revision: number;
  snapshot: WorldSnapshot;
  updatedAt: string;
}
export interface Lease {
  token: number;
  expiresAt: string;
}
export interface User {
  id: string;
  name: string;
  provider: "development" | "wechat";
  /** Server-granted only; undefined means a regular account. */
  role?: "user" | "admin";
}
export interface AuthConfig {
  development: boolean;
  website: boolean;
  h5: boolean;
  storage: "postgresql";
}
export interface AssetManifest {
  id: string;
  version: string;
  assets: Array<{
    id: string;
    url: string;
    sha256: string;
    bytes: number;
    mime: string;
  }>;
}
/** Tutor chat: the client sends the lesson it is reading plus a question;
 *  the server grounds its system prompt in that chapter's text. */
export const tutorMessageSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(2000),
  })
  .strict();
export const tutorChatRequestSchema = z
  .object({
    bookId: z.string().min(1).max(40),
    chapterId: z.string().min(1).max(40),
    lineIndex: z.number().int().min(0).max(300).optional(),
    question: z.string().trim().min(1).max(400),
    history: z.array(tutorMessageSchema).max(10).default([]),
  })
  .strict();
export type TutorChatRequest = z.infer<typeof tutorChatRequestSchema>;
export const tutorSpeechRequestSchema = z
  .object({
    text: z.string().trim().min(1).max(300),
    voice: z.string().min(1).max(40).optional(),
  })
  .strict();
export type TutorSpeechRequest = z.infer<typeof tutorSpeechRequestSchema>;
/** Whether the tutor backend can actually answer (LLM key configured). */
export interface TutorStatus {
  chat: boolean;
  speech: boolean;
  model: string | null;
}
