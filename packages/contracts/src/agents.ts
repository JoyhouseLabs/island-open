import { z } from "zod";
import { animalPersonaSchema, npcChatRequestSchema } from "./content.js";

export const agentKeySchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[\p{L}\p{N}:._-]+$/u);
export const skillIdSchema = z.string().regex(/^[a-z][a-z0-9._-]{1,63}$/);
export const agentConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
    name: z.string().trim().max(24).default(""),
    persona: animalPersonaSchema.optional(),
    background: z.string().trim().max(1200).default(""),
    goals: z.array(z.string().trim().min(1).max(160)).max(6).default([]),
    attributes: z
      .object({
        element: z
          .enum(["未设定", "金", "木", "水", "火", "土"])
          .default("未设定"),
        yinYang: z.enum(["未设定", "阴", "阳", "平衡"]).default("未设定"),
      })
      .strict()
      .default({ element: "未设定", yinYang: "未设定" }),
    memory: z
      .object({
        shortTermHours: z.number().int().min(1).max(168).default(24),
        recentMessages: z.number().int().min(2).max(40).default(16),
        longTerm: z.boolean().default(true),
      })
      .strict()
      .default({ shortTermHours: 24, recentMessages: 16, longTerm: true }),
    autonomy: z
      .object({
        enabled: z.boolean().default(false),
        intervalSeconds: z.number().int().min(60).max(3600).default(180),
        dailyDecisions: z.number().int().min(1).max(120).default(20),
      })
      .strict()
      .default({ enabled: false, intervalSeconds: 180, dailyDecisions: 20 }),
    skills: z.array(skillIdSchema).max(12).default(["island.observe"]),
  })
  .strict();
export type AgentConfig = z.infer<typeof agentConfigSchema>;
export const mcpSkillSchema = z
  .object({
    id: skillIdSchema.refine((s) => !s.startsWith("island.")),
    label: z.string().trim().min(1).max(60),
    endpoint: z.string().url().max(500),
    tokenEnv: z
      .string()
      .regex(/^ISLAND_MCP_[A-Z0-9_]+$/)
      .or(z.literal(""))
      .default(""),
    tool: z.string().regex(/^[a-zA-Z0-9_.-]{1,128}$/),
    enabled: z.boolean().default(false),
    autonomousAllowed: z.boolean().default(false),
    ownerIds: z.array(z.string().uuid()).max(50).default([]),
  })
  .strict();
export type McpSkill = z.infer<typeof mcpSkillSchema>;
export const agentDecisionSchema = z
  .object({
    intent: z.string().trim().min(1).max(200),
    skill: skillIdSchema.nullable(),
    arguments: z.record(z.string(), z.unknown()).default({}),
  })
  .strict()
  .refine((v) => JSON.stringify(v.arguments).length <= 4000, "技能参数过长");
export type AgentDecision = z.infer<typeof agentDecisionSchema>;
export type AgentView = {
  config: AgentConfig;
  shortTerm: { id: string; role: string; content: string; createdAt: string }[];
  longTerm: {
    id: string;
    content: string;
    source: string;
    createdAt: string;
  }[];
  summary: string;
  runs: {
    id: string;
    intent: string;
    skill: string | null;
    status: string;
    createdAt: string;
  }[];
  skills: { id: string; label: string }[];
};

export const agentRequestSchema = npcChatRequestSchema
  .omit({ message: true })
  .extend({
    requestId: z.string().uuid().optional(),
    memoryId: z.string().uuid().optional(),
    content: z.string().trim().min(1).max(600).optional(),
  });
