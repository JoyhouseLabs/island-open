import DeviceLabels, { type DeviceScreenPoint } from "./building/DeviceLabels";
import {
  cursorStyle,
  glyphForBlock,
  glyphForKind,
  glyphForTool,
  ItemGlyph,
} from "./building/itemGlyphs";
import { useBuilder } from "./building/useBuilder";
import BuildingControls from "./building/BuildingControls";
import type { BuildMode } from "./building/types";
import DevicePanel from "./devices/DevicePanel";
import SpeakingSigns from "./devices/SpeakingSigns";
import RoomBackup from "./backup/RoomBackup";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  BookOpen,
  Compass,
  Footprints,
  Glasses,
  Sprout,
  Undo2,
  Sun,
  Moon,
  X,
  Cloud,
  RefreshCw,
  Download,
  Upload,
  Maximize2,
  CloudRain,
  CloudLightning,
  Wind,
  Volume2,
  VolumeX,
  LoaderCircle,
} from "lucide-react";
import type { Season, SubSceneId, Weather } from "@island/contracts";
import { useWorld } from "./useWorld";
import { sceneConfig } from "./sceneConfig";
import { sceneVisuals } from "./scenes";
import { useHomeSession } from "./HomeSession";
import SceneBoundary from "./SceneBoundary";
import SoundMixer from "./SoundMixer";
import PlayerPanel, {
  BackpackButton,
  DressingButton,
  DressingPanel,
  JumpButton,
} from "./player/PlayerPanel";
import { cameraMode, playerIntent, useFirstPerson } from "./player/avatar";
import Bookshelf from "./Bookshelf";
import { paths } from "./routes";
import { emitGrowth } from "./progress/store";
import TalkPrompt from "./dialogue/TalkPrompt";
import DialogueBox from "./dialogue/DialogueBox";
import NpcChat from "./dialogue/NpcChat";
import { proximity } from "./dialogue/proximity";
import { dialogue } from "./dialogue/store";
import GrowthToasts from "./progress/GrowthToasts";
import type { Tool } from "./Island";
import { usePresence } from "./presence/client";

type Props = {
  scene: SubSceneId;
  parent: ReturnType<typeof useWorld>;
  quality: "auto" | "low" | "high";
  onExit: () => void;
};
const weatherChoices: {
  id: Weather;
  name: string;
  icon: typeof Sun;
}[] = [
  { id: "sun", name: "晴朗", icon: Sun },
  { id: "rain", name: "小雨", icon: CloudRain },
  { id: "thunder", name: "雷雨", icon: CloudLightning },
  { id: "wind", name: "大风", icon: Wind },
];
export default function SceneExperience({
  scene,
  parent,
  quality,
  onExit,
}: Props) {
  const config = sceneConfig[scene],
    Visual = sceneVisuals[scene];
  const { avatar, walking, setWalking, audio } = useHomeSession(),
    fp = useFirstPerson(),
    navigate = useNavigate();
  const room = useWorld({
    parentId: parent.record?.id ?? null,
    seed: parent.snapshot.seed,
    user: parent.user,
    scene,
    label: config.short,
  });
  const [tool, setTool] = useState<Tool | BuildMode>("explore"),
    [reset, setReset] = useState(0),
    [panel, setPanel] = useState<"save" | "time" | null>(null),
    [leaving, setLeaving] = useState(false),
    [toast, setToast] = useState(""),
    [reading, setReading] = useState<{
      bookId?: string;
      focusChat?: boolean;
    } | null>(null);
  const buildMode =
    tool === "build" || tool === "remove" || tool === "device" ? tool : null;
  const builder = useBuilder(room, room.unsupported ? null : buildMode);
  const [devicePoints, setDevicePoints] = useState<DeviceScreenPoint[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  // 空格 near 小墨老师 opens the lesson chat directly.
  useEffect(() => {
    if (scene === "library")
      dialogue.onTutor(() => setReading({ focusChat: true }));
    return () => dialogue.onTutor(null);
  }, [scene]);

  // In walk mode the ground taps drive the resident instead of being ignored.
  useEffect(() => {
    playerIntent.active =
      walking && !!avatar && tool === "explore" && !leaving && !deviceId;
    return () => {
      playerIntent.active = false;
    };
  }, [walking, avatar, tool, leaving, deviceId]);
  const upload = useRef<HTMLInputElement>(null),
    back = useRef<HTMLButtonElement>(null);
  const [narrow, setNarrow] = useState(() => window.innerWidth < 700);
  useEffect(() => {
    const q = matchMedia("(max-width: 699px)");
    const change = () => setNarrow(q.matches);
    q.addEventListener("change", change);
    return () => q.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    back.current?.focus();
  }, []);
  // Co-play refresh: this room's world changed on the server (a visitor
  // planted here, or another of the owner's tabs saved) — pick it up.
  const { worldEvent } = usePresence();
  useEffect(() => {
    if (!worldEvent || worldEvent.scene !== scene) return;
    if (room.record && worldEvent.revision <= room.record.revision) return;
    if (room.status !== "synced")
      setToast("这处小天地有了新变化。记得先保存，再载入云端。");
    else void room.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldEvent?.at]);
  useEffect(() => {
    setToast(room.message);
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [room.message]);
  const night =
    scene === "starlight" ||
    parent.snapshot.environment.hour < 6 ||
    parent.snapshot.environment.hour > 19;

  // Dialogue lines reference the shared weather and time of day.
  useEffect(() => {
    proximity.setEnv({
      weather: parent.snapshot.environment.weather ?? "sun",
      season: parent.snapshot.environment.season,
      night,
    });
  }, [parent.snapshot.environment, night]);
  const sync = !room.ready
    ? room.loadError
      ? `${config.short}加载失败`
      : `正在加载${config.short}`
    : {
        guest: "本地草稿",
        synced: `${config.short}已保存 · v${room.record?.revision ?? 1}`,
        dirty: `${config.short}等待同步`,
        saving: `正在保存${config.short}`,
        offline: `${config.short}离线草稿`,
        conflict: `${config.short}版本待处理`,
        loading: "正在加载",
      }[room.status];
  const exit = async (destination?: string) => {
    if (leaving) return;
    setLeaving(true);
    if (
      room.ready &&
      room.user &&
      (room.status === "dirty" || room.status === "offline")
    )
      await room.save();
    if (destination) void navigate(destination);
    else onExit();
  };
  const seasonNames: Record<Season, string> = {
    spring: "春",
    summer: "夏",
    autumn: "秋",
    winter: "冬",
  };
  const setWeather = (weather: Weather) => {
    emitGrowth({ type: "weather.changed", detail: weather });
    return parent.edit((w) => ({
      ...w,
      environment: { ...w.environment, weather },
    }));
  };
  return (
    <main
      className={`app scene-room${night ? " night" : ""}`}
      style={{ ["--room-accent" as string]: config.accent }}
    >
      <DeviceLabels
        world={room.snapshot}
        points={devicePoints}
        onSelect={(id) =>
          builder.editor?.mode === "remove"
            ? builder.editor.select({ deviceId: id })
            : setDeviceId(id)
        }
      />
      <div
        className={`scene tool-${tool}`}
        style={cursorStyle(
          tool === "build"
            ? glyphForBlock(builder.material)
            : tool === "device"
              ? glyphForKind(builder.kind)
              : glyphForTool(tool),
        )}
        aria-label={`${config.title}独立三维场景`}
      >
        {room.ready ? (
          <SceneBoundary label={config.short}>
            <Visual
              world={{
                ...room.snapshot,
                environment: parent.snapshot.environment,
              }}
              tool={buildMode ? "explore" : (tool as Tool)}
              building={
                scene === "library" && builder.enabled && !room.unsupported
                  ? builder.editor
                  : undefined
              }
              unknownSnapshot={room.unknownSnapshot}
              onDevice={setDeviceId}
              onDevicePositions={setDevicePoints}
              low={quality === "low" || (quality === "auto" && narrow)}
              reset={reset}
              onPlace={room.place}
              onExit={() => void exit()}
              onExplore={scene === "dinosaur" ? () => void exit(paths.wilderness) : undefined}
              walk={walking}
              avatar={avatar}
              onGate={(dest) => void navigate(paths[dest])}
              onRead={scene === "library" ? () => setReading({}) : undefined}
              onOpenBook={
                scene === "library"
                  ? (bookId) => setReading({ bookId })
                  : undefined
              }
              onTutor={
                scene === "library"
                  ? () => setReading({ focusChat: true })
                  : undefined
              }
            />
          </SceneBoundary>
        ) : (
          <div className="scene-loading" role="status">
            <config.icon size={30} />
            <span>{room.loadError || config.loading}</span>
            {room.loadError && (
              <button className="small-button" onClick={room.retryLoad}>
                重新加载{config.short}
              </button>
            )}
          </div>
        )}
      </div>
      {scene === "library" && builder.enabled && (
        <BuildingControls builder={builder} room={room} />
      )}
      {deviceId && (
        <DevicePanel
          room={room}
          deviceId={deviceId}
          onSelect={setDeviceId}
          onClose={() => setDeviceId(null)}
        />
      )}
      {!room.unsupported && (
        <SpeakingSigns
          devices={room.snapshot.devices}
          worldId={room.record?.id ?? null}
        />
      )}
      <div className="edge-fade" />
      <header className="topbar">
        <button
          ref={back}
          className="room-back"
          onClick={() => void exit()}
          disabled={leaving}
        >
          <ArrowLeft size={17} />
          {leaving ? "正在返回…" : "返回主岛"}
        </button>
        <button
          className={`sync-pill ${room.status === "conflict" ? "attention" : ""}`}
          onClick={() => setPanel(panel === "save" ? null : "save")}
        >
          <span className={`status-dot ${room.status}`} />
          {sync}
          <Cloud size={14} />
        </button>
      </header>
      <section className="welcome room-welcome">
        <div className="eyebrow">
          <span /> {config.eyebrow}
        </div>
        <h1>{config.title}</h1>
        <p>
          {config.tagline[0]}
          <br />
          {config.tagline[1]}
        </p>
        <button
          className="world-chip room-time"
          onClick={() => setPanel(panel === "time" ? null : "time")}
          aria-label="时间与季节"
        >
          {night ? <Moon size={13} /> : <Sun size={13} />}{" "}
          {scene === "starlight"
            ? "永远星夜"
            : `${seasonNames[parent.snapshot.environment.season]}日 · ${String(
                Math.floor(parent.snapshot.environment.hour),
              ).padStart(2, "0")}:00`}
        </button>
      </section>
      <aside className="room-note">
        <span className="section-caption">{config.noteCaption}</span>
        <p>
          {config.noteBody[0]}
          <br />
          {config.noteBody[1]}
        </p>
        <span>{config.noteHint}</span>
      </aside>
      <div className="view-controls">
        <button
          className={`circle-button ${walking ? "active" : ""}`}
          title={walking ? "停止行走" : "化身行走"}
          aria-label={walking ? "停止行走" : "化身行走"}
          onClick={() => {
            if (!avatar) {
              room.notify("先回主岛选一个形象，就可以在这里行走了。");
              return;
            }
            setTool("explore");
            if (!walking) emitGrowth({ type: "avatar.walked" });
            setWalking(!walking);
          }}
        >
          <Footprints size={18} />
        </button>
        {walking && avatar && (
          <button
            className={`circle-button ${fp ? "active" : ""}`}
            title={fp ? "切回跟随视角（V）" : "试试第一人称（V）"}
            aria-label={fp ? "切回跟随视角" : "第一人称视角"}
            onClick={() => cameraMode.toggle()}
          >
            <Glasses size={18} />
          </button>
        )}
        {scene === "library" && (
          <button
            className="circle-button"
            title="读书"
            aria-label="打开书架"
            onClick={() => setReading({})}
          >
            <BookOpen size={18} />
          </button>
        )}
        <button
          className="circle-button"
          aria-label="查看整个场景"
          onClick={() => setReset((n) => n + 1)}
        >
          <Maximize2 size={18} />
        </button>
        <button
          className={`circle-button ${audio.audible ? "active" : ""}`}
          title={audio.audible ? "关闭环境声" : "开启环境声"}
          aria-label={audio.audible ? "关闭环境声" : "开启环境声"}
          onClick={() => audio.masterButton()}
        >
          {audio.loading ? (
            <LoaderCircle className="spin" size={18} />
          ) : audio.audible ? (
            <Volume2 size={18} />
          ) : (
            <VolumeX size={18} />
          )}
        </button>
        <BackpackButton />
        <DressingButton />
        <JumpButton visible={walking} />
      </div>
      {reading && (
        <Bookshelf
          onClose={() => setReading(null)}
          initialBookId={reading.bookId}
          focusChat={reading.focusChat}
        />
      )}
      <div className="bottom-center">
        <div className="tool-hint">
          {tool === "build"
            ? "单击预览，双击地面或方块表面放置。"
            : tool === "remove"
              ? "选中物件后整理；撤销可恢复上一步。"
              : tool === "device"
                ? "单击预览，双击地面或完整支撑的顶面摆放装置。"
                : tool === "explore"
                  ? config.hints.explore
                  : tool === "flower"
                    ? config.hints.flower
                    : tool === "tree"
                      ? config.hints.tree
                      : config.hints.bench}
        </div>
        <nav className="toolbar" aria-label="场景编辑工具">
          {(
            [
              { id: "explore", label: "漫游", icon: Compass },
              { id: "flower", label: "种花" },
              { id: "tree", label: "种树" },
              { id: "bench", label: "长椅" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              disabled={!room.ready || leaving}
              className={`tool ${tool === t.id ? "active" : ""}`}
              aria-pressed={tool === t.id}
              onClick={() => {
                setTool(t.id);
                if (t.id === "explore") setWalking(true);
              }}
            >
              {"icon" in t ? (
                <t.icon size={20} />
              ) : (
                <ItemGlyph id={t.id} size={22} />
              )}
              <span>{t.label}</span>
            </button>
          ))}
          {scene === "library" &&
            builder.enabled &&
            (["build", "device", "remove"] as const).map((mode) => (
              <button
                key={mode}
                className={`tool ${tool === mode ? "active" : ""}`}
                aria-pressed={tool === mode}
                onClick={() => {
                  setTool(mode);
                  setWalking(false);
                  setReset((n) => n + 1);
                }}
              >
                <ItemGlyph
                  id={
                    mode === "build"
                      ? "blocks"
                      : mode === "device"
                        ? glyphForKind(builder.kind)
                        : "shovel"
                  }
                  size={22}
                />
                <span>
                  {mode === "build"
                    ? "建造"
                    : mode === "device"
                      ? "装置"
                      : "铲子"}
                </span>
              </button>
            ))}
          {scene === "library" && builder.enabled && (
            <button
              className="tool"
              onClick={() => {
                const d = room.snapshot.devices?.find(
                  (d) => d.payload.kind === "bookshelf",
                );
                if (d) setDeviceId(d.id);
                else room.notify("先摆一座书架，再来写自己的作品。");
              }}
            >
              <ItemGlyph id="notebook" size={22} />
              <span>作品</span>
            </button>
          )}
          <span className="toolbar-divider" />
          <button
            className="tool"
            disabled={!room.ready || leaving}
            onClick={room.grow}
          >
            <Sprout size={20} />
            <span>生长</span>
          </button>
          <button
            className="tool undo"
            aria-label="撤销修改"
            disabled={!room.history.length || leaving}
            onClick={room.undo}
          >
            <Undo2 size={17} />
          </button>
        </nav>
      </div>
      <footer className="room-footer">
        <span>{room.snapshot.entities.length} 个物件</span>
        <span>主岛 / {config.title}</span>
      </footer>
      <TalkPrompt />
      <DialogueBox />
      <NpcChat />
      <PlayerPanel />
      <DressingPanel />
      <GrowthToasts />
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      {panel && (
        <aside
          className="panel room-panel"
          aria-label={panel === "save" ? "场景存档" : "共享时间与天气"}
        >
          <button
            className="panel-close"
            aria-label="关闭面板"
            onClick={() => setPanel(null)}
          >
            <X size={19} />
          </button>
          {panel === "save" ? (
            <>
              <span className="eyebrow">{config.saveEyebrow}</span>
              {scene === "library" && <RoomBackup room={room} />}
              <h2>{config.saveTitle}</h2>
              <p className="panel-copy">{sync}</p>
              <p className="tiny-note">
                {config.title}单独保存。返回主岛或下次进入，都可以继续布置。
              </p>
              {room.user ? (
                <>
                  <button
                    className="primary-button"
                    disabled={
                      !room.ready ||
                      room.status === "saving" ||
                      room.status === "conflict"
                    }
                    onClick={() => void room.save()}
                  >
                    <Cloud size={17} />
                    保存{config.short}
                  </button>
                  {room.status === "conflict" && (
                    <>
                      <p className="tiny-note">
                        另一处正在编辑或云端已有更新。请先导出草稿，再决定接管或载入。
                      </p>
                      <button
                        className="small-button"
                        onClick={() => void room.takeover()}
                      >
                        接管编辑
                      </button>
                    </>
                  )}
                  <button
                    className="small-button"
                    disabled={room.busy}
                    onClick={() => void room.reload()}
                  >
                    <RefreshCw size={15} />
                    载入云端{config.short}
                  </button>
                </>
              ) : (
                <p className="tiny-note">
                  当前保存在本机。返回主岛登录后，再进入这里可同步到云端。
                </p>
              )}
              <div className="panel-divider" />
              <button
                className="small-button"
                disabled={!room.ready}
                onClick={room.exportWorld}
              >
                <Download size={15} />
                导出{config.short}布局（不含作品）
              </button>
              <button
                className="small-button"
                disabled={!room.ready}
                onClick={() => upload.current?.click()}
              >
                <Upload size={15} />
                导入{config.short}存档
              </button>
              <button
                className="text-button"
                onClick={() => void room.exportBackup()}
              >
                导出载入前的备份
              </button>
              <input
                ref={upload}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void room.importWorld(file);
                  e.target.value = "";
                }}
              />
              <p className="tiny-note">
                编辑停下 2
                秒后自动保存；断网时保留本地草稿。此处导出仅含当前场景布局；书屋作品请使用完整书屋备份。
              </p>
            </>
          ) : (
            <>
              <span className="eyebrow">ONE ISLAND, ONE SKY</span>
              <h2>共享的时光</h2>
              <p className="tiny-note">
                这里的时间、季节与天气跟随主岛。修改后会一同改变整个家园。
              </p>
              <label className="room-hour">
                时间 · {Math.floor(parent.snapshot.environment.hour)}:00
                <input
                  aria-label="共享时间"
                  type="range"
                  min="0"
                  max="23"
                  step="1"
                  value={parent.snapshot.environment.hour}
                  onChange={(e) =>
                    parent.edit((w) => ({
                      ...w,
                      environment: {
                        ...w.environment,
                        hour: Number(e.target.value),
                      },
                    }))
                  }
                />
              </label>
              <div className="season-options">
                {(Object.keys(seasonNames) as Season[]).map((s) => (
                  <button
                    className={`small-button ${s === parent.snapshot.environment.season ? "active" : ""}`}
                    key={s}
                    aria-pressed={s === parent.snapshot.environment.season}
                    onClick={() =>
                      parent.edit((w) => ({
                        ...w,
                        environment: { ...w.environment, season: s },
                      }))
                    }
                  >
                    {seasonNames[s]}
                  </button>
                ))}
              </div>
              <div className="panel-divider" />
              <strong className="weather-title">天气</strong>
              <div className="season-options">
                {weatherChoices.map((choice) => {
                  const current = parent.snapshot.environment.weather ?? "sun";
                  return (
                    <button
                      key={choice.id}
                      className={`small-button ${current === choice.id ? "active" : ""}`}
                      aria-pressed={current === choice.id}
                      onClick={() => setWeather(choice.id)}
                    >
                      <choice.icon size={14} />
                      {choice.name}
                    </button>
                  );
                })}
              </div>
              <p className="tiny-note">
                雷雨天会先看见闪电，稍后听到雷声；雨声与风声随天气而来。
              </p>
              <div className="panel-divider" />
              <strong className="weather-title">环境声</strong>
              <SoundMixer audio={audio} />
              <p className="tiny-note">
                {parent.status === "conflict"
                  ? "主岛存在版本冲突，共享环境暂未同步；请返回主岛处理。"
                  : parent.user
                    ? parent.status === "synced"
                      ? "共享环境已保存到主岛。"
                      : "共享环境随主岛存档同步。"
                    : "共享环境保存在本机。"}
              </p>
            </>
          )}
        </aside>
      )}
    </main>
  );
}
