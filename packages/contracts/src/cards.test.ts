import { describe, expect, it } from "vitest";
import { builtinCards, knowledgeCardSchema, subjectSchema } from "./index.js";

describe("subjectSchema", () => {
  it("accepts the five subject families", () => {
    expect(subjectSchema.safeParse("forage:crab").success).toBe(true);
    expect(subjectSchema.safeParse("species:fox").success).toBe(true);
    expect(subjectSchema.safeParse("resident:团团").success).toBe(true);
    expect(subjectSchema.safeParse("content:moon-cat").success).toBe(true);
    expect(
      subjectSchema.safeParse(
        "device:1b3e4d5a-9c2b-4f8e-a1b2-c3d4e5f6a7b8",
      ).success,
    ).toBe(true);
  });
  it("rejects malformed ids", () => {
    expect(subjectSchema.safeParse("forage:dragon").success).toBe(false);
    expect(subjectSchema.safeParse("crab").success).toBe(false);
    expect(subjectSchema.safeParse("resident:").success).toBe(false);
    expect(subjectSchema.safeParse("device:not-a-uuid").success).toBe(false);
  });
});

describe("knowledgeCardSchema", () => {
  it("accepts a minimal card and fills defaults", () => {
    const parsed = knowledgeCardSchema.parse({
      id: "forage-crab",
      subject: "forage:crab",
      title: "螃蟹",
      look: "举着钳子横行的小家伙。",
    });
    expect(parsed.facts).toEqual([]);
    expect(parsed.taxa.phylum).toBe("");
  });
  it("rejects over-long text and bad subjects", () => {
    expect(
      knowledgeCardSchema.safeParse({
        id: "x",
        subject: "forage:crab",
        title: "螃蟹",
        look: "好".repeat(201),
      }).success,
    ).toBe(false);
    expect(
      knowledgeCardSchema.safeParse({
        id: "short",
        subject: "nonsense:crab",
        title: "螃蟹",
        look: "举着钳子横行的小家伙。",
      }).success,
    ).toBe(false);
  });
});

describe("builtinCards", () => {
  it("covers the eight forage kinds and four species", () => {
    const subjects = new Set(builtinCards.map((c) => c.subject));
    for (const kind of [
      "petal",
      "pinecone",
      "mushroom",
      "shell",
      "starfish",
      "crab",
      "pebble",
      "mote",
    ])
      expect(subjects.has(`forage:${kind}`)).toBe(true);
    for (const s of ["fox", "panda", "giraffe", "wolf"])
      expect(subjects.has(`species:${s}`)).toBe(true);
  });
  it("all pass their own schema with unique ids", () => {
    for (const card of builtinCards)
      expect(knowledgeCardSchema.safeParse(card).success).toBe(true);
    expect(new Set(builtinCards.map((c) => c.id)).size).toBe(builtinCards.length);
  });
});
