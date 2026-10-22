import { identityQuaternion, type ObjectPart } from "@island/contracts";

const rotation = identityQuaternion;
export const box = (
  id: string,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  color: string,
): ObjectPart => ({
  id,
  position: { x, y, z },
  rotation,
  color,
  sensor: false,
  shape: { kind: "box", halfExtents: { x: w / 2, y: h / 2, z: d / 2 } },
});
export const cylinder = (
  id: string,
  x: number,
  y: number,
  z: number,
  radius: number,
  height: number,
  color: string,
): ObjectPart => ({
  id,
  position: { x, y, z },
  rotation,
  color,
  sensor: false,
  shape: { kind: "cylinder", radius, halfHeight: height / 2 },
});
export const hull = (
  id: string,
  vertices: Array<{ x: number; y: number; z: number }>,
  color: string,
): ObjectPart => ({
  id,
  position: { x: 0, y: 0, z: 0 },
  rotation,
  color,
  sensor: false,
  shape: { kind: "convex", vertices },
});
