import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  ArrowLeft,
  Footprints,
  LoaderCircle,
  Maximize2,
  Moon,
  Sparkles,
  Sun,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { Season } from "@island/contracts";
import { useHomeSession } from "../HomeSession";
import { contentFeed } from "../contentStore";
import { proximity } from "../dialogue/proximity";
import { playerIntent } from "../player/avatar";
import DialogueBox from "../dialogue/DialogueBox";
import NpcChat from "../dialogue/NpcChat";
import TalkPrompt from "../dialogue/TalkPrompt";
import PlaceVisual from "../places/PlaceVisual";
import { usePlaceAmbience } from "../places/ambience";
import PlayerPanel, {
  BackpackButton,
  DressingButton,
  DressingPanel,
  JumpButton,
} from "../player/PlayerPanel";
import { paths } from "../routes";

const seasonNames: Record<Season, string> = {
  spring: "春",
  summer: "夏",
  autumn: "秋",
  winter: "冬",
};

/** A published place: wander, meet its animals, listen to its ambience.
 *  Visits carry no edits — the island stays the only thing you build on. */
export default function PlacePage() {
  const { sceneId } = useParams(),
    navigate = useNavigate(),
    { world, quality, avatar, walking, setWalking } = useHomeSession();
  const [state, setState] = useState<
    { loading: true } | { loading: false; place: null } | { loading: false; place: NonNullable<Awaited<ReturnType<typeof contentFeed>>["places"][number]> }
  >({ loading: true });
  const [reset, setReset] = useState(0),
    [narrow, setNarrow] = useState(() => window.innerWidth < 700);
  useEffect(() => {
    const q = matchMedia("(max-width: 699px)");
    const change = () => setNarrow(q.matches);
    q.addEventListener("change", change);
    return () => q.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    let alive = true;
    void contentFeed()
      .then((feed) => {
        if (alive)
          setState({
            loading: false,
            place: feed.places.find((p) => p.id === sceneId) ?? null,
          });
      })
      .catch(() => alive && setState({ loading: false, place: null }));
    return () => {
      alive = false;
    };
  }, [sceneId]);
  const hour = world.snapshot.environment.hour,
    weather = world.snapshot.environment.weather ?? "sun",
    season = world.snapshot.environment.season,
    night = hour < 6 || hour > 19;
  useEffect(() => {
    proximity.setEnv({ weather, season, night });
  }, [weather, season, night]);
  useEffect(() => {
    playerIntent.active = walking && !!avatar && !state.loading;
    return () => {
      playerIntent.active = false;
    };
  }, [walking, avatar, state.loading]);

  const place = state.loading ? null : state.place;
  const ambience = usePlaceAmbience(place?.ambience.assetId, place?.ambience.volume ?? 0.5);
  if (!state.loading && !place)
    return (
      <main className="scene-loading" role="status">
        <Sparkles size={30} />
        <span>这处小天地暂时不在，回主岛看看。</span>
      </main>
    );
  return (
    <main
      className={`app scene-room${night ? " night" : ""}`}
      style={{ ["--room-accent" as string]: place?.accent ?? "#6f8d63" }}
    >
      <div className="scene" aria-label={`${place?.name ?? "秘境"}可漫游三维场景`}>
        {place ? (
          <PlaceVisual
            config={place}
            hour={hour}
            season={season}
            weather={weather}
            low={quality === "low" || (quality === "auto" && narrow)}
            reset={reset}
            walking={walking}
            avatar={avatar}
            onGate={(dest) => navigate(paths[dest])}
            onExit={() => navigate(paths.island)}
          />
        ) : (
          <div className="scene-loading" role="status">
            <LoaderCircle className="spin" size={26} />
            <span>正在推开秘境的门…</span>
          </div>
        )}
      </div>
      <div className="edge-fade" />
      <header className="topbar">
        <button className="room-back" onClick={() => navigate(paths.island)}>
          <ArrowLeft size={17} />
          返回主岛
        </button>
      </header>
      {place && (
        <section className="welcome room-welcome">
          <div className="eyebrow">
            <span /> {place.eyebrow}
          </div>
          <h1>{place.name}</h1>
          <p>{place.tagline}</p>
          <button className="world-chip room-time" aria-label="时间与季节">
            {night ? <Moon size={13} /> : <Sun size={13} />}{" "}
            {seasonNames[season]}日 ·{" "}
            {String(Math.floor(hour)).padStart(2, "0")}:00
          </button>
        </section>
      )}
      <div className="view-controls">
        <button
          className={`circle-button ${walking ? "active" : ""}`}
          title={walking ? "停下脚步" : "化身行走"}
          aria-label={walking ? "停下脚步" : "化身行走"}
          onClick={() => {
            if (!avatar) {
              navigate(paths.island);
              return;
            }
            setWalking(!walking);
          }}
        >
          <Footprints size={18} />
        </button>
        <button
          className="circle-button"
          aria-label="查看整个场景"
          onClick={() => setReset((n) => n + 1)}
        >
          <Maximize2 size={18} />
        </button>
        {place?.ambience.assetId && (
          <button
            className={`circle-button ${ambience.on ? "active" : ""}`}
            title={ambience.on ? "关闭这里的声音" : "听听这里的声音"}
            aria-label={ambience.on ? "关闭这里的声音" : "听听这里的声音"}
            onClick={ambience.toggle}
          >
            {ambience.loading ? (
              <LoaderCircle className="spin" size={18} />
            ) : ambience.on ? (
              <Volume2 size={18} />
            ) : (
              <VolumeX size={18} />
            )}
          </button>
        )}
        <BackpackButton />
        <DressingButton />
        <JumpButton visible={walking} />
      </div>
      <footer className="room-footer">
        <span>到这里走走，不用带走什么</span>
        <span>主岛 / {place?.name ?? "秘境"}</span>
      </footer>
      <TalkPrompt />
      <DialogueBox />
      <NpcChat />
      <PlayerPanel />
      <DressingPanel />
    </main>
  );
}
