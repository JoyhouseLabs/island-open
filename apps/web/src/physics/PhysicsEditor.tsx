import { useEffect, useState } from "react";
import {
  identityQuaternion,
  type ObjectDefinition,
  type ObjectInstance,
  type Vector3,
} from "@island/contracts";
import { api } from "../api";
import { PhysicsConnection } from "./PhysicsConnection";

export interface PhysicsDraft {
  definition: ObjectDefinition;
  object: ObjectInstance;
  existing: boolean;
}
export function bottomOf(definition: ObjectDefinition) {
  return Math.min(
    ...definition.parts
      .filter((p) => !p.sensor)
      .map((p) => {
        const s = p.shape;
        return (
          p.position.y -
          (s.kind === "box"
            ? s.halfExtents.y
            : s.kind === "ball"
              ? s.radius
              : s.kind === "convex"
                ? Math.max(...s.vertices.map((v) => -v.y))
                : s.halfHeight + (s.kind === "capsule" ? s.radius : 0))
        );
      }),
  );
}
export function previewError(
  conn: PhysicsConnection,
  draft: PhysicsDraft | null,
) {
  if (!draft || !conn.prediction) return "";
  try {
    conn.prediction.runtime.validatePlacement(
      draft.object,
      draft.definition,
      draft.existing ? draft.object.id : undefined,
    );
    return "";
  } catch (e) {
    return (e as Error).message;
  }
}
export default function PhysicsEditor({
  conn,
  selected,
  draft,
  setDraft,
  clearKeys,
}: {
  conn: PhysicsConnection;
  selected: string | null;
  draft: PhysicsDraft | null;
  setDraft: (draft: PhysicsDraft | null) => void;
  clearKeys: () => void;
}) {
  const [catalog, setCatalog] = useState<ObjectDefinition[]>([]),
    [error, setError] = useState("");
  const [definitionId, setDefinitionId] = useState("core:block");
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void api<{ items: ObjectDefinition[] }>("/physics/catalog")
      .then((r) => {
        if (!cancelled) setCatalog(r.items);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const revision = conn.buffer.latest?.layoutRevision;
  useEffect(() => {
    // Keep a rejected draft for correction; remove only a confirmed new layout.
    if (
      submittedId &&
      !conn.editPending &&
      conn.message.startsWith("布置已保存")
    ) {
      setDraft(null);
      setSubmittedId(null);
    }
  }, [revision, conn.editPending, conn.message, submittedId]);
  const active = conn.editing;
  const selectedObject = conn.scene?.objects.find((o) => o.id === selected);
  const editable =
    selectedObject &&
    !["core:floor", "core:platform"].includes(selectedObject.definitionId);
  const invalid = previewError(conn, draft);
  const blocked = conn.editBusy || !!conn.editPending;
  function start() {
    const definition = catalog.find((d) => d.id === definitionId);
    if (!definition) return;
    const p = conn.me?.position ?? { x: 0, y: 0, z: 7 };
    setDraft({
      definition,
      existing: false,
      object: {
        id: crypto.randomUUID(),
        definitionId: definition.id,
        definitionVersion: definition.version,
        position: {
          x: Math.round(p.x + 3),
          y: -bottomOf(definition),
          z: Math.round(p.z),
        },
        rotation: identityQuaternion,
      },
    });
  }
  function move() {
    if (!selectedObject) return;
    const definition = conn.scene!.definitions.find(
      (d) =>
        d.id === selectedObject.definitionId &&
        d.version === selectedObject.definitionVersion,
    )!;
    const current = conn.buffer.latest!.bodies.find(
      (b) => b.id === selectedObject.id,
    )!;
    setDraft({
      definition,
      existing: true,
      object: {
        ...selectedObject,
        position: { ...current.position },
        rotation: { ...current.rotation },
      },
    });
  }
  function submit() {
    if (!draft) return;
    conn.edit(
      draft.existing
        ? {
            type: "move",
            objectId: draft.object.id,
            position: draft.object.position,
            rotation: draft.object.rotation,
          }
        : { type: "place", object: draft.object },
    );
    setSubmittedId(conn.editPending?.commandId ?? null);
  }
  function coordinate(axis: keyof Vector3, value: string) {
    if (!draft || value === "" || !Number.isFinite(Number(value))) return;
    setDraft({
      ...draft,
      object: {
        ...draft.object,
        position: { ...draft.object.position, [axis]: Number(value) },
      },
    });
  }
  return (
    <section className="physics-editor" aria-label="布置家园">
      <div className="physics-actions">
        {!active ? (
          <>
            <button
              disabled={conn.status !== "connected"}
              onClick={() => {
                clearKeys();
                conn.editLease("acquire");
              }}
            >
              布置家园
            </button>
            {conn.lease.holder && conn.lease.holder !== conn.you && (
              <button
                onClick={() => {
                  clearKeys();
                  conn.editLease("acquire", true);
                }}
              >
                接管布置
              </button>
            )}
          </>
        ) : (
          <button
            disabled={blocked}
            onClick={() => {
              setDraft(null);
              clearKeys();
              conn.editLease("release");
            }}
          >
            完成布置
          </button>
        )}
        {conn.editPending && !conn.editBusy && (
          <button
            disabled={conn.status !== "connected"}
            onClick={() => conn.retryEdit()}
          >
            核对并重试布置
          </button>
        )}
      </div>
      {active && (
        <>
          <p>
            选择物品，点击场景定位；确认后保存。接管会结束另一设备的编辑占用。
          </p>
          <div className="physics-editor-row">
            <label>
              新增物品
              <select
                aria-label="新增物品"
                value={definitionId}
                disabled={blocked}
                onChange={(e) => setDefinitionId(e.target.value)}
              >
                {catalog.map((d) => (
                  <option key={`${d.id}@${d.version}`} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <button disabled={blocked || !catalog.length} onClick={start}>
              预览新物品
            </button>
            <button disabled={blocked || !editable} onClick={move}>
              移动所选
            </button>
            <button
              disabled={blocked || !editable}
              onClick={() => {
                if (selectedObject) {
                  setDraft(null);
                  conn.edit({ type: "remove", objectId: selectedObject.id });
                }
              }}
            >
              收起所选
            </button>
          </div>
          {draft && (
            <>
              <div className="physics-editor-row">
                {(["x", "y", "z"] as const).map((axis, i) => (
                  <label key={axis}>
                    {["左右 X", "高度 Y", "前后 Z"][i]}
                    <input
                      aria-label={`布置 ${axis.toUpperCase()}`}
                      type="number"
                      step="0.25"
                      value={draft.object.position[axis]}
                      disabled={blocked}
                      onChange={(e) => coordinate(axis, e.target.value)}
                    />
                  </label>
                ))}
                <button
                  disabled={blocked}
                  onClick={() => {
                    const q = draft.object.rotation,
                      c = Math.SQRT1_2;
                    setDraft({
                      ...draft,
                      object: {
                        ...draft.object,
                        rotation: {
                          x: c * (q.x + q.z),
                          y: c * (q.y + q.w),
                          z: c * (q.z - q.x),
                          w: c * (q.w - q.y),
                        },
                      },
                    });
                  }}
                >
                  旋转 90°
                </button>
              </div>
              <p aria-live="polite" data-testid="physics-placement-preview">
                {invalid || "预览可放置，确认时由服务器复核"}
              </p>
              <div className="physics-actions">
                <button disabled={blocked || !!invalid} onClick={submit}>
                  确认布置
                </button>
                <button disabled={blocked} onClick={() => setDraft(null)}>
                  取消预览
                </button>
              </div>
            </>
          )}
          {error && <p>{error}</p>}
        </>
      )}
    </section>
  );
}
