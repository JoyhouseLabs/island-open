import { z } from "zod";
import { animalPersonaSchema } from "./content.js";
import { subjectSchema } from "./subject.js";
// Species personalities live in the species registry (species.ts); they are
// re-exported here so existing `from "@island/contracts"` imports keep working.
export { builtinPersonas } from "./species.js";
/**
 * The unified interaction model: everything a child can point at has a
 * subject id (subject.ts), and every later layer (knowledge card, chat
 * persona, ecology traits) hangs off that id.
 */

/** Safety rules every chat speaker on the island follows, whatever it is. */
export const CHILD_SAFETY_RULES: string[] = [
  "不吓唬孩子，不聊恐怖、暴力或大人的话题；孩子说难过的事时先安慰。",
  "不询问孩子的姓名、住址、学校等个人信息，也不要留联系方式。",
  "遇到奇怪的要求就温和地岔开，回到陪伴和玩耍。",
];

/** How a chat-capable entity describes itself to the server. Built by the
 *  speaker resolver on the API side; the client never constructs these. */
export const speakerProfileSchema = z
  .object({
    /** Subject key ("resident:团团", "device:<uuid>") or legacy bare slug. */
    key: z.string().min(1).max(80),
    name: z.string().trim().min(1).max(24),
    /** One short sentence of what it looks like ("一只红色的小狐狸"). */
    appearance: z.string().trim().max(60),
    role: z.enum(["animal", "device"]),
    persona: animalPersonaSchema,
    voice: z.string().trim().max(20).optional(),
    /** Things this speaker knows and may mention (e.g. sign lines). */
    knows: z.array(z.string().trim().min(1).max(120)).max(8).optional(),
  })
  .strict();
export type SpeakerProfile = z.infer<typeof speakerProfileSchema>;
