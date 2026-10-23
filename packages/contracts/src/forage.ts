import { z } from "zod";
import { vector3Schema } from "./physics.js";
export const forageKindSchema = z.enum([
  "petal",
  "pinecone",
  "mushroom",
  "shell",
  "starfish",
  "crab",
  "pebble",
  "mote",
]);
export const physicsForageSpotSchema = z
  .object({
    id: z.string().min(1).max(80),
    kind: forageKindSchema,
    position: vector3Schema,
  })
  .strict();
export type PhysicsForageSpot = z.infer<typeof physicsForageSpotSchema>;
export const forageContextSchema = z
  .object({ accountId: z.string().uuid(), connectionId: z.string().uuid() })
  .strict();
export const collectForageSchema = forageContextSchema
  .extend({ spotId: z.string().min(1).max(80), claimId: z.string().uuid() })
  .strict();
/** Published places have no live room, so their forage context is the account itself. */
export const placeForageContextSchema = z
  .object({ accountId: z.string().uuid() })
  .strict();
/** Personal exploration asks for one chunk ring at a time, deterministically
 * regenerated server-side from the world's seed. */
export const explorationForageContextSchema = z
  .object({
    accountId: z.string().uuid(),
    chunk: z.string().regex(/^-?\d{1,6},-?\d{1,6}$/),
  })
  .strict();
/** Account-scoped collect body shared by published places and exploration. */
export const collectAccountForageSchema = placeForageContextSchema
  .extend({ spotId: z.string().min(1).max(80), claimId: z.string().uuid() })
  .strict();
export const forageAvailabilitySchema = z
  .object({
    serverTime: z.number().finite(),
    spots: z
      .array(
        physicsForageSpotSchema.extend({
          claimId: z.string().uuid(),
          readyAt: z.number().finite(),
        }),
      )
      .max(24),
  })
  .strict();
export type ForageAvailability = z.infer<typeof forageAvailabilitySchema>;
