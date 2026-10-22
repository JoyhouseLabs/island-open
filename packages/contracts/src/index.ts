import { z } from "zod";
import { constructionSchema, deviceSchema, entityPlacementSchema, buildingOps, BUILDING_CAPABILITIES } from "./building.js";
export * from "./building.js";
import { subSceneIds } from "./scenes.js";
export * from "./books.js";
export * from "./cards.js";
export * from "./content.js";
export * from "./interactions.js";
export * from "./items.js";
export * from "./subject.js";
export * from "./presence.js";
export * from "./scenes.js";
export * from "./studio.js";
export const seasonSchema = z.enum(["spring", "summer", "autumn", "winter"]);
export type Season = z.infer<typeof seasonSchema>;
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
    construction: constructionSchema.optional(),
    devices: z.array(deviceSchema).max(64).optional(),
    entityPlacements: z.array(entityPlacementSchema).max(800).optional(),
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
  const normalized = (w: WorldSnapshot) => {
    const p=worldSchema.parse(w);
    const cells=(p.construction?.chunks??[]).flatMap(c=>c.cells.map(v=>({
      x:c.cx*16+v.index%16,y:c.cy*16+Math.floor(v.index/256),z:c.cz*16+Math.floor(v.index/16)%16,
      value:p.construction!.blockPalette[v.palette],
    }))).sort((a,b)=>a.x-b.x||a.y-b.y||a.z-b.z);
    const {construction,devices,entityPlacements,...core}=p;
    return {...core, construction:cells, devices:[...(p.devices??[])].sort((a,b)=>a.id.localeCompare(b.id)), entityPlacements:[...(p.entityPlacements??[])].sort((a,b)=>a.entityId.localeCompare(b.entityId))};
  };
  return JSON.stringify(normalized(a))===JSON.stringify(normalized(b));
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
const entityId = z.string().min(1).max(100);
/** One structural edit. A `replace` is a whole checkpoint and must be sent alone. */
export const worldOpSchema = z.discriminatedUnion("op", [
  ...buildingOps,
  z.object({ op: z.literal("place"), entity: entitySchema }).strict(),
  z.object({ op: z.literal("remove"), id: entityId }).strict(),
  z
    .object({
      op: z.literal("update"),
      id: entityId,
      kind: z.enum(["tree", "flower", "bench"]).optional(),
      x: z.number().finite().min(-160).max(160).optional(),
      z: z.number().finite().min(-135).max(135).optional(),
      seed: z.number().int().min(0).max(4294967295).optional(),
      growth: z.number().min(0).max(1).optional(),
    })
    .strict()
    .superRefine((op, ctx) => {
      if (
        op.kind === undefined &&
        op.x === undefined &&
        op.z === undefined &&
        op.seed === undefined &&
        op.growth === undefined
      )
        ctx.addIssue({
          code: "custom",
          message: "更新至少要改一个字段",
          path: ["id"],
        });
    }),
  z.object({ op: z.literal("rename"), name: z.string().trim().min(1).max(40) }).strict(),
  z
    .object({
      op: z.literal("environment"),
      hour: z.number().min(0).max(24),
      season: seasonSchema,
      weather: weatherSchema.optional(),
    })
    .strict(),
  z.object({ op: z.literal("replace"), snapshot: worldSchema }).strict(),
]);
export type WorldOp = z.infer<typeof worldOpSchema>;
export const saveWorldSchema = z
  .object({
    capabilities: z.array(z.enum(BUILDING_CAPABILITIES)).optional(),
    baseRevision: z.number().int().min(1),
    /** Required only when the patch is terrain-scale (a replace, or many entities). */
    leaseToken: z.number().int().positive().optional(),
    deviceId: z.string().uuid(),
    idempotencyKey: z.string().uuid(),
    operations: z.array(worldOpSchema).min(1).max(1600),
  })
  .strict()
  .superRefine((body, ctx) => {
    if (
      body.operations.some((op) => op.op === "replace") &&
      body.operations.length !== 1
    )
      ctx.addIssue({
        code: "custom",
        message: "整份替换必须单独提交",
        path: ["operations"],
      });
  });
export type SaveWorldRequest = z.infer<typeof saveWorldSchema>;
export interface WorldRecord {
  id: string;
  revision: number;
  snapshot: WorldSnapshot;
  updatedAt: string;
  receipt?: { commitId: string; appliedRevision: number };
}
export interface Lease {
  token: number;
  expiresAt: string;
}
export interface User {
  id: string;
  name: string;
  provider: "development" | "wechat" | "guest" | "joyhouse";
  /** Server-granted only; undefined means a regular account. */
  role?: "user" | "admin";
}
export interface AuthConfig {
  development: boolean;
  /** Unified JoyHouse authorization-code + PKCE login, handled by the API. */
  joyhouse?: boolean;
  /** A short-lived named visitor, available without WeChat. */
  guest: boolean;
  website: boolean;
  h5: boolean;
  storage: "postgresql";
}
export interface AssetManifest {
  id: string;
  version: string;
  assets: Array<{
    id: string;
    /** 清单所在目录内的文件名，不含路径。 */
    file: string;
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
  /** Voice dictation available (ASR key configured). */
  asr: boolean;
  model: string | null;
}
export * from "./learning.js";
export * from "./exploration.js";
