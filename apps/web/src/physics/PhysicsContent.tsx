import { useEffect, useRef, useState } from "react";
import {
  physicsTextDraftSchema,
  savePhysicsTextSchema,
  type PhysicsTextRecord,
  type PhysicsTextSummary,
} from "@island/contracts";
import { api, RequestError } from "../api";
import type { PhysicsConnection } from "./PhysicsConnection";

type Draft = ReturnType<typeof physicsTextDraftSchema.parse>;
const blank = (): Draft => ({
  id: crypto.randomUUID(),
  version: 0,
  document: { title: "", text: "" },
});
function stored<T>(
  key: string,
  schema: { parse: (value: unknown) => T },
): T | null {
  try {
    return schema.parse(JSON.parse(localStorage.getItem(key) ?? "null"));
  } catch {
    return null;
  }
}
function TextLibrary({
  userId,
  conn,
  objectId,
  onClose,
}: {
  userId: string;
  conn: PhysicsConnection;
  objectId: string | null;
  onClose: () => void;
}) {
  const draftKey = `physics-text:${userId}`,
    requestKey = `physics-text-request:${userId}`;
  const [draft, setDraft] = useState(
    () => stored(draftKey, physicsTextDraftSchema) ?? blank(),
  );
  const [pending, setPending] = useState(() =>
    stored(requestKey, savePhysicsTextSchema),
  );
  const [items, setItems] = useState<PhysicsTextSummary[]>([]),
    [chosen, choose] = useState<PhysicsTextRecord | null>(null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [refresh, setRefresh] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null),
    lock = useRef(false),
    generation = useRef(0);
  useEffect(() => {
    dialog.current?.showModal();
    return () => {
      dialog.current?.close();
      generation.current++;
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    void api<{ items: PhysicsTextSummary[] }>("/physics/texts")
      .then((r) => {
        if (!cancelled) setItems(r.items);
      })
      .catch((e) => {
        if (!cancelled) setMessage(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [refresh]);
  useEffect(() => {
    try {
      localStorage.setItem(draftKey, JSON.stringify(draft));
    } catch {
      setMessage("本机草稿无法保存，请将文字复制备份");
    }
  }, [draft, draftKey]);
  const blocked = busy || !!pending;
  const target = conn.scene?.objects.find((o) => o.id === objectId);
  const canBind =
    !!target &&
    conn.scene?.definitions
      .find(
        (d) =>
          d.id === target.definitionId &&
          d.version === target.definitionVersion,
      )
      ?.abilities.includes("content") &&
    conn.editing &&
    !conn.editBusy &&
    !conn.editPending;
  async function select(item: PhysicsTextSummary) {
    const current = ++generation.current;
    choose(null);
    setMessage("");
    try {
      const r = await api<PhysicsTextRecord>(
        `/physics/texts/${item.id}/versions/${item.version}`,
      );
      if (current === generation.current) choose(r);
    } catch (e) {
      if (current === generation.current) setMessage((e as Error).message);
    }
  }
  async function save() {
    if (lock.current) return;
    const parsed = savePhysicsTextSchema.safeParse(
      pending ?? {
        id: draft.id,
        expectedVersion: draft.version,
        idempotencyKey: crypto.randomUUID(),
        document: draft.document,
      },
    );
    if (!parsed.success) {
      setMessage(
        "请输入标题，正文最多 10000 字；达到 100 个版本后请另存新正文",
      );
      return;
    }
    try {
      localStorage.setItem(requestKey, JSON.stringify(parsed.data));
    } catch {
      setMessage("无法保留提交编号，请先允许本地存储");
      return;
    }
    lock.current = true;
    setPending(parsed.data);
    setBusy(true);
    setMessage("正在保存正文…");
    const current = ++generation.current;
    try {
      const r = await api<PhysicsTextRecord>("/physics/texts", {
        method: "POST",
        body: JSON.stringify(parsed.data),
      });
      const saved = {
        id: r.id,
        version: r.version,
        document: { title: r.title, text: r.text },
      };
      localStorage.setItem(draftKey, JSON.stringify(saved));
      localStorage.removeItem(requestKey);
      if (current === generation.current) {
        setDraft(saved);
        setPending(null);
        choose(r);
        setRefresh((n) => n + 1);
        setMessage(`正文已保存 · 版本 ${r.version}。选择展示后才会更新装置。`);
      }
    } catch (e) {
      if (
        e instanceof RequestError &&
        e.status >= 400 &&
        e.status < 500 &&
        e.status !== 408 &&
        e.status !== 429
      ) {
        localStorage.removeItem(requestKey);
        if (current === generation.current) setPending(null);
      }
      if (current === generation.current) setMessage((e as Error).message);
    } finally {
      lock.current = false;
      if (current === generation.current) setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="physics-content-dialog"
      aria-label="正文库"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="physics-editor-row physics-content-header">
        <h2>正文库</h2>
        <button disabled={busy} onClick={onClose}>
          关闭正文库
        </button>
      </div>
      <p>
        正文保存到账号，装置展示指定版本。修改文字不会自动覆盖已展示的内容。
      </p>
      <div className="physics-content-columns">
        <section aria-label="本机正文草稿">
          <h3>
            本机草稿 · {draft.version ? `基于 v${draft.version}` : "新正文"}
          </h3>
          <label>
            正文标题
            <input
              aria-label="正文标题"
              value={draft.document.title}
              maxLength={80}
              disabled={blocked}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  document: { ...draft.document, title: e.target.value },
                })
              }
            />
          </label>
          <label>
            正文文字
            <textarea
              aria-label="正文文字"
              value={draft.document.text}
              maxLength={10000}
              rows={12}
              disabled={blocked}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  document: { ...draft.document, text: e.target.value },
                })
              }
            />
          </label>
          <div className="physics-actions">
            <button disabled={busy} onClick={() => void save()}>
              {pending ? "重试正文保存" : "保存正文"}
            </button>
            <button
              disabled={blocked}
              onClick={() =>
                setDraft({ ...draft, id: crypto.randomUUID(), version: 0 })
              }
            >
              另存为新正文
            </button>
            <button disabled={blocked} onClick={() => setDraft(blank())}>
              清空并写新正文
            </button>
          </div>
        </section>
        <section aria-label="账号正文版本">
          <h3>账号已保存正文</h3>
          <button disabled={busy} onClick={() => setRefresh((n) => n + 1)}>
            刷新正文列表
          </button>
          <div className="physics-text-list">
            {items.map((item) => (
              <button
                key={item.id}
                disabled={busy}
                onClick={() => void select(item)}
              >
                {item.title} · v{item.version}
              </button>
            ))}
          </div>
          {chosen && (
            <article>
              <h3>
                {chosen.title} · v{chosen.version}
              </h3>
              <p className="physics-text-body">
                {chosen.text || "（空白正文）"}
              </p>
              <button
                disabled={blocked}
                onClick={() =>
                  setDraft({
                    id: chosen.id,
                    version: chosen.version,
                    document: { title: chosen.title, text: chosen.text },
                  })
                }
              >
                载入所选版本，替换本机草稿
              </button>
              <button
                disabled={!canBind || blocked}
                onClick={() => {
                  conn.edit({
                    type: "content",
                    objectId: objectId!,
                    contentRef: { id: chosen.id, version: chosen.version },
                  });
                }}
              >
                在所选装置展示此版本
              </button>
            </article>
          )}
          {!canBind && (
            <p>进入布置并选择告示牌或展示书架，即可展示账号正文。</p>
          )}
          <button
            disabled={!canBind || blocked || !target?.contentRef}
            onClick={() =>
              conn.edit({
                type: "content",
                objectId: objectId!,
                contentRef: null,
              })
            }
          >
            取消所选装置的正文展示
          </button>
        </section>
      </div>
      <p role="status">{message}</p>
      <p aria-live="polite">{conn.message}</p>
    </dialog>
  );
}
export default function PhysicsContent({
  conn,
  selected,
  userId,
  owner,
  token,
  clearKeys,
}: {
  conn: PhysicsConnection;
  selected: string | null;
  userId: string;
  owner: boolean;
  token: string | null;
  clearKeys: () => void;
}) {
  const [panel, setPanel] = useState<"library" | "reader" | null>(null);
  const [body, setBody] = useState<PhysicsTextRecord | null>(null),
    [error, setError] = useState("");
  const reader = useRef<HTMLDialogElement>(null);
  const object = conn.scene?.objects.find((o) => o.id === selected);
  const ref = object?.contentRef;
  useEffect(() => {
    if (panel !== "reader") return;
    reader.current?.showModal();
    return () => reader.current?.close();
  }, [panel]);
  useEffect(() => {
    if (panel !== "reader") return;
    let cancelled = false;
    setBody(null);
    setError("");
    if (!ref || conn.status !== "connected") {
      setError("装置已收起、没有正文或连接已中断");
      return;
    }
    void api<PhysicsTextRecord>(
      `/physics/scenes/${conn.sceneId}/objects/${selected}/content${token ? `?t=${encodeURIComponent(token)}` : ""}`,
    )
      .then((r) => {
        if (!cancelled) setBody(r);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [
    panel,
    selected,
    ref?.id,
    ref?.version,
    conn.status,
    token,
    conn.sceneId,
  ]);
  return (
    <div className="physics-actions">
      {owner && (
        <button
          onClick={() => {
            clearKeys();
            setPanel("library");
          }}
        >
          正文库
        </button>
      )}
      {ref && (
        <button
          onClick={() => {
            clearKeys();
            setPanel("reader");
          }}
        >
          阅读所选正文
        </button>
      )}
      {panel === "library" && (
        <TextLibrary
          userId={userId}
          conn={conn}
          objectId={selected}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === "reader" && (
        <dialog
          ref={reader}
          className="physics-content-dialog"
          aria-label="装置正文"
          onCancel={(e) => {
            e.preventDefault();
            setPanel(null);
          }}
        >
          <div className="physics-content-header">
            <button onClick={() => setPanel(null)}>关闭阅读</button>
          </div>
          {body ? (
            <article>
              <h2>{body.title}</h2>
              <p>版本 {body.version}</p>
              <p className="physics-text-body">{body.text || "（空白正文）"}</p>
            </article>
          ) : (
            <p role="status">{error || "正在读取正文…"}</p>
          )}
        </dialog>
      )}
    </div>
  );
}
