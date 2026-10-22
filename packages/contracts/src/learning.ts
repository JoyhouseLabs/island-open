import {
  geometryTaskSchema,
  geometryWorkSchema,
  modelTaskSchema,
  modelWorkSchema,
} from "./geometryLearning.js";
export * from "./geometryLearning.js";
import { z } from "zod";
import { sceneIds } from "./scenes.js";
const contentId = z.string().regex(/^[a-z0-9-]{2,40}$/);
const base = {
  id: contentId,
  title: z.string().trim().min(1).max(100),
  text: z.string().trim().min(1).max(4000),
};
export const lessonStepSchema = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("reading") }).strict(),
  z
    .object({
      ...base,
      kind: z.literal("choice"),
      options: z.array(z.string().trim().min(1).max(200)).min(2).max(6),
      correctIndex: z.number().int().min(0).max(5),
    })
    .strict(),
  z.object({ ...base, kind: z.literal("cat-shapes") }).strict(),
  z
    .object({
      ...base,
      kind: z.literal("geometry-lab"),
      geometry: geometryTaskSchema,
    })
    .strict(),
  z
    .object({ ...base, kind: z.literal("model-lab"), model: modelTaskSchema })
    .strict(),
]);
export const lessonSchema = z
  .object({
    id: contentId,
    title: z.string().trim().min(1).max(100),
    description: z.string().trim().min(1).max(1000),
    series: z
      .object({
        id: contentId,
        title: z.string().trim().min(1).max(100),
        order: z.number().int().min(1).max(99),
      })
      .strict()
      .optional(),
    goals: z.array(z.string().trim().min(1).max(200)).max(8).optional(),
    minutes: z.number().int().min(1).max(120),
    trigger: z.enum(["library", "anywhere"]),
    prerequisite: contentId.nullable().default(null),
    steps: z.array(lessonStepSchema).min(1).max(20),
  })
  .strict()
  .superRefine((lesson, ctx) => {
    if (new Set(lesson.steps.map((s) => s.id)).size !== lesson.steps.length)
      ctx.addIssue({
        code: "custom",
        message: "活动编号不能重复",
        path: ["steps"],
      });
    if (lesson.prerequisite === lesson.id)
      ctx.addIssue({
        code: "custom",
        message: "不能以前置任务引用自己",
        path: ["prerequisite"],
      });
    lesson.steps.forEach((s, i) => {
      if (
        s.kind === "geometry-lab" &&
        s.geometry.mode === "parameters" &&
        !s.geometry.target
      )
        ctx.addIssue({
          code: "custom",
          message: "参数挑战需要设定目标模型",
          path: ["steps", i, "geometry", "target"],
        });
      if (s.kind === "choice" && s.correctIndex >= s.options.length)
        ctx.addIssue({
          code: "custom",
          message: "正确选项不在选项列表中",
          path: ["steps", i, "correctIndex"],
        });
    });
  });
export type Lesson = z.infer<typeof lessonSchema>;
export type LessonStep = Lesson["steps"][number];
export type LearnerStep =
  | Exclude<LessonStep, { kind: "choice" }>
  | Omit<Extract<LessonStep, { kind: "choice" }>, "correctIndex">;
export type LessonView = Omit<Lesson, "steps"> & { steps: LearnerStep[] };
export const learningReturnSchema = z
  .object({
    destination: z.enum(["physics", "physics-home"]).optional(),
    worldId: z.string().uuid().nullable().default(null),
    scene: z.enum(sceneIds).default("island"),
    position: z
      .object({
        x: z.number().finite().min(-160).max(160),
        z: z.number().finite().min(-135).max(135),
        yaw: z.number().finite().min(-100).max(100),
      })
      .strict()
      .nullable()
      .default(null),
  })
  .strict()
  .refine(
    (context) =>
      !context.destination || (!!context.worldId && context.position === null),
    "物理场景返回需要世界编号，并从安全出生点进入",
  );
export type LearningReturn = z.infer<typeof learningReturnSchema>;
export const startLearningSchema = z
  .object({ returnContext: learningReturnSchema })
  .strict();
export const catWorkSchema = z
  .object({
    headWidth: z.number().min(0.7).max(1.4),
    color: z.enum(["#e7a35b", "#97b7a3", "#91b7d5", "#c4a3cc"]),
    note: z.string().trim().max(500),
  })
  .strict();
export type CatWork = z.infer<typeof catWorkSchema>;
export const learningResponseSchema = z.union([
  z.boolean(),
  z.number().int().min(0).max(5),
  catWorkSchema,
  geometryWorkSchema,
  modelWorkSchema,
]);
export type LearningResponse = z.infer<typeof learningResponseSchema>;
export const learningCheckpointSchema = z
  .object({
    revision: z.number().int().min(1),
    response: learningResponseSchema,
    complete: z.boolean(),
  })
  .strict();
export type LearningSession = {
  id: string;
  lessonId: string;
  version: number;
  lesson: LessonView;
  status: "active" | "completed";
  revision: number;
  completedSteps: string[];
  responses: Record<string, LearningResponse>;
  returnContext: LearningReturn;
  updatedAt: string;
  completedAt: string | null;
  badge: string | null;
};
export type LearningCatalog = {
  lessons: Array<{ lesson: LessonView; version: number; locked: boolean }>;
  sessions: LearningSession[];
};
