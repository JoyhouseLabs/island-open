import { useCallback, useEffect, useRef, useState } from "react";
import {
  worldSchema,
  sameWorld,
  type SubSceneId,
  type WorldSnapshot,
  type WorldRecord,
  type User,
  type AuthConfig,
  type Lease,
  type SaveWorldRequest,
} from "@island/contracts";
import {
  createWorld,
  growWorld,
  placementError,
  subScenes,
  validatePlacement,
} from "@island/world-core";
import { api, RequestError } from "./api";
import { readDraft, writeDraft } from "./drafts";
import { emitGrowth } from "./progress/store";
type Draft = {
  snapshot: WorldSnapshot;
  baseRevision: number;
  dirty: boolean;
  pending?: SaveWorldRequest;
};
export type SyncStatus =
  "guest" | "synced" | "dirty" | "saving" | "offline" | "conflict" | "loading";
function device() {
  try {
    let id = sessionStorage.getItem("island-device");
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem("island-device", id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}
export type SceneScope = {
  parentId: string | null;
  seed: number;
  user: User | null;
  scene: SubSceneId;
  label: string;
};
export function useWorld(scope?: SceneScope) {
  const [snapshot, setSnapshot] = useState<WorldSnapshot>(() =>
    scope ? subScenes[scope.scene].create(scope.seed) : createWorld(),
  );
  const [ready, setReady] = useState(false),
    [loadError, setLoadError] = useState(""),
    [loadAttempt, setLoadAttempt] = useState(0);
  const [user, setUser] = useState<User | null>(null),
    [config, setConfig] = useState<AuthConfig | null>(null);
  const [record, setRecord] = useState<WorldRecord | null>(null),
    [status, setStatus] = useState<SyncStatus>("guest");
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [history, setHistory] = useState<WorldSnapshot[]>([]);
  const deviceId = useRef(device()),
    lease = useRef<Lease | null>(null),
    pending = useRef<SaveWorldRequest | undefined>(undefined),
    saving = useRef(false);
  const current = useRef({ snapshot, user, record, status });
  current.current = { snapshot, user, record, status };
  const notify = useCallback((text: string) => setMessage(text), []);
  const key = (u: User | null, r: WorldRecord | null) =>
    u && r
      ? `${u.id}:${r.id}`
      : scope
        ? `guest:${scope.scene}:${scope.seed}`
        : "guest";
  const persist = useCallback(
    async (
      w: WorldSnapshot,
      r: WorldRecord | null,
      u: User | null,
      dirty: boolean,
    ) => {
      try {
        await writeDraft(key(u, r), {
          snapshot: w,
          baseRevision: r?.revision ?? 0,
          dirty,
          pending: pending.current,
        } satisfies Draft);
      } catch {
        notify("浏览器无法保存本地草稿，请尽快同步或导出。");
      }
    },
    [notify],
  );
  const acquire = useCallback(async (r: WorldRecord, takeover = false) => {
    const l = await api<Lease>(`/worlds/${r.id}/lease`, {
      method: "POST",
      body: JSON.stringify({ deviceId: deviceId.current, takeover }),
    });
    lease.current = l;
    return l;
  }, []);
  const openWorld = useCallback(
    async (u: User, r: WorldRecord) => {
      setRecord(r);
      setHistory([]);
      pending.current = undefined;
      lease.current = null;
      let draft: Draft | undefined;
      try {
        draft = await readDraft<Draft>(key(u, r));
      } catch {
        notify("本地草稿暂不可用，已读取服务器存档。");
      }
      if (!draft && scope && r.revision === 1) {
        try {
          draft = await readDraft<Draft>(key(null, null));
          if (draft) draft = { ...draft, baseRevision: 1, pending: undefined };
        } catch {
          /* A missing guest draft does not prevent cloud loading. */
        }
      }
      if (draft && !worldSchema.safeParse(draft.snapshot).success)
        draft = undefined;
      if (draft?.pending) {
        try {
          const acknowledged = await api<WorldRecord>(`/worlds/${r.id}`, {
            method: "PUT",
            body: JSON.stringify(draft.pending),
          });
          draft = {
            ...draft,
            baseRevision: acknowledged.revision,
            pending: undefined,
            dirty: !sameWorld(draft.snapshot, acknowledged.snapshot),
          };
          r = await api<WorldRecord>(`/worlds/${r.id}`);
          setRecord(r);
        } catch {
          /* Keep an unacknowledged request available for retry or conflict recovery. */
        }
      }
      if (draft?.dirty && worldSchema.safeParse(draft.snapshot).success) {
        setSnapshot(draft.snapshot);
        pending.current = draft.pending;
        if (draft.baseRevision !== r.revision) {
          setStatus("conflict");
          notify(
            "发现尚未同步的本地草稿，云端版本也已更新。可以导出、另存或载入云端。",
          );
          return;
        }
        setStatus("dirty");
        notify("已恢复上次未同步的草稿。");
      } else {
        setSnapshot(r.snapshot);
        setStatus("synced");
      }
      try {
        await acquire(r);
      } catch (e) {
        setStatus("conflict");
        notify(e instanceof Error ? e.message : "暂未取得编辑权限。");
      }
    },
    [acquire, notify],
  );
  useEffect(() => {
    let cancelled = false;
    if (scope) {
      setReady(false);
      setLoadError("");
      (async () => {
        try {
          if (scope.user && scope.parentId) {
            const r = await api<WorldRecord>(
              `/worlds/${scope.parentId}/scenes/${scope.scene}`,
              { method: "POST", body: "{}" },
            );
            if (cancelled) return;
            setUser(scope.user);
            await openWorld(scope.user, r);
          } else {
            const d = await readDraft<Draft>(key(null, null));
            if (cancelled) return;
            if (
              d &&
              worldSchema.safeParse(d.snapshot).success &&
              d.snapshot.scene === scope.scene
            )
              setSnapshot(d.snapshot);
          }
          if (!cancelled) setReady(true);
        } catch (e) {
          if (!cancelled)
            setLoadError(
              e instanceof Error
                ? e.message
                : `${scope.label}加载失败，请重试。`,
            );
        }
      })();
      return () => {
        cancelled = true;
      };
    }
    api<AuthConfig>("/auth/config")
      .then((c) => {
        if (!cancelled) setConfig(c);
      })
      .catch(() => {
        if (!cancelled) notify("后端暂不可用，仍可离线探索和编辑。");
      });
    (async () => {
      try {
        const u = await api<User>("/auth/me");
        const worlds = await api<WorldRecord[]>("/worlds");
        if (cancelled) return;
        setUser(u);
        const r =
          worlds.find((w) => worldSchema.safeParse(w.snapshot).success) ??
          (await api<WorldRecord>("/worlds", {
            method: "POST",
            body: JSON.stringify({}),
          }));
        if (!cancelled) await openWorld(u, r);
      } catch (e) {
        if (cancelled) return;
        if (!(e instanceof RequestError && e.status === 401))
          notify("未连接到服务器，当前为本地体验。");
        try {
          const d = await readDraft<Draft>("guest");
          if (!cancelled && d && worldSchema.safeParse(d.snapshot).success)
            setSnapshot(d.snapshot);
        } catch {}
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    openWorld,
    notify,
    scope?.parentId,
    scope?.seed,
    scope?.scene,
    scope?.user?.id,
    loadAttempt,
  ]);
  const edit = useCallback(
    (update: (w: WorldSnapshot) => WorldSnapshot) => {
      const c = current.current;
      const next = update(c.snapshot);
      if (next === c.snapshot) return;
      setHistory((h) => [...h.slice(-24), c.snapshot]);
      setSnapshot(next);
      const nextStatus =
        c.status === "conflict" ? "conflict" : c.user ? "dirty" : "guest";
      setStatus(nextStatus);
      current.current = { ...c, snapshot: next, status: nextStatus };
      void persist(next, c.record, c.user, true);
    },
    [persist],
  );
  const save = useCallback(async () => {
    const c = current.current;
    if (!c.user || !c.record) {
      notify("本地草稿已保留。登录后可保存到服务器。");
      return;
    }
    if (saving.current || c.status === "conflict") return;
    saving.current = true;
    setStatus("saving");
    try {
      // Keep the exact request until acknowledgement, including across a lost response/reload.
      if (!pending.current) {
        const l =
          lease.current &&
          Date.parse(lease.current.expiresAt) > Date.now() + 5000
            ? lease.current
            : await acquire(c.record);
        pending.current = {
          baseRevision: c.record.revision,
          leaseToken: l.token,
          deviceId: deviceId.current,
          idempotencyKey: crypto.randomUUID(),
          snapshot: c.snapshot,
        };
      }
      const request = pending.current;
      await persist(current.current.snapshot, c.record, c.user, true);
      const saved = await api<WorldRecord>(`/worlds/${c.record.id}`, {
        method: "PUT",
        body: JSON.stringify(request),
      });
      pending.current = undefined;
      setRecord(saved);
      const stillDirty = !sameWorld(current.current.snapshot, saved.snapshot);
      setStatus(stillDirty ? "dirty" : "synced");
      current.current = {
        ...current.current,
        record: saved,
        status: stillDirty ? "dirty" : "synced",
      };
      await persist(current.current.snapshot, saved, c.user, stillDirty);
    } catch (e) {
      const conflict = e instanceof RequestError && e.status === 409;
      setStatus(conflict ? "conflict" : "offline");
      notify(e instanceof Error ? e.message : "连接中断，本地草稿已保留。");
    } finally {
      saving.current = false;
    }
  }, [acquire, notify, persist]);
  // Browser back/forward can leave a scene before its debounce timer fires.
  // The draft was already persisted; also try to finish the cloud save.
  useEffect(
    () => () => {
      const c = current.current;
      if (
        c.user &&
        c.record &&
        (c.status === "dirty" || c.status === "offline")
      )
        void save();
    },
    [save],
  );
  useEffect(() => {
    if (status !== "dirty") return;
    const timer = setTimeout(() => {
      void save();
    }, 2000);
    return () => clearTimeout(timer);
  }, [snapshot, status, save]);
  useEffect(() => {
    if (!user || !record) return;
    const timer = setInterval(() => {
      if (current.current.status === "conflict" || saving.current) return;
      void acquire(record).catch((e) => {
        if (e instanceof RequestError && e.status === 409) {
          setStatus("conflict");
          notify(e.message);
        }
      });
    }, 30000);
    return () => clearInterval(timer);
  }, [user, record?.id, acquire, notify]);
  useEffect(() => {
    const onOnline = () => {
      if (current.current.status === "offline") setStatus("dirty");
    };
    const onHidden = () => {
      if (document.visibilityState === "hidden") {
        const c = current.current;
        void persist(c.snapshot, c.record, c.user, c.status !== "synced");
      }
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onHidden);
    };
  }, [persist]);
  const login = async () => {
    setBusy(true);
    try {
      const u = await api<User>("/auth/development", {
        method: "POST",
        body: JSON.stringify({ name: "demo" }),
      });
      setUser(u);
      const list = await api<WorldRecord[]>("/worlds");
      let r = list.find((w) => worldSchema.safeParse(w.snapshot).success);
      if (!r) {
        const local = current.current.snapshot;
        r = await api<WorldRecord>("/worlds", {
          method: "POST",
          body: JSON.stringify({ name: local.name, seed: local.seed }),
        });
        const l = await acquire(r);
        r = await api<WorldRecord>(`/worlds/${r.id}`, {
          method: "PUT",
          body: JSON.stringify({
            snapshot: local,
            baseRevision: 1,
            leaseToken: l.token,
            deviceId: deviceId.current,
            idempotencyKey: crypto.randomUUID(),
          }),
        });
      }
      await openWorld(u, r);
      notify("已连接开发账号，存档使用真实 PostgreSQL。");
    } catch (e) {
      notify(e instanceof Error ? e.message : "连接失败。");
    } finally {
      setBusy(false);
    }
  };
  const reload = async () => {
    const c = current.current;
    if (!c.user || !c.record || saving.current) return;
    setBusy(true);
    try {
      const r = await api<WorldRecord>(`/worlds/${c.record.id}`);
      await acquire(r);
      await writeDraft(`${key(c.user, c.record)}:backup`, {
        snapshot: c.snapshot,
        baseRevision: c.record.revision,
        dirty: c.status !== "synced",
      } satisfies Draft);
      pending.current = undefined;
      await persist(r.snapshot, r, c.user, false);
      setRecord(r);
      setSnapshot(r.snapshot);
      setHistory([]);
      setStatus("synced");
      notify("已载入服务器版本。被替换的草稿可通过“导出载入前的备份”取回。");
    } catch (e) {
      notify(e instanceof Error ? e.message : "加载失败");
      setStatus("conflict");
    } finally {
      setBusy(false);
    }
  };
  const takeover = async () => {
    const c = current.current;
    if (!c.record) return;
    try {
      await acquire(c.record, true);
      pending.current = undefined;
      const latest = await api<WorldRecord>(`/worlds/${c.record.id}`);
      if (latest.revision !== c.record.revision) {
        notify("云端已有新版本，请先导出或另存本地草稿，再载入云端。");
        return;
      }
      setStatus("dirty");
      notify("已取得编辑权，正在同步本地修改。");
    } catch (e) {
      notify(e instanceof Error ? e.message : "接管失败");
    }
  };
  const fork = async () => {
    const c = current.current;
    if (!c.user || saving.current) return;
    setBusy(true);
    try {
      const r = await api<WorldRecord>("/worlds", {
        method: "POST",
        body: JSON.stringify({
          name: `${c.snapshot.name.slice(0, 34)} · 副本`,
          seed: c.snapshot.seed,
        }),
      });
      const l = await acquire(r);
      const copy = { ...c.snapshot, name: r.snapshot.name };
      const saved = await api<WorldRecord>(`/worlds/${r.id}`, {
        method: "PUT",
        body: JSON.stringify({
          snapshot: copy,
          baseRevision: 1,
          leaseToken: l.token,
          deviceId: deviceId.current,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      pending.current = undefined;
      setRecord(saved);
      setSnapshot(saved.snapshot);
      setStatus("synced");
      await persist(saved.snapshot, saved, c.user, false);
      notify("已将当前草稿另存为独立家园。");
    } catch (e) {
      notify(e instanceof Error ? e.message : "另存失败");
    } finally {
      setBusy(false);
    }
  };
  const undo = () => {
    const previous = history.at(-1);
    if (!previous) return;
    const c = current.current;
    current.current = {
      ...c,
      snapshot: previous,
      status: c.status === "conflict" ? "conflict" : c.user ? "dirty" : "guest",
    };
    setHistory((h) => h.slice(0, -1));
    setSnapshot(previous);
    setStatus(
      c.status === "conflict" ? "conflict" : c.user ? "dirty" : "guest",
    );
    void persist(previous, c.record, c.user, true);
  };
  const place = (x: number, z: number, kind: "tree" | "flower" | "bench") => {
    if (!ready) return;
    const rule = scope ? subScenes[scope.scene].placementError : placementError;
    const error = rule(
      { x, z },
      current.current.snapshot.entities,
      undefined,
      kind,
    );
    if (error) {
      notify(error);
      return;
    }
    if (current.current.snapshot.entities.length >= 800) {
      notify("这座岛已经很丰富了，先整理一些空间吧。");
      return;
    }
    edit((w) => ({
      ...w,
      entities: [
        ...w.entities,
        {
          id: crypto.randomUUID(),
          kind,
          x,
          z,
          seed: crypto.getRandomValues(new Uint32Array(1))[0]!,
          growth: kind === "tree" ? 0.32 : 1,
        },
      ],
    }));
    emitGrowth({ type: `${kind}.planted` });
    notify(
      kind === "tree"
        ? "种下一棵小树，让它慢慢长大。"
        : kind === "flower"
          ? "一簇小花，在这里安了家。"
          : "长椅放好了，在这里歇一会儿。",
    );
  };
  const download = (w: WorldSnapshot) => {
    const blob = new Blob([JSON.stringify(w, null, 2)], {
        type: "application/json",
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = w.scene === "island" ? "心灵家园.json" : `${w.name}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const exportWorld = () => download(current.current.snapshot);
  const exportBackup = async () => {
    const c = current.current;
    try {
      const backup = await readDraft<Draft>(`${key(c.user, c.record)}:backup`);
      if (!backup) {
        notify("此家园还没有载入前的备份。");
        return;
      }
      download(backup.snapshot);
    } catch {
      notify("未能读取备份。");
    }
  };
  const importWorld = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      notify("存档过大，请使用 2 MB 以内的家园文件。");
      return;
    }
    try {
      const w = worldSchema.parse(JSON.parse(await file.text()));
      if (w.scene !== snapshot.scene)
        throw new Error("请选择当前场景的存档，不同场景不能互相覆盖。");
      if ((record || scope) && w.seed !== snapshot.seed) {
        notify("此存档属于另一座岛，请先在独立家园中导入。");
        return;
      }
      const error = validatePlacement(w);
      if (error) throw new Error(error);
      edit(() => w);
      notify("已导入存档，等待同步。");
    } catch (e) {
      notify(
        e instanceof Error && e.message.length < 100
          ? e.message
          : "存档格式不正确，现有家园未改变。",
      );
    }
  };
  return {
    ready,
    loadError,
    retryLoad: () => setLoadAttempt((n) => n + 1),
    snapshot,
    user,
    config,
    record,
    status,
    message,
    notify,
    busy,
    history,
    login,
    save,
    reload,
    takeover,
    fork,
    edit,
    undo,
    place,
    exportWorld,
    exportBackup,
    importWorld,
    grow: () => {
      edit(growWorld);
      emitGrowth({ type: "plant.grown" });
      notify("植物又长大了一点，原来的位置保持不变。");
    },
  };
}
