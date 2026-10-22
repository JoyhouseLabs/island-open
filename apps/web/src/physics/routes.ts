import { subSceneIds } from "@island/contracts";

export const physicalRoutes = [
  "island",
  ...subSceneIds,
  "playground",
  "building-yard",
];
export type PhysicsEntry = "home" | "visit" | "lobby";
export function homePath(worldId: string, scene = "island") {
  return `/${encodeURIComponent(scene)}?world=${encodeURIComponent(worldId)}`;
}
export function visitPath(
  worldId: string,
  scene: string,
  token: string | null,
) {
  const path = `/visit/${encodeURIComponent(worldId)}${scene === "island" ? "" : `/${encodeURIComponent(scene)}`}`;
  return `${path}${token ? `?t=${encodeURIComponent(token)}` : ""}`;
}
