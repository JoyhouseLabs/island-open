import { describe, expect, it } from "vitest";
import {
  animalConfigSchema,
  bookSchema,
  contentSceneSchema,
  npcChatRequestSchema,
  isRoomScene,
  placeSchema,
  sceneIds,
  sceneRegistry,
  seasonSchema,
  subSceneIds,
  weatherSchema,
} from "./src/index";

describe("content schema stays in sync with the world contract", () => {
  it("covers the island plus every sub-scene", () => {
    const options = contentSceneSchema.options;
    expect(options[0]).toBe("island");
    expect(options.slice(1)).toEqual([...subSceneIds]);
    expect(sceneRegistry.filter((scene) => scene.kind === "room").map((scene) => scene.id)).toEqual([
      ...subSceneIds,
    ]);
    expect([...sceneIds]).toEqual(["island", ...subSceneIds]);
    expect(isRoomScene("garden")).toBe(true);
    expect(isRoomScene("island")).toBe(false);
    expect(isRoomScene("market")).toBe(false);
  });
  it("accepts the live weather and season values", () => {
    for (const weather of weatherSchema.options)
      expect(
        npcChatRequestSchema.shape.env?.parse?.({
          weather,
          season: "summer",
          hour: 12,
        }).weather,
      ).toBe(weather);
    for (const season of seasonSchema.options)
      expect(
        npcChatRequestSchema.shape.env?.parse?.({
          weather: "sun",
          season,
          hour: 12,
        }).season,
      ).toBe(season);
  });
});

describe("bookSchema", () => {
  it("accepts a full book and rejects foreign media urls", () => {
    const book = {
      id: "test-book",
      title: "测试书",
      author: "佚名",
      note: "一本测试用书",
      chapters: [
        {
          id: "c1",
          title: "第一章",
          lines: ["第一行", "第二行"],
          media: [{ type: "image", url: "/assets/x.png", caption: "图" }],
        },
      ],
    };
    expect(bookSchema.parse(book).chapters).toHaveLength(1);
    expect(
      bookSchema.safeParse({
        ...book,
        chapters: [
          { ...book.chapters[0], media: [{ type: "image", url: "http://x" }] },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("animalConfigSchema", () => {
  const base = {
    id: "test-animal",
    name: "小测试",
    species: "panda",
    placement: { scene: "island", x: 0, z: 0, wander: 8 },
  };
  it("fills persona defaults and accepts builtin species", () => {
    const parsed = animalConfigSchema.parse(base);
    expect(parsed.placement.wander).toBe(8);
    expect(parsed.persona).toBeUndefined();
  });
  it("requires an asset for custom species", () => {
    expect(
      animalConfigSchema.safeParse({ ...base, species: "custom" }).success,
    ).toBe(false);
    expect(
      animalConfigSchema.safeParse({
        ...base,
        species: "custom",
        assetId: "123e4567-e89b-12d3-a456-426614174000",
      }).success,
    ).toBe(true);
  });
  it("rejects out-of-map placements", () => {
    expect(
      animalConfigSchema.safeParse({
        ...base,
        placement: { scene: "island", x: 999, z: 0, wander: 8 },
      }).success,
    ).toBe(false);
  });
  it("accepts built-in and place scenes, rejects junk", () => {
    const at = (scene: string) =>
      animalConfigSchema.safeParse({
        ...base,
        placement: { scene, x: 0, z: 0, wander: 8 },
      }).success;
    expect(at("island")).toBe(true);
    expect(at("garden")).toBe(true);
    expect(at("place-moon-valley")).toBe(true);
    expect(at("place-不合法")).toBe(false);
    expect(at("nowhere")).toBe(false);
  });
  it("keeps an optional persona model and drops blank ones", () => {
    const withModel = animalConfigSchema.parse({
      ...base,
      persona: {
        temperament: "温和",
        speechStyle: "",
        likes: "",
        model: "deepseek-flash",
      },
    });
    expect(withModel.persona?.model).toBe("deepseek-flash");
    const blank = animalConfigSchema.parse({
      ...base,
      persona: { temperament: "温和", speechStyle: "", likes: "", model: "  " },
    });
    // A blank model must vanish so the stored/published JSON (admin saves
    // JSON.stringify(parsed)) never carries the key: old strict clients
    // parse the animal without knowing it.
    expect(blank.persona?.model).toBeUndefined();
    expect(JSON.stringify(blank.persona)).not.toContain('"model"');
    expect(
      animalConfigSchema.safeParse({
        ...base,
        persona: {
          temperament: "温和",
          speechStyle: "",
          likes: "",
          model: "x".repeat(101),
        },
      }).success,
    ).toBe(false);
  });
});

describe("placeSchema", () => {
  const base = {
    id: "moon-valley",
    name: "月谷",
    tagline: "安静得能听见月光落地。",
    accent: "#6f8d63",
    ground: { shape: "disc", size: 60, color: "#a8b58c" },
    sky: { day: "#c5d5bb", night: "#172d39", stars: 2200 },
  };
  it("fills defaults and validates hex colors", () => {
    const parsed = placeSchema.parse(base);
    expect(parsed.props).toEqual([]);
    expect(parsed.ambience.volume).toBe(0.5);
    expect(placeSchema.safeParse({ ...base, accent: "green" }).success).toBe(
      false,
    );
  });
  it("allows at most one pond", () => {
    const pond = { kind: "pond" as const, x: 0, z: 0 };
    expect(
      placeSchema.safeParse({ ...base, props: [pond] }).success,
    ).toBe(true);
    expect(
      placeSchema.safeParse({ ...base, props: [pond, pond] }).success,
    ).toBe(false);
  });
});
