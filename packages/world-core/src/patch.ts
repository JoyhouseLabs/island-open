import {
  readCells,
  packCells,
  cellKey,
  parseCell,
  sameValue,
  settleDevices,
  deviceBox,
  supportCells,
  entityBox,
} from "./building.js";
import {
  worldSchema,
  type WorldOp,
  type WorldSnapshot,
} from "@island/contracts";

/** More than this many entities in one patch is a terrain-scale edit. */
export const TERRAIN_ENTITY_OPS = 8;

export function terrainScale(ops: WorldOp[]): boolean {
  if (ops.some((op) => op.op === "replace")) return true;
  return operationTargets(ops).size > TERRAIN_ENTITY_OPS;
}
export function operationTargets(ops: WorldOp[]) {
  const targets = new Set<string>();
  for (const op of ops) {
    if (op.op === "replace") targets.add("*");
    else if (op.op === "block.set") targets.add(`cell:${cellKey(op.cell)}`);
    else if (op.op === "device.put") targets.add(`device:${op.device.id}`);
    else if (op.op === "place") targets.add(`entity:${op.entity.id}`);
    else if (
      op.op === "remove" ||
      op.op === "update" ||
      op.op === "entity.support"
    )
      targets.add(`entity:${op.id}`);
    else targets.add(op.op);
  }
  return targets;
}
export function operationDependencies(
  ops: WorldOp[],
  snapshot?: WorldSnapshot,
) {
  const targets = operationTargets(ops);
  for (const op of ops) {
    if (op.op === "device.put")
      for (const d of [op.expected, op.device]) {
        if (
          d?.placement.state === "placed" &&
          d.placement.support.type === "blockTop"
        )
          for (const cell of supportCells(deviceBox(d)!, d.placement.support.y))
            targets.add(`cell:${cellKey(cell)}`);
      }
    if (
      op.op === "entity.support" ||
      op.op === "update" ||
      op.op === "remove"
    ) {
      const id = op.id,
        entity =
          snapshot?.entities.find((e) => e.id === id) ??
          ops
            .flatMap((o) => (o.op === "place" ? [o.entity] : []))
            .find((e) => e.id === id);
      const anchors = [
        snapshot?.entityPlacements?.find((p) => p.entityId === id),
        ...(op.op === "entity.support" ? [op.value] : []),
      ];
      for (const anchor of anchors)
        if (anchor) {
          const cells = entity
            ? supportCells(entityBox(entity, anchor.y), anchor.support.y)
            : [anchor.support];
          for (const cell of cells) targets.add(`cell:${cellKey(cell)}`);
        }
    }
  }
  return targets;
}

/** Two small patches can both land when they do not touch the same thing. */
export function canRebase(local: WorldOp[], remote: WorldOp[]): boolean {
  const a = operationDependencies(local),
    b = operationDependencies(remote);
  if (a.has("*") || b.has("*")) return false;
  for (const id of a) if (b.has(id)) return false;
  return true;
}

/** Turn a confirmed snapshot and the local draft into the operations to upload. */
export function diffWorld(base: WorldSnapshot, next: WorldSnapshot): WorldOp[] {
  const a = worldSchema.parse(base);
  const b = worldSchema.parse(next);
  if (a.scene !== b.scene || a.seed !== b.seed)
    return [{ op: "replace", snapshot: b }];
  const ops: WorldOp[] = [];
  if (a.name !== b.name) ops.push({ op: "rename", name: b.name });
  if (JSON.stringify(a.environment) !== JSON.stringify(b.environment))
    ops.push({
      op: "environment",
      hour: b.environment.hour,
      season: b.environment.season,
      ...(b.environment.weather ? { weather: b.environment.weather } : {}),
    });
  const nextById = new Map(b.entities.map((e) => [e.id, e]));
  const baseById = new Map(a.entities.map((e) => [e.id, e]));
  for (const e of a.entities)
    if (!nextById.has(e.id)) ops.push({ op: "remove", id: e.id });
  for (const e of a.entities) {
    const n = nextById.get(e.id);
    if (!n) continue;
    const update: Extract<WorldOp, { op: "update" }> = {
      op: "update",
      id: e.id,
    };
    if (e.kind !== n.kind) update.kind = n.kind;
    if (e.x !== n.x) update.x = n.x;
    if (e.z !== n.z) update.z = n.z;
    if (e.seed !== n.seed) update.seed = n.seed;
    if (e.growth !== n.growth) update.growth = n.growth;
    if (Object.keys(update).length > 2) ops.push(update);
  }
  for (const e of b.entities)
    if (!baseById.has(e.id)) ops.push({ op: "place", entity: e });
  const ac = readCells(a.construction),
    bc = readCells(b.construction);
  for (const key of new Set([...ac.keys(), ...bc.keys()]))
    if (!sameValue(ac.get(key), bc.get(key)))
      ops.push({
        op: "block.set",
        cell: parseCell(key),
        expected: ac.get(key) ?? null,
        value: bc.get(key) ?? null,
      });
  const ad = new Map((a.devices ?? []).map((d) => [d.id, d])),
    bd = new Map((b.devices ?? []).map((d) => [d.id, d]));
  for (const id of new Set([...ad.keys(), ...bd.keys()])) {
    const before = ad.get(id),
      after = bd.get(id) ?? {
        ...before!,
        placement: { state: "stored" as const },
      };
    if (JSON.stringify(before) !== JSON.stringify(after))
      ops.push({ op: "device.put", expected: before ?? null, device: after });
  }
  const ap = new Map((a.entityPlacements ?? []).map((p) => [p.entityId, p])),
    bp = new Map((b.entityPlacements ?? []).map((p) => [p.entityId, p]));
  for (const id of new Set([...ap.keys(), ...bp.keys()]))
    if (JSON.stringify(ap.get(id)) !== JSON.stringify(bp.get(id)))
      ops.push({ op: "entity.support", id, value: bp.get(id) ?? null });
  return ops;
}

export function applyWorldOps(
  base: WorldSnapshot,
  ops: WorldOp[],
):
  | { ok: true; snapshot: WorldSnapshot }
  | { ok: false; code: "CONFLICT" | "INVALID" } {
  const start = worldSchema.parse(base);
  if (ops.some((op) => op.op === "replace")) {
    if (ops.length !== 1 || ops[0]?.op !== "replace")
      return { ok: false, code: "INVALID" };
    if (
      ops[0].snapshot.scene !== start.scene ||
      ops[0].snapshot.seed !== start.seed
    )
      return { ok: false, code: "INVALID" };
    return { ok: true, snapshot: ops[0].snapshot };
  }
  let entities = start.entities.map((e) => ({ ...e }));
  const cells = readCells(start.construction);
  let devices = [...(start.devices ?? [])],
    placements = [...(start.entityPlacements ?? [])];
  let buildingTouched = !!start.construction;
  let name = start.name;
  let environment = { ...start.environment };
  for (const op of ops) {
    if (op.op === "block.set") {
      const key = cellKey(op.cell);
      if (!sameValue(cells.get(key), op.expected))
        return { ok: false, code: "CONFLICT" };
      if (op.value) cells.set(key, op.value);
      else cells.delete(key);
      buildingTouched = true;
    } else if (op.op === "device.put") {
      const previous = devices.find((d) => d.id === op.device.id) ?? null;
      if (JSON.stringify(previous) !== JSON.stringify(op.expected))
        return { ok: false, code: "CONFLICT" };
      if (
        previous &&
        (previous.definitionId !== op.device.definitionId ||
          (previous.payload.kind === "bookshelf" &&
            op.device.payload.kind === "bookshelf" &&
            previous.payload.collectionId !== op.device.payload.collectionId))
      )
        return { ok: false, code: "INVALID" };
      devices = devices.filter((d) => d.id !== op.device.id).concat(op.device);
    } else if (op.op === "entity.support") {
      placements = placements.filter((p) => p.entityId !== op.id);
      if (op.value) {
        if (op.value.entityId !== op.id) return { ok: false, code: "INVALID" };
        placements.push(op.value);
      }
    } else if (op.op === "rename") name = op.name;
    else if (op.op === "environment")
      environment = {
        hour: op.hour,
        season: op.season,
        ...(op.weather ? { weather: op.weather } : {}),
      };
    else if (op.op === "remove") {
      if (!entities.some((e) => e.id === op.id))
        return { ok: false, code: "CONFLICT" };
      entities = entities.filter((e) => e.id !== op.id);
      placements = placements.filter((p) => p.entityId !== op.id);
    } else if (op.op === "update") {
      const index = entities.findIndex((e) => e.id === op.id);
      const current = entities[index];
      if (!current) return { ok: false, code: "CONFLICT" };
      entities[index] = {
        ...current,
        ...(op.kind !== undefined ? { kind: op.kind } : {}),
        ...(op.x !== undefined ? { x: op.x } : {}),
        ...(op.z !== undefined ? { z: op.z } : {}),
        ...(op.seed !== undefined ? { seed: op.seed } : {}),
        ...(op.growth !== undefined ? { growth: op.growth } : {}),
      };
    } else if (op.op === "place") {
      const existing = entities.find((e) => e.id === op.entity.id);
      if (existing) {
        if (JSON.stringify(existing) !== JSON.stringify(op.entity))
          return { ok: false, code: "CONFLICT" };
        continue;
      }
      entities = [...entities, { ...op.entity }];
    }
  }
  const parsed = worldSchema.safeParse(
    settleDevices({
      ...start,
      name,
      environment,
      entities,
      ...(buildingTouched ? { construction: packCells(cells) } : {}),
      ...(start.devices || devices.length ? { devices } : {}),
      ...(start.entityPlacements || placements.length
        ? { entityPlacements: placements }
        : {}),
    }),
  );
  if (!parsed.success) return { ok: false, code: "INVALID" };
  return { ok: true, snapshot: parsed.data };
}
