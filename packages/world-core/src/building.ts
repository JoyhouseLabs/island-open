import {
  libraryGrid as grid,
  playerBody,
  deviceDefinitions,
  type Cell,
  type BlockValue,
  type ConstructionSnapshot,
  type WorldSnapshot,
  type DeviceInstance,
  type Placement,
} from "@island/contracts";
export const cellKey = (c: Cell) => `${c.x},${c.y},${c.z}`;
export const parseCell = (k: string): Cell => {
  const [x, y, z] = k.split(",").map(Number);
  return { x: x!, y: y!, z: z! };
};
export const sameValue = (
  a: BlockValue | null | undefined,
  b: BlockValue | null | undefined,
) =>
  (!a && !b) ||
  (!!a &&
    !!b &&
    a.definitionId === b.definitionId &&
    a.definitionVersion === b.definitionVersion &&
    (a.rotation ?? 0) === (b.rotation ?? 0));
export function chunkCell(c: Cell) {
  const cx = Math.floor(c.x / 16),
    cy = Math.floor(c.y / 16),
    cz = Math.floor(c.z / 16);
  return {
    cx,
    cy,
    cz,
    index: c.x - cx * 16 + 16 * (c.z - cz * 16) + 256 * (c.y - cy * 16),
  };
}
export function readCells(v?: ConstructionSnapshot): Map<string, BlockValue> {
  const m = new Map<string, BlockValue>();
  for (const c of v?.chunks ?? [])
    for (const a of c.cells)
      m.set(
        cellKey({
          x: c.cx * 16 + (a.index % 16),
          y: c.cy * 16 + Math.floor(a.index / 256),
          z: c.cz * 16 + (Math.floor(a.index / 16) % 16),
        }),
        v!.blockPalette[a.palette]!,
      );
  return m;
}
export function packCells(m: Map<string, BlockValue>): ConstructionSnapshot {
  const palette = [
    ...new Map(
      [...m.values()].map((v) => [
        JSON.stringify([v.definitionId, v.definitionVersion, v.rotation ?? 0]),
        { ...v, rotation: v.rotation ?? 0 },
      ]),
    ).values(),
  ].sort(
    (a, b) =>
      a.definitionId.localeCompare(b.definitionId) || a.rotation - b.rotation,
  );
  const chunks = new Map<
    string,
    {
      cx: number;
      cy: number;
      cz: number;
      cells: { index: number; palette: number }[];
    }
  >();
  for (const [key, value] of m) {
    const p = chunkCell(parseCell(key)),
      k = `${p.cx},${p.cy},${p.cz}`;
    let c = chunks.get(k);
    if (!c) {
      c = { cx: p.cx, cy: p.cy, cz: p.cz, cells: [] };
      chunks.set(k, c);
    }
    c.cells.push({
      index: p.index,
      palette: palette.findIndex((v) => sameValue(v, value)),
    });
  }
  return {
    dataVersion: 1,
    gridId: grid.id,
    blockPalette: palette,
    chunks: [...chunks.values()]
      .sort((a, b) => a.cx - b.cx || a.cy - b.cy || a.cz - b.cz)
      .map((c) => ({ ...c, cells: c.cells.sort((a, b) => a.index - b.index) })),
  };
}
export const cellMin = (c: Cell) => ({
  x: grid.origin.x + c.x,
  y: grid.origin.y + c.y,
  z: grid.origin.z + c.z,
});
export const pointCell = (p: Cell) => ({
  x: Math.floor(p.x - grid.origin.x),
  y: Math.floor(p.y - grid.origin.y),
  z: Math.floor(p.z - grid.origin.z),
});
/** Bias off an exact face, including negative coordinates and boundary edges. */
export const hitCell = (point: Cell, normal: Cell, adjacent: boolean) =>
  pointCell({
    x: point.x + normal.x * (adjacent ? 1e-5 : -1e-5),
    y: point.y + normal.y * (adjacent ? 1e-5 : -1e-5),
    z: point.z + normal.z * (adjacent ? 1e-5 : -1e-5),
  });
export const inGrid = (c: Cell) =>
  c.x >= 0 &&
  c.x < grid.width &&
  c.y >= 0 &&
  c.y < grid.height &&
  c.z >= 0 &&
  c.z < grid.depth;
export const neighbors = (c: Cell) => [
  { ...c, x: c.x + 1 },
  { ...c, x: c.x - 1 },
  { ...c, y: c.y + 1 },
  { ...c, y: c.y - 1 },
  { ...c, z: c.z + 1 },
  { ...c, z: c.z - 1 },
];
export type Box = { min: Cell; max: Cell };
export const overlaps = (a: Box, b: Box) =>
  a.min.x < b.max.x - 1e-5 &&
  a.max.x > b.min.x + 1e-5 &&
  a.min.y < b.max.y - 1e-5 &&
  a.max.y > b.min.y + 1e-5 &&
  a.min.z < b.max.z - 1e-5 &&
  a.max.z > b.min.z + 1e-5;
export const cellBox = (c: Cell): Box => {
  const min = cellMin(c);
  return { min, max: { x: min.x + 1, y: min.y + 1, z: min.z + 1 } };
};
export function deviceBox(d: DeviceInstance, front = false): Box | null {
  const p = d.placement;
  if (p.state === "stored") return null;
  const spec = deviceDefinitions[d.definitionId];
  let w: number = spec.width,
    depth: number = spec.depth;
  if (p.rotation % 2) [w, depth] = [depth, w];
  const pad = front ? spec.front : 0;
  return {
    min: {
      x: p.x - w / 2 - (p.rotation === 3 ? pad : 0),
      y: p.y,
      z: p.z - depth / 2 - (p.rotation === 2 ? pad : 0),
    },
    max: {
      x: p.x + w / 2 + (p.rotation === 1 ? pad : 0),
      y: p.y + spec.height,
      z: p.z + depth / 2 + (p.rotation === 0 ? pad : 0),
    },
  };
}
export function supportCells(box: Box, y: number): Cell[] {
  const out: Cell[] = [];
  for (
    let x = Math.floor(box.min.x - grid.origin.x + 1e-5);
    x <= Math.floor(box.max.x - grid.origin.x - 1e-5);
    x++
  )
    for (
      let z = Math.floor(box.min.z - grid.origin.z + 1e-5);
      z <= Math.floor(box.max.z - grid.origin.z - 1e-5);
      z++
    )
      out.push({ x, y, z });
  return out;
}
export function entityBox(e: WorldSnapshot["entities"][number], y = 0): Box {
  const rx = e.kind === "tree" ? 1.3 : e.kind === "bench" ? 2 : 0.45,
    rz = e.kind === "bench" ? 0.78 : rx;
  return {
    min: { x: e.x - rx, y, z: e.z - rz },
    max: {
      x: e.x + rx,
      y: y + (e.kind === "tree" ? 12 : e.kind === "bench" ? 2.9 : 0.8),
      z: e.z + rz,
    },
  };
}
/** Physical parts of a raised bench: the seat is usable, the back stays solid. */
export function entityCollisionBoxes(
  e: WorldSnapshot["entities"][number],
  y = 0,
): Box[] {
  const box = entityBox(e, y);
  if (e.kind !== "bench") return [box];
  return [
    {
      min: { x: box.min.x, y, z: e.z - 0.7 },
      max: { x: box.max.x, y: y + 1.575, z: e.z + 0.7 },
    },
    {
      min: { x: box.min.x, y: y + 1.575, z: e.z - 0.775 },
      max: { x: box.max.x, y: y + 2.9, z: e.z - 0.525 },
    },
  ];
}
const protectedLibraryBoxes: Box[] = [
  { min: { x: -28, y: 0, z: -19 }, max: { x: -8, y: 20, z: -1 } },
  { min: { x: -3, y: 0, z: 6 }, max: { x: 3, y: 20, z: 31 } },
  { min: { x: -6.5, y: 0, z: -1.5 }, max: { x: 2.5, y: 5, z: 7.5 } },
  ...[
    [2, 0],
    [10, 12],
  ].map(([x, z]) => ({
    min: { x: x! - 2.5, y: 0, z: z! - 2.5 },
    max: { x: x! + 2.5, y: 7, z: z! + 2.5 },
  })),
];
export function protectedLibrary(box: Box): boolean {
  return protectedLibraryBoxes.some((b) => overlaps(box, b));
}
export function removalError(w: WorldSnapshot, id: string): string | null {
  const e = w.entities.find((e) => e.id === id);
  if (!e) return "找不到这个物件。";
  if (w.scene === "library" && protectedLibrary(entityBox(e)))
    return "原书屋、栈道、阅读角和出入口需要保留。";
  return null;
}
export function validateBuilding(
  w: WorldSnapshot,
  previous?: WorldSnapshot,
): string | null {
  const cells = readCells(w.construction);
  if (
    (cells.size ||
      (w.devices?.length ?? 0) ||
      (w.entityPlacements?.length ?? 0)) &&
    w.scene !== "library"
  )
    return "首版只在林间书屋开放建造。";
  if (cells.size > 4096) return "这个房间最多放置 4096 个方块。";
  const devices = w.devices ?? [],
    placements = w.entityPlacements ?? [];
  if (
    new Set(devices.map((d) => d.id)).size !== devices.length ||
    new Set(placements.map((p) => p.entityId)).size !== placements.length
  )
    return "实例或支撑记录不能重复。";
  const old = previous
    ? readCells(previous.construction)
    : new Map<string, BlockValue>();
  // A batch cannot bootstrap two adjacent floating blocks. New connected
  // components must reach ground or an already-existing surviving block.
  if (
    previous &&
    [...cells.keys()].some((k) => !old.has(k) && parseCell(k).y > 0)
  ) {
    const connected = new Set<string>(),
      todo: string[] = [];
    for (const key of cells.keys())
      if (parseCell(key).y === 0 || old.has(key)) {
        connected.add(key);
        todo.push(key);
      }
    for (let i = 0; i < todo.length; i++)
      for (const n of neighbors(parseCell(todo[i]!))) {
        const k = cellKey(n);
        if (cells.has(k) && !connected.has(k)) {
          connected.add(k);
          todo.push(k);
        }
      }
    if (
      previous &&
      [...cells.keys()].some((k) => !old.has(k) && !connected.has(k))
    )
      return "新方块需要通过相邻方块连接到地面或已有建筑。";
  }
  const entityBoxes = w.entities.map((e) =>
    entityBox(e, placements.find((p) => p.entityId === e.id)?.y ?? 0),
  );
  for (const [key, v] of cells) {
    const c = parseCell(key);
    if (!inGrid(c)) return "整块建筑必须在建造地块内，高度不超过 16 格。";
    if (
      previous &&
      !old.has(key) &&
      c.y > 0 &&
      !neighbors(c).some((n) => cells.has(cellKey(n)))
    )
      return "新方块需要贴地或贴着另一块的面。";
    const box = cellBox(c);
    if (protectedLibrary(box)) return "这里是书屋的保护空间。";
    if (entityBoxes.some((e) => overlaps(box, e)))
      return "先用整理工具移开这里的树、花或椅子。";
  }
  for (const p of placements) {
    const e = w.entities.find((e) => e.id === p.entityId);
    if (!e || e.kind === "tree") return "支撑记录必须指向椅子或花盆。";
    const box = entityBox(e, p.y);
    if (
      p.y !== cellMin(p.support).y + 1 ||
      !supportCells(box, p.support.y).some(
        (c) => cellKey(c) === cellKey(p.support),
      ) ||
      supportCells(box, p.support.y).some((c) => !cells.has(cellKey(c)))
    )
      return "先移开上面的物件，再拆除它的支撑方块。";
    if (e.kind === "bench") {
      const front = {
        min: { x: box.min.x, y: p.y, z: box.max.z },
        max: { x: box.max.x, y: p.y + playerBody.height, z: box.max.z + 1 },
      };
      if (
        voxelBoxes(cells, front).some((b) => overlaps(front, b)) ||
        entityBoxes.some(
          (b, i) => w.entities[i]!.id !== e.id && overlaps(front, b),
        ) ||
        devices.some((d) => {
          const b = deviceBox(d);
          return b && overlaps(front, b);
        })
      )
        return "椅子前方需要留出就坐空间。";
    }
  }
  const boxes: { body: Box; clearance: Box }[] = [];
  for (const d of devices) {
    const box = deviceBox(d);
    if (!box) continue;
    const p = d.placement;
    if (p.state !== "placed") continue;
    if (
      box.min.x < 12 ||
      box.max.x > 30 ||
      box.min.z < -22 ||
      box.max.z > -4 ||
      box.max.y > 18 ||
      protectedLibrary(box)
    )
      return "装置的完整占地需要留在建造地块内。";
    if (p.support.type === "ground") {
      if (p.y !== 0) return "地面装置的高度必须为零。";
    } else {
      const support = p.support;
      if (
        p.y !== cellMin(support).y + 1 ||
        !supportCells(box, support.y).some(
          (c) => cellKey(c) === cellKey(support),
        ) ||
        supportCells(box, support.y).some((c) => !cells.has(cellKey(c)))
      )
        return "装置底部需要完整支撑。";
    }
    if (voxelBoxes(cells, box).some((b) => overlaps(box, b)))
      return "装置不能与建筑方块重叠。";
    const clearance = deviceBox(d, true)!;
    if (
      voxelBoxes(cells, clearance).some((b) => overlaps(clearance, b)) ||
      entityBoxes.some((e) => overlaps(clearance, e))
    )
      return "装置前方需要留出使用空间。";
    if (
      boxes.some(
        (b) => overlaps(box, b.clearance) || overlaps(clearance, b.body),
      )
    )
      return "装置之间需要留出使用空间。";
    boxes.push({ body: box, clearance });
    if (entityBoxes.some((e) => overlaps(box, e)))
      return "装置的位置已有其他物件。";
  }
  if (previous) {
    for (const e of previous.entities) {
      const n = w.entities.find((n) => n.id === e.id);
      if (
        (!n || n.x !== e.x || n.z !== e.z || n.kind !== e.kind) &&
        removalError(previous, e.id)
      )
        return "不能移除或改动书屋保护区域的物件。";
    }
  }
  return null;
}
/** Derived state runs once after the entire transaction, so moving a device and
 * removing its old support in the same request is valid. */
export function settleDevices(w: WorldSnapshot): WorldSnapshot {
  const cells = readCells(w.construction);
  return {
    ...w,
    ...(w.devices
      ? {
          devices: w.devices.map((d) => {
            const p = d.placement;
            if (
              p.state === "placed" &&
              p.support.type === "blockTop" &&
              supportCells(deviceBox(d)!, p.support.y).some(
                (c) => !cells.has(cellKey(c)),
              )
            )
              return { ...d, placement: { state: "stored" as const } };
            return d;
          }),
        }
      : {}),
  };
}
export const hasBuilding = (w: WorldSnapshot) =>
  !!w.construction || !!w.devices?.length || !!w.entityPlacements?.length;
/** Nearby voxels only: queries remain bounded by the player's swept volume. */
export function voxelBoxes(cells: Map<string, BlockValue>, box: Box): Box[] {
  const min = pointCell(box.min),
    max = pointCell(box.max),
    out: Box[] = [];
  for (let x = min.x; x <= max.x; x++)
    for (let y = min.y; y <= max.y; y++)
      for (let z = min.z; z <= max.z; z++) {
        const c = { x, y, z };
        if (cells.has(cellKey(c))) out.push(cellBox(c));
      }
  return out;
}
export function bodyBox(p: Cell): Box {
  return {
    min: {
      x: p.x - playerBody.radius,
      y: p.y + 1e-5,
      z: p.z - playerBody.radius,
    },
    max: {
      x: p.x + playerBody.radius,
      y: p.y + playerBody.height,
      z: p.z + playerBody.radius,
    },
  };
}
export function bodyBlocked(
  p: Cell,
  cells: Map<string, BlockValue>,
  extra: Box[] = [],
) {
  const box = bodyBox(p);
  return voxelBoxes(cells, box)
    .concat(extra)
    .some((b) => overlaps(box, b));
}
/** Substeps plus axis separation prevent tunnelling and give diagonal sliding. */
export function moveBody(
  start: Cell,
  delta: Cell,
  cells: Map<string, BlockValue>,
  extra: Box[] = [],
) {
  const p = { ...start };
  const n = Math.max(
    1,
    Math.ceil(
      Math.max(Math.abs(delta.x), Math.abs(delta.y), Math.abs(delta.z)) /
        playerBody.step,
    ),
  );
  const blocked = { x: false, y: false, z: false };
  for (let i = 0; i < n; i++)
    for (const axis of ["x", "z", "y"] as const) {
      const next = { ...p, [axis]: p[axis] + delta[axis] / n };
      if (bodyBlocked(next, cells, extra)) blocked[axis] = true;
      else p[axis] = next[axis];
    }
  return { position: p, blocked };
}
export function safeBody(
  p: Cell,
  cells: Map<string, BlockValue>,
  extra: Box[] = [],
): Cell {
  if (!bodyBlocked(p, cells, extra)) return p;
  for (let r = 1; r <= 8; r++)
    for (const [dx, dz] of [
      [r, 0],
      [-r, 0],
      [0, r],
      [0, -r],
    ]) {
      const c = { x: p.x + dx!, y: p.y, z: p.z + dz! };
      if (!bodyBlocked(c, cells, extra)) return c;
    }
  return { x: 0, y: 0, z: 8 };
}
