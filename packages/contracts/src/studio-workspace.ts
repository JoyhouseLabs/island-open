import { z } from "zod";
const kind = z.enum(["image", "video"]);
const url = z
  .string()
  .max(2048)
  .url()
  .refine((s) => /^https?:\/\//.test(s));
export const studioDraftSchema = z.object({
  kind,
  prompt: z.string().max(600),
  duration: z.number().int().min(4).max(15),
  aspect: z.enum(["16:9", "9:16", "1:1"]),
  reference: url.nullable(),
  pending: z
    .object({
      taskId: z.string().min(1).max(500),
      kind,
      prompt: z.string().max(2000),
    })
    .nullable(),
  history: z
    .array(
      z.object({
        taskId: z.string().max(500),
        kind,
        prompt: z.string().max(2000),
        url,
        at: z.number(),
      }),
    )
    .max(24),
});
export type StudioDraft = z.infer<typeof studioDraftSchema>;
export const emptyStudioDraft: StudioDraft = {
  kind: "image",
  prompt: "",
  duration: 5,
  aspect: "16:9",
  reference: null,
  pending: null,
  history: [],
};

export const studioTaskRecordSchema = z.object({
  taskId: z.string().min(1).max(500),
  status: z.enum(["pending", "running", "succeeded", "failed"]),
  outputs: z.array(url).max(20),
  error: z.string().nullable(),
});
export const studioHistorySchema = z.object({
  tasks: z
    .array(
      z.object({
        kind,
        prompt: z.string().max(2000),
        task: studioTaskRecordSchema,
        createdAt: z.string().datetime(),
      }),
    )
    .max(24),
});
