import { useEffect, useState } from "react";
import {
  blueprintIds,
  furnitureCatalog,
  materialIds,
  starlightStateSchema,
  type BackpackState,
} from "@island/contracts";
import {
  emptyStarlight,
  forageCatalog,
  materialNames,
  playBlueprints,
} from "@island/world-core";
import { api } from "../api";
import { growth, useGrowth } from "../progress/store";
import { openCard } from "../cards/store";
import { menus, type BagTab } from "./store";

export type BagContext = {
  userId: string | null;
  homeId?: string;
  seed?: number;
  scene: string;
  visiting?: boolean;
  compact?: boolean;
};
const preferences = new Map<string, { query: string; onlyUsable: boolean }>();
export default function Backpack({
  context: c,
  go,
}: {
  context: BagContext;
  go: (path: string) => void;
}) {
  const [tab, setTab] = useState<BagTab>(menus.tab);
  const [query, setQuery] = useState(
    preferences.get(c.userId ?? "local")?.query ?? "",
  );
  const [onlyUsable, setOnlyUsable] = useState(
    preferences.get(c.userId ?? "local")?.onlyUsable ?? false,
  );
  useEffect(() => {
    preferences.set(c.userId ?? "local", { query, onlyUsable });
  }, [c.userId, query, onlyUsable]);
  const [detail, setDetail] = useState<string | null>(null);
  const [selected, setSelected] = useState(c.homeId ?? "");
  const [result, setResult] = useState<BackpackState | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, reload] = useState(0);
  const { state: localGrowth } = useGrowth();
  useEffect(() => {
    let current = true;
    const abort = new AbortController();
    setResult(null);
    setError("");
    setLoading(true);
    if (!c.userId) {
      try {
        const raw =
          c.seed === undefined
            ? null
            : localStorage.getItem(`island-starlight.v1:local:${c.seed}`);
        const state = raw
          ? starlightStateSchema.parse(JSON.parse(raw))
          : emptyStarlight();
        const readAt = new Date().toISOString();
        setResult({
          userId: "local",
          homes: [],
          homeWorldId: null,
          collection: {
            status: "ready",
            data: {
              ...growth.snapshot(),
              owned: Object.fromEntries(
                Object.entries(growth.snapshot().owned)
                  .filter(([, yes]) => yes)
                  .map(([id]) => [id, true as const]),
              ),
            },
            readAt,
          },
          furniture: { status: "ready", data: [], readAt },
          starlight:
            c.seed === undefined
              ? { status: "error", message: "返回本机家园后可读取观星角材料。" }
              : {
                  status: "ready",
                  data: { worldId: null, updatedAt: null, state },
                  readAt,
                },
        });
      } catch {
        setError("本机材料暂时无法读取，原记录仍保留。请返回星光秘境检查。");
      }
      setLoading(false);
      return;
    }
    api<BackpackState>(
      `/backpack${selected ? `?homeWorldId=${encodeURIComponent(selected)}` : ""}`,
      {
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(12000)]),
        cache: "no-store",
      },
    )
      .then((data) => {
        if (current && data.userId === c.userId) setResult(data);
      })
      .catch((e) => {
        if (current) setError(e.message || "暂时无法读取背包，请重试。");
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
      abort.abort();
    };
  }, [c.userId, c.seed, selected, revision]);
  const ownHere =
    !c.visiting &&
    !c.compact &&
    (!result?.homeWorldId || result.homeWorldId === c.homeId);
  const starHere = ownHere && c.scene === "starlight";
  const furnitureHere = ownHere && c.scene === "island";
  const blocked = menus.actions?.().blocked;
  const playUseReason = menus.actions?.().playUseReason;
  const star =
    result?.starlight.status === "ready" ? result.starlight.data : null;
  const matches = (name: string) => name.includes(query.trim());
  const jumpStar = (kind: "blueprint" | "item" | "materials", id?: string) => {
    if (blocked || (starHere && playUseReason)) return;
    if (starHere && menus.actions?.().starlight) {
      menus.open(null);
      menus.actions?.().starlight?.(kind, id);
    } else go("/starlight");
  };
  const actionReason = c.visiting
    ? "参观中，只查看自己的物品"
    : c.compact
      ? "阅读期间只查看"
      : !ownHere
        ? "请先返回此物品所属的家园"
        : "在星光秘境使用";
  return (
    <>
      <p className="nav-note">
        {c.userId ? "我的账号背包" : "本机背包 · 尚未登录"}
        {c.visiting ? " · 当前正在参观" : ""}。收藏是发现记录，材料才用于消耗。
      </p>
      {!!result?.homes.length && (
        <label className="bag-home">
          材料所属家园
          <select
            value={result.homeWorldId ?? ""}
            onChange={(e) => setSelected(e.target.value)}
          >
            {result.homes.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="nav-tabs" aria-label="背包分类">
        {(
          [
            ["materials", "材料"],
            ["furniture", "家具与摆件"],
            ["blueprints", "蓝图"],
            ["collection", "收藏"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            aria-pressed={tab === id}
            onClick={() => {
              menus.tab = id;
              setTab(id);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="bag-filters">
        <input
          type="search"
          placeholder="找一找物品"
          aria-label="搜索物品名称"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label>
          <input
            type="checkbox"
            checked={onlyUsable}
            onChange={(e) => setOnlyUsable(e.target.checked)}
          />
          此处可用
        </label>
        <button onClick={() => reload((n) => n + 1)} disabled={loading}>
          刷新
        </button>
      </div>
      {loading && <p role="status">正在打开背包…</p>}
      {error && <p role="alert">{error}</p>}
      {starHere && playUseReason && <p role="status">{playUseReason}。</p>}
      {blocked && <p role="status">{blocked}（可以继续查看背包）</p>}
      {result && (
        <>
          {tab !== "collection" && result.starlight.status === "error" && (
            <p role="alert">观星角：{result.starlight.message}</p>
          )}
          {tab === "materials" && star && (
            <>
              {materialIds
                .filter(
                  (id) =>
                    matches(materialNames[id]) && (!onlyUsable || starHere),
                )
                .map((id) => (
                  <article
                    className="bag-item"
                    key={`starlight:material:${id}`}
                  >
                    <span className="bag-icon">
                      {id === "moonfruit"
                        ? "🫐"
                        : id === "branch"
                          ? "🌿"
                          : "🪨"}
                    </span>
                    <div>
                      <h3>
                        {materialNames[id]} <b>× {star.state.materials[id]}</b>
                      </h3>
                      <small>
                        观星角材料 · {starHere ? "可在此处使用" : actionReason}
                      </small>
                    </div>
                  </article>
                ))}
              <p className="nav-note">
                走近秘境的发光采摘点，点击后按 E 或“采摘”。材料最多各 99 份。
              </p>
              {!c.visiting && !c.compact && ownHere && (
                <button
                  className="nav-primary"
                  disabled={!!blocked || !!playUseReason}
                  onClick={() => jumpStar("materials")}
                >
                  {starHere ? "采摘与伙伴点心" : "去星光秘境"}
                </button>
              )}
            </>
          )}
          {tab === "furniture" && (
            <>
              {result.furniture.status === "error" ? (
                <p role="alert">家具：{result.furniture.message}</p>
              ) : (
                result.furniture.data
                  .filter(
                    (i) =>
                      matches(
                        furnitureCatalog.find((d) => d.id === i.itemId)?.name ??
                          i.itemId,
                      ) &&
                      (!onlyUsable ||
                        (furnitureHere &&
                          (!i.worldId || i.worldId === c.homeId))),
                  )
                  .map((i) => {
                    const d = furnitureCatalog.find((d) => d.id === i.itemId);
                    return (
                      <article className="bag-item" key={`shop:${i.id}`}>
                        <span className="bag-icon">{d?.icon ?? "🪑"}</span>
                        <div>
                          <h3>{d?.name ?? i.itemId}</h3>
                          <small>
                            岛屿小铺 ·{" "}
                            {i.worldId
                              ? i.worldId === c.homeId
                                ? "已摆在当前主岛"
                                : "已摆在其他场景，需先在那里收起"
                              : "已收起"}
                          </small>
                        </div>
                        {furnitureHere &&
                          (!i.worldId || i.worldId === c.homeId) && (
                            <button
                              disabled={!!blocked}
                              onClick={() => {
                                menus.open(null);
                                menus.actions?.().furniture?.();
                              }}
                            >
                              管理摆放
                            </button>
                          )}
                      </article>
                    );
                  })
              )}
              {star?.state.structures
                .filter(
                  (i) =>
                    matches(playBlueprints[i.blueprint].name) &&
                    (!onlyUsable || starHere),
                )
                .map((i) => (
                  <article
                    className="bag-item"
                    key={`starlight:${star.worldId}:${i.id}`}
                  >
                    <span className="bag-icon">
                      {i.blueprint === "lantern"
                        ? "🏮"
                        : i.blueprint === "basket"
                          ? "🧺"
                          : "🧶"}
                    </span>
                    <div>
                      <h3>{playBlueprints[i.blueprint].name}</h3>
                      <small>
                        观星角 · {i.placement ? "已摆放" : "已收起"}
                        {starHere ? "" : ` · ${actionReason}`}
                      </small>
                    </div>
                    {starHere && (
                      <button
                        disabled={!!blocked || !!playUseReason}
                        onClick={() => jumpStar("item", i.id)}
                      >
                        {i.placement ? "调整位置" : "摆放"}
                      </button>
                    )}
                  </article>
                ))}
              <p className="nav-note">
                每件家具和摆件单独记录；已摆放的物品不会另算一件库存。
              </p>
              {!c.visiting && !c.compact && ownHere && (
                <button
                  onClick={() =>
                    furnitureHere
                      ? (menus.open(null), menus.actions?.().furniture?.())
                      : go("/island")
                  }
                >
                  去主岛管理家具
                </button>
              )}
            </>
          )}
          {tab === "blueprints" &&
            star &&
            blueprintIds
              .filter(
                (id) =>
                  matches(playBlueprints[id].name) && (!onlyUsable || starHere),
              )
              .map((id) => {
                const d = playBlueprints[id];
                const missing = materialIds.filter(
                  (m) => (d.cost[m] ?? 0) > star.state.materials[m],
                );
                return (
                  <article className="bag-recipe" key={`blueprint:${id}`}>
                    <h3>{d.name}</h3>
                    <p>{d.note}</p>
                    <p>
                      {materialIds
                        .filter((m) => d.cost[m])
                        .map(
                          (m) =>
                            `${materialNames[m]} ${star.state.materials[m]}/${d.cost[m]}`,
                        )
                        .join(" · ")}
                    </p>
                    <small>
                      {missing.length
                        ? `还缺：${missing.map((m) => `${materialNames[m]} ${d.cost[m]! - star.state.materials[m]}`).join("、")}`
                        : "材料已备齐"}{" "}
                      · {starHere ? "确认摆放时扣料" : actionReason}
                    </small>
                    {starHere && (
                      <button
                        disabled={
                          !!blocked || !!playUseReason || !!missing.length
                        }
                        onClick={() => jumpStar("blueprint", id)}
                      >
                        预览建造
                      </button>
                    )}
                  </article>
                );
              })}
          {tab === "collection" &&
            (result.collection.status === "error" ? (
              <p role="alert">收藏：{result.collection.message}</p>
            ) : (
              <>
                <div className="bag-collection">
                  {forageCatalog
                    .filter((i) => matches(i.name))
                    .map((i) => {
                      const count =
                        (c.userId
                          ? result.collection.status === "ready"
                            ? result.collection.data.collected
                            : {}
                          : localGrowth.collected)[i.kind] ?? 0;
                      return (
                        <button
                          key={`forage:${i.kind}`}
                          onClick={() =>
                            setDetail(detail === i.kind ? null : i.kind)
                          }
                        >
                          <span>{i.emoji}</span>
                          <strong>{i.name}</strong>
                          <small>发现 {count} 次</small>
                        </button>
                      );
                    })}
                </div>
                {detail && (
                  <article className="bag-recipe">
                    <h3>
                      {forageCatalog.find((i) => i.kind === detail)?.name}
                    </h3>
                    <p>{forageCatalog.find((i) => i.kind === detail)?.note}</p>
                    {!c.visiting && !c.compact && (
                      <button
                        onClick={() => {
                          menus.open(null);
                          openCard(
                            `forage:${detail}` as Parameters<
                              typeof openCard
                            >[0],
                          );
                        }}
                      >
                        打开知识卡
                      </button>
                    )}
                  </article>
                )}
                <p className="nav-note">
                  这是累计发现，不能代替观星角材料。点开查看图鉴；星星和小目标在“更多
                  → 成长”。
                </p>
              </>
            ))}
          {onlyUsable &&
            !starHere &&
            tab !== "collection" &&
            (tab !== "furniture" || !furnitureHere) && (
              <p className="nav-note">
                这里暂无可使用的这一类物品，取消筛选可查看全部。
              </p>
            )}
        </>
      )}
    </>
  );
}
