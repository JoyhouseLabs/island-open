import { useEffect, useState } from "react";
import {
  identityQuaternion,
  physicsPartsBounds,
  type ObjectDefinition,
  type ObjectInstance,
  type Vector3,
  type User,
  type PhysicsAssetCatalog,
} from "@island/contracts";
import { api } from "../api";
import PhysicsShop from "./PhysicsShop";
import PhysicsWorkshop from "./PhysicsWorkshop";
import { PhysicsConnection } from "./PhysicsConnection";

export interface PhysicsDraft {
  definition: ObjectDefinition;
  object: ObjectInstance;
  existing: boolean;
  growth?: boolean;
}
export function bottomOf(definition: ObjectDefinition) {
  return physicsPartsBounds(definition.parts.filter((p) => !p.sensor)).min.y;
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
  user,
}: {
  conn: PhysicsConnection;
  user: User;
  selected: string | null;
  draft: PhysicsDraft | null;
  setDraft: (draft: PhysicsDraft | null) => void;
  clearKeys: () => void;
}) {
  const [catalog, setCatalog] = useState<PhysicsAssetCatalog>({
      items: [],
      shop: [],
      creations: [],
      inventory: [],
    }),
    [error, setError] = useState("");
  const [panel, setPanel] = useState<"shop" | "workshop" | null>(() =>
    new URLSearchParams(location.search).has("creditRecharge") ? "shop" : null,
  );
  const [refreshKey, refresh] = useState(0);
  const [definitionId, setDefinitionId] = useState("core:block");
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void api<PhysicsAssetCatalog>("/physics/catalog")
      .then((r) => {
        if (!cancelled) setCatalog(r);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);
  const revision = conn.buffer.latest?.layoutRevision;
  useEffect(() => {
    // Keep a rejected draft for correction; remove only a confirmed new layout.
    if (submittedId && conn.lastEditedCommandId === submittedId) {
      setDraft(null);
      setSubmittedId(null);
    }
  }, [revision, conn.lastEditedCommandId, submittedId]);
  useEffect(() => {
    refresh((value) => value + 1);
  }, [revision]);
  const active = conn.editing;
  const choices = [
    ...catalog.items.map((definition) => ({
      key: definition.id,
      definition,
      instanceId: undefined as string | undefined,
      label: definition.name,
    })),
    ...catalog.creations.map((r) => ({
      key: `${r.definition.id}@${r.version}`,
      definition: r.definition,
      instanceId: undefined as string | undefined,
      label: `作品 · ${r.definition.name} · v${r.version}`,
    })),
    ...catalog.inventory
      .filter((i) => !i.worldId && !i.physicsSceneId)
      .flatMap((i) => {
        const item = catalog.shop.find((d) => d.itemId === i.itemId);
        return item
          ? [
              {
                key: i.id,
                instanceId: i.id,
                definition: item.definition,
                label: `家具 · ${item.definition.name} · ${i.id.slice(-4)}`,
              },
            ]
          : [];
      }),
  ];
  useEffect(() => {
    if (!choices.some((c) => c.key === definitionId))
      setDefinitionId("core:block");
  }, [catalog, definitionId]);
  function startDefinition(definition: ObjectDefinition, instanceId?: string) {
    const p = conn.me?.position ?? { x: 0, y: 0, z: 7 };
    setDraft({
      definition,
      existing: false,
      object: {
        id: instanceId ?? crypto.randomUUID(),
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
  const selectedObject = conn.scene?.objects.find((o) => o.id === selected);
  const selectedDefinition = conn.scene?.definitions.find(
    (d) =>
      d.id === selectedObject?.definitionId &&
      d.version === selectedObject?.definitionVersion,
  );
  const nextStage = selectedDefinition?.plant?.next;
  const grownDefinition =
    nextStage &&
    catalog.items.find(
      (d) => d.id === nextStage.id && d.version === nextStage.version,
    );
  const editable = selectedObject && !selectedObject.infrastructureKey;
  const invalid = previewError(conn, draft);
  const blocked = conn.editBusy || !!conn.editPending;
  function start() {
    const choice = choices.find((d) => d.key === definitionId);
    if (choice) startDefinition(choice.definition, choice.instanceId);
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
      draft.growth
        ? { type: "grow", objectId: draft.object.id }
        : draft.existing
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
            <button
              onClick={() => {
                clearKeys();
                setPanel(panel === "shop" ? null : "shop");
              }}
            >
              岛屿小铺
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
      {panel === "shop" && (
        <PhysicsShop
          user={user}
          catalog={catalog}
          onChanged={() => refresh((v) => v + 1)}
          onClose={() => setPanel(null)}
        />
      )}
      {active && (
        <>
          <p>
            选择物品，点击场景定位；确认后保存。接管会结束另一设备的编辑占用。
          </p>
          <div className="physics-editor-row">
            <button
              disabled={blocked}
              onClick={() => setPanel(panel === "shop" ? null : "shop")}
            >
              岛屿小铺
            </button>
            <button
              disabled={blocked}
              onClick={() => setPanel(panel === "workshop" ? null : "workshop")}
            >
              物品工坊
            </button>
            <button onClick={() => refresh((v) => v + 1)}>刷新物品库</button>
          </div>
          {panel === "workshop" && (
            <PhysicsWorkshop
              userId={user.id}
              items={catalog.creations}
              onSaved={() => refresh((v) => v + 1)}
              onPlace={(definition) => {
                startDefinition(definition);
                setPanel(null);
              }}
              onClose={() => setPanel(null)}
            />
          )}
          <div className="physics-editor-row">
            <label>
              新增物品
              <select
                aria-label="新增物品"
                value={definitionId}
                disabled={blocked}
                onChange={(e) => setDefinitionId(e.target.value)}
              >
                {choices.map((d) => (
                  <option key={d.key} value={d.key}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              disabled={blocked || !choices.some((c) => c.key === definitionId)}
              onClick={start}
            >
              预览新物品
            </button>
            {selectedDefinition?.plant && (
              <button
                disabled={blocked || !editable || !grownDefinition}
                onClick={() => {
                  if (selectedObject && grownDefinition)
                    setDraft({
                      definition: grownDefinition,
                      object: {
                        ...selectedObject,
                        definitionId: grownDefinition.id,
                        definitionVersion: grownDefinition.version,
                      },
                      existing: true,
                      growth: true,
                    });
                }}
              >
                {grownDefinition ? "预览生长" : "已经成熟"}
              </button>
            )}
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
              {draft.definition.id === "core:block" && (
                <p>点击表面时，方块吸附到 1 米网格；也可以输入坐标精调。</p>
              )}
              <div className="physics-editor-row">
                {(["x", "y", "z"] as const).map((axis, i) => (
                  <label key={axis}>
                    {["左右 X", "高度 Y", "前后 Z"][i]}
                    <input
                      aria-label={`布置 ${axis.toUpperCase()}`}
                      type="number"
                      step={draft.definition.id === "core:block" ? "1" : "0.25"}
                      value={draft.object.position[axis]}
                      disabled={blocked || draft.growth}
                      onChange={(e) => coordinate(axis, e.target.value)}
                    />
                  </label>
                ))}
                <button
                  disabled={blocked || draft.growth}
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
                  {draft.growth ? "确认生长" : "确认布置"}
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
