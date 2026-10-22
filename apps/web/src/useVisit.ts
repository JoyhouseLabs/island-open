import { useCallback, useEffect, useState } from "react";
import { api, RequestError } from "./api";
import type { SubSceneId, User, VisitIsland, WorldRecord } from "@island/contracts";

export type VisitStatus = "loading" | "guest" | "ready" | "error";

/**
 * Read-only visit loader: fetches another player's island through the
 * token-gated endpoints. There is no edit/place/save here by construction —
 * a visitor simply cannot write to the host's world.
 */
export function useVisit(worldId: string, token: string) {
  const [status, setStatus] = useState<VisitStatus>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [island, setIsland] = useState<VisitIsland | null>(null);
  const [message, setMessage] = useState("");
  const [scenes, setScenes] = useState<Partial<Record<SubSceneId, WorldRecord | 404>>>({});

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const me = await api<User>("/auth/me");
      setUser(me);
      const data = await api<VisitIsland>(
        `/worlds/${worldId}/visit?t=${encodeURIComponent(token)}`,
      );
      setIsland(data);
      setStatus("ready");
    } catch (e) {
      if (e instanceof RequestError && e.status === 401) {
        setStatus("guest");
        return;
      }
      setMessage(e instanceof RequestError ? e.message : "暂时打不开这个家园。");
      setStatus("error");
    }
  }, [worldId, token]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Dev login for a visiting guest; deliberately NOT useWorld.login(),
   *  which would auto-create an island of the guest's own. */
  const guestLogin = useCallback(
    async (name: string) => {
      try {
        await api("/auth/guest", {
          method: "POST",
          body: JSON.stringify({ name }),
        });
        await load();
      } catch (e) {
        setMessage(e instanceof RequestError ? e.message : "暂时登录不上，请稍后再试。");
        setStatus("error");
      }
    },
    [load],
  );

  const loadScene = useCallback(
    async (scene: SubSceneId) => {
      if (scenes[scene]) return scenes[scene];
      try {
        const record = await api<WorldRecord>(
          `/worlds/${worldId}/visit/${scene}?t=${encodeURIComponent(token)}`,
        );
        setScenes((s) => ({ ...s, [scene]: record }));
        return record;
      } catch {
        setScenes((s) => ({ ...s, [scene]: 404 }));
        return 404;
      }
    },
    [scenes, worldId, token],
  );

  /** Co-play planting: the server applies it to the host's world and both
   *  sides hear about the new revision through presence. */
  const place = useCallback(
    async (
      scene: "island" | SubSceneId,
      kind: "tree" | "flower" | "bench",
      x: number,
      z: number,
    ) => {
      const record = await api<WorldRecord>(
        `/worlds/${worldId}/visit/${scene}/place?t=${encodeURIComponent(token)}`,
        {
          method: "POST",
          body: JSON.stringify({ kind, x, z, id: crypto.randomUUID() }),
        },
      );
      if (scene === "island")
        setIsland((cur) => (cur ? { ...cur, world: record } : cur));
      else setScenes((s) => ({ ...s, [scene]: record }));
      return record;
    },
    [worldId, token],
  );

  /** Silent refresh when presence says the world changed; keeps the
   *  current view (no loading flash) while swapping in the new snapshot. */
  const refresh = useCallback(async () => {
    try {
      const data = await api<VisitIsland>(
        `/worlds/${worldId}/visit?t=${encodeURIComponent(token)}`,
      );
      setIsland(data);
      for (const key of Object.keys(scenes) as SubSceneId[]) {
        if (scenes[key] === 404) continue;
        try {
          const record = await api<WorldRecord>(
            `/worlds/${worldId}/visit/${key}?t=${encodeURIComponent(token)}`,
          );
          setScenes((s) => ({ ...s, [key]: record }));
        } catch {
          /* the room may have gone away; keep what we have */
        }
      }
    } catch {
      /* sharing may have been closed mid-visit; the next navigation shows it */
    }
  }, [worldId, token, scenes]);

  return {
    status,
    user,
    island,
    message,
    scenes,
    loadScene,
    place,
    reload: load,
    refresh,
    guestLogin,
  };
}
