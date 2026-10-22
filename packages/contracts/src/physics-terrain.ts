import { z } from "zod";

export const terrainBudgets = Object.freeze({
  tiles: 64,
  cellsPerAxis: 64,
  vertices: 65536,
  triangles: 131072,
});
/** Row-major samples: x varies fastest, with the same a-c-b / b-c-d diagonal everywhere. */
export const physicsTerrainTileSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9:._-]{0,95}$/),
    origin: z
      .object({
        x: z.number().finite().min(-100000).max(100000),
        y: z.number().finite().min(-10000).max(10000),
        z: z.number().finite().min(-100000).max(100000),
      })
      .strict(),
    columns: z.number().int().min(1).max(terrainBudgets.cellsPerAxis),
    rows: z.number().int().min(1).max(terrainBudgets.cellsPerAxis),
    step: z.number().finite().min(0.25).max(16),
    heights: z.array(z.number().finite().min(-256).max(256)).min(4).max(4225),
    /** Omitted means every cell is solid. False cells have neither visible surface nor collision. */
    cells: z.array(z.boolean()).max(4096).optional(),
    material: z.enum(["wood", "stone", "rubber", "ice"]),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  })
  .strict()
  .superRefine((t, ctx) => {
    if (t.heights.length !== (t.columns + 1) * (t.rows + 1))
      ctx.addIssue({ code: "custom", message: "地形采样数量与网格不匹配" });
    if (
      t.cells &&
      (t.cells.length !== t.columns * t.rows || !t.cells.some(Boolean))
    )
      ctx.addIssue({ code: "custom", message: "地形单元掩码无效" });
  });
export type PhysicsTerrainTile = z.infer<typeof physicsTerrainTileSchema>;
export const physicsTerrainSchema = z
  .array(physicsTerrainTileSchema)
  .max(terrainBudgets.tiles)
  .superRefine((tiles, ctx) => {
    if (new Set(tiles.map((t) => t.id)).size !== tiles.length)
      ctx.addIssue({ code: "custom", message: "地形区块编号重复" });
    const vertices = tiles.reduce((n, t) => n + t.heights.length, 0);
    const triangles = tiles.reduce(
      (n, t) =>
        n + 2 * (t.cells ? t.cells.filter(Boolean).length : t.columns * t.rows),
      0,
    );
    if (
      vertices > terrainBudgets.vertices ||
      triangles > terrainBudgets.triangles
    )
      ctx.addIssue({ code: "custom", message: "地形网格超过场景预算" });
  });
/** Pure shared mesh; rendering and Rapier must consume these exact triangles. Coordinates are tile-local. */
export function terrainGeometry(tile: PhysicsTerrainTile) {
  const positions = new Float32Array(tile.heights.length * 3),
    indices: number[] = [];
  for (let z = 0; z <= tile.rows; z++)
    for (let x = 0; x <= tile.columns; x++) {
      const a = z * (tile.columns + 1) + x;
      positions.set([x * tile.step, tile.heights[a]!, z * tile.step], a * 3);
      if (
        x < tile.columns &&
        z < tile.rows &&
        (tile.cells?.[z * tile.columns + x] ?? true)
      ) {
        const b = a + 1,
          c = a + tile.columns + 1,
          d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
  return { positions, indices: new Uint32Array(indices) };
}
/** World-space height on the exact mesh triangles; holes and outside points have no surface. */
export function terrainHeightAt(
  tile: PhysicsTerrainTile,
  x: number,
  z: number,
): number | undefined {
  const gx = (x - tile.origin.x) / tile.step,
    gz = (z - tile.origin.z) / tile.step;
  if (gx < 0 || gz < 0 || gx > tile.columns || gz > tile.rows) return undefined;
  const ix = Math.min(Math.floor(gx), tile.columns - 1),
    iz = Math.min(Math.floor(gz), tile.rows - 1);
  if (tile.cells && !tile.cells[iz * tile.columns + ix]) return undefined;
  const u = gx - ix,
    v = gz - iz,
    a = iz * (tile.columns + 1) + ix;
  const ah = Math.fround(tile.heights[a]!),
    bh = Math.fround(tile.heights[a + 1]!),
    ch = Math.fround(tile.heights[a + tile.columns + 1]!),
    dh = Math.fround(tile.heights[a + tile.columns + 2]!);
  return (
    tile.origin.y +
    (u + v <= 1
      ? ah + (bh - ah) * u + (ch - ah) * v
      : dh + (ch - dh) * (1 - u) + (bh - dh) * (1 - v))
  );
}
