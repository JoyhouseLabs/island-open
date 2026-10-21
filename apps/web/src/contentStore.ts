import {
  animalConfigSchema,
  bookSchema,
  books as builtinBooks,
  placeSchema,
  type AnimalConfig,
  type Book,
  type IntelligenceStatus,
  type PlaceConfig,
} from "@island/contracts";
import { api } from "./api";
import { registerPlaces } from "./places/specs";

export type ContentFeed = {
  books: Book[];
  animals: AnimalConfig[];
  places: PlaceConfig[];
};
let feed: Promise<ContentFeed> | null = null;

/**
 * The admin-published content feed, fetched once per session. Failures fall
 * back to the built-in shelf and an empty roster, matching the island's
 * offline-friendly behavior.
 */
export function contentFeed(): Promise<ContentFeed> {
  return (feed ??= (async () => {
    const [booksRes, animalsRes, placesRes] = await Promise.all([
      api<{ books: unknown[] }>("/content/books").catch(() => null),
      api<{ animals: unknown[] }>("/content/animals").catch(() => null),
      api<{ places: unknown[] }>("/content/places").catch(() => null),
    ]);
    const parsedBooks = (booksRes?.books ?? builtinBooks as unknown[])
      .map((b) => bookSchema.safeParse(b))
      .filter((r): r is { success: true; data: Book } => r.success)
      .map((r) => r.data);
    const animals = (animalsRes?.animals ?? [])
      .map((a) => animalConfigSchema.safeParse(a))
      .filter((r): r is { success: true; data: AnimalConfig } => r.success)
      .map((r) => r.data);
    const places = (placesRes?.places ?? [])
      .map((p) => placeSchema.safeParse(p))
      .filter((r): r is { success: true; data: PlaceConfig } => r.success)
      .map((r) => r.data);
    registerPlaces(places);
    return {
      books: parsedBooks.length ? parsedBooks : [...builtinBooks],
      animals,
      places,
    };
  })());
}

/**
 * Content animals by their live agent id ("content-<id>"), registered while
 * rendering so dialogue can find the speaker's config and persona.
 */
export const npcSpeakers = new Map<string, AnimalConfig>();

let intelligence: Promise<IntelligenceStatus> | null = null;
/** Whether the backend LLM is configured (cached; failures read as off). */
export function intelligenceStatus(): Promise<IntelligenceStatus> {
  return (intelligence ??= api<IntelligenceStatus>("/intelligence/status").catch(
    () => ({ tutor: false, npc: false, speech: false, model: null }),
  ));
}
