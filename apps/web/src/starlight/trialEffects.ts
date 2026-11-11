import type { StarTrial } from "@island/contracts";
import { trialIntent } from "@island/world-core";

export type TrialEffect = {
  id: string;
  skill: "beam" | "guard" | "observe";
  dealt: number;
  received: number;
  counter: boolean;
  won: boolean;
};
export const TRIAL_EFFECT_SECONDS = 2.4;
/** Only a confirmed, consecutive turn can produce an effect. Reloads, receipts
 * and pauses never infer combat from translated or truncated log text. */
export function confirmedTrialEffect(
  before: StarTrial | null,
  after: StarTrial | null,
  skill: TrialEffect["skill"],
): TrialEffect | null {
  if (!before || !after || before.id !== after.id || before.phase !== "active")
    return null;
  const terminal = after.phase === "won" || after.phase === "rest";
  if (
    terminal
      ? after.turn !== before.turn
      : after.phase !== "active" || after.turn !== before.turn + 1
  )
    return null;
  return {
    id: `${before.id}:${before.turn}`,
    skill,
    dealt: Math.max(0, before.shadow - after.shadow),
    received: Math.max(0, before.energy - after.energy),
    counter: after.shadow > 0 && trialIntent(before.turn).damage > 0,
    won: after.phase === "won",
  };
}

/** Bounded animation phases, independent of the authoritative combat rules. */
export function trialEffectFrame(
  effect: TrialEffect | null,
  elapsed: number,
  still: boolean,
) {
  const t = Math.max(0, Math.min(TRIAL_EFFECT_SECONDS, elapsed));
  const pulse = (start: number, duration: number) =>
    t < start || t >= start + duration
      ? 0
      : Math.sin((Math.PI * (t - start)) / duration);
  return {
    charge: !still && effect?.skill === "beam" ? pulse(0, 0.45) : 0,
    beam:
      !still && effect?.skill === "beam" && t >= 0.35 && t < 0.9
        ? (t - 0.35) / 0.55
        : null,
    impact: !still && effect?.dealt ? pulse(0.82, 0.45) : 0,
    shield:
      effect?.skill === "guard"
        ? still
          ? 1
          : Math.max(0.18, pulse(0.08, 1.95))
        : 0,
    observe: effect?.skill === "observe" ? (still ? 1 : pulse(0, 1.1)) : 0,
    counter:
      !still && effect?.counter && t >= 1.15 && t < 1.7
        ? (t - 1.15) / 0.55
        : null,
    receive: !still && effect?.counter ? pulse(1.65, 0.45) : 0,
    celebrate: !still && effect?.won ? pulse(1, 1.4) : 0,
  };
}
