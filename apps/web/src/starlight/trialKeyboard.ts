import {
  trialSkills,
  type StarTrial,
  type StarlightAction,
  type TrialSkillId,
} from "@island/contracts";

export const trialSkillKeys: Record<TrialSkillId, string> = {
  beam: "1",
  guard: "2",
  observe: "3",
  double: "4",
  rush: "5",
  moonlight: "6",
};

/** Buttons and keyboard share availability; the server still validates every action. */
export function trialSkillUnavailable(
  trial: StarTrial | null,
  id: TrialSkillId,
) {
  const skill = trialSkills[id];
  if (skill.heal && trial?.energy === 10) return "能量已满";
  const lacking = Math.max(0, skill.cost - (trial?.points ?? 0));
  return lacking ? `还差 ${lacking} 行动点` : "";
}

type TrialKey = Pick<
  KeyboardEvent,
  | "key"
  | "repeat"
  | "defaultPrevented"
  | "isComposing"
  | "keyCode"
  | "altKey"
  | "ctrlKey"
  | "metaKey"
  | "shiftKey"
>;
/** Called only by the focused trial panel, never by a window-level listener. */
export function trialShortcut(
  event: TrialKey,
  context: {
    enabled: boolean;
    locked: boolean;
    effectBusy: boolean;
    trial: StarTrial | null;
  },
  editingText: boolean,
): StarlightAction | null {
  if (
    !context.enabled ||
    context.locked ||
    editingText ||
    event.defaultPrevented ||
    event.repeat ||
    event.isComposing ||
    event.keyCode === 229 ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey
  )
    return null;
  const { trial } = context;
  if (event.key.toLowerCase() === "p") {
    if (trial?.phase === "active") return { op: "trial.pause" };
    if (trial?.phase === "paused") return { op: "trial.resume" };
  }
  if (context.effectBusy || trial?.phase !== "active") return null;
  const id = (Object.keys(trialSkillKeys) as TrialSkillId[]).find(
    (id) => trialSkillKeys[id] === event.key,
  );
  return id && !trialSkillUnavailable(trial, id)
    ? { op: "trial.turn", skill: id }
    : null;
}
