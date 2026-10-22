import { useCallback, useEffect, useRef, useState } from "react";
import { Shapes, RotateCw } from "lucide-react";
import type { CreationDefinition, CreationPlacement } from "@island/contracts";
import { creationPlacementError } from "@island/world-core";
import type { useWorld } from "../useWorld";
import type { CreationEditor } from "./CreationModel";
import { Workshop } from "./Workshop";
import "./creations.css";
export function useCreations(
  world: ReturnType<typeof useWorld>,
  stopWalking: () => void,
) {
  const [open, setOpen] = useState(false),
    [active, setActive] = useState<CreationPlacement | null>(null),
    [preview, setPreview] = useState<CreationPlacement | null>(null);
  const blocked =
    !world.user ||
    !world.record ||
    !world.ready ||
    world.unsupported ||
    world.status === "conflict";
  const cancel = useCallback(() => {
    setActive(null);
    setPreview(null);
  }, []);
  const close = useCallback(() => setOpen(false), []);
  const userId = world.user?.id ?? null;
  const priorAccount = useRef(userId);
  useEffect(() => {
    cancel();
    if (priorAccount.current !== userId) setOpen(false);
    priorAccount.current = userId;
  }, [userId, world.record?.id, cancel]);
  useEffect(() => {
    if (blocked) cancel();
  }, [blocked, cancel]);
  useEffect(() => {
    if (!active) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [active, cancel]);
  const begin = (d: CreationDefinition) => {
    if (blocked) {
      world.notify("请先登录并等待家园加载，或处理存档冲突，再摆放造物。");
      return;
    }
    stopWalking();
    const f: CreationPlacement = {
      id: crypto.randomUUID(),
      definitionId: d.id,
      definitionVersion: d.version,
      blueprint: d.blueprint,
      x: 0,
      z: 0,
      rotation: 0,
    };
    setActive(f);
    setPreview(null);
    setOpen(false);
  };
  const move = (id: string) => {
    if (blocked) return;
    const f = world.snapshot.creations?.find((f) => f.id === id);
    if (f) {
      stopWalking();
      setActive(f);
      setPreview(f);
      setOpen(false);
    }
  };
  const store = (id: string) => {
    if (blocked) return;
    world.edit((w) => ({
      ...w,
      creations: (w.creations ?? []).filter((f) => f.id !== id),
    }));
    cancel();
    world.notify("造物已收起，设计仍在物品工坊里。可用撤销恢复这次摆放。");
  };
  const problem = preview
    ? creationPlacementError(world.snapshot, preview)
    : "点击岛上的空地，选择摆放位置。";
  const editor: CreationEditor = {
    active: !!active,
    preview,
    invalid: !!problem,
    selectedId: preview ? (active?.id ?? null) : null,
    onPoint: (x, z) => {
      if (active && !blocked)
        setPreview({
          ...active,
          x: Math.round(x * 4) / 4,
          z: Math.round(z * 4) / 4,
        });
    },
    onSelect: move,
  };
  return {
    editor,
    cancel,
    button: (
      <button
        className="tool"
        aria-label="物品工坊"
        onClick={() => {
          cancel();
          stopWalking();
          setOpen(true);
        }}
      >
        <Shapes size={20} />
        <span>工坊</span>
      </button>
    ),
    ui: (
      <>
        {open && (
          <Workshop
            key={userId ?? "visitor"}
            userId={userId}
            onClose={close}
            onPlace={begin}
            placed={world.snapshot.creations ?? []}
            onMove={move}
            onStore={store}
          />
        )}
        {active && (
          <section className="creation-tray" aria-label="摆放造物">
            <div>
              <strong>
                {active.blueprint.name} · 第 {active.definitionVersion} 版
              </strong>
              <p role="status">{problem || "位置合适，可以放在这里。"}</p>
            </div>
            <div className="creation-row">
              <button
                onClick={() => {
                  const rotation = ((active.rotation + 1) % 4) as 0 | 1 | 2 | 3;
                  setActive({ ...active, rotation });
                  setPreview((p) => (p ? { ...p, rotation } : null));
                }}
              >
                <RotateCw size={16} />
                旋转 {active.rotation * 90}°
              </button>
              <button
                className="creation-primary"
                disabled={blocked || !preview || !!problem}
                onClick={() => {
                  if (!preview || problem || blocked) return;
                  const f = preview;
                  world.edit((w) => ({
                    ...w,
                    creations: [
                      ...(w.creations ?? []).filter((p) => p.id !== f.id),
                      f,
                    ],
                  }));
                  cancel();
                  world.notify("造物摆好啦，正在保存到家园。");
                }}
              >
                确认摆放造物
              </button>
              {world.snapshot.creations?.some((f) => f.id === active.id) && (
                <button onClick={() => store(active.id)}>收起造物</button>
              )}
              <button onClick={cancel}>取消摆放</button>
            </div>
          </section>
        )}
      </>
    ),
  };
}
