import { z } from "zod";
import type { WorldRecord } from "./index.js";

/**
 * Island sharing and realtime presence: read-only visits through secret
 * links plus the WebSocket wire protocol for co-present players.
 *
 * Quick-phrase chat is enum-only on purpose — the server relays known
 * phrase/emote ids and never free text, which is what actually keeps
 * visitor chat safe for children. Chinese labels live in the client UI.
 *
 * The scene list below is duplicated from index.ts on purpose (same TDZ
 * reason as content.ts); presence.test.ts asserts it stays in sync.
 */
const sceneIds = [
  "island",
  "garden",
  "home",
  "meadow",
  "forest",
  "library",
  "pond",
  "lab",
  "nursery",
  "mountain",
  "starlight",
  "beach",
] as const;
export const presenceSceneSchema = z.enum(sceneIds);
export type PresenceScene = (typeof sceneIds)[number];

export const sharingSchema = z.enum(["private", "link"]);
export type Sharing = z.infer<typeof sharingSchema>;
export const shareUpdateRequestSchema = z
  .object({
    sharing: sharingSchema,
    /** Co-play: visitors may plant while the link is open. */
    plant: z.boolean().optional(),
  })
  .strict();
export type ShareUpdateRequest = z.infer<typeof shareUpdateRequestSchema>;
export interface SharingStatus {
  sharing: Sharing;
  /** Server-side secret; null while private. */
  shareToken: string | null;
  /** Convenience for copy-paste; null while private. */
  shareUrl: string | null;
  /** Visitors may plant (only meaningful with sharing === "link"). */
  plant: boolean;
}
/** Response of GET /worlds/:id/visit — the island plus its created rooms. */
export interface VisitIsland {
  world: WorldRecord;
  owner: { name: string };
  scenes: Array<{ scene: Exclude<PresenceScene, "island">; id: string }>;
  /** Visitors may plant while the link is open. */
  plant: boolean;
}
/** One visitor placement request: the server applies it authoritatively. */
export const visitPlaceRequestSchema = z
  .object({
    kind: z.enum(["tree", "flower", "bench"]),
    x: z.number().finite().min(-160).max(160),
    z: z.number().finite().min(-135).max(135),
    /** Client-generated entity id: retries with the same id are no-ops. */
    id: z.string().min(1).max(100).optional(),
  })
  .strict();
export type VisitPlaceRequest = z.infer<typeof visitPlaceRequestSchema>;

/** The avatar payload a player broadcasts (mirrors the client's AvatarConfig). */
export const avatarWireSchema = z
  .object({
    form: z.string().min(1).max(20),
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    hat: z.string().min(1).max(20),
  })
  .strict();
export type AvatarWire = z.infer<typeof avatarWireSchema>;

export const phraseSchema = z.enum(["hi", "play", "pretty", "bye"]);
export type Phrase = z.infer<typeof phraseSchema>;
export const emoteSchema = z.enum(["heart", "sparkle", "note", "flower"]);
export type WireEmote = z.infer<typeof emoteSchema>;

export interface PresencePlayer {
  id: string;
  name: string;
  avatar: AvatarWire;
  /** True when this connection belongs to the island's owner. */
  host: boolean;
}

/** One host-simulated NPC (resident animals) relayed to visitors. */
export const agentWireSchema = z
  .object({
    id: z.string().min(1).max(48),
    kind: z.string().min(1).max(20),
    x: z.number().finite().min(-160).max(160),
    z: z.number().finite().min(-135).max(135),
    yaw: z.number().min(-Math.PI).max(Math.PI).optional(),
    action: z.string().min(1).max(16).optional(),
    name: z.string().min(1).max(24).optional(),
  })
  .strict();
export type AgentWire = z.infer<typeof agentWireSchema>;

/** Client → server messages over /api/presence. */
export const presenceClientSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("hello"),
      name: z.string().trim().min(1).max(24),
      avatar: avatarWireSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("pos"),
      x: z.number().finite().min(-160).max(160),
      z: z.number().finite().min(-135).max(135),
      yaw: z.number().min(-Math.PI).max(Math.PI),
      moving: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("bubble"),
      phrase: phraseSchema.optional(),
      emote: emoteSchema.optional(),
    })
    .strict()
    .refine((b) => (b.phrase ? !b.emote : !!b.emote), {
      message: "phrase 与 emote 只能二选一",
    }),
  z
    .object({
      type: z.literal("agents"),
      /** The host's authoritative resident positions; visitors only read. */
      list: z.array(agentWireSchema).max(24),
    })
    .strict(),
]);
export type PresenceClientMessage = z.infer<typeof presenceClientSchema>;

/** Server → client messages. Positions and bubbles name the sender id. */
export const presenceServerSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("welcome"),
      you: z.string(),
      host: z.boolean(),
      players: z.array(
        z
          .object({
            id: z.string(),
            name: z.string(),
            avatar: avatarWireSchema,
            host: z.boolean(),
          })
          .strict(),
      ),
    })
    .strict(),
  z
    .object({
      type: z.literal("join"),
      player: z
        .object({
          id: z.string(),
          name: z.string(),
          avatar: avatarWireSchema,
          host: z.boolean(),
        })
        .strict(),
    })
    .strict(),
  z.object({ type: z.literal("leave"), id: z.string() }).strict(),
  z
    .object({
      type: z.literal("pos"),
      id: z.string(),
      x: z.number(),
      z: z.number(),
      yaw: z.number(),
      moving: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("bubble"),
      id: z.string(),
      phrase: phraseSchema.optional(),
      emote: emoteSchema.optional(),
      at: z.number(),
    })
    .strict(),
  z
    .object({
      type: z.literal("agents"),
      /** Sender connection id; clients only apply frames from the host. */
      id: z.string(),
      agents: z.array(agentWireSchema).max(24),
    })
    .strict(),
  z
    .object({
      type: z.literal("world"),
      /** The room's parent world id and scene, plus the new revision. */
      world: z.string(),
      scene: z.string(),
      revision: z.number().int().positive(),
    })
    .strict(),
]);
export type PresenceServerMessage = z.infer<typeof presenceServerSchema>;
