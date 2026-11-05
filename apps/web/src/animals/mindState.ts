export const residentWorld: {
  current: { worldId: string; token?: string } | null;
} = { current: null };
export const rests = new Map<string, number>();
export function consumeResidentRest(id: string) {
  const until = rests.get(id);
  rests.delete(id);
  return !!until && until > Date.now();
}
