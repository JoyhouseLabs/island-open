import PublishedPlaces from "./PublishedPlaces";
import PhysicsLogin from "./PhysicsLogin";
import { homePath, visitPath, type PhysicsEntry } from "./routes";
import DinosaurGuide, { type DinosaurFocus } from "./DinosaurGuide";
import { dinosaurHabitats } from "@island/world-core";
import { physicalThemeSpecs } from "@island/world-core";
import PhysicsMechanisms from "./PhysicsMechanisms";
import { snapBlockPosition } from "@island/physics-core";
import PhysicsTransfer from "./PhysicsTransfer";
import PhysicsContent from "./PhysicsContent";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useBlocker,
  type To,
} from "react-router";
import type { AuthConfig, User } from "@island/contracts";
import { api, RequestError } from "../api";
import { PhysicsConnection } from "./PhysicsConnection";
import PhysicsEditor, { bottomOf, type PhysicsDraft } from "./PhysicsEditor";
import OnlineScene from "./OnlineScene";
import "./physics.css";
import { IslandConfigProvider } from "../contentStore";
import { rememberReturn } from "../learning/travel";
const PhysicsDressing = lazy(() => import("./PhysicsDressing"));
const Bookshelf = lazy(() => import("../Bookshelf"));

interface World {
  id: string;
  name: string;
  owner: boolean;
  sharing: "private" | "link";
  interactive: boolean;
  accessRevision: number;
  shareToken?: string | null;
  scenes: Array<{ id: string; key: string; name: string; revision: number }>;
}
export default function OnlinePhysics({
  entry,
  scene,
}: { entry?: PhysicsEntry; scene?: string } = {}) {
  const route = useParams(),
    location = useLocation(),
    navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const worldId =
    entry === "home" ? (params.get("world") ?? undefined) : route.worldId;
  const token = params.get("t");
  const sceneKey =
    scene ??
    (entry === "visit"
      ? (route.scene ?? "island")
      : (params.get("scene") ?? "playground"));
  const [sceneChoices, setSceneChoices] = useState<
    Array<{ key: string; name: string; description: string }>
  >([]);
  const [ready, setReady] = useState(false),
    [enabled, setEnabled] = useState(false),
    [auth, setAuth] = useState<AuthConfig | null>(null),
    [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [world, setWorld] = useState<World | null>(null),
    [items, setItems] = useState<Array<{ id: string; name: string }>>([]);
  const [conn, setConn] = useState<PhysicsConnection | null>(null),
    [, update] = useState(0),
    [selected, select] = useState<string | null>(null);
  const [reading, setReading] = useState<null | "books" | "tutor">(null);
  const [dinosaurFocus, setDinosaurFocus] = useState<DinosaurFocus | null>(
    null,
  );
  const [dressing, setDressing] = useState(false);
  const overlayOpen = !!reading || dinosaurFocus !== null || dressing;
  const [learningEnabled, setLearningEnabled] = useState(false);
  const [night, setNight] = useState(false);
  const [draft, setDraft] = useState<PhysicsDraft | null>(null);
  const keys = useMemo(() => new Set<string>(), []);
  const sceneNav = useRef<HTMLElement>(null);
  const inspectDinosaur = (id: DinosaurFocus) => {
    keys.clear();
    window.scrollTo({ top: 0 });
    setDinosaurFocus(id);
  };
  useEffect(() => {
    const nav = sceneNav.current;
    const current = nav?.querySelector<HTMLButtonElement>(
      'button[aria-current="page"]',
    );
    if (nav && current && nav.scrollWidth > nav.clientWidth)
      nav.scrollLeft = current.offsetLeft - nav.offsetLeft - 12;
  }, [sceneKey, sceneChoices, world?.id]);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      api<{
        enabled: boolean;
        scenes: Array<{ key: string; name: string; description: string }>;
      }>("/physics/config"),
      api<AuthConfig>("/auth/config"),
      api<User>("/auth/me").catch((e) => {
        if (e instanceof RequestError && e.status === 401) return null;
        throw e;
      }),
      api<{ features?: { learning?: boolean } }>("/capabilities"),
    ])
      .then(([caps, config, account, features]) => {
        if (!cancelled) {
          setEnabled(caps.enabled);
          setSceneChoices(caps.scenes);
          setAuth(config);
          setUser(account);
          setLearningEnabled(!!features.features?.learning);
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
    const request =
      entry === "home"
        ? api<World>("/physics/home", {
            method: "POST",
            body: JSON.stringify(worldId ? { worldId } : {}),
          }).then(async (value) => {
            if (cancelled) return;
            if (!worldId) {
              navigate(homePath(value.id, sceneKey), { replace: true });
              return;
            }
            if (!value.scenes.some((s) => s.key === sceneKey))
              value = await api<World>(
                `/physics/worlds/${value.id}/scenes/${encodeURIComponent(sceneKey)}`,
                { method: "POST", body: "{}" },
              );
            if (!cancelled) setWorld(value);
          })
        : worldId
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
  }, [
    user,
    enabled,
    worldId,
    token,
    entry,
    entry === "home" ? sceneKey : null,
  ]);
  const permitted = useRef(false);
  const go = (to: To) => {
    permitted.current = true;
    navigate(to);
  };
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (permitted.current) {
      permitted.current = false;
      return false;
    }
    return (
      !!world?.owner &&
      !!conn?.scene &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search)
    );
  });
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (
      !conn ||
      busy ||
      conn.editing ||
      conn.editPending ||
      conn.pending ||
      overlayOpen
    ) {
      setError("请先完成当前操作，再离开场景");
      blocker.reset();
      return;
    }
    let active = true;
    keys.clear();
    setError("");
    setBusy(true);
    void (async () => {
      await conn.saveBeforeLeave();
      if (active) blocker.proceed();
    })()
      .catch((e) => {
        if (active) {
          setError(e.message);
          blocker.reset();
        }
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [blocker, conn]);
  const switchGeneration = useRef(0);
  useEffect(() => {
    setBusy(false);
    return () => {
      switchGeneration.current++;
    };
  }, [location.key]);
  const sceneId = world?.scenes.find((s) => s.key === sceneKey)?.id;
  useEffect(() => {
    setDraft(null);
    select(null);
    setNight(false);
    setReading(null);
    setDinosaurFocus(null);
    setDressing(false);
    keys.clear();
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
  async function switchScene(key: string) {
    if (!world || busy || conn?.editing || conn?.editPending || conn?.pending)
      return;
    const generation = ++switchGeneration.current;
    setBusy(true);
    setError("");
    keys.clear();
    try {
      if (world.owner && conn?.scene) await conn.saveBeforeLeave();
      if (generation !== switchGeneration.current) return;
      if (!world.scenes.some((s) => s.key === key)) {
        if (!world.owner) throw new Error("岛主尚未开辟这个场景");
        const opened = await api<World>(
          `/physics/worlds/${world.id}/scenes/${encodeURIComponent(key)}`,
          { method: "POST", body: JSON.stringify({}) },
        );
        if (generation !== switchGeneration.current) return;
        setWorld(opened);
      }
      const next = new URLSearchParams(location.search);
      next.set("scene", key);
      go(
        entry === "home"
          ? homePath(world.id, key)
          : entry === "visit"
            ? visitPath(world.id, key, token)
            : { pathname: location.pathname, search: next.toString() },
      );
    } catch (e) {
      if (generation === switchGeneration.current)
        setError((e as Error).message);
    } finally {
      if (generation === switchGeneration.current) setBusy(false);
    }
  }
  function openReading(mode: "books" | "tutor") {
    if (busy || conn?.editing || conn?.editPending || conn?.pending) return;
    keys.clear();
    setReading(mode);
  }
  async function visitActivity(path: string) {
    if (
      !world?.owner ||
      !conn?.scene ||
      busy ||
      conn.editing ||
      conn.editPending ||
      conn.pending
    )
      return;
    const generation = ++switchGeneration.current;
    setBusy(true);
    setError("");
    keys.clear();
    try {
      await conn.saveBeforeLeave();
      if (generation === switchGeneration.current) go(path);
    } catch (e) {
      if (generation === switchGeneration.current)
        setError((e as Error).message);
    } finally {
      if (generation === switchGeneration.current) setBusy(false);
    }
  }
  function exploreWilderness() {
    if (world)
      return visitActivity(
        `/dinosaur/explore?world=${encodeURIComponent(world.id)}`,
      );
  }
  async function visitLearning() {
    if (
      !world?.owner ||
      !user ||
      !conn?.scene ||
      busy ||
      conn.editing ||
      conn.editPending ||
      conn.pending
    )
      return;
    const generation = ++switchGeneration.current;
    keys.clear();
    setBusy(true);
    setError("");
    try {
      await conn.saveBeforeLeave();
      if (generation !== switchGeneration.current) return;
      rememberReturn(
        {
          destination: entry ? "physics-home" : "physics",
          worldId: world.id,
          scene: "library",
          position: null,
        },
        user.id,
      );
      go("/learn");
    } catch (e) {
      if (generation === switchGeneration.current)
        setError((e as Error).message);
    } finally {
      if (generation === switchGeneration.current) setBusy(false);
    }
  }
  async function login(development: boolean, name: string) {
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
  async function logout() {
    if (
      busy ||
      conn?.editing ||
      conn?.editPending ||
      conn?.pending ||
      overlayOpen
    )
      return;
    setBusy(true);
    setError("");
    keys.clear();
    try {
      if (world?.owner && conn?.status === "connected")
        await conn.saveBeforeLeave();
      await api("/auth/logout", { method: "POST", body: "{}" });
      setUser(null);
      setWorld(null);
      setItems([]);
      if (entry === "home") go("/island");
      else if (!entry && worldId) go("/physics/online");
    } catch (e) {
      setError(e instanceof Error ? e.message : "退出失败，请重试");
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
        body: JSON.stringify({
          id: crypto.randomUUID(),
          name: entry ? "我的家园" : "我的物理世界",
        }),
      });
      navigate(entry ? homePath(value.id) : `/physics/online/${value.id}`);
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
    ? `${window.location.origin}${entry ? visitPath(world.id, sceneKey, world.shareToken) : `/physics/online/${world.id}?t=${world.shareToken}&scene=${encodeURIComponent(sceneKey)}`}`
    : "";
  const connected = conn?.status === "connected",
    canInteract = connected && !conn?.editing && !!conn?.me?.canInteract;
  return (
    <main
      className={`physics-playground ${world ? "physics-has-scenes" : ""} ${conn?.scene ? "" : "physics-lobby"}`}
    >
      <header className="physics-header" inert={busy || overlayOpen}>
        <Link to={entry ? "/worlds" : "/physics/online"}>← 我的世界</Link>
        <div>
          <h1>{world?.name ?? (entry ? "我的家园" : "在线物理世界")}</h1>
          <p>{conn?.scene?.name ?? "一起布置、搬动和探索"}</p>
        </div>
        {entry ? (
          <Link to="/island">回我的岛</Link>
        ) : (
          <Link to="/physics">本地试验</Link>
        )}
        {user && (
          <button
            className="physics-sound"
            disabled={
              busy || !!conn?.editing || !!conn?.editPending || !!conn?.pending
            }
            onClick={() => void logout()}
          >
            退出登录
          </button>
        )}
      </header>
      {world && (
        <nav
          ref={sceneNav}
          className="physics-actions physics-scene-nav"
          aria-label="切换场景"
          inert={overlayOpen}
        >
          {sceneChoices
            .filter(
              (s) => world.owner || world.scenes.some((v) => v.key === s.key),
            )
            .map((s) => (
              <button
                key={s.key}
                aria-current={s.key === sceneKey ? "page" : undefined}
                disabled={
                  busy ||
                  (s.key === sceneKey && !!sceneId) ||
                  !!conn?.editing ||
                  !!conn?.editPending ||
                  !!conn?.pending
                }
                title={s.description}
                onClick={() => void switchScene(s.key)}
              >
                {s.name}
                {world.scenes.some((v) => v.key === s.key) ? "" : " · 开辟"}
              </button>
            ))}
          {conn?.editing && <span>完成布置后可切换场景</span>}
        </nav>
      )}
      {!ready ? (
        <p role="status">正在读取账号…</p>
      ) : !enabled ? (
        <section className="physics-login">
          <h2>在线世界尚未开放</h2>
          <Link to="/physics">先去本地游乐场</Link>
        </section>
      ) : !user ? (
        <PhysicsLogin auth={auth} busy={busy} login={login} />
      ) : !worldId && entry === "home" ? (
        <p role="status">正在准备你的家园…</p>
      ) : !worldId ? (
        <section className="physics-login">
          <h2>我的新世界</h2>
          <p>新世界使用在线物理规则，每五秒保存一次，离开时补存。</p>
          <button disabled={busy} onClick={() => void create()}>
            {entry ? "创建新家园" : "创建物理世界"}
          </button>
          {items.map((item) => (
            <Link
              key={item.id}
              to={entry ? homePath(item.id) : `/physics/online/${item.id}`}
            >
              {item.name} →
            </Link>
          ))}
        </section>
      ) : conn?.scene ? (
        <>
          <section className="physics-viewport" inert={overlayOpen}>
            <OnlineScene
              dinosaurFocus={dinosaurFocus}
              inspectDinosaur={inspectDinosaur}
              paused={busy || overlayOpen}
              night={night}
              conn={conn}
              keys={keys}
              selected={selected}
              select={(id) => {
                select(id);
                const object = conn.scene?.objects.find((o) => o.id === id);
                if (
                  !conn.editing &&
                  conn.scene?.template.id === "core:dinosaur"
                ) {
                  const habitat = dinosaurHabitats.find(
                    (h) => object?.infrastructureKey === `habitat-${h.id}`,
                  );
                  if (
                    habitat ||
                    object?.infrastructureKey?.startsWith("nest-")
                  ) {
                    inspectDinosaur(habitat?.id ?? "nest");
                  }
                }
                if (
                  !conn.editing &&
                  conn.scene?.template.id === "core:library" &&
                  object?.infrastructureKey?.startsWith("shelf-")
                )
                  openReading("books");
              }}
              draft={conn.editing ? draft : null}
              placeAt={(point, normal) => {
                if (!draft || draft.growth || !conn.editing || conn.editPending)
                  return;
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
                : "方向键/按钮移动 · E 搬动或坐下 · F 坐下/起身"}
            </div>
          </section>
          <section className="physics-controls" inert={busy || overlayOpen}>
            <button
              className="physics-sound"
              onClick={() => {
                keys.clear();
                setDressing(true);
              }}
            >
              我的形象
            </button>
            {conn.scene.template.id === "core:dinosaur" && (
              <section
                className="physics-library-activities"
                aria-label="公园活动"
              >
                <button
                  disabled={conn.editing}
                  onClick={() => inspectDinosaur("all")}
                >
                  公园导览 · 四处发现
                </button>
                {world?.owner && (
                  <button
                    disabled={
                      busy ||
                      conn.editing ||
                      !!conn.editPending ||
                      !!conn.pending
                    }
                    onClick={() => void exploreWilderness()}
                  >
                    探索外围
                  </button>
                )}
                <span>也可以点击园区标牌、蛋巢或动物，打开观察介绍。</span>
              </section>
            )}
            {physicalThemeSpecs.some(
              (s) => `core:${s.key}` === conn.scene!.template.id,
            ) && (
              <section
                className="physics-library-activities"
                aria-label="场景活动"
              >
                <strong>{conn.scene.name}</strong>
                <span>
                  {
                    physicalThemeSpecs.find(
                      (s) => `core:${s.key}` === conn.scene!.template.id,
                    )!.description
                  }
                </span>
                <small>
                  {conn.scene.template.id === "core:lab"
                    ? "靠近并选中样品瓶，试试拿起、放下和轻抛；也可以沿踏步走上实验台。"
                    : conn.scene.template.id === "core:mountain"
                      ? "沿浅色小径上山，从观景台北侧的栏杆开口登台；山脚有长椅可休息。"
                      : "用方向键或按钮探索，选中座位后可以坐下休息；在布置家园中继续创作。"}
                </small>
              </section>
            )}
            {["core:garden", "core:nursery"].includes(
              conn.scene.template.id,
            ) && (
              <section
                className="physics-library-activities"
                aria-label="种植活动"
              >
                <strong>培育自己的小花园</strong>
                <span>在「布置家园」选择橡树或雏菊，点击地面或苗床种下。</span>
                <small>
                  选中植物后可预览生长。周围空间足够时，确认进入下一阶段；成熟后仍可移动或收起。
                </small>
              </section>
            )}
            {world?.owner && (
              <section
                className="physics-library-activities"
                aria-label="阅读与创作"
              >
                <button
                  disabled={
                    busy ||
                    !connected ||
                    !!conn.editing ||
                    !!conn.editPending ||
                    !!conn.pending
                  }
                  onClick={() =>
                    void visitActivity(
                      `/books?${new URLSearchParams({ world: world.id, scene: sceneKey })}`,
                    )
                  }
                >
                  共读书架
                </button>
                <button
                  disabled={
                    busy ||
                    !connected ||
                    !!conn.editing ||
                    !!conn.editPending ||
                    !!conn.pending
                  }
                  onClick={() =>
                    void visitActivity(
                      `/studio?${new URLSearchParams({ world: world.id, scene: sceneKey })}`,
                    )
                  }
                >
                  AI 工坊
                </button>
              </section>
            )}
            {world?.owner && user && (
              <PublishedPlaces
                key={user.id}
                disabled={
                  busy ||
                  !connected ||
                  !!conn.editing ||
                  !!conn.editPending ||
                  !!conn.pending
                }
                visit={(id) =>
                  void visitActivity(
                    `/place/${encodeURIComponent(id)}?${new URLSearchParams({ world: world.id, scene: sceneKey })}`,
                  )
                }
              />
            )}
            {conn.scene.template.id === "core:library" && (
              <section
                className="physics-library-activities"
                aria-label="书屋活动"
              >
                <strong>在书屋做些什么</strong>
                <div className="physics-actions">
                  <button
                    disabled={
                      !!conn.editing || !!conn.editPending || !!conn.pending
                    }
                    onClick={() => openReading("books")}
                  >
                    读书
                  </button>
                  <button
                    disabled={
                      !!conn.editing || !!conn.editPending || !!conn.pending
                    }
                    onClick={() => openReading("tutor")}
                  >
                    小墨老师
                  </button>
                  {learningEnabled && world?.owner && (
                    <button
                      disabled={
                        !connected ||
                        !!conn.editing ||
                        !!conn.editPending ||
                        !!conn.pending
                      }
                      onClick={() => void visitLearning()}
                    >
                      学习中心
                    </button>
                  )}
                </div>
                <small>阅读自己的书架；桌边读本可以拿起，坐垫可以坐下。</small>
              </section>
            )}
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
                key={`editor:${user.id}:${conn.sceneId}`}
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
                key={`transfer:${user.id}:${conn.sceneId}`}
                conn={conn}
                userId={user.id}
                clearKeys={() => keys.clear()}
              />
            )}
            <PhysicsContent
              key={`content:${user.id}:${conn.sceneId}`}
              conn={conn}
              selected={selected}
              userId={user.id}
              owner={!!world?.owner}
              token={token}
              clearKeys={() => keys.clear()}
            />
            <PhysicsMechanisms
              key={conn.sceneId}
              conn={conn}
              owner={!!world?.owner}
              selected={selected}
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
                          (a) =>
                            a === "grabbable" ||
                            a === "content" ||
                            a === "seat" ||
                            a === "switch" ||
                            a === "pressure" ||
                            a === "door" ||
                            a === "light" ||
                            a === "grow",
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
              {conn.scene.objects.some(
                (o) =>
                  o.id === selected &&
                  conn.scene!.definitions.some(
                    (d) =>
                      d.id === o.definitionId &&
                      d.version === o.definitionVersion &&
                      d.behavior?.kind === "switch",
                  ),
              ) && (
                <button
                  disabled={
                    !canInteract ||
                    conn.pending ||
                    !!conn.me?.held ||
                    !!conn.me?.seatId
                  }
                  onClick={() => conn.action("toggle", selected)}
                >
                  拨动开关
                </button>
              )}
              <button
                disabled={
                  !connected ||
                  conn.pending ||
                  conn.editing ||
                  (!conn.me?.seatId && (!canInteract || !!conn.me?.held))
                }
                onClick={() =>
                  conn.action(conn.me?.seatId ? "stand" : "sit", selected)
                }
              >
                {conn.me?.seatId ? "起身" : "坐下"}
              </button>
              {conn.me?.seatId && <span>正在坐着 · 起身后可移动</span>}

              <button
                disabled={
                  !canInteract ||
                  conn.pending ||
                  !!conn.me?.held ||
                  !!conn.me?.seatId
                }
                onClick={() => conn.action("push", selected)}
              >
                轻推一下
              </button>
              <button
                disabled={
                  !canInteract ||
                  !!conn.me?.seatId ||
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
                  disabled={!connected || conn.editing || !!conn.me?.seatId}
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
        <p role="status">
          {error
            ? "无法进入世界"
            : world && !sceneId
              ? "这个场景尚未开辟或未开放，请选择上方场景"
              : "正在连接世界…"}
        </p>
      )}
      {dressing && user && (
        <Suspense
          fallback={
            <div className="modal-backdrop" role="status">
              正在打开装扮小屋…
            </div>
          }
        >
          <PhysicsDressing
            key={user.id}
            close={() => {
              keys.clear();
              setDressing(false);
            }}
          />
        </Suspense>
      )}
      {dinosaurFocus !== null && (
        <DinosaurGuide
          focus={dinosaurFocus}
          choose={setDinosaurFocus}
          close={() => {
            keys.clear();
            setDinosaurFocus(null);
          }}
        />
      )}
      {reading && user && (
        <IslandConfigProvider userId={user.id}>
          <Suspense
            fallback={
              <div className="modal-backdrop" role="status">
                正在翻开书架…
              </div>
            }
          >
            <Bookshelf
              key={user.id}
              userId={user.id}
              focusChat={reading === "tutor"}
              onClose={() => {
                keys.clear();
                setReading(null);
              }}
            />
          </Suspense>
        </IslandConfigProvider>
      )}
      {error && (
        <p role="alert" className="physics-error">
          {error}
        </p>
      )}
    </main>
  );
}
