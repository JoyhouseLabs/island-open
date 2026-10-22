import {
  createElement,
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  animalConfigSchema,
  bookSchema,
  books as builtinBooks,
  knowledgeCardSchema,
  builtinCards,
  placeSchema,
  type AnimalConfig,
  type Book,
  type IntelligenceStatus,
  type KnowledgeCard,
  type PlaceConfig,
} from "@island/contracts";
import { api } from "./api";
import { registerPlaces } from "./places/specs";

export type ContentFeed = {
  books: Book[];
  animals: AnimalConfig[];
  places: PlaceConfig[];
  cards: KnowledgeCard[];
};

/** The optional feature flags mirrored from /api/capabilities. */
export interface FeatureFlags {
  cards: boolean;
  speakingEntities: boolean;
  ecology: boolean;
}

/** Whose island the content lists belong to. A world id reads the owner's
 *  configuration (a visit); otherwise the signed-in person's own island. */
export type IslandConfigScope = {
  userId?: string | null;
  worldId?: string;
  token?: string;
};

const IslandConfigContext = createContext<IslandConfigScope>({});

export function IslandConfigProvider({
  userId = null,
  worldId,
  token,
  children,
}: IslandConfigScope & { children: ReactNode }) {
  return createElement(
    IslandConfigContext.Provider,
    { value: { userId, worldId, token } },
    children,
  );
}

export function useIslandConfig() {
  return useContext(IslandConfigContext);
}

const feeds = new Map<string, Promise<ContentFeed>>();
const fallbackFeed = (): ContentFeed => ({
  books: [...builtinBooks],
  animals: [],
  places: [],
  cards: [...builtinCards],
});

function scopeKey(scope: IslandConfigScope) {
  return scope.worldId
    ? `world:${scope.worldId}:${scope.token ?? ""}`
    : `self:${scope.userId ?? ""}`;
}

function contentQuery(scope: IslandConfigScope) {
  if (!scope.worldId) return "";
  const params = new URLSearchParams({ world: scope.worldId });
  if (scope.token) params.set("t", scope.token);
  return `?${params}`;
}

/**
 * Books, animals and places installed on one island. Failures fall back to
 * the built-in shelf and an empty roster.
 */
export function contentFeed(scope: IslandConfigScope = {}): Promise<ContentFeed> {
  const key = scopeKey(scope);
  const cached = feeds.get(key);
  if (cached) return cached;
  const query = contentQuery(scope);
  const pending = (async () => {
    const [booksRes, animalsRes, placesRes, cardsRes] = await Promise.all([
      api<{ books: unknown[] }>(`/content/books${query}`).catch(() => null),
      api<{ animals: unknown[] }>(`/content/animals${query}`).catch(() => null),
      api<{ places: unknown[] }>(`/content/places${query}`).catch(() => null),
      api<{ cards: unknown[] }>(`/content/cards${query}`).catch(() => null),
    ]);
    const parsedBooks = (booksRes?.books ?? (builtinBooks as unknown[]))
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
    const cards = (cardsRes?.cards ?? [])
      .map((c) => knowledgeCardSchema.safeParse(c))
      .filter((r): r is { success: true; data: KnowledgeCard } => r.success)
      .map((r) => r.data);
    registerPlaces(places);
    return {
      books: parsedBooks.length ? parsedBooks : [...builtinBooks],
      animals,
      places,
      cards: cards.length ? cards : [...builtinCards],
    };
  })().catch(() => {
    feeds.delete(key);
    return fallbackFeed();
  });
  feeds.set(key, pending);
  return pending;
}

export function useContentFeed() {
  const scope = useIslandConfig();
  const key = scopeKey(scope);
  const [feed, setFeed] = useState<ContentFeed | null>(null);
  useEffect(() => {
    let alive = true;
    void contentFeed(scope).then((next) => {
      if (alive) setFeed(next);
    });
    return () => {
      alive = false;
    };
    // scopeKey covers the fields that change the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return feed;
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
    () => ({ tutor: false, npc: false, speech: false, asr: false, model: null }),
  ));
}

let featureFlags: Promise<FeatureFlags> | null = null;
const FLAGS_OFF: FeatureFlags = {
  cards: false,
  speakingEntities: false,
  ecology: false,
};
/** Which optional features the server switched on (cached; failures read as off). */
export function featuresStatus(): Promise<FeatureFlags> {
  return (featureFlags ??= api<{ features?: Partial<FeatureFlags> }>(
    "/capabilities",
  )
    .then((c) => ({ ...FLAGS_OFF, ...c.features }))
    .catch(() => FLAGS_OFF));
}

/** The knowledge card describing one subject, if this island has one. */
export function cardForSubject(
  feed: ContentFeed | null,
  subject: string,
): KnowledgeCard | undefined {
  return feed?.cards.find((c) => c.subject === subject);
}
