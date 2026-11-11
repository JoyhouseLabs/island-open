export const residentWorld: {
  current: { worldId: string; token?: string } | null;
} = { current: null };
export const rests = new Map<string, number>();
export function consumeResidentRest(id: string) {
  const until = rests.get(id);
  rests.delete(id);
  return !!until && until > Date.now();
}

/** One explicit invitation to a placed mat; transient behavior, not a saved claim. */
export const restDestinations = new Map<string, { x: number; z: number; until: number }>();

export const greetings = new Map<string, number>();
