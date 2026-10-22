import {
  identityQuaternion,
  type ObjectPart,
  type PhysicsRegion,
  type PhysicsTerrainTile,
} from "@island/contracts";
import {
  CHUNK_SIZE,
  TERRAIN_STEP,
  wildVertexHeight,
  wildHeight,
  CAMP,
  type WildChunk,
} from "./wilderness.js";

const phi = (1 + Math.sqrt(5)) / 2;
const rockVertices = [
  ...[-1, 1].flatMap((x) =>
    [-1, 1].flatMap((y) => [-1, 1].map((z) => ({ x, y, z }))),
  ),
  ...[-1, 1].flatMap((a) =>
    [-1, 1].flatMap((b) => [
      { x: 0, y: a / phi, z: b * phi },
      { x: a / phi, y: b * phi, z: 0 },
      { x: a * phi, y: 0, z: b / phi },
    ]),
  ),
].map((v) => ({
  x: (v.x / Math.sqrt(3)) * 1.3,
  y: (v.y / Math.sqrt(3)) * 1.3,
  z: (v.z / Math.sqrt(3)) * 1.3,
}));
/** Same canonical hulls used by instanced drawing and physical region generation. Leaves are decorative. */
export const wildPropGeometry = {
  tree: {
    offsetY: 1.8,
    vertices: [-1, 1].flatMap((side) =>
      Array.from({ length: 5 }, (_, i) => ({
        x: Math.sin((i * Math.PI * 2) / 5) * (side < 0 ? 0.4 : 0.22),
        y: side * 1.8,
        z: Math.cos((i * Math.PI * 2) / 5) * (side < 0 ? 0.4 : 0.22),
      })),
    ),
  },
  rock: { offsetY: 0.6, vertices: rockVertices },
};
export function wildTerrainTile(
  seed: number,
  chunk: Pick<WildChunk, "x" | "z">,
): PhysicsTerrainTile {
  const count = CHUNK_SIZE / TERRAIN_STEP;
  return {
    id: "ground",
    origin: { x: 0, y: 0, z: 0 },
    columns: count,
    rows: count,
    step: TERRAIN_STEP,
    heights: Array.from({ length: (count + 1) ** 2 }, (_, i) =>
      wildVertexHeight(
        seed,
        chunk.x * CHUNK_SIZE + (i % (count + 1)) * TERRAIN_STEP,
        chunk.z * CHUNK_SIZE + Math.floor(i / (count + 1)) * TERRAIN_STEP,
      ),
    ),
    material: "stone",
    color: "#a4b77b",
  };
}
export function wildCampParts(): PhysicsRegion["parts"] {
  const base = {
    rotation: identityQuaternion,
    sensor: false,
    material: "wood" as const,
  };
  return [
    {
      ...base,
      id: "tent",
      position: { x: CAMP.x, y: 2.5, z: CAMP.z + 3 },
      shape: {
        kind: "convex",
        vertices: [
          { x: 4.5, y: -2.5, z: 0 },
          { x: -4.5, y: -2.5, z: 0 },
          { x: 0, y: -2.5, z: 4.5 },
          { x: 0, y: -2.5, z: -4.5 },
          { x: 0, y: 2.5, z: 0 },
        ],
      },
      color: "#c88455",
    },
    {
      ...base,
      id: "pole",
      position: { x: CAMP.x + 5, y: 3, z: CAMP.z },
      shape: { kind: "cylinder", halfHeight: 3, radius: 0.12 },
      color: "#695647",
    },
    {
      ...base,
      id: "flag",
      position: { x: CAMP.x + 6, y: 5.1, z: CAMP.z },
      shape: { kind: "box", halfExtents: { x: 1, y: 0.6, z: 0.04 } },
      color: "#f4d393",
    },
  ];
}
/** Region origin is supplied in bounded physics-local coordinates, even millions of chunks from camp. */
export function wildPhysicsRegion(
  seed: number,
  chunk: WildChunk,
  origin: { x: number; z: number },
): PhysicsRegion {
  const parts: PhysicsRegion["parts"] = chunk.props.map((p, i) => {
    const geometry = wildPropGeometry[p.kind];
    const part: ObjectPart = {
      id: `${p.kind}-${i}`,
      position: {
        x: p.x - chunk.x * CHUNK_SIZE,
        y: wildHeight(seed, p.x, p.z) + geometry.offsetY * p.scale,
        z: p.z - chunk.z * CHUNK_SIZE,
      },
      rotation: identityQuaternion,
      sensor: false,
      color: p.kind === "tree" ? "#78604b" : "#929989",
      shape: {
        kind: "convex",
        vertices: geometry.vertices.map((v) => ({
          x: v.x * p.scale,
          y: v.y * p.scale,
          z: v.z * p.scale,
        })),
      },
    };
    return { ...part, material: p.kind === "tree" ? "wood" : "stone" };
  });
  if (chunk.x === 0 && chunk.z === 0) parts.push(...wildCampParts());
  return {
    id: `wild:${chunk.x}:${chunk.z}`,
    origin: {
      x: (chunk.x - origin.x) * CHUNK_SIZE,
      y: 0,
      z: (chunk.z - origin.z) * CHUNK_SIZE,
    },
    terrain: [wildTerrainTile(seed, chunk)],
    parts,
  };
}
