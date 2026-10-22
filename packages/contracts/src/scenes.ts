/**
 * Every scene the game can open. Rooms hang off a person's island.
 * A future shared map (the market) registers here with kind "platform"
 * and is not created as a child of someone's world.
 *
 * Geometry, walking and forage still live next to the renderer. This list
 * is the only id list: presence, content, routes and the API all read it.
 */
export const subSceneIds = [
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
export type SubSceneId = (typeof subSceneIds)[number];
export type SceneKind = "world" | "room" | "platform";

const roomNames: Record<SubSceneId, string> = {
  garden: "私家花园",
  home: "家园小院",
  meadow: "风眠草地",
  forest: "狐狸森林",
  library: "林间书屋",
  pond: "静水池塘",
  lab: "自然实验室",
  nursery: "实验种植园",
  mountain: "听风山",
  starlight: "星光秘境",
  beach: "月牙沙滩",
};

export const sceneRegistry = [
  { id: "island" as const, kind: "world" as const, name: "主岛" },
  ...subSceneIds.map((id) => ({
    id,
    kind: "room" as const,
    name: roomNames[id],
  })),
];

export const sceneIds = ["island", ...subSceneIds] as const;
export type SceneId = (typeof sceneIds)[number];

export function isRoomScene(id: string): id is SubSceneId {
  return (subSceneIds as readonly string[]).includes(id);
}
