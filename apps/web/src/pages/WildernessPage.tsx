import { useEffect, useMemo, useReducer } from "react";
import { useNavigate } from "react-router";
import { useHomeSession } from "../HomeSession";
import Wilderness from "../wilderness/Wilderness";
import { ExplorationJournal } from "../wilderness/journal";
import { api } from "../api";
import { paths } from "../routes";
function SavedExploration({
  worldId,
  userId,
  seed,
}: {
  worldId?: string;
  userId?: string;
  seed: number;
}) {
  const { quality, avatar } = useHomeSession(),
    navigate = useNavigate();
  const journal = useMemo(
    () =>
      new ExplorationJournal(
        `island-exploration-v2:${userId ?? "guest"}:${worldId ?? "local"}:${seed}`,
        seed,
        {
          getItem: (key) => localStorage.getItem(key),
          setItem: (key, value) => localStorage.setItem(key, value),
        },
        worldId && userId
          ? {
              read: () => api(`/worlds/${worldId}/exploration`),
              save: (request) =>
                api(`/worlds/${worldId}/exploration`, {
                  method: "PUT",
                  body: JSON.stringify(request),
                }),
            }
          : undefined,
      ),
    [worldId, userId, seed],
  );
  const [, render] = useReducer((n) => n + 1, 0);
  useEffect(() => {
    const unsubscribe = journal.subscribe(render);
    void journal.load();
    const timer = window.setInterval(() => void journal.flush(), 5000);
    const flush = () => void journal.flush();
    window.addEventListener("online", flush);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      unsubscribe();
      clearInterval(timer);
      window.removeEventListener("online", flush);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
      void journal.flush();
    };
  }, [journal]);
  if (!journal.ready)
    return (
      <div className="scene-loading" role="status">
        正在读取探索手记…
      </div>
    );
  return (
    <Wilderness
      seed={seed}
      low={quality !== "high"}
      avatar={avatar}
      journal={journal}
      onExit={() => {
        void journal.flush();
        void navigate(paths.dinosaur);
      }}
    />
  );
}
export default function WildernessPage() {
  const { world } = useHomeSession();
  return (
    <SavedExploration
      key={`${world.user?.id}:${world.record?.id}:${world.snapshot.seed}`}
      seed={world.snapshot.seed}
      worldId={world.record?.id}
      userId={world.user?.id}
    />
  );
}
