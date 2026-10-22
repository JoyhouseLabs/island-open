import {
  createContext,
  useContext,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Outlet, useParams, useLocation, Link } from "react-router";
import { useVisit } from "./useVisit";
import { paths } from "./routes";
import { loadAvatar, type AvatarConfig } from "./player/avatar";
import { presence, usePresence } from "./presence/client";
import { growth } from "./progress/store";
import { IslandConfigProvider } from "./contentStore";
import CardModal from "./cards/CardModal";
import type { User, VisitIsland } from "@island/contracts";

type Quality = "auto" | "low" | "high";
type Visit = ReturnType<typeof useVisit>;
type Session = {
  visit: Visit;
  worldId: string;
  token: string;
  avatar: AvatarConfig;
  walking: boolean;
  setWalking: Dispatch<SetStateAction<boolean>>;
  quality: Quality;
};
const Context = createContext<Session | null>(null);
export function useVisitSession() {
  const session = useContext(Context);
  if (!session) throw new Error("参观页面需要参观会话。");
  return session;
}

/**
 * Layout for /visit/:worldId(/:scene): a read-only window into someone
 * else's island. Provides the avatar (defaulted so walking works out of
 * the box) and connects presence as a token-carrying visitor.
 */
export default function VisitSession() {
  const { worldId = "", "*": splat } = useParams();
  const location = useLocation();
  const token = new URLSearchParams(location.search).get("t") ?? "";
  const sceneParam = location.pathname.split("/")[3] ?? "island";
  const visit = useVisit(worldId, token);
  const [walking, setWalking] = useState(true);
  const [guestName, setGuestName] = useState("");
  const [quality] = useState<Quality>("auto");
  const [avatar] = useState<AvatarConfig>(() => loadAvatar());

  const island: VisitIsland | null = visit.island;
  const name: string = visit.user?.name ?? "旅人";
  useEffect(() => {
    growth.bind(visit.user?.id ?? null);
  }, [visit.user?.id]);
  useEffect(() => {
    if (visit.status !== "ready" || !island) return;
    presence.connect({
      worldId,
      scene: sceneParam,
      token,
      name,
      avatar,
    });
  }, [visit.status, island, worldId, sceneParam, token, name, avatar]);
  useEffect(() => () => presence.disconnect(), []);

  useEffect(() => {
    if (island)
      document.title = `${island.world.snapshot.name} · 心灵家园`;
  }, [island]);

  // Co-play refresh: the host (or another visitor) changed the world —
  // pull the new snapshot without leaving the current view.
  const { worldEvent } = usePresence();
  useEffect(() => {
    if (worldEvent) void visit.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldEvent?.at]);

  if (visit.status === "loading")
    return (
      <div className="scene-loading" role="status">
        正在打开朋友的家园…
      </div>
    );
  if (visit.status === "guest")
    return (
      <div className="scene-loading visit-gate">
        <h1>先留下名字，再上岛看看</h1>
        <p>参观别人的家园需要先登录，这样岛上的朋友才知道你是谁。</p>
        <form
          className="visit-name"
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = guestName.trim();
            if (trimmed) void visit.guestLogin(trimmed);
          }}
        >
          <label>
            你的名字
            <input
              value={guestName}
              maxLength={12}
              autoComplete="nickname"
              onChange={(e) => setGuestName(e.target.value)}
            />
          </label>
          <button className="small-button" disabled={!guestName.trim()}>
            进去看看
          </button>
        </form>
        <Link to={paths.island}>返回我的家园</Link>
      </div>
    );
  if (visit.status === "error" || !island)
    return (
      <div className="scene-loading visit-gate">
        <h1>这扇门暂时打不开</h1>
        <p>{visit.message || "参观链接可能已经失效。"}</p>
        <Link className="small-button" to={paths.island}>
          返回我的家园
        </Link>
      </div>
    );

  return (
    <Context.Provider
      value={{
        visit,
        worldId,
        token,
        avatar,
        walking,
        setWalking,
        quality,
      }}
    >
      <IslandConfigProvider
        userId={visit.user?.id ?? null}
        worldId={worldId}
        token={token}
      >
        <Outlet />
        <CardModal />
      </IslandConfigProvider>
    </Context.Provider>
  );
}
