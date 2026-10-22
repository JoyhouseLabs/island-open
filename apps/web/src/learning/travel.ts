import { learningReturnSchema, type LearningReturn } from "@island/contracts";
/** Small navigation state, independent of the 3D runtime and learner records. */
export const learningTravel = {
  current: null as { scene: string; x: number; z: number; yaw: number } | null,
  pending: null as LearningReturn | null,
  worldId: null as string | null,
};
const key = "island-learning-return-v1";
export function rememberReturn(context: LearningReturn, userId: string | null) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ context, userId }));
  } catch {
    /* Server retains context after activation. */
  }
}
export function readReturn(userId: string): LearningReturn {
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) ?? "null");
    const parsed = learningReturnSchema.safeParse(saved?.context);
    if (saved?.userId && saved.userId !== userId)
      return { worldId: null, scene: "island", position: null };
    if (parsed.success) return parsed.data;
  } catch {
    /* Fall back to the island. */
  }
  return { worldId: null, scene: "island", position: null };
}
export function returnUrl(context: LearningReturn) {
  return `/${context.scene}${context.worldId ? `?world=${encodeURIComponent(context.worldId)}` : ""}`;
}
