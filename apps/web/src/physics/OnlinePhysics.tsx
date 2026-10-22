import { snapBlockPosition } from "@island/physics-core";
import PhysicsTransfer from "./PhysicsTransfer";
import PhysicsContent from "./PhysicsContent";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import type { AuthConfig, User } from "@island/contracts";
import { api, RequestError } from "../api";
import { PhysicsConnection } from "./PhysicsConnection";
import PhysicsEditor, { bottomOf, type PhysicsDraft } from "./PhysicsEditor";
import OnlineScene from "./OnlineScene";
import "./physics.css";

interface World {
  id: string;
  name: string;
  owner: boolean;
  sharing: "private" | "link";
  interactive: boolean;
  accessRevision: number;
  shareToken?: string | null;
  scenes: Array<{ id: string; key: string; revision: number }>;
}
export default function OnlinePhysics() {
  const { worldId } = useParams(),
    location = useLocation(),
    navigate = useNavigate();
  const token = new URLSearchParams(location.search).get("t");
  const [ready, setReady] = useState(false),
    [enabled, setEnabled] = useState(false),
    [auth, setAuth] = useState<AuthConfig | null>(null),
    [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [name, setName] = useState("旅人"),
    [world, setWorld] = useState<World | null>(null),
    [items, setItems] = useState<Array<{ id: string; name: string }>>([]);
  const [conn, setConn] = useState<PhysicsConnection | null>(null),
    [, update] = useState(0),
    [selected, select] = useState<string | null>(null);
  const [night, setNight] = useState(false);
  const [draft, setDraft] = useState<PhysicsDraft | null>(null);
  const keys = useMemo(() => new Set<string>(), []);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      api<{ enabled: boolean }>("/physics/config"),
      api<AuthConfig>("/auth/config"),
      api<User>("/auth/me").catch((e) => {
        if (e instanceof RequestError && e.status === 401) return null;
        throw e;
      }),
    ])
      .then(([caps, config, account]) => {
        if (!cancelled) {
          setEnabled(caps.enabled);
          setAuth(config);
          setUser(account);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    setWorld(null);
    setDraft(null);
    select(null);
    setError("");
    if (!user || !enabled) return;
    let cancelled = false;
    const request = worldId
      ? api<World>(
          `/physics/worlds/${worldId}${token ? `?t=${encodeURIComponent(token)}` : ""}`,
        ).then((value) => {
          if (!cancelled) setWorld(value);
        })
      : api<{ items: Array<{ id: string; name: string }> }>(
          "/physics/worlds",
        ).then((value) => {
          if (!cancelled) setItems(value.items);
        });
    void request.catch((e) => {
      if (!cancelled) setError(e.message);
    });
    return () => {
      cancelled = true;
    };
  }, [user, enabled, worldId, token]);
  const sceneId = world?.scenes[0]?.id;
  useEffect(() => {
    if (!sceneId || !user) {
      setConn(null);
      return;
    }
    let alive = true;
    const connection = new PhysicsConnection(sceneId, token, () => {
      if (alive) update((value) => value + 1);
    });
    setConn(connection);
    return () => {
      alive = false;
      keys.clear();
      connection.dispose();
    };
  }, [sceneId, token, user?.id, keys]);
  async function login(development: boolean) {
    setBusy(true);
    setError("");
    try {
      setUser(
        await api<User>(development ? "/auth/development" : "/auth/guest", {
          method: "POST",
          body: JSON.stringify({ name: development ? "demo" : name }),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function create() {
    setBusy(true);
    setError("");
    try {
      const value = await api<World>("/physics/worlds", {
        method: "POST",
        body: JSON.stringify({ id: crypto.randomUUID(), name: "我的物理世界" }),
      });
      navigate(`/physics/online/${value.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function sharing(sharing: "private" | "link", interactive: boolean) {
    if (!world) return;
    const previous = world;
    setBusy(true);
    setError("");
    setWorld({ ...world, sharing, interactive });
    try {
      setWorld(
        await api<World>(`/physics/worlds/${world.id}/sharing`, {
          method: "PUT",
          body: JSON.stringify({
            expectedRevision: world.accessRevision,
            sharing,
            interactive,
          }),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
      try {
        setWorld(await api<World>(`/physics/worlds/${previous.id}`));
      } catch {
        setWorld(previous);
      }
    } finally {
      setBusy(false);
    }
  }
  const shareUrl = world?.shareToken
    ? `${window.location.origin}/physics/online/${world.id}?t=${world.shareToken}`
    : "";
  const connected = conn?.status === "connected",
    canInteract = connected && !conn?.editing && !!conn?.me?.canInteract;
  return (
    <main
      className={`physics-playground ${conn?.scene ? "" : "physics-lobby"}`}
    >
      <header className="physics-header">
        <Link to="/physics/online">← 我的世界</Link>
        <div>
          <h1>{world?.name ?? "在线物理世界"}</h1>
          <p>一起布置、搬动和探索</p>
        </div>
        <Link to="/physics">本地试验</Link>
      </header>
      {!ready ? (
        <p role="status">正在读取账号…</p>
      ) : !enabled ? (
        <section className="physics-login">
          <h2>在线世界尚未开放</h2>
          <Link to="/physics">先去本地游乐场</Link>
        </section>
      ) : !user ? (
        <section className="physics-login">
          <h2>登录后进入世界</h2>
          <p>世界会保存到账号；参观也需要一个名字。</p>
          {auth?.joyhouse && (
            <a
              href={`/api/auth/joyhouse/start?returnTo=${encodeURIComponent(location.pathname + location.search)}`}
            >
              微信登录并返回
            </a>
          )}
          {auth?.development && (
            <button disabled={busy} onClick={() => void login(true)}>
              本地开发账号登录
            </button>
          )}
          <label>
            你的名字
            <input
              value={name}
              maxLength={12}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button
            disabled={busy || !name.trim()}
            onClick={() => void login(false)}
          >
            以访客身份进入
          </button>
        </section>
      ) : !worldId ? (
        <section className="physics-login">
          <h2>我的新世界</h2>
          <p>新世界使用在线物理规则，每五秒保存一次，离开时补存。</p>
          <button disabled={busy} onClick={() => void create()}>
            创建物理世界
          </button>
          {items.map((item) => (
            <Link key={item.id} to={`/physics/online/${item.id}`}>
              {item.name} →
            </Link>
          ))}
        </section>
      ) : conn?.scene ? (
        <>
          <section className="physics-viewport">
            <OnlineScene
              night={night}
              conn={conn}
              keys={keys}
              selected={selected}
              select={select}
              draft={conn.editing ? draft : null}
              placeAt={(point, normal) => {
                if (!draft || !conn.editing || conn.editPending) return;
                setDraft({
                  ...draft,
                  object: {
                    ...draft.object,
                    position:
                      draft.definition.id === "core:block"
                        ? snapBlockPosition(point, normal)
                        : {
                            x: Math.round(point.x * 4) / 4,
                            y:
                              Math.round(
                                (point.y - bottomOf(draft.definition)) * 4,
                              ) / 4,
                            z: Math.round(point.z * 4) / 4,
                          },
                  },
                });
              }}
            />
            <div className="physics-hint">
              {conn.editing
                ? "布置中 · 点击场景定位 · 确认后保存"
                : "方向键/按钮移动 · 点选物品 · E 拿起或放下"}
            </div>
          </section>
          <section className="physics-controls">
            <label>
              <input
                type="checkbox"
                checked={night}
                onChange={(e) => setNight(e.target.checked)}
              />
              夜晚预览（仅自己）
            </label>
            <div>
              <strong data-testid="physics-online-status">
                {connected
                  ? `在线 · ${conn.buffer.latest?.players.length ?? 0} 人`
                  : "连接中断"}
              </strong>
              <p role="status">{conn.message}</p>
              <p data-testid="physics-save-status">{conn.saved}</p>
            </div>
            {world?.owner && (
              <PhysicsEditor
                key={`${user.id}:${conn.sceneId}`}
                user={user}
                conn={conn}
                selected={selected}
                draft={draft}
                setDraft={setDraft}
                clearKeys={() => keys.clear()}
              />
            )}
            {world?.owner && (
              <PhysicsTransfer
                key={`${user.id}:${conn.sceneId}`}
                conn={conn}
                userId={user.id}
                clearKeys={() => keys.clear()}
              />
            )}
            <PhysicsContent
              key={`${user.id}:${conn.sceneId}`}
              conn={conn}
              selected={selected}
              userId={user.id}
              owner={!!world?.owner}
              token={token}
              clearKeys={() => keys.clear()}
            />
            <label className="physics-select">
              观察物品
              <select
                aria-label="观察物品"
                value={selected ?? ""}
                onChange={(e) => select(e.target.value || null)}
              >
                <option value="">选择物品</option>
                {conn.scene.objects
                  .filter(
                    (object) =>
                      conn.editing ||
                      conn
                        .scene!.definitions.find(
                          (d) => d.id === object.definitionId,
                        )
                        ?.abilities.some(
                          (a) => a === "grabbable" || a === "content",
                        ),
                  )
                  .map((object) => (
                    <option key={object.id} value={object.id}>
                      {
                        conn.scene!.definitions.find(
                          (d) => d.id === object.definitionId,
                        )?.name
                      }
                    </option>
                  ))}
              </select>
            </label>
            <div className="physics-actions">
              <button
                disabled={!canInteract || conn.pending || !!conn.me?.held}
                onClick={() => conn.action("push", selected)}
              >
                轻推一下
              </button>
              <button
                disabled={
                  !canInteract ||
                  conn.pending ||
                  (!!conn.me?.held && !conn.me.dropPreview?.valid)
                }
                onClick={() =>
                  conn.action(conn.me?.held ? "drop" : "grab", selected)
                }
              >
                {conn.me?.held ? "放下" : "拿起"}
              </button>
              <button
                disabled={!canInteract || conn.pending || !conn.me?.held}
                onClick={() => conn.action("toss", null)}
              >
                轻抛
              </button>
              {world?.owner && (
                <button disabled={!connected} onClick={() => conn.save()}>
                  保存世界
                </button>
              )}
              {!connected && (
                <button onClick={() => conn.connect()}>重新连接</button>
              )}
            </div>
            {!canInteract && connected && !conn.editing && (
              <p>当前仅参观，岛主可在分享设置中开放物品互动。</p>
            )}
            {conn.me?.held && <p>{conn.me.dropPreview?.reason}</p>}
            <div className="physics-movement">
              {[
                ["向左", "a"],
                ["向前", "w"],
                ["向后", "s"],
                ["向右", "d"],
                ["跳跃", " "],
              ].map(([label, key]) => (
                <button
                  key={key}
                  disabled={!connected || conn.editing}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    keys.add(key!);
                    if (key !== " ") conn.markMovement();
                  }}
                  onPointerUp={() => keys.delete(key!)}
                  onPointerCancel={() => keys.delete(key!)}
                  onLostPointerCapture={() => keys.delete(key!)}
                >
                  {label}
                </button>
              ))}
            </div>
            {world?.owner && (
              <details className="physics-share">
                <summary>分享与互动</summary>
                <label>
                  <input
                    type="checkbox"
                    checked={world.sharing === "link"}
                    disabled={busy}
                    onChange={(e) =>
                      void sharing(e.target.checked ? "link" : "private", false)
                    }
                  />
                  开放参观
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={world.interactive}
                    disabled={busy || world.sharing !== "link"}
                    onChange={(e) => void sharing("link", e.target.checked)}
                  />
                  允许物品互动
                </label>
                {shareUrl && (
                  <label>
                    参观链接
                    <input
                      aria-label="参观链接"
                      readOnly
                      value={shareUrl}
                      onFocus={(e) => e.target.select()}
                    />
                  </label>
                )}
              </details>
            )}
            <details>
              <summary>连接状态</summary>
              <output data-testid="physics-online-state">
                {JSON.stringify({
                  inputVisibleMs: conn.inputVisibleMs,
                  maxCorrectionMeters: conn.maxCorrectionMeters,
                  lastVisibleActionMs: conn.lastVisibleActionMs,
                  lastActionMs: conn.lastActionMs,
                  correction: conn.prediction?.lastCorrection,
                  you: conn.you,
                  scene: conn.scene,
                  lease: conn.lease,
                  frame: conn.buffer.latest,
                  predicted: conn.prediction?.player.snapshot(),
                  blocks: conn.prediction?.runtime.blockStats,
                })}
              </output>
            </details>
          </section>
        </>
      ) : conn?.status === "disconnected" ? (
        <section className="physics-login">
          <p role="status">{conn.message}</p>
          <button onClick={() => conn.connect()}>重新连接</button>
          <button onClick={() => setUser(null)}>重新登录</button>
        </section>
      ) : (
        <p role="status">{error ? "无法进入世界" : "正在连接世界…"}</p>
      )}
      {error && (
        <p role="alert" className="physics-error">
          {error}
        </p>
      )}
    </main>
  );
}
