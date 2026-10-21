import type { SubSceneId } from "@island/contracts";
// Only implemented scenes are routable. New modules get their own page and path.
export const paths: { island: string; books: string; studio: string } & Record<SubSceneId, string> = {
  island: "/island",
  books: "/books",
  studio: "/studio",
  garden: "/garden",
  home: "/home",
  meadow: "/meadow",
  forest: "/forest",
  library: "/library",
  pond: "/pond",
  lab: "/lab",
  nursery: "/nursery",
  mountain: "/mountain",
  starlight: "/starlight",
  beach: "/beach",
};
export const pageTitles: Record<string, string> = {
  [paths.island]: "主岛 · 心灵家园",
  [paths.books]: "共读书架 · 心灵家园",
  [paths.studio]: "AI 工坊 · 心灵家园",
  [paths.garden]: "私家花园 · 心灵家园",
  [paths.home]: "家园小院 · 心灵家园",
  [paths.meadow]: "风眠草地 · 心灵家园",
  [paths.forest]: "狐狸森林 · 心灵家园",
  [paths.library]: "林间书屋 · 心灵家园",
  [paths.pond]: "静水池塘 · 心灵家园",
  [paths.lab]: "自然实验室 · 心灵家园",
  [paths.nursery]: "实验种植园 · 心灵家园",
  [paths.mountain]: "听风山 · 心灵家园",
  [paths.starlight]: "星光秘境 · 心灵家园",
  [paths.beach]: "月牙沙滩 · 心灵家园",
};
/** Read-only visit links (param routes cannot be literal keys above). */
export const visitIslandPath = (worldId: string, t: string) =>
  `/visit/${worldId}?t=${encodeURIComponent(t)}`;
export const visitScenePath = (
  worldId: string,
  scene: Exclude<SubSceneId, never>,
  t: string,
) => `/visit/${worldId}/${scene}?t=${encodeURIComponent(t)}`;
