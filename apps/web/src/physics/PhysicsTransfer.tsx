import { useEffect, useRef, useState } from "react";
import {
  PHYSICS_BUNDLE_BYTES,
  physicsBundleSchema,
  type PhysicsBundle,
  type ImportPhysicsBundle,
} from "@island/contracts";
import { api, RequestError } from "../api";
import type { PhysicsConnection } from "./PhysicsConnection";
import { transferRequest } from "./transfer-store";
function download(bundle: PhysicsBundle, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(bundle)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function PhysicsTransfer({
  conn,
  userId,
  clearKeys,
}: {
  conn: PhysicsConnection;
  userId: string;
  clearKeys: () => void;
}) {
  const [open, setOpen] = useState(false),
    [bundle, setBundle] = useState<PhysicsBundle | null>(null),
    [pending, setPending] = useState<ImportPhysicsBundle | null>(null),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [backups, setBackups] = useState<
    Array<{ commandId: string; revision: number; createdAt: string }>
  >([]);
  const dialog = useRef<HTMLDialogElement>(null),
    alive = useRef(true),
    lock = useRef(false);
  const key = `${userId}:${conn.sceneId}`;
  useEffect(() => {
    alive.current = true;
    void transferRequest(key)
      .then((p) => {
        if (alive.current) {
          setPending(p);
          setBundle(p?.bundle ?? null);
          setReady(true);
        }
      })
      .catch(() => {
        if (alive.current)
          setMessage("无法打开本机导入记录，请允许浏览器存储后刷新");
      });
    return () => {
      alive.current = false;
    };
  }, [key]);
  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    let cancelled = false;
    void api<{ items: typeof backups }>(
      `/physics/scenes/${conn.sceneId}/import-backups`,
    )
      .then((r) => {
        if (!cancelled) setBackups(r.items);
      })
      .catch((e) => {
        if (!cancelled) setMessage(e.message);
      });
    return () => {
      cancelled = true;
      dialog.current?.close();
    };
  }, [open, conn.sceneId]);
  async function choose(file: File | undefined) {
    if (!file || busy || pending) return;
    setBundle(null);
    setMessage("");
    try {
      if (file.size > PHYSICS_BUNDLE_BYTES)
        throw new Error("导入文件不能超过 8 MB");
      const parsed = physicsBundleSchema.parse(JSON.parse(await file.text()));
      if (alive.current) setBundle(parsed);
    } catch (e) {
      if (alive.current)
        setMessage(
          e instanceof SyntaxError
            ? "文件不是有效 JSON"
            : e instanceof Error && e.message.includes("8 MB")
              ? e.message
              : "只接受完整的新版物理世界包，旧存档或缺少正文的文件无法导入",
        );
    }
  }
  async function exportCurrent() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("正在保存并导出…");
    try {
      const pack = await api<PhysicsBundle>(
        `/physics/scenes/${conn.sceneId}/export?connectionId=${conn.you}`,
      );
      download(pack, `island-physics-${conn.sceneId}.json`);
      if (alive.current)
        setMessage("已导出服务端保存的布局、物体状态、作品和正文");
    } catch (e) {
      if (alive.current) setMessage((e as Error).message);
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function restoreFile(id: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const pack = await api<PhysicsBundle>(
        `/physics/scenes/${conn.sceneId}/import-backups/${id}`,
      );
      download(pack, `island-physics-before-${id}.json`);
      if (alive.current)
        setMessage("已下载导入前备份，选择这个文件即可预览并恢复");
    } catch (e) {
      if (alive.current) setMessage((e as Error).message);
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function submit() {
    if (lock.current || !bundle) return;
    const request = pending ?? {
      connectionId: conn.you,
      commandId: crypto.randomUUID(),
      expectedRevision: conn.buffer.latest!.layoutRevision,
      bundle,
    };
    lock.current = true;
    setBusy(true);
    try {
      await transferRequest(key, request);
    } catch {
      lock.current = false;
      setBusy(false);
      setMessage("无法保留导入请求，尚未提交；请允许浏览器存储后重试");
      return;
    }
    setPending(request);
    setMessage("正在校验并替换布局…");
    try {
      const result = await api<{ revision: number; backupId: string }>(
        `/physics/scenes/${conn.sceneId}/import`,
        {
          method: "POST",
          body: JSON.stringify({ ...request, connectionId: conn.you }),
        },
      );
      await transferRequest(key, null);
      if (alive.current) {
        setPending(null);
        setBundle(null);
        setMessage(
          `导入已保存 · 布局版本 ${result.revision}，最近三次导入前备份可在下方下载。`,
        );
        setBackups(
          (
            await api<{ items: typeof backups }>(
              `/physics/scenes/${conn.sceneId}/import-backups`,
            )
          ).items,
        );
      }
    } catch (e) {
      if (
        e instanceof RequestError &&
        e.status >= 400 &&
        e.status < 500 &&
        ![408, 429].includes(e.status) &&
        !["IMPORT_BUSY", "CONNECTION_REQUIRED", "EDIT_LEASE_LOST"].includes(
          e.code,
        )
      ) {
        try {
          await transferRequest(key, null);
          if (alive.current) setPending(null);
        } catch {
          if (alive.current)
            setMessage("本机请求记录无法清理，请刷新后核对原请求");
          return;
        }
      }
      if (alive.current) setMessage((e as Error).message);
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const editable = conn.editing && !conn.editPending && !conn.editBusy;
  return (
    <>
      <div className="physics-actions">
        <button
          disabled={busy || conn.status !== "connected"}
          onClick={() => void exportCurrent()}
        >
          导出世界包
        </button>
        <button
          onClick={() => {
            clearKeys();
            setOpen(true);
          }}
        >
          导入与备份
        </button>
      </div>
      {!open && message && <p role="status">{message}</p>}
      {open && (
        <dialog
          ref={dialog}
          className="physics-content-dialog physics-transfer-dialog"
          aria-label="导入与备份"
          onCancel={(e) => {
            e.preventDefault();
            if (!busy) setOpen(false);
          }}
        >
          <div className="physics-content-header physics-editor-row">
            <h2>导入与备份</h2>
            <button disabled={busy} onClick={() => setOpen(false)}>
              关闭导入窗口
            </button>
          </div>
          <p>
            导入会替换当前房间的全部布局。购买家具需要你已拥有，并先从其他场景收起；作品和正文会保留指定版本。
          </p>
          <label>
            选择世界包
            <input
              aria-label="选择世界包"
              type="file"
              accept="application/json,.json"
              disabled={busy || !!pending || !ready}
              onChange={(e) => void choose(e.target.files?.[0])}
            />
          </label>
          {bundle && (
            <section aria-label="导入预览">
              <h3>{bundle.scene.name}</h3>
              <p>
                {bundle.scene.objects.length} 个物体 ·{" "}
                {
                  bundle.scene.definitions.filter(
                    (d) => d.source === "creation",
                  ).length
                }{" "}
                个作品版本 · {bundle.texts.length} 份正文版本 ·{" "}
                {
                  bundle.scene.objects.filter(
                    (o) =>
                      bundle.scene.definitions.find(
                        (d) =>
                          d.id === o.definitionId &&
                          d.version === o.definitionVersion,
                      )?.source === "shop",
                  ).length
                }{" "}
                件购买家具
              </p>
              <p>
                布局不能与场景中的人重叠，购买家具也不能重复占用。导入失败时保留原布局，成功时自动保留导入前备份。
              </p>
            </section>
          )}
          {!editable && <p>先关闭此窗口，进入「布置家园」后再确认导入。</p>}
          <button
            disabled={!ready || busy || !bundle || !editable}
            onClick={() => void submit()}
          >
            {pending ? "核对并重试导入" : "确认替换当前布局"}
          </button>
          {pending && (
            <p>上次结果尚未确认，请使用原请求重试；刷新后也能继续核对。</p>
          )}
          <p role="status">{message}</p>
          <h3>最近三次导入前备份</h3>
          <p>下载后可重新选择文件，预览并确认恢复。</p>
          {backups.map((b) => (
            <button
              key={b.commandId}
              disabled={busy}
              onClick={() => void restoreFile(b.commandId)}
            >
              下载版本 {b.revision} 导入前备份 ·{" "}
              {new Date(b.createdAt).toLocaleString()}
            </button>
          ))}
        </dialog>
      )}
    </>
  );
}
