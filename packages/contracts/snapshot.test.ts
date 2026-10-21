import { expect, test } from "vitest";
import { sameWorld, worldSchema } from "./src/index";
test("JSONB key order is irrelevant, but an edit during saving remains dirty", () => {
  const a = worldSchema.parse({
    schemaVersion: 3,
    scene: "island",
    generatorVersion: "3.0.0",
    name: "岛屿",
    seed: 1,
    environment: { hour: 16, season: "summer" },
    entities: [{ id: "a", kind: "tree", x: 30, z: 30, seed: 2, growth: 0.5 }],
    contentLock: { core: "1.0.0" },
  });
  const reverse = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(reverse)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value)
              .reverse()
              .map(([key, v]) => [key, reverse(v)]),
          )
        : value;
  expect(sameWorld(a, reverse(a) as typeof a)).toBe(true);
  expect(
    sameWorld(a, { ...a, entities: [{ ...a.entities[0]!, growth: 0.7 }] }),
  ).toBe(false);
});
