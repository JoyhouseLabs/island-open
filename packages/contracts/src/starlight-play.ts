import { z } from "zod";

export const trialSkillIds = [
  "beam",
  "guard",
  "observe",
  "double",
  "rush",
  "moonlight",
] as const;
export type TrialSkillId = (typeof trialSkillIds)[number];
export const trialSkills: Record<
  TrialSkillId,
  {
    name: string;
    symbol: string;
    cost: number;
    damage: number;
    guard: number;
    heal: number;
    note: string;
  }
> = {
  beam: {
    name: "光波",
    symbol: "✦",
    cost: 2,
    damage: 3,
    guard: 0,
    heal: 0,
    note: "冲击 3 · 观察后冲击 5",
  },
  guard: {
    name: "守护",
    symbol: "◇",
    cost: 1,
    damage: 0,
    guard: 3,
    heal: 0,
    note: "抵挡本回合 3 点冲击",
  },
  observe: {
    name: "观察",
    symbol: "◎",
    cost: 0,
    damage: 0,
    guard: 0,
    heal: 0,
    note: "下次光波增强为 5 点",
  },
  double: {
    name: "双星连击",
    symbol: "✧✧",
    cost: 3,
    damage: 4,
    guard: 0,
    heal: 0,
    note: "两道星环 · 共冲击 4",
  },
  rush: {
    name: "影跃突袭",
    symbol: "➶",
    cost: 4,
    damage: 6,
    guard: 0,
    heal: 0,
    note: "向前跃击 · 冲击 6",
  },
  moonlight: {
    name: "月光恢复",
    symbol: "☾",
    cost: 3,
    damage: 0,
    guard: 0,
    heal: 4,
    note: "先恢复最多 4 能量，再承受回应",
  },
};

export const materialIds = ["moonfruit", "branch", "pebble"] as const;
export type MaterialId = (typeof materialIds)[number];
export const blueprintIds = ["lantern", "basket", "mat"] as const;
export type BlueprintId = (typeof blueprintIds)[number];
export const playPointSchema = z
  .object({
    x: z.number().finite().min(-35).max(35),
    z: z.number().finite().min(-30).max(30),
  })
  .strict();
export const playPlacementSchema = playPointSchema
  .extend({
    rotation: z.number().int().min(0).max(3),
    color: z.enum(["gold", "mint", "violet", "star"]),
  })
  .strict();
export type PlayPlacement = z.infer<typeof playPlacementSchema>;
export const playStructureSchema = z
  .object({
    id: z.string().uuid(),
    blueprint: z.enum(blueprintIds),
    version: z.literal(1),
    placement: playPlacementSchema.nullable(),
  })
  .strict();
export type PlayStructure = z.infer<typeof playStructureSchema>;
export const trialSchema = z
  .object({
    id: z.string().uuid(),
    rulesVersion: z.literal(1),
    turn: z.number().int().min(1).max(101),
    phase: z.enum(["active", "paused", "won", "rest", "abandoned"]),
    energy: z.number().int().min(0).max(10),
    shadow: z.number().int().min(0).max(10),
    points: z.number().int().min(0).max(4),
    focused: z.boolean(),
    log: z.array(z.string().max(180)).max(8),
  })
  .strict();
export type StarTrial = z.infer<typeof trialSchema>;
export const starlightStateSchema = z
  .object({
    version: z.literal(1),
    revision: z.number().int().min(0),
    materials: z
      .object({
        moonfruit: z.number().int().min(0).max(99),
        branch: z.number().int().min(0).max(99),
        pebble: z.number().int().min(0).max(99),
      })
      .strict(),
    harvested: z.record(z.string(), z.number().finite().min(0)),
    structures: z.array(playStructureSchema).max(24),
    snacks: z.number().int().min(0),
    starReward: z.boolean(),
    trial: trialSchema.nullable(),
  })
  .strict();
export type StarlightState = z.infer<typeof starlightStateSchema>;
export const starlightActionSchema = z.discriminatedUnion("op", [
  z
    .object({
      op: z.literal("harvest"),
      nodeId: z.string().min(1).max(40),
      position: playPointSchema,
    })
    .strict(),
  z
    .object({ op: z.literal("craft"), blueprint: z.enum(blueprintIds) })
    .strict(),
  z
    .object({
      op: z.literal("build"),
      blueprint: z.enum(blueprintIds),
      placement: playPlacementSchema,
    })
    .strict(),
  z
    .object({
      op: z.literal("place"),
      id: z.string().uuid(),
      placement: playPlacementSchema,
    })
    .strict(),
  z.object({ op: z.literal("store"), id: z.string().uuid() }).strict(),
  z.object({ op: z.literal("snack") }).strict(),
  z.object({ op: z.literal("trial.start") }).strict(),
  z
    .object({
      op: z.literal("trial.turn"),
      skill: z.enum(trialSkillIds),
    })
    .strict(),
  z
    .object({ op: z.enum(["trial.pause", "trial.resume", "trial.leave"]) })
    .strict(),
]);
export type StarlightAction = z.infer<typeof starlightActionSchema>;
export const starlightRequestSchema = z
  .object({
    actionId: z.string().uuid(),
    expectedRevision: z.number().int().min(0),
    action: starlightActionSchema,
  })
  .strict();
export type StarlightRequest = z.infer<typeof starlightRequestSchema>;
export type StarlightResponse = {
  state: StarlightState;
  serverTime: number;
  message: string;
  replayed?: boolean;
};
