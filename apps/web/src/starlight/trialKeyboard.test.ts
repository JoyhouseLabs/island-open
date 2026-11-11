import { expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { applyStarlight, emptyStarlight } from "@island/world-core";
import { trialShortcut, trialSkillUnavailable } from "./trialKeyboard";

const key = (key: string) => ({
  key,
  repeat: false,
  defaultPrevented: false,
  isComposing: false,
  keyCode: 0,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
});
const start = () =>
  applyStarlight(
    emptyStarlight(),
    {
      actionId: randomUUID(),
      expectedRevision: 0,
      action: { op: "trial.start" },
    },
    1000,
  ).state;
const context = () => ({
  enabled: true,
  locked: false,
  effectBusy: false,
  trial: { ...start().trial!, points: 4, energy: 6 },
});

test("number keys select six distinct techniques, including folded extra skills", () => {
  const c = context();
  for (const [digit, skill] of [
    ["1", "beam"],
    ["2", "guard"],
    ["3", "observe"],
    ["4", "double"],
    ["5", "rush"],
    ["6", "moonlight"],
  ]) {
    expect(trialShortcut(key(digit!), c, false)).toEqual({
      op: "trial.turn",
      skill,
    });
  }
  for (const other of [
    "0",
    "7",
    "End",
    "ArrowLeft",
    "Enter",
    " ",
    "Escape",
    "b",
  ])
    expect(trialShortcut(key(other), c, false)).toBeNull();
});

test("held keys, IME selection, modified keys and text entry cannot spend a turn", () => {
  for (const field of [
    "repeat",
    "defaultPrevented",
    "isComposing",
    "altKey",
    "ctrlKey",
    "metaKey",
    "shiftKey",
  ] as const) {
    for (const digit of ["1", "p"])
      expect(
        trialShortcut({ ...key(digit), [field]: true }, context(), false),
      ).toBeNull();
  }
  expect(
    trialShortcut({ ...key("1"), keyCode: 229 }, context(), false),
  ).toBeNull();
  expect(trialShortcut(key("1"), context(), true)).toBeNull();
  expect(trialShortcut(key("p"), context(), true)).toBeNull();
});

test("inactive panels and pending operations block all shortcuts; animation permits only pause", () => {
  for (const blocked of [{ enabled: false }, { locked: true }]) {
    for (const digit of ["1", "p"])
      expect(
        trialShortcut(key(digit), { ...context(), ...blocked }, false),
      ).toBeNull();
  }
  const playing = { ...context(), effectBusy: true };
  expect(trialShortcut(key("1"), playing, false)).toBeNull();
  expect(trialShortcut(key("p"), playing, false)).toEqual({
    op: "trial.pause",
  });
});

test("shortcuts obey the same points and full-energy restrictions as buttons", () => {
  const c = context();
  c.trial.points = 2;
  expect(trialShortcut(key("4"), c, false)).toBeNull();
  expect(trialSkillUnavailable(c.trial, "double")).toBe("还差 1 行动点");
  c.trial.points = 0;
  expect(trialShortcut(key("1"), c, false)).toBeNull();
  expect(trialShortcut(key("3"), c, false)).toEqual({
    op: "trial.turn",
    skill: "observe",
  });
  c.trial.points = 4;
  c.trial.energy = 10;
  expect(trialShortcut(key("6"), c, false)).toBeNull();
  expect(trialSkillUnavailable(c.trial, "moonlight")).toBe("能量已满");
});

test("pause and resume preserve the encounter; paused or completed trials cannot attack", () => {
  let state = start();
  const id = state.trial!.id;
  for (const digit of ["p", "P"]) {
    const action = trialShortcut(
      key(digit),
      { ...context(), trial: state.trial! },
      false,
    )!;
    state = applyStarlight(
      state,
      { actionId: randomUUID(), expectedRevision: state.revision, action },
      1000,
    ).state;
    expect(state.trial!.id).toBe(id);
    expect(state.trial!.turn).toBe(1);
  }
  expect(state.trial!.phase).toBe("active");
  for (const phase of ["paused", "won", "rest", "abandoned"] as const) {
    const c = { ...context(), trial: { ...state.trial!, phase } };
    expect(trialShortcut(key("1"), c, false)).toBeNull();
    if (phase !== "paused")
      expect(trialShortcut(key("p"), c, false)).toBeNull();
  }
});
