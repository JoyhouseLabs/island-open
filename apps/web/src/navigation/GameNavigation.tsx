import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  Backpack as BagIcon,
  Map,
  Hammer,
  PawPrint,
  Menu,
  X,
} from "lucide-react";
import { sceneRegistry } from "@island/contracts";
import { animalInspectors } from "../animals/detailsStore";
import { useContentFeed } from "../contentStore";
import { allAgents } from "../animals/registry";
import { useGrowth } from "../progress/store";
import { playerAction } from "../player/actions";
import Backpack, { type BagContext } from "./Backpack";
import { menus, useMenuPanel, type MenuPanel } from "./store";
import "./navigation.css";

const entries = [
  ["map", "地图", Map],
  ["bag", "背包", BagIcon],
  ["build", "建造", Hammer],
  ["partners", "伙伴", PawPrint],
  ["more", "更多", Menu],
] as const;
export default function GameNavigation({
  context,
  visitBase,
  extraPlaces = [],
}: {
  context: BagContext;
  visitBase?: { id: string; token: string };
  extraPlaces?: { id: string; name: string }[];
}) {
  const panel = useMenuPanel(),
    location = useLocation(),
    navigate = useNavigate();
  const ref = useRef<HTMLElement>(null);
  const [notice, setNotice] = useState("");
  const [agents, setAgents] = useState(allAgents);
  const { state, tasks, progress } = useGrowth();
  const c = context;
  const feed = useContentFeed();
  const places = extraPlaces.length ? extraPlaces : (feed?.places ?? []);
  const actions = menus.actions?.();
  useEffect(() => {
    menus.open(null);
    setNotice("");
  }, [location.pathname, c.userId]);
  useEffect(() => {
    document.body.classList.toggle("has-game-nav", !c.compact);
    return () => document.body.classList.remove("has-game-nav");
  }, [c.compact]);
  useEffect(() => {
    document.body.classList.toggle("game-menu-open", !!panel);
    if (!panel) return;
    setAgents(allAgents());
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const timer = window.setInterval(() => setAgents(allAgents()), 750);
    return () => {
      clearInterval(timer);
      document.body.classList.remove("game-menu-open");
      previous?.isConnected && previous.focus();
    };
  }, [panel]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        !menus.panel &&
        (e.isComposing || e.ctrlKey || e.metaKey || e.altKey || e.repeat)
      )
        return;
      const editable = (e.target as HTMLElement)?.closest(
        "input,textarea,select,[contenteditable=true]",
      );
      if (menus.panel) {
        // Capture ahead of scene listeners: Escape closes one layer; held keys never reach the scene.
        e.stopImmediatePropagation();
        if (
          !e.isComposing &&
          !e.repeat &&
          !e.ctrlKey &&
          !e.metaKey &&
          !e.altKey &&
          (e.key === "Escape" || (!editable && e.key.toLowerCase() === "b"))
        ) {
          e.preventDefault();
          menus.open(null);
        }
        if (e.key === "Tab") {
          const list = [
            ...(ref.current?.querySelectorAll<HTMLElement>(
              'button:not(:disabled),input,select,a[href],[tabindex="0"]',
            ) ?? []),
          ].filter((el) => el.getClientRects().length);
          const first = list[0],
            last = list.at(-1);
          if (
            e.shiftKey &&
            (document.activeElement === first ||
              document.activeElement === ref.current)
          ) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      } else if (
        !editable &&
        e.key.toLowerCase() === "b" &&
        !document.querySelector('.shop-shade,[aria-modal="true"]')
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        menus.open("bag");
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, []);
  const go = (path: string) => {
    const active = menus.actions?.();
    if (active?.blocked) {
      setNotice(active.blocked);
      return;
    }
    menus.open(null);
    if (active?.travel) void active.travel(path);
    else void navigate(path);
  };
  const run = (fn?: () => void) => {
    if (!fn) return;
    if (actions?.blocked) {
      setNotice(actions.blocked);
      return;
    }
    menus.open(null);
    fn();
  };
  const bag = (tab: "materials" | "furniture" | "blueprints") =>
    menus.open("bag", tab);
  const name =
    sceneRegistry.find((s) => s.id === c.scene)?.name ??
    (c.scene === "wilderness" ? "外围探索" : "当前场景");
  return (
    <>
      {c.compact ? (
        <button
          className="compact-backpack"
          onClick={() => menus.toggle("bag")}
          aria-expanded={panel === "bag"}
        >
          <BagIcon size={19} />
          背包
        </button>
      ) : (
        <nav className="game-nav" aria-label="全场景主菜单">
          {entries.map(([id, label, Icon]) => (
            <button
              key={id}
              aria-expanded={panel === id}
              className={panel === id ? "selected" : ""}
              onClick={() => {
                setNotice("");
                menus.toggle(id);
              }}
            >
              <Icon size={21} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      )}
      {panel && (
        <div
          className="game-menu-shade"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) menus.open(null);
          }}
        >
          <section
            className="game-menu"
            ref={ref}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={
              panel === "growth"
                ? "成长"
                : entries.find((e) => e[0] === panel)?.[1]
            }
          >
            <header>
              <div>
                <span>
                  {c.visiting ? "参观中" : "我的家园"} · {name}
                </span>
                <h2>
                  {panel === "bag"
                    ? "我的背包"
                    : panel === "growth"
                      ? "成长与小目标"
                      : entries.find((e) => e[0] === panel)?.[1]}
                </h2>
              </div>
              <button aria-label="关闭菜单" onClick={() => menus.open(null)}>
                <X size={22} />
              </button>
            </header>
            {notice && <p role="status">{notice}</p>}
            {panel === "bag" && (
              <Backpack
                key={`${c.userId}:${c.homeId ?? "own"}`}
                context={c}
                go={go}
              />
            )}
            {panel === "map" && (
              <>
                <p className="nav-note">
                  {c.visiting
                    ? "参观路线保留当前分享权限。背包始终是自己的。"
                    : "选一个地方，继续探索。"}
                </p>
                <div className="nav-grid">
                  {sceneRegistry.map((s) => (
                    <button
                      key={s.id}
                      aria-current={s.id === c.scene ? "location" : undefined}
                      onClick={() =>
                        go(
                          visitBase
                            ? `/visit/${visitBase.id}${s.id === "island" ? "" : `/${s.id}`}?t=${encodeURIComponent(visitBase.token)}`
                            : `/${s.id}`,
                        )
                      }
                    >
                      {s.name}
                      {s.id === c.scene && <small>现在在这里</small>}
                    </button>
                  ))}
                  {!c.visiting &&
                    places.map((p) => (
                      <button key={p.id} onClick={() => go(`/place/${p.id}`)}>
                        {p.name}
                      </button>
                    ))}
                </div>
                {c.visiting && (
                  <button onClick={() => go("/island")}>返回自己的家园</button>
                )}
              </>
            )}
            {panel === "build" && (
              <>
                <p className="nav-note">
                  先选想做的事。打开背包会暂时挡住场景操作，关闭后可以继续原来的预览。
                </p>
                <div className="nav-grid">
                  <button
                    disabled={
                      !actions?.build ||
                      !!actions?.buildReason ||
                      !!actions?.blocked
                    }
                    onClick={() => run(actions?.build)}
                  >
                    自由布置
                    <small>
                      {actions?.buildReason ||
                        (actions?.build
                          ? "现有免费装饰与编辑工具"
                          : "当前场景不支持布置")}
                    </small>
                  </button>
                  <button onClick={() => bag("blueprints")}>
                    蓝图建造<small>查看配方与缺少的材料</small>
                  </button>
                  <button onClick={() => bag("furniture")}>
                    已有家具与摆件<small>查看摆放与收起状态</small>
                  </button>
                </div>
                {c.visiting && (
                  <p>这里只能参观；获授权的种植仍使用场景活动入口。</p>
                )}
                {actions?.blocked && <p role="status">{actions.blocked}</p>}
              </>
            )}
            {panel === "partners" && (
              <>
                <p className="nav-note">
                  当前场景中的伙伴。点开档案，再选择摸摸、对话或查看真实能力。
                </p>
                <div className="nav-grid">
                  {agents
                    .filter((a) => a.kind !== "player")
                    .map((a) => (
                      <button
                        key={a.id}
                        disabled={!animalInspectors.has(a.id)}
                        onClick={() => {
                          menus.open(null);
                          animalInspectors.get(a.id)?.();
                        }}
                      >
                        {a.name ?? a.kind}
                        <small>
                          {animalInspectors.has(a.id)
                            ? "当前场景 · 查看档案"
                            : "走近后按空格交谈"}
                        </small>
                      </button>
                    ))}
                </div>
                {!agents.some((a) => a.kind !== "player") && (
                  <p>这里暂时没有伙伴，去主岛或星光秘境找找吧。</p>
                )}
                <button onClick={() => menus.open("map")}>
                  去其他场景找伙伴
                </button>
              </>
            )}
            {panel === "more" && (
              <>
                <div className="nav-grid">
                  <button onClick={() => menus.open("growth")}>
                    成长与小目标
                  </button>
                  {actions?.shop ? (
                    <button onClick={() => run(actions.shop)}>
                      岛屿小铺 · Credit
                    </button>
                  ) : (
                    !c.visiting && (
                      <button onClick={() => go("/island")}>
                        回主岛逛小铺
                      </button>
                    )
                  )}
                  <button onClick={() => go("/stories")}>故事工坊 · 编故事</button>
                  <button onClick={() => go("/books")}>书籍与共读</button>
                  <button onClick={() => go("/learn")}>学习中心</button>
                  {actions?.settings && (
                    <button onClick={() => run(actions.settings)}>
                      环境与时间
                    </button>
                  )}
                  {actions?.sound && (
                    <button onClick={() => run(actions.sound)}>
                      环境声音开关
                    </button>
                  )}
                  {actions?.dress && (
                    <button onClick={() => run(actions.dress)}>装扮角色</button>
                  )}
                  {actions?.save && (
                    <button onClick={() => run(actions.save)}>
                      保存与分享
                    </button>
                  )}
                  {actions?.about && (
                    <button onClick={() => run(actions.about)}>
                      关于这座岛
                    </button>
                  )}
                </div>
                {actions?.moreContent && (
                  <div onClick={() => menus.open(null)}>
                    {actions.moreContent}
                  </div>
                )}
                <h3>角色动作</h3>
                <div className="nav-tabs">
                  {(
                    [
                      ["wave", "挥手"],
                      ["sit", "坐下"],
                      ["spin", "转圈"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => run(() => playerAction.trigger(id))}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="nav-note">
                  B 打开背包，Esc 关闭当前菜单。W/A/S/D
                  或方向键移动，空格跳跃或与附近伙伴交谈。场景 JSON
                  导出不包含全账号背包资产。
                </p>
              </>
            )}
            {panel === "growth" && (
              <>
                <p>
                  星星 <strong>{state.stars} ★</strong>
                </p>
                {tasks.map((t) => (
                  <article className="bag-recipe" key={t.id}>
                    <h3>
                      {state.done[t.id] ? "✓ " : ""}
                      {t.title}
                    </h3>
                    <p>
                      {progress(t.id)} / {t.goal.count}
                    </p>
                  </article>
                ))}
                <button onClick={() => menus.open("more")}>返回更多</button>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
