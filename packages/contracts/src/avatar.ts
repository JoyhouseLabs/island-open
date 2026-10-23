import { z } from "zod";

export const avatarConfigSchema = z
  .object({
    form: z.enum(["foxbot", "pandabot", "islander", "bunnybot", "catbot"]),
    accent: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .transform((v) => v.toLowerCase()),
    hat: z.enum([
      "none",
      "straw",
      "beret",
      "crown",
      "cap",
      "starcrown",
      "copter",
    ]),
  })
  .strict();
export type AvatarConfig = z.infer<typeof avatarConfigSchema>;
export const defaultAvatar: AvatarConfig = {
  form: "foxbot",
  accent: "#e0824f",
  hat: "none",
};
export const avatarHatUnlocks: Partial<Record<AvatarConfig["hat"], string>> = {
  starcrown: "hat-starcrown",
  copter: "hat-copter",
};
export const playerAppearanceSchema = z
  .object({
    name: z.string().min(1).max(80),
    avatar: avatarConfigSchema,
    revision: z.number().int().nonnegative(),
  })
  .strict();
export type PlayerAppearance = z.infer<typeof playerAppearanceSchema>;
export const avatarProfileSchema = z
  .object({
    avatar: avatarConfigSchema,
    revision: z.number().int().nonnegative(),
    ownedHats: z.array(avatarConfigSchema.shape.hat),
    stars: z.number().int().nonnegative(),
  })
  .strict();
export type AvatarProfile = z.infer<typeof avatarProfileSchema>;
export const saveAvatarSchema = z
  .object({
    avatar: avatarConfigSchema,
    expectedRevision: z.number().int().nonnegative(),
    accountId: z.string().uuid().optional(),
  })
  .strict();
