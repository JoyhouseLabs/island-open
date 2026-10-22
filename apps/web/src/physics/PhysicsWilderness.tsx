import { useEffect, useMemo, useReducer, useState } from "react";
import { Link, useBlocker, useLocation, useNavigate } from "react-router";
import {
  avatarProfileSchema,
  physicsExplorationRecordSchema,
  type AvatarConfig,
  type AuthConfig,
  type User,
  type PhysicsExplorationRecord,
} from "@island/contracts";
import { api, RequestError } from "../api";
import Wilderness from "../wilderness/Wilderness";
import { ExplorationJournal } from "../wilderness/journal";
import PhysicsLogin from "./PhysicsLogin";
import { homePath } from "./routes";
import "./physics.css";

function Journey({
  worldId,
  user,
  avatar,
  initial,
}: {
  worldId: string;
  user: User;
  avatar: AvatarConfig;
  initial: PhysicsExplorationRecord;
}) {
  const navigate = useNavigate();
  const endpoint = `/physics/worlds/${encodeURIComponent(worldId)}/exploration`;
  const journal = useMemo(() => {
    let first: PhysicsExplorationRecord | null = initial;
    return new ExplorationJournal(
      `island-physics-exploration-v1:${user.id}:${worldId}:${initial.seed}`,
      initial.seed,
      {
        getItem: (key) => localStorage.getItem(key),
        setItem: (key, value) => localStorage.setItem(key, value),
      },
      {
        read: async () => {
          if (first) {
            const value = first;
            first = null;
            return value;
          }
          return physicsExplorationRecordSchema.parse(await api(endpoint));
        },
        save: async (request) =>
          physicsExplorationRecordSchema.parse(
            await api(endpoint, {
              method: "PUT",
              body: JSON.stringify(request),
            }),
          ),
      },
    );
  }, [user.id, worldId, initial, endpoint]);
  const [, render] = useReducer((n) => n + 1, 0);
  const [error, setError] = useState("");
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      currentLocation.pathname !== nextLocation.pathname ||
      currentLocation.search !== nextLocation.search,
  );
  useEffect(() => {
    const off = journal.subscribe(render);
    void journal.load();
    const flush = () => void journal.flush(),
      timer = window.setInterval(flush, 5000);
    window.addEventListener("online", flush);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      off();
      clearInterval(timer);
      window.removeEventListener("online", flush);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
      void journal.flush();
    };
  }, [journal]);
  const saving = blocker.state === "blocked";
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    let active = true;
    setError("");
    // Yield one render so movement is paused before taking the final journal snapshot.
    const frame = requestAnimationFrame(() => {
      void journal
        .saveBeforeLeave()
        .then(() => {
          if (active) blocker.proceed();
        })
        .catch((e) => {
          if (active) {
            setError(e.message);
            blocker.reset();
          }
        });
    });
    return () => {
      active = false;
      cancelAnimationFrame(frame);
    };
  }, [blocker, journal]);
  if (!journal.ready) return <p role="status">正在读取探索手记…</p>;
  return (
    <>
      <Wilderness
        seed={initial.seed}
        low={true}
        avatar={avatar}
        journal={journal}
        paused={saving}
        onExit={() => navigate(homePath(worldId, "dinosaur"))}
      />
      {(saving || error) && (
        <aside
          className="wild-navigation-status"
          role={error ? "alert" : "status"}
        >
          {error || "正在保存探索进度…"}
          {error && <button onClick={() => setError("")}>知道了</button>}
        </aside>
      )}
    </>
  );
}
export default function PhysicsWilderness() {
  const location = useLocation(),
    navigate = useNavigate();
  const worldId = new URLSearchParams(location.search).get("world");
  const [ready, setReady] = useState(false),
    [enabled, setEnabled] = useState(false),
    [user, setUser] = useState<User | null>(null),
    [auth, setAuth] = useState<AuthConfig | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [loaded, setLoaded] = useState<{
    worldId: string;
    avatar: AvatarConfig;
    initial: PhysicsExplorationRecord;
  } | null>(null);
  useEffect(() => {
    let active = true;
    void Promise.all([
      api<{ enabled: boolean }>("/physics/config"),
      api<AuthConfig>("/auth/config"),
      api<User>("/auth/me").catch((e) => {
        if (e instanceof RequestError && e.status === 401) return null;
        throw e;
      }),
    ])
      .then(([config, auth, user]) => {
        if (active) {
          setEnabled(config.enabled);
          setAuth(auth);
          setUser(user);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    setLoaded(null);
    setError("");
    if (!enabled || !user) return;
    void (async () => {
      const home = await api<{ id: string; scenes: Array<{ key: string }> }>(
        "/physics/home",
        { method: "POST", body: JSON.stringify(worldId ? { worldId } : {}) },
      );
      if (!active) return;
      if (!worldId) {
        navigate(`/dinosaur/explore?world=${encodeURIComponent(home.id)}`, {
          replace: true,
        });
        return;
      }
      if (!home.scenes.some((s) => s.key === "dinosaur"))
        await api(`/physics/worlds/${home.id}/scenes/dinosaur`, {
          method: "POST",
          body: "{}",
        });
      if (!active) return;
      const [profile, record] = await Promise.all([
        api("/physics/avatar"),
        api(`/physics/worlds/${home.id}/exploration`),
      ]);
      const avatar = avatarProfileSchema.parse(profile).avatar,
        initial = physicsExplorationRecordSchema.parse(record);
      if (active) setLoaded({ worldId: home.id, avatar, initial });
    })().catch((e) => {
      if (active) setError(e.message);
    });
    return () => {
      active = false;
    };
  }, [enabled, user?.id, worldId]);
  const login = async (development: boolean, name: string) => {
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
  };
  if (loaded && user)
    return (
      <Journey key={`${user.id}:${loaded.worldId}`} {...loaded} user={user} />
    );
  return (
    <main className="physics-playground physics-lobby">
      <header className="physics-header">
        <Link to="/island">回我的岛</Link>
        <h1>外围探索</h1>
      </header>
      {!ready ? (
        <p role="status">正在读取账号…</p>
      ) : !enabled ? (
        <p>外围探索尚未开放</p>
      ) : !user ? (
        <PhysicsLogin auth={auth} busy={busy} login={login} />
      ) : !error ? (
        <p role="status">正在准备探索手记…</p>
      ) : null}
      {error && (
        <section className="physics-login">
          <p role="alert">{error}</p>
          <button onClick={() => window.location.reload()}>重新进入探索</button>
        </section>
      )}
    </main>
  );
}
