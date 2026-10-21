import type { Species } from "@island/world-core";

export type AgentInfo = {
  /** Built-in speakers, "player", "tutor", or "custom" for admin GLB animals. */
  kind: "player" | Species | "tutor" | (string & {});
  x: number;
  z: number;
  /** Display name for prompts and dialogue (团团, 高高, 小墨老师…). */
  name?: string;
  /** Facing and current behaviour, relayed to visiting players. */
  yaw?: number;
  action?: string;
};

/** Live positions of everyone who can interact: the walking player,
 *  the fox and every resident animal. Updated per frame, read freely. */
const registry = new Map<string, AgentInfo>();

export function reportAgent(id: string, info: AgentInfo) {
  registry.set(id, info);
}
export function dropAgent(id: string) {
  registry.delete(id);
}
export function nearbyAgents(
  x: number,
  z: number,
  radius: number,
  exclude: string,
): (AgentInfo & { id: string })[] {
  const found: (AgentInfo & { id: string })[] = [];
  for (const [id, info] of registry)
    if (id !== exclude && Math.hypot(info.x - x, info.z - z) < radius)
      found.push({ ...info, id });
  return found;
}
/** One agent by id, for live chase targets. */
export function agentById(id: string): AgentInfo | null {
  return registry.get(id) ?? null;
}
export function playerAgent() {
  return registry.get("player") ?? null;
}

/** Every registered agent; the host relays the NPC subset to visitors. */
export function allAgents(): Array<AgentInfo & { id: string }> {
  return [...registry.entries()].map(([id, info]) => ({ ...info, id }));
}

/** The closest non-player agent within radius, for talk prompts. */
export function nearestAgent(
  x: number,
  z: number,
  radius: number,
  exclude: string,
): (AgentInfo & { id: string; distance: number }) | null {
  let best: (AgentInfo & { id: string; distance: number }) | null = null;
  for (const [id, info] of registry) {
    if (id === exclude || info.kind === "player") continue;
    const distance = Math.hypot(info.x - x, info.z - z);
    if (distance < radius && (!best || distance < best.distance))
      best = { ...info, id, distance };
  }
  return best;
}
