// Static geometry, dynamic objects, interactive characters, read-only characters.
export const collisionGroups = {
  fixed: 0x0001ffff,
  dynamic: 0x0002ffff,
  character: 0x00040003,
  visitor: 0x00080001,
} as const;
export const isCharacterCollider = (groups: number) =>
  ((groups >>> 16) & 12) !== 0;
