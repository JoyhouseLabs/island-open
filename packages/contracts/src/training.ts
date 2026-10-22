import { z } from "zod";
import { solidSchema, type SolidKind } from "./geometryLearning.js";

export const trainingPreferencesSchema = z
  .object({
    minutes: z.enum(["5", "10", "15"]),
    presentation: z.enum(["2d", "3d"]),
    goal: z.enum(["explore", "practice", "review"]),
  })
  .strict();
export type TrainingPreferences = z.infer<typeof trainingPreferencesSchema>;
export const trainingAnswerSchema = z
  .object({
    choices: z.record(z.string().max(40), z.string().max(80)).default({}),
    solid: solidSchema.optional(),
    height: z.number().finite().min(0.8).max(3.2).optional(),
    size: z.number().finite().min(0.6).max(2).optional(),
    // Only student explanations are stored. Adult practice uses fictional choices.
    explanation: z.string().trim().max(500).default(""),
  })
  .strict();
export type TrainingAnswer = z.infer<typeof trainingAnswerSchema>;
export const trainingWriteSchema = z
  .object({
    revision: z.number().int().positive(),
    answer: trainingAnswerSchema,
  })
  .strict();
export const trainingSubmitSchema = trainingWriteSchema
  .extend({
    submissionId: z.string().uuid(),
    skip: z.boolean().default(false),
  })
  .strict();
export const trainingStartSchema = z
  .object({
    taskId: z.string().regex(/^[a-z0-9-]{1,40}$/),
  })
  .strict();
export interface TrainingQuestion {
  id: string;
  skill: string;
  prompt: string;
  options: { id: string; text: string }[];
}
export interface TrainingTask {
  id: string;
  title: string;
  objective: string;
  minutes: number;
  kind: "geometry" | "scenario";
  stage: "baseline" | "practice" | "transfer" | "independent" | "reflection";
}
export interface TrainingProgram {
  id: string;
  version: number;
  title: string;
  audience: "student" | "adult";
  description: string;
  boundary: string;
  skills: { id: string; title: string }[];
  tasks: TrainingTask[];
}
export interface TrainingActivity {
  task: TrainingTask;
  variantId: string;
  introduction: string;
  questions: TrainingQuestion[];
  model?: { solid: SolidKind; height: number; size: number };
  target?: { solid: SolidKind; height: number; size: number };
  formation: boolean;
  adjustable: boolean;
  explanationRequired: boolean;
  hints: never[]; // Hint content is only returned after the server records assistance.
}
export interface TrainingEvidence {
  skill: string;
  outcome: "demonstrated" | "revisit" | "participated";
  detail: string;
}
export interface TrainingAssessment {
  rubricVersion: string;
  status: "demonstrated" | "revisit" | "participated" | "skipped";
  summary: string;
  evidence: TrainingEvidence[];
  assistance: "independent" | "supported";
  explanation: "not-assessed";
}
export interface TrainingAttempt {
  id: string;
  planId: string;
  revision: number;
  ordinal: number;
  mode: "baseline" | "practice" | "transfer" | "independent" | "review";
  status: "active" | "submitted";
  activity: TrainingActivity;
  answer: TrainingAnswer;
  hint: { text: string; source: "guide" | "ai-selected" } | null;
  assessment: TrainingAssessment | null;
  submittedAt: string | null;
}
export interface TrainingPlan {
  id: string;
  program: TrainingProgram;
  preferences: TrainingPreferences;
  revision: number;
  paused: boolean;
  completedTaskIds: string[];
  attempts: TrainingAttempt[];
  reviewAt: string | null;
  recommendation: {
    taskId: string;
    reason: string;
    evidenceIds: string[];
  } | null;
  skills: { id: string; title: string; state: string; evidenceIds: string[] }[];
}
export interface TrainingCatalog {
  programs: TrainingProgram[];
  plans: {
    id: string;
    programId: string;
    title: string;
    paused: boolean;
    completed: number;
  }[];
}
