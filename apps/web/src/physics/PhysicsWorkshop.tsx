import { useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import {
  identityQuaternion,
  physicsCreationBlueprintSchema,
  physicsCreationDraftSchema,
  physicsTableTemplate,
  savePhysicsCreationSchema,
  type PhysicsCreationBlueprint,
  type PhysicsCreationRecord,
  type ObjectPart,
  type ObjectDefinition,
} from "@island/contracts";
import { api, RequestError } from "../api";
import { PhysicsPart } from "./PhysicsPart";

type Draft = {
  id: string;
  version: number;
  blueprint: PhysicsCreationBlueprint;
};
function initial(userId: string): Draft {
  try {
    const parsed = physicsCreationDraftSchema.safeParse(
      JSON.parse(localStorage.getItem(`physics-workshop:${userId}`) ?? "null"),
    );
    if (parsed.success) return parsed.data;
  } catch {}
  return {
    id: crypto.randomUUID(),
    version: 0,
    blueprint: physicsTableTemplate(),
  };
}
export default function PhysicsWorkshop({
  userId,
  items,
  onSaved,
  onPlace,
  onClose,
}: {
  userId: string;
  items: PhysicsCreationRecord[];
  onSaved: () => void;
  onPlace: (d: ObjectDefinition) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => initial(userId)),
    [selected, select] = useState("top"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [saved, setSaved] = useState<PhysicsCreationRecord | null>(null);
  const requestKey = `physics-workshop-request:${userId}`;
  const [pending, setPending] = useState<ReturnType<
    typeof savePhysicsCreationSchema.parse
  > | null>(() => {
    try {
      const p = savePhysicsCreationSchema.safeParse(
        JSON.parse(localStorage.getItem(requestKey) ?? "null"),
      );
      return p.success ? p.data : null;
    } catch {
      return null;
    }
  });
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const lock = useRef(false),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(`physics-workshop:${userId}`, JSON.stringify(draft));
    } catch {
      setMessage("本机草稿无法保存，请先保存到账号");
    }
  }, [draft, userId]);
  const invalid = physicsCreationBlueprintSchema.safeParse(draft.blueprint);
  const part =
    draft.blueprint.parts.find((p) => p.id === selected) ??
    draft.blueprint.parts[0]!;
  const blocked = busy || !!pending;
  const dirty =
    !saved ||
    JSON.stringify(draft.blueprint) !==
      JSON.stringify({
        name: saved.definition.name,
        material: saved.definition.material,
        bodyType: saved.definition.bodyType,
        parts: saved.definition.parts,
      });
  function change(patch: Partial<PhysicsCreationBlueprint>) {
    if (!blocked)
      setDraft({ ...draft, blueprint: { ...draft.blueprint, ...patch } });
  }
  function changePart(patch: Partial<ObjectPart>) {
    change({
      parts: draft.blueprint.parts.map((p) =>
        p.id === part.id ? { ...p, ...patch } : p,
      ),
    });
  }
  function add(kind: "box" | "ball" | "cylinder") {
    const p: ObjectPart = {
      id: crypto.randomUUID(),
      position: { x: 0, y: 0.5, z: 0 },
      rotation: identityQuaternion,
      color: "#bb8958",
      sensor: false,
      shape:
        kind === "box"
          ? { kind, halfExtents: { x: 0.5, y: 0.5, z: 0.5 } }
          : kind === "ball"
            ? { kind, radius: 0.5 }
            : { kind, radius: 0.5, halfHeight: 0.5 },
    };
    change({ parts: [...draft.blueprint.parts, p] });
    select(p.id);
  }
  async function save() {
    if (lock.current) return;
    const request = pending ?? {
      id: draft.id,
      expectedVersion: draft.version,
      idempotencyKey: crypto.randomUUID(),
      blueprint: draft.blueprint,
    };
    const parsed = savePhysicsCreationSchema.safeParse(request);
    if (!parsed.success) {
      setMessage(parsed.error.issues[0]!.message);
      return;
    }
    try {
      localStorage.setItem(requestKey, JSON.stringify(parsed.data));
    } catch {
      setMessage("无法保留请求，请先允许本地存储后再保存");
      return;
    }
    lock.current = true;
    setPending(parsed.data);
    setBusy(true);
    setMessage("正在保存作品…");
    try {
      const record = await api<PhysicsCreationRecord>("/physics/creations", {
        method: "POST",
        body: JSON.stringify(parsed.data),
      });
      if (!alive.current) return;
      localStorage.removeItem(requestKey);
      setPending(null);
      setSaved(record);
      const d = record.definition;
      setDraft({
        id: record.id,
        version: record.version,
        blueprint: {
          name: d.name,
          material: d.material,
          bodyType: d.bodyType as "fixed" | "dynamic",
          parts: d.parts,
        },
      });
      setMessage(`作品已保存 · 版本 ${record.version}，已有摆件保留原版本`);
      onSaved();
    } catch (e) {
      if (alive.current) {
        if (e instanceof RequestError && e.status >= 400 && e.status < 500) {
          localStorage.removeItem(requestKey);
          setPending(null);
        }
        setMessage((e as Error).message);
      }
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  function open(record: PhysicsCreationRecord) {
    const d = record.definition;
    setDraft({
      id: record.id,
      version: record.version,
      blueprint: {
        name: d.name,
        material: d.material,
        bodyType: d.bodyType as "fixed" | "dynamic",
        parts: d.parts,
      },
    });
    setSaved(record);
    select(d.parts[0]!.id);
    setMessage("");
  }
  const dimension = (
    label: string,
    value: number,
    update: (v: number) => void,
  ) => (
    <label key={label}>
      {label}
      <input
        aria-label={`部件${label}`}
        type="number"
        step="0.125"
        min="0.05"
        max="6"
        value={value}
        disabled={blocked}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v) && v >= 0.05 && v <= 6) update(v);
        }}
      />
    </label>
  );
  return (
    <dialog
      ref={dialog}
      className="physics-workshop"
      aria-label="物品工坊"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="physics-editor-row">
        <h2>物品工坊</h2>
        <button onClick={onClose}>关闭工坊</button>
        <button
          disabled={blocked}
          onClick={() => {
            setDraft({
              id: crypto.randomUUID(),
              version: 0,
              blueprint: physicsTableTemplate(),
            });
            setSaved(null);
            select("top");
          }}
        >
          新建桌子
        </button>
        <button
          disabled={blocked}
          onClick={() => {
            setDraft({ ...draft, id: crypto.randomUUID(), version: 0 });
            setSaved(null);
            setMessage("已复制为新作品草稿");
          }}
        >
          另存为新作品
        </button>
      </div>
      <div className="physics-workshop-body">
        <div className="physics-workshop-preview">
          <Canvas camera={{ position: [7, 6, 7], fov: 45 }} dpr={[1, 1.5]}>
            <color attach="background" args={["#e5eee5"]} />
            <ambientLight intensity={1.5} />
            <directionalLight position={[4, 8, 4]} intensity={2} />
            <gridHelper args={[6, 12, "#6c9279", "#b7c8b8"]} />
            {draft.blueprint.parts.map((p) => (
              <group
                key={p.id}
                onClick={(e) => {
                  e.stopPropagation();
                  select(p.id);
                }}
              >
                <PhysicsPart part={p} selected={p.id === part.id} />
              </group>
            ))}
            <OrbitControls
              target={[0, 1.5, 0]}
              minDistance={3}
              maxDistance={15}
            />
          </Canvas>
        </div>
        <div className="physics-workshop-fields">
          <p>组合最多 24 个部件，作品范围 6 × 6 × 6。保存版本可重复摆放。</p>
          <div className="physics-editor-row">
            {items.map((r) => (
              <button key={r.id} disabled={blocked} onClick={() => open(r)}>
                编辑 {r.definition.name} · v{r.version}
              </button>
            ))}
          </div>
          <div className="physics-editor-row">
            <label>
              作品名称
              <input
                aria-label="作品名称"
                value={draft.blueprint.name}
                maxLength={60}
                disabled={blocked}
                onChange={(e) => change({ name: e.target.value })}
              />
            </label>
            <label>
              材质
              <select
                value={draft.blueprint.material}
                disabled={blocked}
                onChange={(e) =>
                  change({
                    material: e.target
                      .value as PhysicsCreationBlueprint["material"],
                  })
                }
              >
                {[
                  ["wood", "木"],
                  ["stone", "石"],
                  ["rubber", "橡胶"],
                  ["ice", "冰"],
                ].map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label>
              物理类型
              <select
                value={draft.blueprint.bodyType}
                disabled={blocked}
                onChange={(e) =>
                  change({ bodyType: e.target.value as "fixed" | "dynamic" })
                }
              >
                <option value="fixed">固定家具</option>
                <option value="dynamic">活动物品</option>
              </select>
            </label>
          </div>
          <div className="physics-editor-row">
            {(
              [
                ["box", "添加方块"],
                ["ball", "添加球"],
                ["cylinder", "添加圆柱"],
              ] as const
            ).map(([kind, label]) => (
              <button
                key={kind}
                disabled={blocked || draft.blueprint.parts.length >= 24}
                onClick={() => add(kind)}
              >
                {label}
              </button>
            ))}
            <button
              disabled={blocked || draft.blueprint.parts.length >= 24}
              onClick={() => {
                const p = { ...structuredClone(part), id: crypto.randomUUID() };
                change({ parts: [...draft.blueprint.parts, p] });
                select(p.id);
              }}
            >
              复制部件
            </button>
            <button
              disabled={blocked || draft.blueprint.parts.length <= 1}
              onClick={() =>
                change({
                  parts: draft.blueprint.parts.filter((p) => p.id !== part.id),
                })
              }
            >
              删除部件
            </button>
            <label>
              选中部件
              <select
                aria-label="选中部件"
                value={part.id}
                onChange={(e) => select(e.target.value)}
              >
                {draft.blueprint.parts.map((p, i) => (
                  <option key={p.id} value={p.id}>
                    {i + 1} ·{" "}
                    {p.shape.kind === "box"
                      ? "方块"
                      : p.shape.kind === "ball"
                        ? "球"
                        : "圆柱"}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="physics-editor-row">
            {(["x", "y", "z"] as const).map((axis, i) => (
              <label key={axis}>
                {["左右", "高度", "前后"][i]}
                <input
                  aria-label={`部件 ${axis.toUpperCase()}`}
                  type="number"
                  step="0.125"
                  min={axis === "y" ? 0 : -3}
                  max={axis === "y" ? 6 : 3}
                  disabled={blocked}
                  value={part.position[axis]}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v) && v >= -3 && v <= 6)
                      changePart({ position: { ...part.position, [axis]: v } });
                  }}
                />
              </label>
            ))}
            <label>
              颜色
              <input
                aria-label="部件颜色"
                type="color"
                value={part.color}
                disabled={blocked}
                onChange={(e) => changePart({ color: e.target.value })}
              />
            </label>
          </div>
          <div className="physics-editor-row">
            {part.shape.kind === "box" &&
              (["x", "y", "z"] as const).map((axis, i) => {
                const s = part.shape as Extract<
                  ObjectPart["shape"],
                  { kind: "box" }
                >;
                return dimension(
                  ["宽度", "厚度", "深度"][i]!,
                  s.halfExtents[axis] * 2,
                  (v) =>
                    changePart({
                      shape: {
                        ...s,
                        halfExtents: { ...s.halfExtents, [axis]: v / 2 },
                      },
                    }),
                );
              })}
            {(part.shape.kind === "ball" || part.shape.kind === "cylinder") &&
              dimension("直径", part.shape.radius * 2, (v) =>
                changePart({
                  shape: {
                    ...part.shape,
                    radius: v / 2,
                  } as ObjectPart["shape"],
                }),
              )}
            {part.shape.kind === "cylinder" &&
              dimension("厚度", part.shape.halfHeight * 2, (v) =>
                changePart({
                  shape: {
                    ...part.shape,
                    halfHeight: v / 2,
                  } as ObjectPart["shape"],
                }),
              )}
            <button
              disabled={blocked}
              onClick={() => {
                const q = part.rotation,
                  c = Math.SQRT1_2;
                changePart({
                  rotation: {
                    x: c * (q.x + q.z),
                    y: c * (q.y + q.w),
                    z: c * (q.z - q.x),
                    w: c * (q.w - q.y),
                  },
                });
              }}
            >
              旋转部件 90°
            </button>
          </div>
        </div>
      </div>
      <p aria-live="polite">
        {!invalid.success
          ? invalid.error.issues[0]?.message
          : message ||
            `草稿已保存在本机 · ${draft.blueprint.parts.length} 个部件`}
      </p>
      <div className="physics-actions">
        <button
          disabled={busy || (!pending && !invalid.success)}
          onClick={() => void save()}
        >
          {pending ? "重试原保存请求" : "保存作品"}
        </button>
        <button
          disabled={blocked || dirty}
          onClick={() => {
            if (saved) onPlace(saved.definition);
          }}
        >
          摆放已保存版本
        </button>
      </div>
    </dialog>
  );
}
