import { builtinPersonas } from "@island/contracts";
import { residents } from "@island/world-core";
import { featuresStatus, npcSpeakers, type FeatureFlags } from "../contentStore";

/**
 * One deep-chat speaker as the client sees it: the subject key sent to
 * /api/npc/chat, the display name, and — for sign devices — which island to
 * look the sign up on. Returned only when this speaker can actually talk.
 */
export type SpeakerPersona = {
  subject: string;
  name: string;
  persona: { temperament: string; speechStyle: string; likes: string };
  /** Device speakers: the island the sign stands on (plus a visit token). */
  world?: { worldId: string; token?: string };
};

/** Where each registered sign lives; filled in by <SpeakingSigns>. */
export const signWorlds = new Map<string, { worldId: string; token?: string }>();

let flags: FeatureFlags = { cards: false, speakingEntities: false, ecology: false };
void featuresStatus().then((f) => {
  flags = f;
});

/** Resident lookups happen once; agent ids are `${scene}-${name}`. */
const residentAgents = new Map<
  string,
  { name: string; species: keyof typeof builtinPersonas }
>();
for (const [scene, roster] of Object.entries(residents))
  for (const r of roster ?? [])
    residentAgents.set(`${scene}-${r.name}`, { name: r.name, species: r.species });

/**
 * Whether one live agent id can deep-chat, and under which subject. Admin
 * animals follow their configured persona; built-in species, named residents
 * and sign devices arrive with the speaking-entities flag.
 */
export function personaFor(agentId: string): SpeakerPersona | null {
  if (agentId === "fox")
    return flags.speakingEntities
      ? { subject: "species:fox", name: "小狐狸", persona: builtinPersonas.fox }
      : null;
  if (agentId.startsWith("content-")) {
    const config = npcSpeakers.get(agentId);
    return config?.persona
      ? { subject: config.id, name: config.name, persona: config.persona }
      : null;
  }
  if (agentId.startsWith("device:")) {
    if (!flags.speakingEntities) return null;
    return {
      subject: agentId,
      name: "告示牌",
      persona: {
        temperament: "热心的路边讲解员，爱出小谜语",
        speechStyle: "慢悠悠念出牌子上的字，喜欢说“你猜怎么着”",
        likes: "路过停下来读它的孩子、风、新写的字",
      },
      world: signWorlds.get(agentId),
    };
  }
  if (!flags.speakingEntities) return null;
  // Built-in residents register as `${scene}-${name}`; same name across
  // scenes is the same character with one continuous memory.
  const resident = residentAgents.get(agentId);
  if (resident)
    return {
      subject: `resident:${resident.name}`,
      name: resident.name,
      persona: builtinPersonas[resident.species],
    };
  return null;
}
