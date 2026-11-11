import { expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import type { StarlightAction, StarlightState } from "@island/contracts";
import { applyStarlight, emptyStarlight } from "@island/world-core";
import { confirmedTrialEffect, trialEffectFrame } from "./trialEffects";
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
