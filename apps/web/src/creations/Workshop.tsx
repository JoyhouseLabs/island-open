import { useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Box, Circle, Cylinder, Plus, RotateCw, Undo2, X } from "lucide-react";
import {
  creationBlueprintSchema,
  creationDraftSchema,
  saveCreationSchema,
  type CreationBlueprint,
  type CreationDefinition,
  type CreationDraft,
  type CreationPart,
  type SaveCreationRequest,
} from "@island/contracts";
import { api, RequestError } from "../api";
import RendererCleanup from "../RendererCleanup";
import { CreationModel } from "./CreationModel";

const shapeNames = { box: "方块", sphere: "球体", cylinder: "圆柱" };
const newPart = (shape: CreationPart["shape"]): CreationPart => ({
  id: crypto.randomUUID(),
  shape,
  color: "#8bb8a2",
  x: 0,
  y: 0.5,
  z: 0,
  width: 1,
  height: 1,
  depth: 1,
  rotation: 0,
});
const newDraft = (): CreationDraft => ({
  id: crypto.randomUUID(),
  version: 0,
  blueprint: { name: "我的小造物", parts: [newPart("box")] },
});
export function Workshop({
  userId,
  onClose,
  onPlace,
  placed,
  onMove,
  onStore,
}: {
  userId: string | null;
  onClose: () => void;
  onPlace: (d: CreationDefinition) => void;
  placed: {
    id: string;
    blueprint: CreationBlueprint;
    definitionVersion: number;
  }[];
  onMove: (id: string) => void;
  onStore: (id: string) => void;
}) {
  const draftKey = `island-creation-draft:${userId ?? "visitor"}`,
    pendingKey = `island-creation-pending:${userId ?? "visitor"}`;
  const [items, setItems] = useState<CreationDefinition[]>([]),
    [draft, setDraft] = useState<CreationDraft | null>(null),
    [selected, setSelected] = useState("");
  const [pending, setPending] = useState<SaveCreationRequest | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [note, setNote] = useState(""),
    [loaded, setLoaded] = useState(false);
  const [resume, setResume] = useState<CreationDraft | null>(null);
  const [history, setHistory] = useState<CreationDraft[]>([]);
  const lock = useRef(false),
    alive = useRef(true),
    dialog = useRef<HTMLElement>(null),
    readSerial = useRef(0);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const refresh = async () => {
    if (!userId) {
      setLoaded(true);
      return;
    }
    const serial = ++readSerial.current;
    try {
      const r = await api<{ items: CreationDefinition[] }>("/creations");
      if (alive.current && serial === readSerial.current) {
        setItems(r.items);
        setLoaded(true);
      }
    } catch (e) {
      if (alive.current && serial === readSerial.current) {
        setError(e instanceof Error ? e.message : "工坊暂时未连接。");
        setLoaded(true);
      }
    }
  };
  useEffect(() => {
    void refresh();
    try {
      const p = saveCreationSchema.safeParse(
        JSON.parse(localStorage.getItem(pendingKey) ?? "null"),
      );
      const d = creationDraftSchema.safeParse(
        JSON.parse(localStorage.getItem(draftKey) ?? "null"),
      );
      const restored = p.success
        ? {
            id: p.data.id,
            version: p.data.expectedVersion,
            blueprint: p.data.blueprint,
          }
        : d.success
          ? d.data
          : null;
      if (p.success) setPending(p.data);
      if (restored) {
        setResume(restored);
        setDraft(restored);
        setSelected(restored.blueprint.parts[0]!.id);
        setNote("已恢复这台设备上的草稿。");
      }
    } catch {
      setError("本地草稿暂时无法读取，请检查浏览器存储权限。");
    }
  }, []);
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
      if (e.key === "Tab") {
        const nodes = Array.from(
          dialog.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]',
          ) ?? [],
        ).filter((n) => n.getClientRects().length);
        const first = nodes[0],
          last = nodes.at(-1);
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === dialog.current)
        ) {
          e.preventDefault();
          last?.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last ||
            document.activeElement === dialog.current)
        ) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => {
      window.removeEventListener("keydown", handler, true);
      prior?.focus();
    };
  }, [onClose]);
  const persist = (d: CreationDraft | null) => {
    setResume(d);
    try {
      if (d) localStorage.setItem(draftKey, JSON.stringify(d));
      else localStorage.removeItem(draftKey);
    } catch {
      setError("浏览器无法保留草稿，请在关闭前保存到云端。");
    }
  };
  const change = (d: CreationDraft) => {
    if (pending || busy) return;
    if (draft) setHistory((h) => [...h.slice(-39), draft]);
    setDraft(d);
    persist(d);
    setNote("");
  };
  const open = (value: CreationDraft) => {
    if (pending) return;
    const d = {
      id: value.id,
      version: value.version,
      blueprint: value.blueprint,
    };
    setHistory([]);
    setDraft(d);
    setSelected(d.blueprint.parts[0]!.id);
    persist(d);
    setError("");
    setNote("");
  };
  const part =
    draft?.blueprint.parts.find((p) => p.id === selected) ??
    draft?.blueprint.parts[0];
  const update = (patch: Partial<CreationPart>) => {
    if (draft && part)
      change({
        ...draft,
        blueprint: {
          ...draft.blueprint,
          parts: draft.blueprint.parts.map((p) =>
            p.id === part.id ? { ...p, ...patch } : p,
          ),
        },
      });
  };
  const validity = draft
    ? creationBlueprintSchema.safeParse(draft.blueprint)
    : null;
  const save = async () => {
    if (lock.current || !userId || !draft) return;
    const parsed = saveCreationSchema.safeParse(
      pending ?? {
        id: draft.id,
        expectedVersion: draft.version,
        blueprint: draft.blueprint,
        idempotencyKey: crypto.randomUUID(),
      },
    );
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "请检查造物尺寸");
      return;
    }
    const request = parsed.data;
    try {
      localStorage.setItem(pendingKey, JSON.stringify(request));
    } catch {
      setError("无法保存请求凭证，请允许浏览器本地存储后再试。");
      return;
    }
    lock.current = true;
    setBusy(true);
    setPending(request);
    setError("");
    readSerial.current++;
    try {
      const result = await api<CreationDefinition>("/creations", {
        method: "POST",
        body: JSON.stringify(request),
      });
      if (!alive.current) return;
      localStorage.removeItem(pendingKey);
      localStorage.removeItem(draftKey);
      setPending(null);
      setResume(null);
      setDraft(null);
      setHistory([]);
      setItems((old) => [result, ...old.filter((d) => d.id !== result.id)]);
      setNote(
        `「${result.blueprint.name}」第 ${result.version} 版已保存，可以摆放了。`,
      );
    } catch (e) {
      if (!alive.current) return;
      if (e instanceof RequestError && e.status >= 400 && e.status < 500) {
        try {
          localStorage.removeItem(pendingKey);
        } catch {}
        setPending(null);
      }
      setError(
        e instanceof Error ? e.message : "保存结果待确认，请重试同一次保存。",
      );
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return (
    <div className="creation-shade">
      <section
        ref={dialog}
        tabIndex={-1}
        className="creation-workshop"
        role="dialog"
        aria-modal="true"
        aria-label="物品工坊"
      >
        <header>
          <div>
            <small>用小形状，创造大想象</small>
            <h2>物品工坊</h2>
          </div>
          <button aria-label="关闭物品工坊" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        {error && (
          <p className="creation-error" role="alert">
            {error}{" "}
            {!draft && <button onClick={() => void refresh()}>重新连接</button>}
          </p>
        )}
        {note && (
          <p className="creation-notice" role="status">
            {note}
          </p>
        )}
        {!userId && (
          <p className="creation-notice">
            可以先试着创作，草稿留在这台设备。登录后才能保存造物和摆进家园。
          </p>
        )}
        {pending && (
          <p className="creation-notice">
            上次保存结果待确认。请重试这次保存，再继续修改。
            <button disabled={busy} onClick={() => void save()}>
              重试保存
            </button>
          </p>
        )}
        {draft && part ? (
          <>
            <div className="creation-title">
              <label>
                造物名称
                <input
                  aria-label="造物名称"
                  maxLength={40}
                  value={draft.blueprint.name}
                  disabled={!!pending || busy}
                  onChange={(e) =>
                    change({
                      ...draft,
                      blueprint: { ...draft.blueprint, name: e.target.value },
                    })
                  }
                />
              </label>
              <small>
                编号 {draft.id.slice(0, 8).toUpperCase()} ·{" "}
                {draft.version ? `基于第 ${draft.version} 版` : "新造物"}
              </small>
            </div>
            <div className="creation-editor">
              <div className="creation-preview">
                <Canvas
                  shadows
                  camera={{ position: [8, 7, 9], fov: 42 }}
                  dpr={[1, 1.5]}
                  frameloop="demand"
                  aria-label="造物三维预览"
                >
                  <color attach="background" args={["#e9f0e9"]} />
                  <ambientLight intensity={1.5} />
                  <directionalLight
                    position={[5, 9, 6]}
                    intensity={2}
                    castShadow
                  />
                  <CreationModel
                    blueprint={draft.blueprint}
                    selected={part.id}
                    onSelect={setSelected}
                  />
                  <gridHelper args={[6, 12, "#7d9e8b", "#c4d2c5"]} />
                  <mesh
                    rotation={[-Math.PI / 2, 0, 0]}
                    position={[0, -0.015, 0]}
                    receiveShadow
                  >
                    <planeGeometry args={[6, 6]} />
                    <meshStandardMaterial color="#d7e2d3" />
                  </mesh>
                  <OrbitControls
                    makeDefault
                    target={[0, 1.7, 0]}
                    minDistance={4}
                    maxDistance={20}
                    maxPolarAngle={Math.PI / 2 - 0.03}
                  />
                  <RendererCleanup />
                </Canvas>
                <p>拖动旋转视角 · 点击部件选中 · 底座 6 × 6</p>
              </div>
              <div className="creation-properties">
                <fieldset disabled={!!pending || busy}>
                  <legend>组合部件 · {draft.blueprint.parts.length}/24</legend>
                  <div className="creation-shapes">
                    {(["box", "sphere", "cylinder"] as const).map((shape) => (
                      <button
                        key={shape}
                        disabled={draft.blueprint.parts.length >= 24}
                        onClick={() => {
                          const p = newPart(shape);
                          change({
                            ...draft,
                            blueprint: {
                              ...draft.blueprint,
                              parts: [...draft.blueprint.parts, p],
                            },
                          });
                          setSelected(p.id);
                        }}
                      >
                        {shape === "box" ? (
                          <Box size={17} />
                        ) : shape === "sphere" ? (
                          <Circle size={17} />
                        ) : (
                          <Cylinder size={17} />
                        )}
                        添加{shapeNames[shape]}
                      </button>
                    ))}
                  </div>
                  <label>
                    选中部件
                    <select
                      aria-label="选中部件"
                      value={part.id}
                      onChange={(e) => setSelected(e.target.value)}
                    >
                      {draft.blueprint.parts.map((p, i) => (
                        <option key={p.id} value={p.id}>
                          {i + 1}. {shapeNames[p.shape]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="creation-color">
                    部件颜色
                    <input
                      type="color"
                      aria-label="部件颜色"
                      value={part.color}
                      onChange={(e) => update({ color: e.target.value })}
                    />
                  </label>
                  <div className="creation-numbers">
                    {(
                      [
                        ["x", "左右位置", -3, 3, 0.125],
                        ["y", "中心高度", 0.125, 6, 0.125],
                        ["z", "前后位置", -3, 3, 0.125],
                        ["width", "宽度", 0.25, 6, 0.25],
                        ["height", "高度", 0.25, 6, 0.25],
                        ["depth", "深度", 0.25, 6, 0.25],
                      ] as const
                    ).map(([key, label, min, max, step]) => (
                      <label key={key}>
                        {label}
                        <input
                          type="number"
                          aria-label={label}
                          min={min}
                          max={max}
                          step={step}
                          value={part[key]}
                          onChange={(e) => {
                            const n = e.target.valueAsNumber;
                            if (Number.isFinite(n)) {
                              const value = Math.max(
                                min,
                                Math.min(max, Math.round(n / step) * step),
                              );
                              update(
                                key === "height" && part.y === part.height / 2
                                  ? { height: value, y: value / 2 }
                                  : { [key]: value },
                              );
                            }
                          }}
                        />
                      </label>
                    ))}
                  </div>
                  <div className="creation-row">
                    <button
                      onClick={() =>
                        update({
                          rotation: ((part.rotation + 1) % 4) as 0 | 1 | 2 | 3,
                        })
                      }
                    >
                      <RotateCw size={16} />
                      旋转 {part.rotation * 90}°
                    </button>
                    <button onClick={() => update({ y: part.height / 2 })}>
                      落到底座
                    </button>
                  </div>
                  <div className="creation-row">
                    <button
                      disabled={draft.blueprint.parts.length >= 24}
                      onClick={() => {
                        const p = { ...part, id: crypto.randomUUID() };
                        change({
                          ...draft,
                          blueprint: {
                            ...draft.blueprint,
                            parts: [...draft.blueprint.parts, p],
                          },
                        });
                        setSelected(p.id);
                      }}
                    >
                      复制部件
                    </button>
                    <button
                      disabled={draft.blueprint.parts.length <= 1}
                      onClick={() => {
                        const parts = draft.blueprint.parts.filter(
                          (p) => p.id !== part.id,
                        );
                        change({
                          ...draft,
                          blueprint: { ...draft.blueprint, parts },
                        });
                        setSelected(parts[0]!.id);
                      }}
                    >
                      删除部件
                    </button>
                  </div>
                </fieldset>
              </div>
            </div>
            <footer>
              <p role="status">
                {validity && !validity.success
                  ? (validity.error.issues[0]?.message ?? "请检查造物尺寸")
                  : "尺寸合适。保存新版本后，岛上已摆好的旧版本保持原样。"}
              </p>
              <div className="creation-row">
                <button
                  disabled={!history.length || !!pending || busy}
                  onClick={() => {
                    const prev = history.at(-1);
                    if (prev) {
                      setDraft(prev);
                      persist(prev);
                      setHistory((h) => h.slice(0, -1));
                    }
                  }}
                >
                  <Undo2 size={16} />
                  撤销
                </button>
                {draft.version > 0 && (
                  <button
                    disabled={!!pending || busy}
                    onClick={() =>
                      open({ ...draft, id: crypto.randomUUID(), version: 0 })
                    }
                  >
                    另存为新造物
                  </button>
                )}
                <button
                  disabled={!!pending || busy}
                  onClick={() => {
                    persist(draft);
                    setDraft(null);
                    setNote("草稿已留在此设备，关闭后重新打开工坊可继续。");
                  }}
                >
                  回到收藏
                </button>
                <button
                  className="creation-primary"
                  disabled={!userId || busy || (!pending && !validity?.success)}
                  onClick={() => void save()}
                >
                  {busy
                    ? "正在保存…"
                    : pending
                      ? "重试保存"
                      : draft.version
                        ? "保存新版本"
                        : "保存造物"}
                </button>
              </div>
            </footer>
          </>
        ) : (
          <>
            {resume && (
              <p className="creation-notice">
                本机有未完成的草稿「{resume.blueprint.name}」。
                <button onClick={() => open(resume)}>继续草稿</button>
              </p>
            )}
            <div className="creation-library-head">
              <div>
                <h3>我的造物</h3>
                <p>每件造物都能重复摆放。主岛最多摆放 16 件。</p>
              </div>
              <button
                className="creation-primary"
                onClick={() => open(newDraft())}
              >
                <Plus size={18} />
                开始创作
              </button>
            </div>
            {!loaded ? (
              <p>正在打开工坊…</p>
            ) : !items.length ? (
              <div className="creation-empty">
                <Box size={42} />
                <h3>从一个小方块开始</h3>
                <p>组合形状，试试做一张小桌子、一座雕塑或一只玩具。</p>
              </div>
            ) : (
              <div className="creation-library">
                {items.map((d) => (
                  <article key={d.id}>
                    <div
                      className="creation-mini"
                      style={{ background: d.blueprint.parts[0]!.color + "33" }}
                    >
                      {d.blueprint.parts.slice(0, 6).map((p) => (
                        <span
                          key={p.id}
                          style={{
                            background: p.color,
                            borderRadius:
                              p.shape === "box"
                                ? 4
                                : p.shape === "sphere"
                                  ? "50%"
                                  : "40% / 20%",
                          }}
                        />
                      ))}
                    </div>
                    <h4>{d.blueprint.name}</h4>
                    <small title={d.id}>
                      #{d.id.slice(0, 8).toUpperCase()} · 第 {d.version} 版 ·{" "}
                      {d.blueprint.parts.length} 个部件
                    </small>
                    <div className="creation-row">
                      <button onClick={() => open(d)}>编辑造物</button>
                      <button
                        className="creation-primary"
                        onClick={() => onPlace(d)}
                      >
                        摆进家园
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
            {!!placed.length && (
              <div className="creation-placed">
                <h3>主岛上的造物 · {placed.length}/16</h3>
                {placed.map((f) => (
                  <div key={f.id}>
                    <span>
                      {f.blueprint.name}
                      <small>
                        实例 #{f.id.slice(0, 8).toUpperCase()} · 第{" "}
                        {f.definitionVersion} 版
                      </small>
                    </span>
                    <button onClick={() => onMove(f.id)}>移动</button>
                    <button onClick={() => onStore(f.id)}>收起</button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
