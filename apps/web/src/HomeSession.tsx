import { learningTravel } from "./learning/travel";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Outlet, useLocation } from "react-router";
import { useWorld } from "./useWorld";
import { useAudio } from "./useAudio";
import type { Focus } from "./Island";
import { paths } from "./routes";
import { AVATAR_KEY, loadAvatar, type AvatarConfig } from "./player/avatar";
import { presence, usePresence } from "./presence/client";
import { growth } from "./progress/store";
import { IslandConfigProvider } from "./contentStore";
import CardModal from "./cards/CardModal";

type Quality = "auto" | "low" | "high";
type Session = {
  world: ReturnType<typeof useWorld>;
  audio: ReturnType<typeof useAudio>;
  quality: Quality;
  setQuality: Dispatch<SetStateAction<Quality>>;
  islandEntry: Focus;
  setIslandEntry: Dispatch<SetStateAction<Focus>>;
  avatar: AvatarConfig | null;
  setAvatar: Dispatch<SetStateAction<AvatarConfig | null>>;
  walking: boolean;
  setWalking: Dispatch<SetStateAction<boolean>>;
};
const Context = createContext<Session | null>(null);
export function useHomeSession() {
  const session = useContext(Context);
  if (!session) throw new Error("家园页面需要共享会话。");
  return session;
}
export default function HomeSession() {
  const world = useWorld(),
    location = useLocation();
  const audio = useAudio(world.notify, {
    weather: world.snapshot.environment.weather ?? "sun",
    coastal: location.pathname === paths.island || location.pathname === paths.beach,
  });
  const [quality, setQuality] = useState<Quality>("auto");
  const [islandEntry, setIslandEntry] = useState<Focus>(null);
  // Enter every fresh visit with a visible resident; keep any saved outfit.
  const [avatar, setAvatar] = useState<AvatarConfig | null>(loadAvatar);
  const [walking, setWalking] = useState(true);
  useEffect(() => {
    try {
      if (avatar) localStorage.setItem(AVATAR_KEY, JSON.stringify(avatar));
      else localStorage.removeItem(AVATAR_KEY);
    } catch {
      /* Private browsing keeps the choice for this visit only. */
    }
  }, [avatar]);
  // Owner-side presence: connect every scene of one's own island (no share
  // token needed) so visiting players can see and greet the host. The room
  // key is <island world id>:<scene>, so both sides land together.
  const recordId = world.record?.id,
    userName = world.user?.name,
    scene =
      Object.entries(paths).find(([, p]) => p === location.pathname.replace(/\/+$/, ""))?.[0] ??
      "island";
  useEffect(() => {
    growth.bind(world.user?.id ?? null);
  }, [world.user?.id]);
  useEffect(() => {
    if (scene === "wilderness") { presence.disconnect(); return; }
    if (!recordId || !avatar || !userName) return;
    presence.connect({
      worldId: recordId,
      scene,
      name: userName,
      avatar,
    });
  }, [recordId, scene, avatar, userName]);
  useEffect(() => () => presence.disconnect(), []);
  // Co-play refresh: when the room says the island changed (a visitor
  // planted, or this browser's other tab saved), pick it up — silently
  // while clean, with a nudge while there are unsaved local edits.
  const { worldEvent } = usePresence();
  useEffect(() => {
    if (!worldEvent || worldEvent.scene !== "island") return;
    if (world.record && worldEvent.revision <= world.record.revision) return;
    if (world.status === "dirty" || world.status === "saving")
      world.notify("岛上有了新变化（朋友种下了什么）。记得先保存，再载入云端。");
    else void world.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldEvent?.at]);
  learningTravel.worldId = world.record?.id ?? null;
  return (
    <Context.Provider
      value={{
        world,
        audio,
        quality,
        setQuality,
        islandEntry,
        setIslandEntry,
        avatar,
        setAvatar,
        walking,
        setWalking,
      }}
    >
      {world.ready ? (
        <IslandConfigProvider userId={world.user?.id ?? null}>
          <Outlet />
          <CardModal />
        </IslandConfigProvider>
      ) : (
        <div className="scene-loading" role="status">
          正在读取你的家园…
        </div>
      )}
    </Context.Provider>
  );
}
