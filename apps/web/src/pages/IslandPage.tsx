import { useCreations } from "../creations/useCreations";
import { useFurnitureShop } from "../shop/useFurnitureShop";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { cursorStyle, glyphForTool } from "../building/itemGlyphs";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowUpRight,
  Check,
  ChevronRight,
  Cloud,
  CloudLightning,
  CloudRain,
  Compass,
  Flower2,
  House,
  Leaf,
  LoaderCircle,
  Maximize2,
  Moon,
  Plus,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Snowflake,
  Sparkles,
  Sprout,
  Sun,
  Footprints,
  TreePine,
  Undo2,
  Volume2,
  VolumeX,
  Wind,
  X,
  Armchair,
  BookOpen,
  FlaskConical,
  Waves,
  RefreshCw,
  LogIn,
  Link2,
  Copy,
  Glasses,
  MapPin,
  Wrench,
} from "lucide-react";
import type { Season, Weather } from "@island/contracts";
import { landmarks } from "@island/world-core";
import { useHomeSession } from "../HomeSession";
import { Link, useLocation, useNavigate } from "react-router";
import { paths } from "../routes";
import type { Tool, Focus } from "../Island";
import { sceneByLandmark, sceneConfig } from "../sceneConfig";
import SoundMixer from "../SoundMixer";
import { useContentFeed } from "../contentStore";
import {
  avatarAccents,
  avatarForms,
  avatarHats,
  cameraMode,
  playerIntent,
  useFirstPerson,
  type AvatarConfig,
} from "../player/avatar";
import { Canvas } from "@react-three/fiber";
import { AvatarPreview } from "../player/AvatarModel";
import { api } from "../api";
import type { SharingStatus } from "@island/contracts";
import { useGrowth, emitGrowth } from "../progress/store";
import GrowthToasts from "../progress/GrowthToasts";
import TalkPrompt from "../dialogue/TalkPrompt";
import DialogueBox from "../dialogue/DialogueBox";
import NpcChat from "../dialogue/NpcChat";
import { proximity } from "../dialogue/proximity";
import SceneBoundary from "../SceneBoundary";
import PlayerPanel, {
  BackpackButton,
  DressingButton,
  DressingPanel,
  JumpButton,
  usePackOpen,
} from "../player/PlayerPanel";
const Island = lazy(() => import("../Island"));
const seasons: { id: Season; name: string; icon: typeof Sun }[] = [
  { id: "spring", name: "春", icon: Sprout },
  { id: "summer", name: "夏", icon: Sun },
  { id: "autumn", name: "秋", icon: Leaf },
  { id: "winter", name: "冬", icon: Snowflake },
];
const weatherChoices: { id: Weather; name: string; icon: typeof Sun }[] = [
  { id: "sun", name: "晴朗", icon: Sun },
  { id: "rain", name: "小雨", icon: CloudRain },
  { id: "thunder", name: "雷雨", icon: CloudLightning },
  { id: "wind", name: "大风", icon: Wind },
];
const places: Record<string, typeof House> = {
  home: House,
  garden: Flower2,
  meadow: Leaf,
  forest: TreePine,
  library: BookOpen,
  pond: Waves,
  lab: FlaskConical,
  nursery: Sprout,
  mountain: Compass,
  cave: Sparkles,
  beach: Sun,
};
export default function IslandPage() {
  const {
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
  } = useHomeSession();
  const growth = useGrowth();
  const fpView = useFirstPerson();
  const navigate = useNavigate();
  const [tool, setTool] = useState<Tool>("explore"),
    [selected, setSelected] = useState<string>(
      islandEntry
        ? (landmarks.find(
            (p) => Math.hypot(p.x - islandEntry.x, p.z - islandEntry.z) < 4,
          )?.id ?? "home")
        : "home",
    ),
    [focus, setFocus] = useState<Focus>(islandEntry),
    [cameraReset, setCameraReset] = useState(0),
    [panel, setPanel] = useState<
      "environment" | "storage" | "credits" | "growth" | null
    >(null),
    [loginOpen, setLoginOpen] = useState(false),
    [pickerOpen, setPickerOpen] = useState(false),
    [noteOpen, setNoteOpen] = useState(false),
    [pinnedDock, setPinnedDock] = useState<
      "places" | "tools" | "settings" | null
    >(null),
    [hoverDock, setHoverDock] = useState<
      "places" | "tools" | "settings" | null
    >(null),
    [draft, setDraft] = useState<AvatarConfig>(
      () =>
        avatar ?? {
          form: "foxbot",
          accent: avatarAccents[0]!,
          hat: "none",
        },
    ),
    [asset, setAsset] = useState("loading"),
    [toast, setToast] = useState(""),
    [share, setShare] = useState<SharingStatus | null>(null),
    [shareBusy, setShareBusy] = useState(false);
  const publishedPlaces = useContentFeed()?.places ?? [];
  const location = useLocation();
  // Hover previews a category; clicking pins it for touch and keyboard use.
  // Keep the decoration palette open until the player finishes or changes
  // activities. The backpack closes any active decoration session.
  const canHover = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(hover: hover)").matches,
    [],
  );
  const packOpen = usePackOpen();
  useEffect(() => {
    if (packOpen) finishDecorating();
  }, [packOpen]);
  const dockShown = packOpen
    ? null
    : (pinnedDock ?? (canHover ? hoverDock : null));
  // Leaving a category starts a short grace timer: a mouse travelling up
  // into the drawer (or back to another one) must not drop it mid-air.
  const dockLeave = useRef<number>(undefined);
  useEffect(() => () => window.clearTimeout(dockLeave.current), []);
  const enterCat = (id: "places" | "tools" | "settings") => {
    window.clearTimeout(dockLeave.current);
    setHoverDock(id);
  };
  const leaveCat = () => {
    window.clearTimeout(dockLeave.current);
    dockLeave.current = window.setTimeout(() => setHoverDock(null), 800);
  };
  const upload = useRef<HTMLInputElement>(null),
    dialog = useRef<HTMLDivElement>(null),
    previousFocus = useRef<HTMLElement | null>(null);
  const hour = world.snapshot.environment.hour,
    night = hour < 6 || hour > 19,
    weather = world.snapshot.environment.weather ?? "sun",
    weatherName = weatherChoices.find((c) => c.id === weather)?.name,
    time = `${String(Math.floor(hour)).padStart(2, "0")}:${String(Math.floor((hour % 1) * 60)).padStart(2, "0")}`;
  useEffect(() => {
    setToast(world.message);
    const timer = setTimeout(() => setToast(""), 5500);
    return () => clearTimeout(timer);
  }, [world.message]);
  useEffect(() => {
    if (!loginOpen) return;
    previousFocus.current = document.activeElement as HTMLElement;
    const first = dialog.current?.querySelector<HTMLElement>("button");
    first?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLoginOpen(false);
      if (e.key === "Tab") {
        const items = dialog.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),a[href]",
        );
        if (!items?.length) return;
        const a = items[0]!,
          b = items[items.length - 1]!;
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault();
          b.focus();
        } else if (!e.shiftKey && document.activeElement === b) {
          e.preventDefault();
          a.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previousFocus.current?.focus();
    };
  }, [loginOpen]);
  // Dialogue lines reference the shared weather and time of day.
  useEffect(() => {
    proximity.setEnv({
      weather: world.snapshot.environment.weather ?? "sun",
      season: world.snapshot.environment.season,
      night,
    });
  }, [world.snapshot.environment, night]);

  // Walking taps only drive the avatar while exploring.
  useEffect(() => {
    playerIntent.active = walking && !!avatar && tool === "explore";
    return () => {
      playerIntent.active = false;
    };
  }, [walking, avatar, tool]);

  // Sharing: load the current state when the storage panel opens.
  const shareRecordId = world.record?.id,
    signedIn = !!world.user;
  useEffect(() => {
    if (panel !== "storage" || !shareRecordId || !signedIn) return;
    api<SharingStatus>(`/worlds/${shareRecordId}/sharing`)
      .then(setShare)
      .catch(() => setShare(null));
  }, [panel, shareRecordId, signedIn]);
  const toggleShare = async () => {
    if (!shareRecordId) return;
    setShareBusy(true);
    try {
      setShare(
        await api<SharingStatus>(`/worlds/${shareRecordId}/sharing`, {
          method: "PUT",
          body: JSON.stringify({
            sharing: share?.sharing === "link" ? "private" : "link",
          }),
        }),
      );
    } catch {
      setToast("分享设置暂时改不了，请稍后再试。");
    } finally {
      setShareBusy(false);
    }
  };
  const togglePlant = async () => {
    if (!shareRecordId || share?.sharing !== "link") return;
    setShareBusy(true);
    try {
      setShare(
        await api<SharingStatus>(`/worlds/${shareRecordId}/sharing`, {
          method: "PUT",
          body: JSON.stringify({
            sharing: "link",
            plant: !share.plant,
          }),
        }),
      );
    } catch {
      setToast("种植权限暂时改不了，请稍后再试。");
    } finally {
      setShareBusy(false);
    }
  };
  const copyShare = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setToast("参观链接已复制");
    } catch {
      setToast("请手动复制输入框里的链接");
    }
  };
  const select = (id: string) => {
    const scene = sceneByLandmark[id],
      place = landmarks.find((p) => p.id === id);
    setSelected(id);
    setTool("explore");
    if (!scene || !place) return;
    setPanel(null);
    setIslandEntry({ x: place.x, z: place.z, stamp: Date.now() });
    void navigate(paths[scene]);
  };
  const syncText = {
    guest: "本地体验",
    synced: `已保存 · v${world.record?.revision ?? 1}`,
    dirty: "等待同步",
    saving: "正在保存",
    offline: "离线草稿",
    conflict: "版本待处理",
    loading: "正在加载",
  }[world.status];
  const setSeason = (season: Season) =>
    world.edit((w) => ({ ...w, environment: { ...w.environment, season } }));
  const setWeather = (weather: Weather) => {
    emitGrowth({ type: "weather.changed", detail: weather });
    world.edit((w) => ({ ...w, environment: { ...w.environment, weather } }));
  };
  const beforeDecorating = useRef(walking);
  const decorating = useRef(false);
  const finishDecorating = () => {
    if (decorating.current) setWalking(beforeDecorating.current);
    decorating.current = false;
    setTool("explore");
    setPinnedDock(null);
    setHoverDock(null);
  };
  const beginDecorating = () => {
    if (!decorating.current) beforeDecorating.current = walking;
    decorating.current = true;
    setPinnedDock("tools");
    setWalking(false);
  };
  const editReason = !world.ready
    ? "小岛正在加载，请稍等"
    : world.unsupported
      ? "此存档包含新版内容，当前只能参观"
      : world.status === "conflict"
        ? "请先处理右上角的存档冲突，再继续布置"
        : "";
  const shop = useFurnitureShop(world, () => { setTool("explore"); setWalking(false); setPinnedDock(null); setHoverDock(null); });
  const creations = useCreations(world, () => { shop.cancel(); setTool("explore"); setWalking(false); setPinnedDock(null); setHoverDock(null); });
  const changeTool = (t: Tool) => {
    creations.cancel();
    shop.cancel();
    if (editReason) return;
    setTool(t);
    beginDecorating();
    if (t !== "explore") world.notify("点击岛上的空地，放下你的小小心意。");
  };
  return (
    <main className={night ? "app night" : "app"}>
      <div
        className={`scene tool-${tool}`}
        style={cursorStyle(glyphForTool(tool))}
        aria-label="可旋转缩放的三维心灵岛屿"
      >
        <Suspense
          fallback={
            <div className="scene-loading">
              <Sprout size={32} />
              <span>一座小岛，正在醒来…</span>
            </div>
          }
        >
          <SceneBoundary label="主岛">
            <Island
              creationEditor={creations.editor}
              furnitureEditor={creations.editor.active ? undefined : shop.editor}
              world={world.snapshot}
              tool={tool}
              focus={focus}
              cameraReset={cameraReset}
              quality={quality}
              onPlace={(x, z, kind) => {
                if (!editReason) world.place(x, z, kind);
              }}
              onSelect={(id) => { if (!shop.editor.active && !creations.editor.active) select(id); }}
              onAsset={setAsset}
              onNote={() => setNoteOpen(true)}
              walk={walking}
              avatar={avatar}
              onGate={(dest) => {
                if (shop.editor.active || creations.editor.active) return;
                const landmark =
                  dest === "island" ? "home" : sceneConfig[dest].landmark;
                select(landmark);
              }}
            />
          </SceneBoundary>
        </Suspense>
      </div>
      {shop.ui}
      {creations.ui}
      <div className="edge-fade" />
      <header className="topbar">
        <a
          href={paths.island}
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            setFocus(null);
            setCameraReset((n) => n + 1);
          }}
          aria-label="心灵家园，返回全岛"
        >
          <span className="brand-mark">
            <Sprout size={23} strokeWidth={1.7} />
          </span>
          <span>
            <strong>心灵家园</strong>
            <small>A LITTLE WORLD WITHIN</small>
          </span>
        </a>
        <div className="top-actions">
          <button
            className="star-pill"
            aria-label="成长册"
            title="成长册"
            onClick={() => setPanel(panel === "growth" ? null : "growth")}
          >
            <Sparkles size={13} />
            <span>{growth.state.stars}★</span>
          </button>
          <button
            className={`sync-pill ${world.status === "conflict" ? "attention" : ""}`}
            onClick={() => setPanel(panel === "storage" ? null : "storage")}
          >
            <span className={`status-dot ${world.status}`} />
            <span>{syncText}</span>
            <ChevronRight size={13} />
          </button>
          <button
            className="avatar"
            aria-label={world.user ? "查看账号与存档" : "登录家园"}
            onClick={() =>
              world.user ? setPanel("storage") : setLoginOpen(true)
            }
          >
            {world.user ? <House size={19} /> : <LogIn size={18} />}
          </button>
        </div>
      </header>
      <section className="welcome">
        <div className="eyebrow">
          <span /> YOUR OWN QUIET CORNER
        </div>
        <h1>
          让心，
          <br />
          慢慢靠岸。
        </h1>
        <p>
          一片花园，一座小山。
          <br />
          把心里的世界，种在这里。
        </p>
        <div className="world-chip">
          <span className="small-leaf">
            <Leaf size={13} />
          </span>
          <span>
            {
              seasons.find((s) => s.id === world.snapshot.environment.season)
                ?.name
            }
            日 · {time}
          </span>
          <span className="chip-separator" />
          {night ? <Moon size={12} /> : <Sun size={13} />}
          <span>
            {weather !== "sun" ? weatherName : night ? "星夜" : "晴朗"}
          </span>
        </div>
      </section>
      <div className="north">
        <span>N</span>
        <Compass size={30} strokeWidth={0.8} />
        <small>慢一点，也很好</small>
      </div>

      <div className="view-controls resident-controls">
        {" "}
        <button
          className={`circle-button ${walking ? "active" : ""}`}
          title={walking ? "停下脚步" : "化身行走"}
          aria-label={walking ? "停下脚步" : "化身行走"}
          aria-pressed={walking}
          onClick={() => {
            if (!avatar) {
              setPickerOpen(true);
              return;
            }
            decorating.current = false;
            setPinnedDock(null);
            setHoverDock(null);
            setTool("explore");
            if (!walking) emitGrowth({ type: "avatar.walked" });
            setWalking(!walking);
          }}
        >
          <Footprints size={19} />
        </button>
        {walking && avatar && (
          <button
            className={`circle-button ${fpView ? "active" : ""}`}
            title={fpView ? "切回跟随视角（V）" : "试试第一人称（V）"}
            aria-label={fpView ? "切回跟随视角" : "第一人称视角"}
            onClick={() => cameraMode.toggle()}
          >
            <Glasses size={19} />
          </button>
        )}
        <DressingButton />
        <JumpButton visible={walking} />
      </div>
      <div className="bottom-center">
        <div className="tool-hint">
          {tool === "explore"
            ? pinnedDock === "tools"
              ? "选择工具布置小岛 · 完成后继续探索"
              : walking
                ? "点击地面或用方向键行走 · 空格跳跃或交谈"
                : "拖动环顾 · 滚轮或双指缩放"
            : tool === "tree"
              ? "在空地种下一棵树"
              : tool === "flower"
                ? "为草地添一簇花"
                : "放一把长椅，歇一会儿"}
        </div>
        <div className="bottom-dock">
          <nav className="toolbar" aria-label="底部菜单">
            <div
              className={`dock-cat${dockShown === "places" ? " open" : ""}`}
              onMouseEnter={() => enterCat("places")}
              onMouseLeave={leaveCat}
            >
              <button
                className={`tool ${dockShown === "places" ? "active" : ""}`}
                aria-expanded={dockShown === "places"}
                aria-label="去哪里 · 岛上的小地方"
                title="导航 · 岛上的小地方"
                onClick={() => {
                  const next = pinnedDock === "places" ? null : "places";
                  finishDecorating();
                  setPinnedDock(next);
                }}
              >
                <MapPin size={19} />
                <span>去哪里</span>
              </button>
              <nav
                className="dock-drawer place-drawer"
                aria-label="岛屿分区"
                inert={dockShown !== "places"}
              >
                <span className="section-caption">岛上的小地方</span>
                {landmarks.map((p) => {
                  const Icon = places[p.id] ?? Compass,
                    scene = sceneByLandmark[p.id];
                  if (!scene)
                    return (
                      <button
                        className={selected === p.id ? "place active" : "place"}
                        key={p.id}
                        onClick={() => {
                          setSelected(p.id);
                          setTool("explore");
                          setFocus({ x: p.x, z: p.z, stamp: Date.now() });
                          setPinnedDock(null);
                        }}
                      >
                        <Icon size={16} strokeWidth={1.6} />
                        <span>{p.name}</span>
                        {selected === p.id && <span className="place-dot" />}
                      </button>
                    );
                  return (
                    <Link
                      key={p.id}
                      to={paths[scene]}
                      className={selected === p.id ? "place active" : "place"}
                      onClick={() =>
                        setIslandEntry({ x: p.x, z: p.z, stamp: Date.now() })
                      }
                    >
                      <Icon size={16} strokeWidth={1.6} />
                      <span>{p.name}</span>
                      <small className="entry-badge" aria-hidden="true">
                        进入
                      </small>
                    </Link>
                  );
                })}
                {publishedPlaces.length > 0 && (
                  <>
                    <span className="place-drawer-separator" />
                    <span className="section-caption">更多小天地</span>
                    {publishedPlaces.map((place) => (
                      <Link
                        key={place.id}
                        to={`/place/${place.id}`}
                        className={
                          location.pathname === `/place/${place.id}`
                            ? "place active"
                            : "place"
                        }
                      >
                        <Sparkles size={16} strokeWidth={1.6} />
                        <span>{place.name}</span>
                        <small className="entry-badge" aria-hidden="true">
                          进入
                        </small>
                      </Link>
                    ))}
                  </>
                )}
              </nav>
            </div>
            <div
              className={`dock-cat${dockShown === "tools" ? " open" : ""}`}
              onMouseEnter={() => enterCat("tools")}
              onMouseLeave={leaveCat}
            >
              <button
                className={`tool ${dockShown === "tools" ? "active" : ""}`}
                aria-expanded={dockShown === "tools"}
                aria-label="布置家园"
                title="布置家园"
                onClick={() => {
                  if (decorating.current) finishDecorating();
                  else beginDecorating();
                }}
              >
                <Wrench size={19} />
                <span>布置家园</span>
              </button>
              <nav
                className="dock-drawer home-editor"
                aria-label="打理小岛"
                inert={dockShown !== "tools"}
              >
                <header>
                  <strong>布置家园</strong>
                  <button className="small-button" onClick={finishDecorating}>
                    完成布置
                  </button>
                </header>
                {editReason && <p role="status">{editReason}</p>}
                <fieldset className="scene-tools" disabled={!!editReason}>
                  <div className="drawer-row">
                    {(
                      [
                        { id: "explore", label: "环顾", icon: Compass },
                        { id: "tree", label: "种树", icon: TreePine },
                        { id: "flower", label: "种花", icon: Flower2 },
                        { id: "bench", label: "长椅", icon: Armchair },
                      ] as const
                    ).map((t) => (
                      <button
                        key={t.id}
                        className={tool === t.id ? "tool active" : "tool"}
                        aria-pressed={tool === t.id}
                        onClick={() => {
                          changeTool(t.id);
                        }}
                      >
                        <t.icon size={21} strokeWidth={1.65} />
                        <span>{t.label}</span>
                      </button>
                    ))}
                    <span className="toolbar-line" />
                    <button
                      className="tool grow"
                      onClick={() => {
                        world.grow();
                      }}
                    >
                      <Sprout size={21} strokeWidth={1.65} />
                      <span>生长</span>
                    </button>
                    <button
                      className="tool undo"
                      aria-label="撤销上一步"
                      title="撤销上一步"
                      disabled={!world.history.length}
                      onClick={() => {
                        world.undo();
                      }}
                    >
                      <Undo2 size={19} />
                    </button>
                  </div>
                </fieldset>
              </nav>
            </div>
            <div
              className={`dock-cat${dockShown === "settings" ? " open" : ""}`}
              onMouseEnter={() => enterCat("settings")}
              onMouseLeave={leaveCat}
            >
              <button
                className={`tool ${dockShown === "settings" ? "active" : ""}`}
                aria-expanded={dockShown === "settings"}
                aria-label="环境 · 视角与声音"
                title="配置 · 视角与环境"
                onClick={() => {
                  const next = pinnedDock === "settings" ? null : "settings";
                  finishDecorating();
                  setPinnedDock(next);
                }}
              >
                <SlidersHorizontal size={19} />
                <span>环境</span>
              </button>
              <nav
                className="dock-drawer"
                aria-label="视角与环境"
                inert={dockShown !== "settings"}
              >
                <div className="drawer-row">
                  <button
                    className="tool"
                    title="返回全岛"
                    aria-label="返回全岛"
                    onClick={() => {
                      setFocus(null);
                      setCameraReset((n) => n + 1);
                      setTool("explore");
                      setPinnedDock(null);
                    }}
                  >
                    <Maximize2 size={19} />
                    <span>全岛</span>
                  </button>
                  <button
                    className={`tool ${panel === "environment" ? "active" : ""}`}
                    title="时间与季节"
                    aria-label="时间与季节"
                    onClick={() => {
                      setPanel(panel === "environment" ? null : "environment");
                      setPinnedDock(null);
                    }}
                  >
                    <Sun size={19} />
                    <span>季节</span>
                  </button>
                  <button
                    className={`tool ${audio.audible ? "active" : ""}`}
                    title={audio.audible ? "关闭环境声" : "开启环境声"}
                    aria-label={audio.audible ? "关闭环境声" : "开启环境声"}
                    onClick={() => {
                      audio.masterButton();
                      setPinnedDock(null);
                    }}
                  >
                    {audio.loading ? (
                      <LoaderCircle className="spin" size={19} />
                    ) : audio.audible ? (
                      <Volume2 size={19} />
                    ) : (
                      <VolumeX size={19} />
                    )}
                    <span>声音</span>
                  </button>
                </div>
              </nav>
            </div>
            <span className="toolbar-line" />
            <span onClickCapture={creations.cancel}>{shop.button}</span>
            {creations.button}
            <BackpackButton tool label="我的发现" />
          </nav>
        </div>
      </div>
      <footer className="footnote">
        <span>{world.snapshot.entities.length} 个生命与心意</span>
        <button
          onClick={() => setPanel(panel === "credits" ? null : "credits")}
        >
          关于这座岛 <Plus size={12} />
        </button>
      </footer>
      {asset === "loading" && (
        <div className="asset-notice">
          <LoaderCircle className="spin" size={12} /> 狐狸正在来岛上的路上
        </div>
      )}
      {asset === "error" && (
        <div className="asset-notice">狐狸资源暂未加载 · 显示简化模型</div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Leaf size={16} />
          <span>{toast}</span>
          <button aria-label="关闭提示" onClick={() => setToast("")}>
            <X size={14} />
          </button>
        </div>
      )}
      <GrowthToasts />
      <TalkPrompt />
      <DialogueBox />
      <NpcChat />
      <PlayerPanel />
      <DressingPanel />
      {panel && (
        <aside
          className="panel"
          aria-label={
            panel === "environment"
              ? "环境设置"
              : panel === "storage"
                ? "账号与存档"
                : panel === "growth"
                  ? "成长册"
                  : "关于这座岛"
          }
        >
          <div className="panel-heading">
            <span className="section-caption">
              {panel === "environment"
                ? "MAKE IT YOUR SEASON"
                : panel === "storage"
                  ? "A HOME TO RETURN TO"
                  : panel === "growth"
                    ? "EVERY DEED, A STAR"
                    : "GROWING, TOGETHER"}
            </span>
            <button aria-label="关闭面板" onClick={() => setPanel(null)}>
              <X size={18} />
            </button>
          </div>
          {panel === "environment" ? (
            <>
              <h2>你喜欢的时光</h2>
              <p className="panel-copy">这里的季节，可以为你停留。</p>
              <div className="season-switch">
                {seasons.map((s) => (
                  <button
                    key={s.id}
                    className={
                      world.snapshot.environment.season === s.id ? "active" : ""
                    }
                    onClick={() => setSeason(s.id)}
                  >
                    <s.icon size={19} />
                    <span>{s.name}</span>
                  </button>
                ))}
              </div>
              <label className="slider-label" htmlFor="weather">
                <span>此刻的天气</span>
                <strong>
                  {
                    weatherChoices.find(
                      (c) =>
                        c.id === (world.snapshot.environment.weather ?? "sun"),
                    )?.name
                  }
                </strong>
              </label>
              <div className="season-switch weather-switch">
                {weatherChoices.map((c) => (
                  <button
                    key={c.id}
                    className={
                      (world.snapshot.environment.weather ?? "sun") === c.id
                        ? "active"
                        : ""
                    }
                    onClick={() => setWeather(c.id)}
                  >
                    <c.icon size={19} />
                    <span>{c.name}</span>
                  </button>
                ))}
              </div>
              <label className="slider-label" htmlFor="hour">
                <span>一天中的时刻</span>
                <strong>{time}</strong>
              </label>
              <input
                id="hour"
                type="range"
                min="0"
                max="23.75"
                step=".25"
                value={hour}
                onChange={(e) =>
                  world.edit((w) => ({
                    ...w,
                    environment: {
                      ...w.environment,
                      hour: Number(e.target.value),
                    },
                  }))
                }
              />
              <div className="range-captions">
                <span>午夜</span>
                <span>正午</span>
                <span>夜晚</span>
              </div>
              <div className="panel-divider" />
              <SoundMixer audio={audio} />
              <div className="panel-divider" />
              <label className="quality-label" htmlFor="quality">
                画面细节
                <select
                  id="quality"
                  value={quality}
                  onChange={(e) => setQuality(e.target.value as typeof quality)}
                >
                  <option value="auto">随设备调整</option>
                  <option value="low">轻量 · 更流畅</option>
                  <option value="high">精细 · 有阴影</option>
                </select>
              </label>
              <p className="tiny-note">
                当前可手动切换时光与四季。星空为氛围效果，尚未接入真实星图。
              </p>
            </>
          ) : panel === "storage" ? (
            <>
              <h2>把家园，好好收藏</h2>
              <p className="panel-copy">
                {world.user
                  ? `${world.user.name} · ${world.user.provider === "development" ? "开发账号" : world.user.provider === "guest" ? "访客" : world.user.provider === "joyhouse" ? "JoyHouse 账号" : "微信账号"}`
                  : "当前是本地体验，草稿保存在此浏览器。"}
              </p>
              <div className="storage-status">
                <Cloud size={23} />
                <div>
                  <strong>{syncText}</strong>
                  <small>
                    {world.user
                      ? "PostgreSQL 服务器存档"
                      : "登录后连接服务器存档"}
                  </small>
                </div>
              </div>
              {!world.user ? (
                <button
                  className="primary-button"
                  onClick={() => setLoginOpen(true)}
                >
                  <LogIn size={16} /> 登录家园
                </button>
              ) : (
                <>
                  <div className="button-grid">
                    <button
                      className="small-button"
                      disabled={
                        world.busy ||
                        world.status === "saving" ||
                        world.status === "conflict"
                      }
                      onClick={() => void world.save()}
                    >
                      <Cloud size={15} />
                      立即保存
                    </button>
                    <button
                      className="small-button"
                      disabled={world.busy || world.status === "saving"}
                      onClick={() => void world.reload()}
                    >
                      <RefreshCw size={15} />
                      载入服务器
                    </button>
                  </div>
                  <button
                    className="text-button"
                    disabled={world.busy || world.status === "saving"}
                    onClick={() => void world.fork()}
                  >
                    <Plus size={14} /> 将当前家园另存为副本
                  </button>
                  {world.record && (
                    <div className="share-box">
                      <h3>
                        <Link2 size={14} /> 邀朋友来岛上玩
                      </h3>
                      <button
                        className="small-button"
                        disabled={shareBusy}
                        aria-pressed={share?.sharing === "link"}
                        onClick={() => void toggleShare()}
                      >
                        {share?.sharing === "link"
                          ? "关闭参观链接"
                          : "开放参观链接"}
                      </button>
                      {share?.sharing === "link" && share.shareUrl && (
                        <>
                          <div className="share-link-row">
                            <input
                              readOnly
                              value={share.shareUrl}
                              aria-label="参观链接"
                              onFocus={(e) => e.currentTarget.select()}
                            />
                            <button
                              className="small-button"
                              onClick={() => void copyShare(share.shareUrl!)}
                            >
                              <Copy size={13} /> 复制
                            </button>
                          </div>
                          <button
                            className="text-button"
                            disabled={shareBusy}
                            aria-pressed={share.plant}
                            onClick={() => void togglePlant()}
                          >
                            <Sprout size={14} />
                            {share.plant
                              ? "已开放一起种植（点我关闭）"
                              : "允许朋友一起种植"}
                          </button>
                          <small>
                            朋友打开链接只能走走看看
                            {share.plant ? "，还可以种下小树和花" : ""}
                            ；关闭链接后立即失效。
                          </small>
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
              {world.status === "conflict" && (
                <div className="conflict-box">
                  <strong>你的草稿还在这里</strong>
                  <p>
                    另一设备可能正在编辑，或服务器版本已更新。可以先导出、另存副本，再载入服务器版本。
                  </p>
                  <button
                    className="small-button"
                    onClick={() => void world.takeover()}
                  >
                    接管编辑权
                  </button>
                </div>
              )}
              <div className="panel-divider" />
              <div className="button-grid">
                <button className="small-button" onClick={world.exportWorld}>
                  <ArrowDownToLine size={15} />
                  导出存档
                </button>
                <button
                  className="small-button"
                  onClick={() => upload.current?.click()}
                >
                  <ArrowUpFromLine size={15} />
                  导入存档
                </button>
              </div>
              <button
                className="text-button"
                onClick={() => void world.exportBackup()}
              >
                导出载入前的备份
              </button>
              <input
                ref={upload}
                hidden
                type="file"
                accept="application/json,.json"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void world.importWorld(f);
                  e.target.value = "";
                }}
              />
              <p className="tiny-note">
                已登录时，编辑停下 2
                秒后自动保存。断网时保留本地草稿；版本冲突时停止自动覆盖。
              </p>
            </>
          ) : panel === "growth" ? (
            <>
              <h2>成长册</h2>
              <p className="panel-copy">
                {growth.state.stars} 颗星 · {growth.state.deeds.length} 条记录
              </p>
              {growth.tasks
                .filter((t) => !growth.state.done[t.id])
                .slice(0, 3)
                .map((t) => (
                  <p className="tiny-note" key={t.id}>
                    下一步：{t.title}——{t.story}（{growth.progress(t.id)}/
                    {t.goal.count}）
                  </p>
                ))}
              <div className="panel-divider" />
              <div className="growth-list">
                {growth.tasks.map((t) => (
                  <div
                    className={`growth-task ${growth.state.done[t.id] ? "done" : ""}`}
                    key={t.id}
                  >
                    <strong>{t.title}</strong>
                    <small>
                      {growth.state.done[t.id]
                        ? "✓ 已完成"
                        : `${growth.progress(t.id)}/${t.goal.count} · ${t.story}`}
                    </small>
                    <span aria-hidden="true">{t.stars}★</span>
                  </div>
                ))}
              </div>
              <div className="panel-divider" />
              <strong className="credits-title">星星小铺</strong>
              <div className="growth-list">
                {growth.unlocks.map((u) => {
                  const owned = !!growth.state.owned[u.id];
                  return (
                    <div className="growth-task" key={u.id}>
                      <strong>{u.name}</strong>
                      {owned ? (
                        <span aria-hidden="true">✓</span>
                      ) : (
                        <button
                          className="unlock-buy"
                          disabled={growth.state.stars < u.cost}
                          onClick={() => growth.buy(u.id)}
                        >
                          {u.cost}★
                        </button>
                      )}
                      <small>{u.note}</small>
                    </div>
                  );
                })}
              </div>
              {growth.state.deeds.length > 0 && (
                <>
                  <div className="panel-divider" />
                  <strong className="credits-title">最近的事</strong>
                  {growth.state.deeds.slice(0, 6).map((d, i) => (
                    <p className="credits-copy" key={i}>
                      {new Date(d.at).toLocaleDateString()} · {d.text}
                    </p>
                  ))}
                </>
              )}
              <p className="tiny-note">
                种花、读书、问候居民，都算数。星星以后能解锁新的小装饰。
              </p>
            </>
          ) : (
            <>
              <h2>一个慢慢生长的世界</h2>
              <p className="panel-copy">心灵家园 · 主岛与十一处小天地</p>
              <p className="credits-copy">
                岛屿、建筑、分形树木由代码生成。同一颗种子，会长出同一片起点；你的每次布置，让它逐渐成为自己的家。
              </p>
              <div className="panel-divider" />
              <strong className="credits-title">开放的客户端</strong>
              <p className="credits-copy">
                客户端采用 AGPL-3.0-only；共享协议与世界规则采用 Apache-2.0。
              </p>
              <div className="credit-links">
                <a
                  href="https://github.com/JoyhouseLabs/island-open"
                  target="_blank"
                  rel="noreferrer"
                >
                  开源项目 ↗
                </a>
                <a
                  href="https://app.joyhouse.chat/source/island-open-20261021.tar.gz"
                  download
                >
                  此版本客户端源码 ↓
                </a>
              </div>
              <div className="panel-divider" />
              <strong className="credits-title">狐狸与声音</strong>
              <p className="credits-copy">
                狐狸模型：PixelMannen（CC0）。绑定与动画：tomkranis；glTF
                转换：AsoboStudio、scurest（CC BY
                4.0）。原始文件未修改，场景中调整了比例。
              </p>
              <div className="credit-links">
                <a
                  href="https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/Fox"
                  target="_blank"
                  rel="noreferrer"
                >
                  资源来源 ↗
                </a>
                <a
                  href="https://creativecommons.org/licenses/by/4.0/"
                  target="_blank"
                  rel="noreferrer"
                >
                  授权说明 ↗
                </a>
              </div>
              <p className="credits-copy">
                海浪环境声为程序合成的原创音频。当前没有背景音乐。狐狸沿道路巡游；每个地标都有自己的独立小天地，天气与四季全岛共享。
              </p>
            </>
          )}
        </aside>
      )}
      {loginOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setLoginOpen(false);
          }}
        >
          <div
            ref={dialog}
            className="login-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="login-title"
          >
            <button
              className="modal-close"
              aria-label="关闭登录"
              onClick={() => setLoginOpen(false)}
            >
              <X size={20} />
            </button>
            <div className="login-icon">
              <House size={32} strokeWidth={1.2} />
            </div>
            <span className="eyebrow">BRING YOUR WORLD WITH YOU</span>
            <h2 id="login-title">
              无论走到哪里，
              <br />
              家园都在。
            </h2>
            <p>
              登录后，将岛屿收藏到服务器，
              <br />
              下次回来，继续让它生长。
            </p>
            {world.config?.joyhouse && (
              <>
                <a
                  className="primary-button"
                  href="/api/auth/joyhouse/start?mode=scan"
                >
                  微信扫码登录 <ArrowUpRight size={17} />
                </a>
                <a
                  className="small-button"
                  href="/api/auth/joyhouse/start?mode=h5"
                >
                  微信内授权登录
                </a>
              </>
            )}
            {!world.config?.joyhouse && world.config?.website && (
              <a
                className="primary-button"
                href="/api/auth/wechat/website/start"
              >
                微信扫码登录 <ArrowUpRight size={17} />
              </a>
            )}
            {!world.config?.joyhouse && world.config?.h5 && (
              <a className="small-button" href="/api/auth/wechat/h5/start">
                微信内授权登录
              </a>
            )}
            {!world.config?.joyhouse &&
              !world.config?.website &&
              !world.config?.h5 && (
                <div className="wechat-pending">
                  <ShieldCheck size={17} />
                  <span>微信登录等待开放平台配置</span>
                </div>
              )}
            {world.config?.development && (
              <button
                disabled={world.busy}
                className="primary-button"
                onClick={async () => {
                  await world.login();
                  setLoginOpen(false);
                }}
              >
                {world.busy ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <LogIn size={17} />
                )}
                使用本地开发账号
              </button>
            )}
            <button className="text-button" onClick={() => setLoginOpen(false)}>
              先在岛上走走 <ChevronRight size={14} />
            </button>
            <small className="tiny-note">
              {world.config?.joyhouse
                ? "在微信内打开可直接授权，电脑上请使用微信扫码。"
                : world.config?.development
                  ? "开发账号仅用于本机联调，不代表微信授权。"
                  : "登录后可保存和恢复你的家园。"}
            </small>
          </div>
        </div>
      )}
      {noteOpen &&
        (() => {
          const next = growth.tasks.find((t) => !growth.state.done[t.id]);
          if (!next) return null;
          return (
            <div
              className="modal-backdrop"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setNoteOpen(false);
              }}
            >
              <div className="note-modal" role="dialog" aria-modal="true">
                <span className="eyebrow">A NOTE FROM THE FOX</span>
                <h2>狐狸叼来一张纸条</h2>
                <p className="note-paper">「{next.story}」</p>
                <p className="tiny-note">
                  {next.title} · 已完成 {growth.progress(next.id)}/
                  {next.goal.count} · 完成可得 {next.stars}★
                </p>
                <button
                  className="primary-button"
                  onClick={() => setNoteOpen(false)}
                >
                  去试试
                </button>
              </div>
            </div>
          );
        })()}
      {pickerOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPickerOpen(false);
          }}
        >
          <div
            className="avatar-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="avatar-title"
          >
            <button
              className="modal-close"
              aria-label="关闭形象选择"
              onClick={() => setPickerOpen(false)}
            >
              <X size={20} />
            </button>
            <span className="eyebrow">WHO WALKS YOUR ISLAND</span>
            <h2 id="avatar-title">选择你的形象</h2>
            <div className="avatar-stage">
              <Canvas
                dpr={[1, 1.5]}
                camera={{ position: [0, 0.95, 3.3], fov: 38 }}
              >
                <ambientLight intensity={1.1} />
                <directionalLight position={[2, 4, 3]} intensity={2} />
                <AvatarPreview config={draft} />
              </Canvas>
            </div>
            <div className="avatar-forms">
              {avatarForms.map((f) => (
                <button
                  key={f.id}
                  className={draft.form === f.id ? "active" : ""}
                  onClick={() => setDraft({ ...draft, form: f.id })}
                >
                  <strong>{f.name}</strong>
                  <small>{f.note}</small>
                </button>
              ))}
            </div>
            <div className="avatar-accents" aria-label="主题色">
              {avatarAccents.map((c) => (
                <button
                  key={c}
                  className={draft.accent === c ? "active" : ""}
                  style={{ background: c }}
                  aria-label={`主题色 ${c}`}
                  onClick={() => setDraft({ ...draft, accent: c })}
                />
              ))}
            </div>
            <label className="section-caption" htmlFor="hat-row">
              头上的配件
            </label>
            <div className="avatar-hats" id="hat-row">
              {avatarHats.map((h) => {
                const locked = !!h.unlockId && !growth.state.owned[h.unlockId];
                const def = h.unlockId
                  ? growth.unlocks.find((u) => u.id === h.unlockId)
                  : null;
                return (
                  <button
                    key={h.id}
                    className={`${draft.hat === h.id ? "active" : ""} ${locked ? "locked" : ""}`}
                    onClick={() => {
                      if (h.unlockId && !growth.state.owned[h.unlockId]) {
                        if (def && growth.state.stars >= def.cost) {
                          growth.buy(h.unlockId);
                          setDraft({ ...draft, hat: h.id });
                        } else {
                          growth.buy(h.unlockId); // shows the shortfall note
                        }
                        return;
                      }
                      setDraft({ ...draft, hat: h.id });
                    }}
                  >
                    {h.name}
                    {locked ? ` · ${def?.cost}★` : ""}
                  </button>
                );
              })}
            </div>
            <button
              className="primary-button"
              onClick={() => {
                setAvatar(draft);
                setWalking(true);
                setTool("explore");
                emitGrowth({ type: "avatar.walked" });
                setPickerOpen(false);
              }}
            >
              <Footprints size={16} /> 就这样出发
            </button>
            <button
              className="text-button"
              onClick={() => setPickerOpen(false)}
            >
              先在岛上看看
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
