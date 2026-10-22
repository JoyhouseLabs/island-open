import { useEffect, useRef, useState, type RefObject } from "react";
import { Canvas } from "@react-three/fiber";
import {
  Backpack,
  ChevronUp,
  Hand,
  LoaderCircle,
  Lock,
  Shirt,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import { useSyncExternalStore } from "react";
import { forageCatalog } from "@island/world-core";
import { openCard } from "../cards/store";
import { useGrowth } from "../progress/store";
import { useHomeSession } from "../HomeSession";
import { AvatarPreview } from "./AvatarModel";
import { avatarAccents, avatarForms, avatarHats } from "./avatar";
import { playerAction } from "./actions";

/** Tiny shared open/close state so page buttons and the B key agree. */
const listeners = new Set<() => void>();
let openVersion = 0;
let open = false;
const toggle = (next?: boolean) => {
  open = next ?? !open;
  openVersion++;
  for (const l of listeners) l();
};
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
const getVersion = () => openVersion;
export function usePackOpen() {
  useSyncExternalStore(subscribe, getVersion);
  return open;
}

/** The dressing room keeps the same tiny store so the settings drawer,
 *  sub-scene buttons and the Escape key all agree. */
let dressingOpen = false,
  dressingVersion = 0;
const dressingListeners = new Set<() => void>();
const toggleDressing = (next?: boolean) => {
  dressingOpen = next ?? !dressingOpen;
  dressingVersion++;
  for (const l of dressingListeners) l();
};
export function useDressingOpen() {
  useSyncExternalStore(
    (cb) => {
      dressingListeners.add(cb);
      return () => dressingListeners.delete(cb);
    },
    () => dressingVersion,
  );
  return dressingOpen;
}

/**
 * True "mouse not on the panel" closing: pointermove outside the element
 * arms a generous timer (walking the mouse up from the toolbar must not
 * lose the panel halfway), re-entering cancels it, staying away closes.
 * mouseleave alone cannot do this — a mouse that never entered would
 * never "leave".
 */
const AWAY_CLOSE_MS = 1500;
/** Hover-capable pointer: buttons open their panel on hover and clicks are
 *  left to touch screens (a tap would otherwise open-then-toggle-close). */
const canHover =
  typeof window !== "undefined" &&
  window.matchMedia("(hover: hover)").matches;
/** The invoking buttons count as panel territory: resting the mouse on the
 *  backpack button must not time the panel out. */
let packInvoker: HTMLElement | null = null;
let dressingInvoker: HTMLElement | null = null;
/** Stable getters so useAwayClose never re-subscribes on a re-render. */
const packSafe = () => packInvoker;
const dressingSafe = () => dressingInvoker;
function useAwayClose(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  close: () => void,
  extraSafe?: () => HTMLElement | null,
) {
  // Keep the latest close in a ref so re-renders never clear a pending
  // timer by re-subscribing (the callback identity changes every render).
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  }, [close]);
  useEffect(() => {
    if (!active) return;
    let timer: number | undefined;
    const move = (e: PointerEvent) => {
      const el = ref.current,
        target = e.target as Node | null;
      const extra = extraSafe?.();
      const inside =
        !!el &&
        !!target &&
        (el === target ||
          el.contains(target) ||
          (!!extra && (extra === target || extra.contains(target))));
      if (inside) {
        window.clearTimeout(timer);
        timer = undefined;
      } else if (timer === undefined)
        timer = window.setTimeout(() => closeRef.current(), AWAY_CLOSE_MS);
    };
    window.addEventListener("pointermove", move);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointermove", move);
    };
  }, [active, extraSafe, ref]);
}

/** Backpack entry in a page's view-controls cluster. */
/** `tool` renders the island toolbar style with a label; the default is the
 *  round side-button used by sub-scene pages. */
export function BackpackButton({ tool = false, label = "背包" }: { tool?: boolean; label?: string }) {
  const isOpen = usePackOpen();
  return (
    <button
      className={`${tool ? "tool" : "circle-button"} ${isOpen ? "active" : ""}`}
      title="背包"
      aria-label={label === "背包" ? "打开背包" : label}
      aria-expanded={isOpen}
      ref={(el) => {
        packInvoker = el;
      }}
      onClick={() => {
        toggle();
      }}
    >
      <Backpack size={18} />
      {tool && <span>{label}</span>}
    </button>
  );
}

/** Touch-friendly jump, shown while the avatar walks. */
export function JumpButton({  visible,
  tool = false,
}: {
  visible: boolean;
  tool?: boolean;
}) {
  if (!visible) return null;
  return (
    <button
      className={tool ? "tool" : "circle-button"}
      title="跳跃"
      aria-label="跳跃"
      onClick={() => playerAction.trigger("jump")}
    >
      <ChevronUp size={20} />
      {tool && <span>跳跃</span>}
    </button>
  );
}

/** Dressing entry: the settings drawer on the island, round button elsewhere. */
export function DressingButton({ tool = false }: { tool?: boolean }) {
  const isOpen = useDressingOpen();
  return (
    <button
      className={`${tool ? "tool" : "circle-button"} ${isOpen ? "active" : ""}`}
      title="装扮"
      aria-label={isOpen ? "关闭装扮" : "打开装扮"}
      aria-expanded={isOpen}
      ref={(el) => {
        dressingInvoker = el;
      }}
      onPointerEnter={canHover ? () => toggleDressing(true) : undefined}
      onClick={() => {
        if (!canHover) toggleDressing();
      }}
    >
      <Shirt size={tool ? 19 : 18} />
      {tool && <span>装扮</span>}
    </button>
  );
}

/** The avatar's dressing room, split from the backpack: forms, colours,
 *  hats and the live preview. Hides when the mouse stays away. */
export function DressingPanel() {
  const isOpen = useDressingOpen();
  const ref = useRef<HTMLElement>(null);
  useAwayClose(ref, isOpen, () => toggleDressing(false), dressingSafe);
  useEffect(() => {
    if (!isOpen) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") toggleDressing(false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [isOpen]);
  if (!isOpen) return null;
  return (
    <aside className="panel dressing-panel" aria-label="装扮" ref={ref}>
      <button
        className="panel-close"
        aria-label="关闭装扮"
        onClick={() => toggleDressing(false)}
      >
        <X size={19} />
      </button>
      <span className="eyebrow">DRESSED FOR A WALK</span>
      <h2>装扮小屋</h2>
      <p className="tiny-note">换一身样子，岛上散步的心情也不一样。</p>
      <Dressing />
    </aside>
  );
}

const actions = [
  { id: "wave", label: "挥手", key: "1", icon: Hand },
  { id: "sit", label: "坐下", key: "2", icon: Sparkles },
  { id: "spin", label: "转圈", key: "3", icon: LoaderCircle },
] as const;

/** Wear a hat: star-shop hats need buying first (one tap buys and wears). */
function Dressing() {
  const { avatar, setAvatar } = useHomeSession();
  const { state, unlocks, buy } = useGrowth();
  if (!avatar) return null;
  const costOf = (unlockId?: string) =>
    unlockId ? unlocks.find((u) => u.id === unlockId)?.cost : undefined;
  return (
    <>
      {/* Live preview: every form, colour and hat change shows right here.
 *          Mirrors the picker's stage (AvatarPreview needs a Canvas). */}
      <div className="avatar-stage pack-stage">
        <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0.95, 3.3], fov: 38 }}>
          <ambientLight intensity={1.1} />
          <directionalLight position={[2, 4, 3]} intensity={2} />
          <AvatarPreview config={avatar} />
        </Canvas>
      </div>
      <div className="pack-forms">
        {avatarForms.map((f) => (
          <button
            key={f.id}
            className={`small-button ${avatar.form === f.id ? "active" : ""}`}
            aria-pressed={avatar.form === f.id}
            title={f.note}
            onClick={() => setAvatar({ ...avatar, form: f.id })}
          >
            {f.name}
          </button>
        ))}
      </div>
      <div className="pack-accents" aria-label="主题色">
        {avatarAccents.map((c) => (
          <button
            key={c}
            className={avatar.accent === c ? "active" : ""}
            style={{ background: c }}
            aria-label={`主题色 ${c}`}
            onClick={() => setAvatar({ ...avatar, accent: c })}
          />
        ))}
      </div>
      <div className="pack-hats">
        {avatarHats.map((h) => {
          const owned = !h.unlockId || state.owned[h.unlockId];
          const cost = costOf(h.unlockId);
          return (
            <button
              key={h.id}
              className={`small-button ${avatar.hat === h.id ? "active" : ""}`}
              aria-pressed={avatar.hat === h.id}
              onClick={() => {
                if (!owned) {
                  if (h.unlockId && buy(h.unlockId))
                    setAvatar({ ...avatar, hat: h.id });
                } else setAvatar({ ...avatar, hat: h.id });
              }}
            >
              {!owned && <Lock size={11} />}
              {h.name}
              {!owned && cost !== undefined && <span className="pack-cost">{cost}★</span>}
            </button>
          );
        })}
      </div>
    </>
  );
}

/**
 * The backpack: the forage collection, stars, unlocks, the next task and
 * the control cheatsheet — plus one-tap actions and dressing. B toggles it.
 */
export default function PlayerPanel() {
  const isOpen = usePackOpen();
  const [tab, setTab] = useState<"collect" | "goals" | "actions">("collect");
  const packRef = useRef<HTMLElement>(null);
  useAwayClose(packRef, isOpen, () => toggle(false), packSafe);
  const { state, tasks, progress } = useGrowth();
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (e.key.toLowerCase() === "b") toggle();
      else if (e.key === "Escape" && open) toggle(false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  if (!isOpen) return null;
  const nextTask = tasks.find((t) => !state.done[t.id]);
  const tabs = [
    { id: "collect", label: "收集" },
    { id: "goals", label: "小目标" },
    { id: "actions", label: "动作" },
  ] as const;
  return (
    <aside className="panel pack-panel" aria-label="背包" ref={packRef}>
      <button
        className="panel-close"
        aria-label="关闭背包"
        onClick={() => toggle(false)}
      >
        <X size={19} />
      </button>
      <span className="eyebrow">LITTLE THINGS, KEPT</span>
      <h2>我的背包</h2>
      <div className="pack-tabs" role="tablist" aria-label="背包分区">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`pack-tab ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "collect" && (
        <>
          <div className="pack-grid">
            {forageCatalog.map((c) => {
              const count = state.collected[c.kind] ?? 0;
              return (
                <div
                  key={c.kind}
                  className={`pack-cell ${count ? "" : "empty"}`}
                  title={c.note}
                  role="button"
                  tabIndex={0}
                  onClick={() => openCard(`forage:${c.kind}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openCard(`forage:${c.kind}`);
                    }
                  }}
                >
                  <span className="pack-emoji" aria-hidden="true">
                    {c.emoji}
                  </span>
                  <strong>{count}</strong>
                  <small>{c.name}</small>
                </div>
              );
            })}
          </div>
          <p className="tiny-note">
            在岛上散步时会遇到花瓣、松果、贝壳…走近就能捡起来；每类第一次捡到
            +1★。
          </p>
        </>
      )}
      {tab === "goals" && (
        <>
          <div className="pack-row">
            <Star size={15} />
            <span>星星 {state.stars}</span>
            <span className="pack-owned">
              {Object.keys(state.owned).length > 0
                ? `已换 ${Object.keys(state.owned).length} 件小物件`
                : "小铺还没换过东西"}
            </span>
          </div>
          {nextTask && (
            <p className="tiny-note">
              下一个小目标：「{nextTask.title}」—{" "}
              {progress(nextTask.id)} / {nextTask.goal.count}
            </p>
          )}
        </>
      )}
      {tab === "actions" && (
        <>
          <div className="pack-actions">
            {actions.map((a) => (
              <button
                key={a.id}
                className="small-button"
                onClick={() => playerAction.trigger(a.id)}
              >
                <a.icon size={14} />
                {a.label} · {a.key}
              </button>
            ))}
          </div>
          <p className="tiny-note">
            W/A/S/D 或方向键走路 · Shift 疾跑 · 空格跳跃（靠近伙伴时空格是交谈）·
            长椅可以跳上去坐 · B 关闭背包
          </p>
        </>
      )}
    </aside>
  );
}
