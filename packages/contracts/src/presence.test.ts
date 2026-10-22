import { describe, expect, it } from "vitest";
import { subSceneIds } from "./index.js";
import {
  avatarWireSchema,
  presenceClientSchema,
  presenceSceneSchema,
  presenceServerSchema,
  shareUpdateRequestSchema,
} from "./presence.js";

describe("presence scene list stays in sync with subSceneIds", () => {
  it("accepts island plus every sub-scene", () => {
    expect(presenceSceneSchema.options).toEqual(["island", ...subSceneIds]);
  });
});

describe("shareUpdateRequestSchema", () => {
  it("accepts both sharing modes", () => {
    expect(shareUpdateRequestSchema.parse({ sharing: "link" })).toEqual({
      sharing: "link",
    });
    expect(shareUpdateRequestSchema.parse({ sharing: "private" })).toEqual({
      sharing: "private",
    });
    expect(
      shareUpdateRequestSchema.safeParse({ sharing: "public" }).success,
    ).toBe(false);
  });
});

describe("presenceClientSchema", () => {
  it("validates a hello with avatar", () => {
    const parsed = presenceClientSchema.parse({
      type: "hello",
      name: "小鹿",
      avatar: { form: "islander", accent: "#e2a55f", hat: "none" },
    });
    expect(parsed.type).toBe("hello");
    expect(avatarWireSchema.safeParse({ form: "x", accent: "red", hat: "none" }).success).toBe(false);
  });

  it("rejects free-text bubbles", () => {
    // phrase/emote are enums — free text must never pass.
    expect(
      presenceClientSchema.safeParse({ type: "bubble", phrase: "你好呀" }).success,
    ).toBe(false);
    expect(
      presenceClientSchema.safeParse({ type: "bubble", text: "你好呀" }).success,
    ).toBe(false);
  });

  it("requires exactly one of phrase or emote", () => {
    expect(
      presenceClientSchema.safeParse({ type: "bubble", phrase: "hi", emote: "heart" })
        .success,
    ).toBe(false);
    expect(presenceClientSchema.safeParse({ type: "bubble" }).success).toBe(false);
    expect(
      presenceClientSchema.safeParse({ type: "bubble", emote: "flower" }).success,
    ).toBe(true);
  });

  it("bounds positions like world entities", () => {
    expect(
      presenceClientSchema.safeParse({ type: "pos", x: 0, z: 0, yaw: 0, moving: false })
        .success,
    ).toBe(true);
    expect(
      presenceClientSchema.safeParse({ type: "pos", x: 999, z: 0, yaw: 0, moving: true })
        .success,
    ).toBe(false);
  });
});

describe("presenceServerSchema", () => {
  it("round-trips welcome/join/pos/bubble", () => {
    const avatar = { form: "islander", accent: "#5f9fe2", hat: "none" };
    expect(
      presenceServerSchema.parse({
        type: "welcome",
        you: "a",
        host: true,
        players: [{ id: "b", name: "n", avatar, host: false }],
      }),
    ).toEqual({
      type: "welcome",
      you: "a",
      host: true,
      players: [{ id: "b", name: "n", avatar, host: false }],
    });
    expect(
      presenceServerSchema.parse({
        type: "join",
        player: { id: "a", name: "n", avatar, host: false },
      }),
    ).toEqual({ type: "join", player: { id: "a", name: "n", avatar, host: false } });
    expect(
      presenceServerSchema.parse({ type: "pos", id: "a", x: 1, z: 2, yaw: 0.5, moving: true }),
    ).toEqual({ type: "pos", id: "a", x: 1, z: 2, yaw: 0.5, moving: true });
    expect(
      presenceServerSchema.parse({ type: "bubble", id: "a", phrase: "hi", at: 1 }),
    ).toEqual({ type: "bubble", id: "a", phrase: "hi", at: 1 });
  });

  it("relays host agents and world revisions", () => {
    const agents = presenceServerSchema.parse({
      type: "agents",
      id: "host-conn",
      agents: [{ id: "island-团团", kind: "panda", x: 1, z: 2, yaw: 0, action: "rest" }],
    });
    expect(agents.type).toBe("agents");
    expect(presenceServerSchema.safeParse({ type: "agents", id: "x", agents: [] }).success).toBe(true);
    // more than 24 agents is refused
    expect(
      presenceServerSchema.safeParse({
        type: "agents",
        id: "x",
        agents: Array.from({ length: 25 }, (_, i) => ({
          id: `a${i}`,
          kind: "panda",
          x: 0,
          z: 0,
        })),
      }).success,
    ).toBe(false);
    expect(
      presenceServerSchema.parse({
        type: "world",
        world: "w",
        scene: "garden",
        revision: 7,
      }),
    ).toEqual({ type: "world", world: "w", scene: "garden", revision: 7 });
  });
});
