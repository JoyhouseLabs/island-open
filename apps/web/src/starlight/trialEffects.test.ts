import { expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import type { StarlightAction, StarlightState } from "@island/contracts";
import { applyStarlight, emptyStarlight } from "@island/world-core";
import {
  confirmedTrialEffect,
  trialEffectFrame,
  trialCue,
} from "./trialEffects";
const apply = (state: StarlightState, action: StarlightAction) =>
  applyStarlight(
    state,
    { actionId: randomUUID(), expectedRevision: state.revision, action },
    1000,
  ).state;
const start = () => apply(emptyStarlight(), { op: "trial.start" });
test("a confirmed beam uses actual damage and stops the counter when the shadow is cleared", () => {
  let state = start();
  for (const skill of ["observe", "beam", "observe"] as const)
    state = apply(state, { op: "trial.turn", skill });
  const after = apply(state, { op: "trial.turn", skill: "beam" });
  const fx = confirmedTrialEffect(state.trial, after.trial, "beam")!;
  expect(after.trial?.phase).toBe("won");
  expect(fx.dealt).toBe(5);
  expect(fx.counter).toBe(false);
  expect(fx.won).toBe(true);
});
test("pauses, restored snapshots, other battles and duplicate receipts don't generate combat", () => {
  const before = start(),
    after = apply(before, { op: "trial.turn", skill: "guard" });
  expect(confirmedTrialEffect(after.trial, after.trial, "guard")).toBeNull();
  expect(
    confirmedTrialEffect(
      before.trial,
      apply(before, { op: "trial.pause" }).trial,
      "guard",
    ),
  ).toBeNull();
  expect(confirmedTrialEffect(before.trial, start().trial, "beam")).toBeNull();
  expect(confirmedTrialEffect(null, after.trial, "guard")).toBeNull();
});
test("effect identity advances after the eight-line log fills, without parsing display text", () => {
  let before = start();
  for (let i = 0; i < 8; i++)
    before = apply(before, { op: "trial.turn", skill: "guard" });
  const after = apply(before, { op: "trial.turn", skill: "guard" });
  expect(before.trial?.log.length).toBe(8);
  expect(after.trial?.log.length).toBe(8);
  const fx = confirmedTrialEffect(
    before.trial,
    { ...after.trial!, log: ["translated text"] },
    "guard",
  )!;
  expect(fx.id).toBe(`${before.trial!.id}:${before.trial!.turn}`);
  expect(fx.received).toBe(0);
});
test("reduced motion removes travelling and impact effects but retains a static guard cue", () => {
  const before = start(),
    after = apply(before, { op: "trial.turn", skill: "guard" });
  const fx = confirmedTrialEffect(before.trial, after.trial, "guard");
  const frame = trialEffectFrame(fx, 1.4, true);
  expect(frame.beam).toBeNull();
  expect(frame.counter).toBeNull();
  expect(frame.impact).toBe(0);
  expect(frame.receive).toBe(0);
  expect(frame.shield).toBe(1);
});
test("beam presentation separates charge, travel, impact and enemy response", () => {
  const before = start(),
    after = apply(before, { op: "trial.turn", skill: "beam" });
  const fx = confirmedTrialEffect(before.trial, after.trial, "beam");
  expect(trialEffectFrame(fx, 0.2, false).charge).toBeGreaterThan(0);
  expect(trialEffectFrame(fx, 0.6, false).beam).toBeGreaterThan(0);
  expect(trialEffectFrame(fx, 1, false).impact).toBeGreaterThan(0);
  expect(trialEffectFrame(fx, 1, false).beam).toBeNull();
  expect(trialEffectFrame(fx, 2.4, false).counter).toBeNull();
});

test("turn cue follows accepted animation, hides while pending or paused, and returns to skill choice", () => {
  const before = start(),
    after = apply(before, { op: "trial.turn", skill: "observe" });
  const fx = confirmedTrialEffect(before.trial, after.trial, "observe")!;
  expect(trialCue(before.trial, false, null, false).actor).toBe("ally");
  expect(trialCue(after.trial, false, fx, false).label).toContain("观察");
  expect(trialCue(after.trial, false, fx, true)).toEqual({
    actor: "shadow",
    label: "星影正在蓄光",
  });
  expect(trialCue(after.trial, true, fx, true).actor).toBeNull();
  expect(
    trialCue({ ...after.trial!, phase: "paused" }, false, fx, true).actor,
  ).toBeNull();
  expect(trialCue(after.trial, false, fx, true, true).actor).toBeNull();
  expect(trialCue(after.trial, false, null, true).label).toContain(
    "请选择招式",
  );
  expect(
    trialCue({ ...after.trial!, phase: "won" }, false, null, false).actor,
  ).toBeNull();
  expect(trialCue(after.trial, false, { ...fx, won: true }, true).actor).toBe(
    "ally",
  );
  expect(
    trialCue(after.trial, false, { ...fx, counter: true }, true).label,
  ).toBe("轮到星影回应");
});
test("healing reports the full counter hit even when healing offsets part of it", () => {
  const before = start();
  Object.assign(before.trial!, { energy: 8, points: 4, turn: 2 });
  const after = apply(before, { op: "trial.turn", skill: "moonlight" });
  const fx = confirmedTrialEffect(before.trial, after.trial, "moonlight")!;
  expect(fx.healed).toBe(2);
  expect(fx.received).toBe(5);
  expect(trialEffectFrame(fx, 0.5, false).heal).toBeGreaterThan(0);
  expect(trialEffectFrame(fx, 0.5, true).heal).toBe(1);
});
test("double rings hit separately and rush returns before the opponent response", () => {
  const before = start();
  before.trial!.points = 4;
  const fx = confirmedTrialEffect(
    before.trial,
    apply(before, { op: "trial.turn", skill: "double" }).trial,
    "double",
  )!;
  expect(trialEffectFrame(fx, 0.4, false).firstRing).toBeGreaterThan(0);
  expect(trialEffectFrame(fx, 0.4, false).secondRing).toBeNull();
  expect(trialEffectFrame(fx, 0.7, false).firstRing).toBeNull();
  expect(trialEffectFrame(fx, 0.7, false).secondRing).toBeGreaterThan(0);
  expect(trialEffectFrame(fx, 0.6, false).impact).toBeGreaterThan(0);
  expect(trialEffectFrame(fx, 1, false).impact).toBeGreaterThan(0);
  const rush = { ...fx, skill: "rush" as const };
  expect(trialEffectFrame(rush, 0.6, false).dash).toBeGreaterThan(0.9);
  expect(trialEffectFrame(rush, 1.15, false).dash).toBe(0);
  expect(trialEffectFrame(rush, 0.6, true).dash).toBe(0);
  expect(trialEffectFrame(fx, 0.4, true).firstRing).toBeNull();
});
