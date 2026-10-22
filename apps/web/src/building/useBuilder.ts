import { useState, useEffect, useMemo } from "react";
import {
  deviceDefinitions,
  type DeviceInstance,
  type WorldOp,
  type BlockValue,
  type Placement,
} from "@island/contracts";
import {
  applyWorldOps,
  readCells,
  cellKey,
  cellMin,
  validateBuilding,
  removalError,
  inGrid,
} from "@island/world-core";
import type { useWorld } from "../useWorld";
import type { BuildTarget, BuildMode, BuildingEditor } from "./types";
import { glyphForBlock, glyphForKind } from "./itemGlyphs";
import { api } from "../api";
export function useBuilder(
  room: ReturnType<typeof useWorld>,
  mode: BuildMode | null,
) {
  const [enabled, setEnabled] = useState(false),
    [target, setTarget] = useState<BuildTarget | null>(null),
    [targetScreen, setTargetScreen] = useState<{ x: number; y: number } | null>(
      null,
    ),
    [material, setMaterial] =
      useState<BlockValue["definitionId"]>("island:stone"),
    [kind, setKind] = useState<
      DeviceInstance["definitionId"] | "bench" | "flower"
    >("island:bookshelf"),
    [rotation, setRotation] = useState<0 | 1 | 2 | 3>(0),
    [cutaway, setCutaway] = useState(false),
    [storedId, setStoredId] = useState("");
  useEffect(() => {
    void api<{ building: boolean }>("/capabilities")
      .then((c) => setEnabled(c.building))
      .catch(() => {});
  }, []);
  useEffect(() => setTarget(null), [mode]);
  const select = (picked: BuildTarget | null) => {
    // Pointer movement within one grid cell must not revalidate the whole world.
    setTarget((previous) =>
      JSON.stringify(previous) === JSON.stringify(picked) ? previous : picked,
    );
  };
  const operations = (picked = target): WorldOp[] => {
    const target = picked;
    if (!target || !mode) return [];
    if ("entityId" in target) {
      const error = removalError(room.snapshot, target.entityId);
      if (error) throw Error(error);
      return [{ op: "remove", id: target.entityId }];
    }
    if ("deviceId" in target) {
      const d = room.snapshot.devices?.find((d) => d.id === target.deviceId);
      return d
        ? [
            {
              op: "device.put",
              expected: d,
              device: { ...d, placement: { state: "stored" } },
            },
          ]
        : [];
    }
    if (!inGrid(target.cell))
      throw Error(
        "这里不在绿色建造区内。点“定位绿色建造区”，再选择网格里的空地。",
      );
    const cells = readCells(room.snapshot.construction),
      value = cells.get(cellKey(target.cell)) ?? null;
    if (mode === "build" && value)
      throw Error("这里已有方块，请指向它的表面继续搭建。");
    if (mode === "remove" && !value)
      throw Error("这里没有建筑方块，请点击要整理的物件或方块。");
    if (mode === "build" || mode === "remove")
      return [
        {
          op: "block.set",
          cell: target.cell,
          expected: value,
          value:
            mode === "remove"
              ? null
              : { definitionId: material, definitionVersion: 1, rotation },
        },
      ];
    if (!target.top) throw Error("请选地面或方块的水平顶面。");
    const min = cellMin(target.cell),
      y = value ? min.y + 1 : 0;
    const support = value
      ? { type: "blockTop" as const, ...target.cell }
      : { type: "ground" as const };
    if (kind === "bench" || kind === "flower") {
      const id = crypto.randomUUID();
      return [
        {
          op: "place",
          entity: {
            id,
            kind,
            x: min.x + 0.5,
            z: min.z + 0.5,
            seed: 123,
            growth: 1,
          },
        },
        ...(value
          ? [
              {
                op: "entity.support" as const,
                id,
                value: {
                  entityId: id,
                  y,
                  support: { type: "blockTop" as const, ...target.cell },
                },
              },
            ]
          : []),
      ];
    }
    const placement: Placement = {
      state: "placed",
      x: min.x + 0.5,
      y,
      z: min.z + 0.5,
      rotation,
      support,
    };
    const stored = room.snapshot.devices?.find((d) => d.id === storedId);
    if (stored)
      return [
        {
          op: "device.put",
          expected: stored,
          device: { ...stored, placement },
        },
      ];
    const base = {
      id: crypto.randomUUID(),
      definitionVersion: 1 as const,
      dataVersion: 1 as const,
      placement,
    };
    const d: DeviceInstance =
      kind === "island:bookshelf"
        ? {
            ...base,
            definitionId: kind,
            payload: { kind: "bookshelf", collectionId: crypto.randomUUID() },
          }
        : kind === "island:sign"
          ? {
              ...base,
              definitionId: kind,
              payload: { kind: "sign", lines: ["", "", "", ""] },
            }
          : kind === "island:nameplate"
            ? {
                ...base,
                definitionId: kind,
                payload: { kind: "nameplate", name: "我的小屋" },
              }
            : {
                ...base,
                definitionId: kind,
                payload: { kind: "displayCase", itemRef: null },
              };
    return [{ op: "device.put", expected: null, device: d }];
  };
  const prepare = (target: BuildTarget | null) => {
    if (!target) return { error: null, snapshot: null };
    try {
      const r = applyWorldOps(room.snapshot, operations(target));
      return r.ok
        ? {
            error: validateBuilding(r.snapshot, room.snapshot),
            snapshot: r.snapshot,
          }
        : { error: "当前位置不能这样修改。", snapshot: null };
    } catch (e) {
      return { error: (e as Error).message, snapshot: null };
    }
  };
  const preview = useMemo(
    () => prepare(target),
    [target, mode, room.snapshot, material, kind, rotation, storedId],
  );
  const previewError = preview.error;
  const commit = (prepared = preview, picked = target) => {
    const preview = prepared;
    if (!preview.snapshot) {
      room.notify(preview.error ?? "先点击场景选中位置或物件。");
      return;
    }
    if (preview.error) {
      room.notify(preview.error);
      return;
    }
    room.edit(() => preview.snapshot!);
    room.notify(mode === "remove" ? "已整理，可撤销。" : "已放好，等待保存。");
    if (mode === "build" && picked && "cell" in picked) {
      const n = picked.normal ?? { x: 0, y: 1, z: 0 };
      setTarget({
        ...picked,
        cell: {
          x: picked.cell.x + n.x,
          y: picked.cell.y + n.y,
          z: picked.cell.z + n.z,
        },
      });
    } else setTarget(null);
    setStoredId("");
  };
  const editor: BuildingEditor | undefined = mode
    ? {
        mode,
        target,
        select,
        place: (picked) => {
          if (mode === "remove") return;
          setTarget(picked);
          commit(prepare(picked), picked);
        },
        reportTarget: (point) =>
          setTargetScreen((previous) =>
            previous?.x === point?.x && previous?.y === point?.y
              ? previous
              : point,
          ),
        previewError,
        device:
          kind === "bench" || kind === "flower" ? "island:bookshelf" : kind,
        held:
          mode === "remove"
            ? "shovel"
            : mode === "build"
              ? glyphForBlock(material)
              : glyphForKind(kind),
        rotation,
        cutaway,
      }
    : undefined;
  return {
    enabled,
    editor,
    target,
    targetScreen,
    material,
    setMaterial,
    kind,
    setKind,
    rotation,
    setRotation,
    cutaway,
    setCutaway,
    storedId,
    setStoredId,
    previewError,
    commit: () => commit(),
  };
}
