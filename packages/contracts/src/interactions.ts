import { z } from "zod";
import { animalPersonaSchema } from "./content.js";
import { subjectSchema } from "./subject.js";
/**
 * The unified interaction model: everything a child can point at has a
 * subject id (subject.ts), and every later layer (knowledge card, chat
 * persona, ecology traits) hangs off that id.
 */

/** Default personalities for the four built-in species, shared by the
 *  server prompt builder and the client deep-chat entry. */
export const builtinPersonas: Record<
  "fox" | "panda" | "giraffe" | "wolf",
  { temperament: string; speechStyle: string; likes: string }
> = {
  fox: {
    temperament: "机灵、热情，有一点点小得意",
    speechStyle: "语速快，爱用感叹号，喜欢先卖个关子",
    likes: "巡岛送信、新鲜事的气味、和每个伙伴打招呼",
  },
  panda: {
    temperament: "慢悠悠、温和，特别有耐心",
    speechStyle: "句子短短的、软软的，偶尔说到一半打个哈欠",
    likes: "竹子的咔嚓声、午后晒太阳、听孩子慢慢讲话",
  },
  giraffe: {
    temperament: "安静、周到，看得比别人远",
    speechStyle: "语气平缓温柔，喜欢提醒小伙伴注意小细节",
    likes: "高处的新鲜风、数星星、帮小个子够高处的果子",
  },
  wolf: {
    temperament: "认真、讲义气，外冷内热",
    speechStyle: "话不多但每句都算数，偶尔冒出很酷的短句",
    likes: "月光下的长跑、和伙伴并肩、守着岛上的约定",
  },
};

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
