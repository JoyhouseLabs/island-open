import { sceneRegistry, type SubSceneId } from "@island/contracts";

const roomPaths = Object.fromEntries(
  sceneRegistry
    .filter((scene) => scene.kind === "room")
    .map((scene) => [scene.id, `/${scene.id}`]),
) as Record<SubSceneId, string>;

// Only implemented scenes are routable. New modules get their own page and path.
export const paths: { island: string; books: string; studio: string; wilderness: string } & Record<
  SubSceneId,
  string
> = {
  island: "/island",
  wilderness: "/dinosaur/explore",
  books: "/books",
  studio: "/studio",
  ...roomPaths,
};

export const pageTitles: Record<string, string> = {
  "/physics": "物理游乐场 · 心灵家园",
  [paths.wilderness]: "外围探索 · 心灵家园",
  [paths.books]: "共读书架 · 心灵家园",
  [paths.studio]: "AI 工坊 · 心灵家园",
};
for (const scene of sceneRegistry)
  pageTitles[scene.kind === "world" ? paths.island : `/${scene.id}`] =
    `${scene.name} · 心灵家园`;

/** Read-only visit links (param routes cannot be literal keys above). */
export const visitIslandPath = (worldId: string, t: string) =>
  `/visit/${worldId}?t=${encodeURIComponent(t)}`;
export const visitScenePath = (
  worldId: string,
  scene: SubSceneId,
  t: string,
) => `/visit/${worldId}/${scene}?t=${encodeURIComponent(t)}`;
