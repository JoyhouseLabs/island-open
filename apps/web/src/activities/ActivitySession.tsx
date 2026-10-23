import { useEffect, useMemo, useState } from "react";
import { Link, Outlet, useLocation } from "react-router";
import {
  physicsSceneKeySchema,
  type AuthConfig,
  type User,
} from "@island/contracts";
import { api, RequestError } from "../api";
import { IslandConfigProvider } from "../contentStore";
import PhysicsLogin from "../physics/PhysicsLogin";
import { homePath } from "../physics/routes";
import { ActivityContext, type ActivityScope } from "./context";
import { ActivityEvents } from "./events";
import "../physics/physics.css";
import "./activities.css";
function Ready({
  user,
  physical,
  worldId,
  scene,
}: {
  user: User;
  physical: boolean;
  worldId: string | null;
  scene: string;
}) {
  const [message, notify] = useState("");
  const events = useMemo(() => {
    try {
      return new ActivityEvents(user.id, localStorage, (request) =>
        api("/inventory/act", {
          method: "POST",
          body: JSON.stringify(request),
        }),
      );
    } catch {
      return null;
    }
  }, [user.id]);
  useEffect(() => {
    const flush = () => {
      if (events)
        void events
          .flush()
          .catch(() =>
            notify("活动记录尚未同步，本机记录保留，联网后会重试。"),
          );
    };
    flush();
    window.addEventListener("online", flush);
    const timer = setInterval(flush, 15000);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", flush);
    };
  }, [events]);
  const query =
    physical && worldId
      ? `?${new URLSearchParams({ world: worldId, scene })}`
      : "";
  const value: ActivityScope = {
    user,
    href: (path) => path + query,
    home: physical && worldId ? homePath(worldId) : "/island",
    library: physical && worldId ? homePath(worldId, "library") : "/library",
    returnTo: physical && worldId ? homePath(worldId, scene) : "/island",
    notify,
    record(event) {
      if (!events) {
        notify("本机活动记录不可用，成长记录暂未保存。");
        return;
      }
      try {
        events.record(event);
        void events
          .flush()
          .catch(() =>
            notify("活动记录尚未同步，本机记录保留，联网后会重试。"),
          );
      } catch {
        notify("本机活动记录保存失败，请保持页面打开后重试。");
      }
    },
  };
  return (
    <ActivityContext.Provider value={value}>
      <IslandConfigProvider userId={user.id}>
        <Outlet key={`${user.id}`} />
        {message && (
          <aside className="activity-notice" role="status">
            {message}
            <button onClick={() => notify("")}>知道了</button>
          </aside>
        )}
      </IslandConfigProvider>
    </ActivityContext.Provider>
  );
}
export default function ActivitySession({ physical }: { physical: boolean }) {
  const location = useLocation();
  const params = new URLSearchParams(location.search),
    worldId = physical ? params.get("world") : null;
  const scene =
    params.get("scene") ??
    (location.pathname.startsWith("/books") ? "library" : "island");
  const [user, setUser] = useState<User | null>(null),
    [auth, setAuth] = useState<AuthConfig | null>(null);
  const [ready, setReady] = useState(false),
    [verified, setVerified] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const verificationKey = `${user?.id ?? ""}:${worldId ?? ""}:${scene}`;
  useEffect(() => {
    let active = true;
    const refreshUser = () => {
      if (document.hidden) return;
      void api<User>("/auth/me")
        .then((u) => {
          if (active) setUser(u);
        })
        .catch((e) => {
          if (active && e instanceof RequestError && e.status === 401)
            setUser(null);
        });
    };
    window.addEventListener("focus", refreshUser);
    document.addEventListener("visibilitychange", refreshUser);
    void Promise.all([
      api<AuthConfig>("/auth/config"),
      api<User>("/auth/me").catch((e) => {
        if (e instanceof RequestError && e.status === 401) return null;
        throw e;
      }),
    ])
      .then(([a, u]) => {
        if (active) {
          setAuth(a);
          setUser(u);
          setReady(true);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
      window.removeEventListener("focus", refreshUser);
      document.removeEventListener("visibilitychange", refreshUser);
    };
  }, []);
  useEffect(() => {
    let active = true;
    setVerified(null);
    setError("");
    if (!user) return;
    if (!physical || !worldId) {
      setVerified(verificationKey);
      return;
    }
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        worldId,
      ) ||
      !physicsSceneKeySchema.safeParse(scene).success
    ) {
      setError("家园返回地址无效，请从自己的家园重新进入");
      return;
    }
    void api<{ owner: boolean; scenes: Array<{ key: string }> }>(
      `/physics/worlds/${encodeURIComponent(worldId)}`,
    )
      .then((world) => {
        if (!world.owner || !world.scenes.some((s) => s.key === scene))
          throw new Error("请从自己的已开放场景进入活动");
        if (active) setVerified(verificationKey);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [physical, worldId, scene, user?.id]);
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
  if (user && verified === verificationKey && !error)
    return (
      <Ready
        key={`${user.id}:${worldId ?? ""}`}
        user={user}
        worldId={worldId}
        scene={scene}
        physical={physical}
      />
    );
  return (
    <main className="physics-playground physics-lobby">
      <header className="physics-header">
        <Link to="/island">回我的岛</Link>
        <h1>
          {location.pathname.startsWith("/place/")
            ? "我的小天地"
            : "阅读与创作"}
        </h1>
      </header>
      {error ? (
        <section role="alert">
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>重新连接</button>
        </section>
      ) : !ready || user ? (
        <p role="status">正在读取账号与返回地址…</p>
      ) : (
        <PhysicsLogin auth={auth} busy={busy} login={login} />
      )}
    </main>
  );
}
