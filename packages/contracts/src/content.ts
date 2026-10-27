import { z } from "zod";
import { SPECIES } from "./species.js";
import { sceneIds } from "./scenes.js";

/**
 * Admin-managed content: books, animals and the NPC chat request shape.
 * These schemas are shared by the admin app (editing), the API (validation
 * and storage) and the game client (defensive parsing of published feeds).
 */
export const contentSceneSchema = z.enum(sceneIds);
export type ContentScene = (typeof sceneIds)[number];

const slug = z.string().regex(/^[a-z0-9-]{2,40}$/, "id 只能用小写字母、数字和连字符");
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "颜色需为 #rrggbb 格式");
// Animal species derive from the registry; "custom" means an uploaded GLB.
const animalSpecies = [...SPECIES, "custom"] as const;
const mediaUrl = z
  .string()
  .max(500)
  .refine(
    (url) => url.startsWith("/") || url.startsWith("https://"),
    "媒体地址必须是站内相对路径或 https 链接",
  );

export const chapterMediaSchema = z
  .object({
    type: z.enum(["image", "video"]),
    url: mediaUrl,
    caption: z.string().max(80).optional(),
  })
  .strict();
export const bookChapterSchema = z
  .object({
    id: z.string().min(1).max(60),
    title: z.string().trim().min(1).max(80),
    lines: z.array(z.string().trim().min(1).max(600)).min(1).max(40),
    media: z.array(chapterMediaSchema).max(8).optional(),
  })
  .strict();
export const bookSchema = z
  .object({
    id: slug,
    title: z.string().trim().min(1).max(40),
    author: z.string().trim().min(1).max(40),
    note: z.string().trim().max(80),
    /** A PDF asset turns the book into page-by-page reading; chapters
     *  may then be omitted entirely. */
    pdf: z.string().uuid().optional(),
    chapters: z.array(bookChapterSchema).max(200).default([]),
  })
  .strict()
  .superRefine((b, ctx) => {
    if (!b.pdf && b.chapters.length === 0)
      ctx.addIssue({
        code: "custom",
        message: "没有 PDF 时至少需要一章文字",
        path: ["chapters"],
      });
  });

export const animalPersonaSchema = z
  .object({
    temperament: z.string().trim().max(200).default(""),
    speechStyle: z.string().trim().max(200).default(""),
    likes: z.string().trim().max(200).default(""),
    /** Per-speaker model name on the same provider; blank falls back to
     *  the global LLM_MODEL. Empty strings are dropped here so published
     *  definitions never carry the key and old strict clients keep
     *  parsing the animal. */
    model: z.preprocess(
      (v) => (typeof v === "string" && !v.trim() ? undefined : v),
      z.string().trim().max(100).optional(),
    ),
  })
  .strict();
export const animalConfigSchema = z
  .object({
    id: slug,
    name: z.string().trim().min(1).max(24),
    species: z.enum(animalSpecies),
    assetId: z.string().uuid().optional(),
    placement: z
      .object({
        // Built-in scenes, or a published place ("place-<slug>").
        scene: z
          .string()
          .max(50)
          .refine(
            (s) =>
              (contentSceneSchema.options as readonly string[]).includes(s) ||
              /^place-[a-z0-9-]{2,40}$/.test(s),
            "场景必须是内置场景或已发布的秘境",
          ),
        x: z.number().finite().min(-160).max(160),
        z: z.number().finite().min(-135).max(135),
        wander: z.number().min(2).max(40).default(8),
      })
      .strict(),
    persona: animalPersonaSchema.optional(),
  })
  .strict()
  .superRefine((a, ctx) => {
    if (a.species === "custom" && !a.assetId)
      ctx.addIssue({
        code: "custom",
        message: "自定义物种需要选择一个 GLB 素材",
        path: ["assetId"],
      });
  });
export type AnimalConfig = z.infer<typeof animalConfigSchema>;

/** A visitable place assembled by the admin console: ground, sky, props,
 *  an optional ambience loop and the animals placed inside it. */
export const placePropSchema = z
  .object({
    kind: z.enum(["tree", "flower", "bench", "rock", "lamp", "pond"]),
    x: z.number().finite().min(-140).max(140),
    z: z.number().finite().min(-140).max(140),
    seed: z.number().int().min(0).max(4294967295).optional(),
    scale: z.number().min(0.5).max(2).default(1),
  })
  .strict();
export const placeSchema = z
  .object({
    id: slug,
    name: z.string().trim().min(1).max(12),
    tagline: z.string().trim().max(40),
    eyebrow: z.string().trim().max(40).default("A PLACE TO WANDER"),
    accent: hex,
    ground: z
      .object({
        shape: z.enum(["disc", "square"]),
        size: z.number().min(30).max(120),
        color: hex,
      })
      .strict(),
    sky: z
      .object({ day: hex, night: hex, stars: z.number().int().min(0).max(3000) })
      .strict(),
    ambience: z
      .object({
        assetId: z.string().uuid().optional(),
        volume: z.number().min(0).max(1).default(0.5),
      })
      .strict()
      .default({ volume: 0.5 }),
    props: z.array(placePropSchema).max(60).default([]),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (p.props.filter((x) => x.kind === "pond").length > 1)
      ctx.addIssue({
        code: "custom",
        message: "一个秘境最多一个池塘",
        path: ["props"],
      });
  });
export type PlaceProp = z.infer<typeof placePropSchema>;
export type PlaceConfig = z.infer<typeof placeSchema>;

/** A deep-chat speaker: a legacy bare content slug, or a full subject id
 *  ("resident:团团", "device:<uuid>"). Old clients keep sending slugs. */
const speakerIdSchema = z
  .string()
  .min(1)
  .max(80)
  .refine(
    (s) => /^([a-z0-9-]{2,40}|[a-z]+:\S{1,64})$/.test(s),
    "speakerId 需为内容编号或 subject 标识",
  );
export const npcChatRequestSchema = z
  .object({
    speakerId: speakerIdSchema,
    message: z.string().trim().min(1).max(400),
    env: z
      .object({
        weather: z.enum(["sun", "rain", "thunder", "wind"]),
        season: z.enum(["spring", "summer", "autumn", "winter"]),
        hour: z.number().min(0).max(24),
      })
      .strict()
      .optional(),
    /** Device speakers live on a concrete island; visitors add the token. */
    world: z.string().uuid().optional(),
    token: z.string().min(1).max(200).optional(),
  })
  .strict();
export type NpcChatRequest = z.infer<typeof npcChatRequestSchema>;

export interface AssetInfo {
  id: string;
  sha256: string;
  mime: string;
  bytes: number;
  kind: "model" | "audio" | "image" | "pdf";
  filename: string;
}
/** Whether the island's LLM backends can actually answer (keys configured). */
export interface IntelligenceStatus {
  tutor: boolean;
  npc: boolean;
  speech: boolean;
  /** Voice dictation available (ASR key configured). */
  asr: boolean;
  model: string | null;
}

/** Shared reading notes: everyone reading the book sees everyone's notes. */
export const bookNoteCreateSchema = z
  .object({
    page: z.number().int().min(1).max(5000),
    text: z.string().trim().min(1).max(500),
  })
  .strict();
export type BookNoteCreate = z.infer<typeof bookNoteCreateSchema>;
export interface BookNote {
  bookVersion?: number | null;
  locationKind?: "page" | "legacy";
  id: string;
  bookId: string;
  page: number;
  text: string;
  createdAt: string;
  author: { id: string; name: string };
}
export interface BookReader {
  name: string;
  page: number;
  updatedAt: string;
}
/** Reading-progress upsert: "I've reached this page". */
export const bookProgressSchema = z
  .object({ page: z.number().int().min(1).max(5000) })
  .strict();
/** AI reading companion: explain the current page (or a question about it). */
export const bookExplainSchema = z
  .object({
    page: z.number().int().min(1).max(5000),
    /** The page's own text (chapter lines or extracted PDF text). */
    text: z.string().trim().min(1).max(4000),
    question: z.string().trim().max(300).optional(),
  })
  .strict();
export type BookExplainRequest = z.infer<typeof bookExplainSchema>;
