import { describe, expect, it } from "vitest";
import {
  geometryWorkSchema,
  initialGeometry,
  modelError,
  modelExamples,
  trainModelStep,
} from "./geometryLearning.js";
import { lessonSchema } from "./learning.js";
describe("geometry curriculum", () => {
  it("rejects duplicate observations and unsafe parameters", () => {
    expect(
      geometryWorkSchema.safeParse({
        ...initialGeometry(),
        observed: ["cone", "cone"],
      }).success,
    ).toBe(false);
    expect(
      geometryWorkSchema.safeParse({ ...initialGeometry(), height: Infinity })
        .success,
    ).toBe(false);
    expect(
      geometryWorkSchema.safeParse({ ...initialGeometry(), size: -1 }).success,
    ).toBe(false);
  });
  it("requires a target for parameter challenges", () => {
    const lesson = {
      id: "geometry-test",
      title: "测试",
      description: "描述",
      minutes: 10,
      trigger: "library",
      steps: [
        {
          id: "explore",
          kind: "geometry-lab",
          title: "观察",
          text: "试试",
          geometry: { mode: "parameters" },
        },
      ],
    };
    expect(lessonSchema.safeParse(lesson).success).toBe(false);
    expect(
      lessonSchema.safeParse({
        ...lesson,
        steps: [
          {
            ...lesson.steps[0],
            geometry: {
              mode: "parameters",
              target: { solid: "cone", height: 2.6, size: 0.9 },
            },
          },
        ],
      }).success,
    ).toBe(true);
  });
  it("learns from examples and then adapts the same parameter", () => {
    let weight = 1;
    for (const mode of ["train", "adapt"] as const) {
      for (let i = 0; i < 30; i++) {
        const next = trainModelStep(weight, mode);
        expect(modelError(next, mode)).toBeLessThanOrEqual(
          modelError(weight, mode),
        );
        weight = next;
      }
      expect(weight).toBeCloseTo(mode === "train" ? 2 : 3, 4);
      expect(modelExamples[mode].some((p) => Number(p.width) === 2)).toBe(
        false,
      );
      expect(weight * 2).toBeCloseTo(mode === "train" ? 4 : 6, 4);
    }
    expect(modelError(weight, "train")).toBeGreaterThan(1);
  });
});
