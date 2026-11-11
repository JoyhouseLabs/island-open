import {
  trialSkills,
  type StarTrial,
  type TrialSkillId,
} from "@island/contracts";
import { trialIntent } from "@island/world-core";

export type TrialEffect = {
  id: string;
  turn: number;
  skill: TrialSkillId;
  healed: number;
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
  const healed = Math.min(trialSkills[skill].heal, 10 - before.energy);
  return {
    id: `${before.id}:${before.turn}`,
    turn: before.turn,
    skill,
    dealt: Math.max(0, before.shadow - after.shadow),
    healed,
    received: Math.max(0, before.energy + healed - after.energy),
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
    impact:
      !still && effect?.dealt
        ? Math.max(
            effect.skill === "double" ? pulse(0.48, 0.24) : 0,
            pulse(0.82, 0.45),
          )
        : 0,
    firstRing:
      !still && effect?.skill === "double" && t >= 0.2 && t < 0.55
        ? (t - 0.2) / 0.35
        : null,
    secondRing:
      !still && effect?.skill === "double" && t >= 0.55 && t < 0.9
        ? (t - 0.55) / 0.35
        : null,
    dash: !still && effect?.skill === "rush" ? pulse(0.12, 0.95) : 0,
    heal: effect?.skill === "moonlight" ? (still ? 1 : pulse(0.05, 1.05)) : 0,
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

export type TrialCue = { actor: "ally" | "shadow" | null; label: string };
/** One cue drives both the world arrow and the text beside the skills. The
 * shadow's response is part of the accepted turn, never another player input. */
export function trialCue(
  trial: StarTrial | null,
  pending: boolean,
  effect: TrialEffect | null,
  responding: boolean,
  paused = false,
): TrialCue {
  if (paused || trial?.phase === "paused")
    return { actor: null, label: "试炼已暂停" };
  if (pending) return { actor: null, label: "正在确认行动，请稍等" };
  if (effect) {
    if (responding && !effect.won)
      return {
        actor: "shadow",
        label: effect.counter ? "轮到星影回应" : "星影正在蓄光",
      };
    return {
      actor: "ally",
      label: `月亮伊布 · ${trialSkills[effect.skill].name}`,
    };
  }
  if (trial?.phase === "active")
    return { actor: "ally", label: "轮到月亮伊布 · 请选择招式" };
  return {
    actor: null,
    label:
      trial?.phase === "won"
        ? "试炼完成"
        : trial?.phase === "rest"
          ? "伙伴需要休息"
          : "准备好后开始试炼",
  };
}
