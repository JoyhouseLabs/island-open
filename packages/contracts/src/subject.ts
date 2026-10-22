import { z } from "zod";

/**
 * The unified subject id: everything a child can point at has one, and every
 * interaction layer (knowledge card, chat persona, ecology traits) hangs off
 * it. Kept in its own module because both content.ts (chat requests) and
 * interactions.ts (speaker profiles) validate against it — importing across
 * those would create a cycle. The forage/species name lists mirror
 * world-core's catalogs and must stay in sync with them.
 */
export const subjectRegex =
  /^(forage:(petal|pinecone|mushroom|shell|starfish|crab|pebble|mote)|species:(fox|panda|giraffe|wolf)|resident:\S{1,24}|content:[a-z0-9-]{2,40}|device:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
export const subjectSchema = z.string().regex(subjectRegex, "实体标识格式不对");
export type SubjectId = z.infer<typeof subjectSchema>;
