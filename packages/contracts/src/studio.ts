import { z } from "zod";

/** AI 工坊 (studio): aiai-v1 text-to-image, image-to-image and
 *  text-to-video generation, shared between the API and the web app. */

const safeUrl = z
  .string()
  .url()
  .max(2_048)
  .refine(
    (value) => value.startsWith("https://") || value.startsWith("http://127.0.0.1"),
    "参考图必须是 HTTPS 地址",
  );

export const studioStartSchema = z
  .object({
    kind: z.enum(["image", "video"]),
    prompt: z.string().trim().min(1).max(2_000),
    /** 图生图 / 图生视频：上一张生成图的地址作为参考或首帧。 */
    referenceUrl: safeUrl.optional(),
    aspectRatio: z.enum(["16:9", "9:16", "1:1"]).optional(),
    /** 视频时长（秒），kling 档位 4–15。 */
    durationSeconds: z.number().int().min(4).max(15).optional(),
    resolution: z.enum(["720p", "1080p"]).optional(),
  })
  .strict();
export type StudioStartRequest = z.infer<typeof studioStartSchema>;

/** Narrated video: the gateway's clips have no audio track, so the server
 *  rewrites the prompt into one gentle sentence, speaks it via TTS and muxes
 *  the track onto the clip with ffmpeg. */
export const studioVoiceoverSchema = z
  .object({
    /** The silent clip the gateway produced (https, or localhost in tests). */
    videoUrl: safeUrl,
    /** The clip's original prompt — raw material for the narration. */
    prompt: z.string().trim().min(1).max(2_000),
    /** Optional hand-written narration; otherwise the LLM rewrites prompt. */
    narration: z.string().trim().min(1).max(300).optional(),
  })
  .strict();
export type StudioVoiceoverRequest = z.infer<typeof studioVoiceoverSchema>;

export interface StudioVoiceover {
  /** Same-origin URL of the narrated clip; lives ~2 hours after creation. */
  videoUrl: string;
  /** The narration actually spoken on the track. */
  narration: string;
}

export type StudioTaskStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed";

export interface StudioTask {
  taskId: string;
  status: StudioTaskStatus;
  /** Output media URLs once the task succeeds. */
  outputs: string[];
  error: string | null;
}

export interface StudioStatus {
  configured: boolean;
  imageModel: string;
  videoModel: string;
  /** Whether narrating clips is possible (TTS + ffmpeg both available). */
  voiceover: boolean;
}
