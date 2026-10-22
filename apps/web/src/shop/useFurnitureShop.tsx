import FurnitureThumbnail from "./FurnitureThumbnail";
import CreditPanel from "./CreditPanel";
import { useEffect, useRef, useState } from "react";
import { Armchair, Package, RotateCw, Store, X } from "lucide-react";
import {
  furnitureCatalog,
  shopPurchaseSchema,
  type FurniturePlacement,
  type FurnitureId,
  type ShopState,
  type ShopPurchaseResult,
} from "@island/contracts";
import { furniturePlacementError } from "@island/world-core";
import type { useWorld } from "../useWorld";
import { api, RequestError } from "../api";
import type { FurnitureEditor } from "./Furniture";
import "./shop.css";

type World = ReturnType<typeof useWorld>;
type Pending = { itemId: FurnitureId; idempotencyKey: string };
export function useFurnitureShop(world: World, stopWalking: () => void) {
  const [open, setOpen] = useState(
      !!new URLSearchParams(location.search).get("creditRecharge"),
    ),
    [tab, setTab] = useState<"shop" | "bag" | "credits">(
      new URLSearchParams(location.search).has("creditRecharge")
        ? "credits"
        : "shop",
    );
  const [state, setState] = useState<ShopState | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [active, setActive] = useState<{
    id: string;
    itemId: FurnitureId;
  } | null>(null);
  const [preview, setPreview] = useState<FurniturePlacement | null>(null);
  const [rotation, setRotation] = useState<0 | 1 | 2 | 3>(0);
  const [pending, setPending] = useState<Pending | null>(null);
  const dialog = useRef<HTMLElement>(null);
  const lock = useRef(false),
    epoch = useRef(0),
    reads = useRef(0);
  const key = world.user ? `island-shop-purchase:${world.user.id}` : null;
  const blocked =
    !world.user ||
    !world.record ||
    !world.ready ||
    world.unsupported ||
    world.status === "conflict";
  const cancel = () => {
    setActive(null);
    setPreview(null);
  };
  useEffect(() => {
    epoch.current++;
    reads.current++;
    lock.current = false;
    setState(null);
    setBusy(false);
    setError("");
    cancel();
    try {
      const raw = key && localStorage.getItem(key);
      const parsed = shopPurchaseSchema.safeParse(raw ? JSON.parse(raw) : null);
      setPending(parsed.success ? parsed.data : null);
    } catch {
      setPending(null);
    }
    return () => {
      epoch.current++;
    };
  }, [key, world.record?.id]);
  useEffect(() => {
    if (!open) return;
    const prior = document.activeElement as HTMLElement | null;
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const nodes = Array.from(
        dialog.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),a[href],select:not(:disabled),input:not(:disabled)",
        ) ?? [],
      );
      const first = nodes[0],
        last = nodes.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener("keydown", trap);
    return () => {
      window.removeEventListener("keydown", trap);
      prior?.focus();
    };
  }, [open]);
  const refresh = async () => {
    if (!world.user) return;
    const stamp = epoch.current,
      serial = ++reads.current;
    try {
      const next = await api<ShopState>("/shop");
      if (epoch.current === stamp && serial === reads.current) {
        setState(next);
        setError("");
      }
    } catch (e) {
      if (epoch.current === stamp && serial === reads.current)
        setError(e instanceof Error ? e.message : "小铺暂时没有连接上。");
    }
  };
  useEffect(() => {
    if (open && world.status !== "saving") void refresh();
  }, [open, key, world.record?.id, world.record?.revision]);
  useEffect(() => {
    if (blocked) cancel();
  }, [blocked]);
  useEffect(() => {
    if (!open && !active) return;
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        cancel();
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [open, active]);
  const begin = (item: { id: string; itemId: FurnitureId }) => {
    if (blocked) return;
    const placed = world.snapshot.furniture?.find((f) => f.id === item.id);
    setActive({ id: item.id, itemId: item.itemId });
    setPreview(placed ?? null);
    setRotation(placed?.rotation ?? 0);
    setOpen(false);
    stopWalking();
  };
  const purchase = async (itemId: FurnitureId) => {
    if (lock.current || !key || blocked) return;
    if (pending && pending.itemId !== itemId) {
      setError("请先重试上一次购买，确认结果后再挑选其他家具。");
      return;
    }
    const request = pending ?? { itemId, idempotencyKey: crypto.randomUUID() };
    // Persist before sending: reloads and network timeouts retry the same purchase.
    try {
      localStorage.setItem(key, JSON.stringify(request));
    } catch {
      setError("浏览器无法保存购买凭证，请允许本地存储后重试。");
      return;
    }
    setPending(request);
    lock.current = true;
    setBusy(true);
    setError("");
    reads.current++;
    const stamp = epoch.current;
    try {
      const result = await api<ShopPurchaseResult>("/shop/purchase", {
        method: "POST",
        body: JSON.stringify(request),
      });
      if (epoch.current !== stamp) return;
      localStorage.removeItem(key);
      setPending(null);
      setState(result.state);
      setTab("bag");
      world.notify("买好啦，家具已放进背包。选择「摆放」让它在岛上安家。");
    } catch (e) {
      if (epoch.current !== stamp) return;
      if (e instanceof RequestError && e.status >= 400 && e.status < 500) {
        localStorage.removeItem(key);
        setPending(null);
      }
      setError(
        e instanceof Error ? e.message : "暂未确认购买结果，请重试本次购买。",
      );
    } finally {
      if (epoch.current === stamp) {
        setBusy(false);
        lock.current = false;
      }
    }
  };
  const problem = preview
    ? furniturePlacementError(world.snapshot, preview)
    : "点击岛上的空地，预览摆放位置。";
  const store = (id: string) => {
    if (blocked) return;
    world.edit((w) => ({
      ...w,
      furniture: (w.furniture ?? []).filter((f) => f.id !== id),
    }));
    cancel();
    world.notify(
      "家具已收起，仍在你的家具背包里。等待云端保存后可在其他岛使用。",
    );
  };
  const editor: FurnitureEditor = {
    active: !!active,
    preview,
    invalid: !!problem,
    selectedId: preview ? (active?.id ?? null) : null,
    onPoint: (x, z) => {
      if (active && !blocked) setPreview({ ...active, x, z, rotation });
    },
    onSelect: (id) => {
      if (blocked) return;
      const f = world.snapshot.furniture?.find((f) => f.id === id);
      if (f) begin(f);
    },
  };
  const button = (
    <button
      className="tool"
      aria-label="岛屿小铺"
      onClick={() => {
        cancel();
        setOpen(true);
        setTab("shop");
      }}
    >
      <Store size={20} />
      <span>小铺</span>
    </button>
  );
  const ui = (
    <>
      {open && (
        <div className="shop-shade" onClick={() => setOpen(false)}>
          <section
            ref={dialog}
            className="shop-panel"
            role="dialog"
            aria-modal="true"
            aria-label="岛屿小铺"
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <div>
                <span className="shop-eyebrow">给自己的小岛，一点新心意</span>
                <h2>岛屿小铺</h2>
              </div>
              <button
                autoFocus
                className="circle-button"
                aria-label="关闭小铺"
                onClick={() => setOpen(false)}
              >
                <X size={20} />
              </button>
            </header>
            <div className="shop-wallet">
              <strong>{state ? state.credits : "—"} Credit</strong>
              <button onClick={() => setTab("credits")}>充值 / 交易记录</button>
            </div>
            <p className="shop-note">
              使用 Credit 积分购买，每件家具都会进入背包，收起后可以再次摆放。
            </p>
            {!world.user && (
              <p className="shop-notice">
                登录后就能购买家具，并保存到自己的岛屿。可以先逛逛。
              </p>
            )}
            {blocked && world.user && (
              <p className="shop-notice">
                请等待家园加载，或先处理存档冲突，再继续布置。
              </p>
            )}
            {error && (
              <p role="alert" className="shop-error">
                {error} <button onClick={() => void refresh()}>刷新背包</button>
              </p>
            )}
            {pending && (
              <div className="shop-notice">
                上次购买结果待确认。
                <button
                  disabled={busy || blocked}
                  onClick={() => void purchase(pending.itemId)}
                >
                  重试本次购买
                </button>
              </div>
            )}
            <nav className="shop-tabs" aria-label="小铺分类">
              <button
                aria-pressed={tab === "shop"}
                onClick={() => setTab("shop")}
              >
                <Store size={16} />
                挑选家具
              </button>
              <button
                aria-pressed={tab === "bag"}
                onClick={() => setTab("bag")}
              >
                <Package size={16} />
                家具背包 · {state?.items.length ?? 0}
              </button>
              <button
                aria-pressed={tab === "credits"}
                onClick={() => setTab("credits")}
              >
                积分与订单
              </button>
            </nav>
            {tab === "credits" ? (
              world.user ? (
                <CreditPanel
                  key={world.user.id}
                  userId={world.user.id}
                  guest={world.user.provider === "guest"}
                  onBalance={() => void refresh()}
                />
              ) : (
                <p className="shop-notice">请先登录后查看积分和订单。</p>
              )
            ) : tab === "shop" ? (
              <div className="shop-grid">
                {furnitureCatalog.map((d) => (
                  <article key={d.id} className="shop-card">
                    <div
                      className="shop-art"
                      style={{ background: `${d.color}28` }}
                      aria-hidden="true"
                    >
                      <FurnitureThumbnail item={d} />
                    </div>
                    <h3>{d.name}</h3>
                    <p>{d.description}</p>
                    <small>
                      {d.width} × {d.depth} · 主岛地面
                    </small>
                    <button
                      disabled={
                        blocked ||
                        busy ||
                        !state ||
                        state.credits < d.price ||
                        !!pending
                      }
                      onClick={() => void purchase(d.id)}
                    >
                      购买 · {d.price} Credit
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="shop-bag">
                {!state?.items.length && (
                  <div className="shop-empty">
                    <Armchair size={36} />
                    <h3>为小岛挑一件喜欢的家具</h3>
                    <p>收起的家具会回到这里，随时可以再摆放。</p>
                    <button onClick={() => setTab("shop")}>去逛小铺</button>
                  </div>
                )}
                {state?.items.map((item) => {
                  const d = furnitureCatalog.find((d) => d.id === item.itemId)!;
                  const placed = world.snapshot.furniture?.some(
                    (f) => f.id === item.id,
                  );
                  const elsewhere =
                    item.worldId && item.worldId !== world.record?.id;
                  return (
                    <article className="shop-bag-item" key={item.id}>
                      <span className="shop-bag-icon">{d.icon}</span>
                      <div>
                        <strong>{d.name}</strong>
                        <small>
                          {elsewhere
                            ? "已摆在另一座岛"
                            : placed
                              ? "已摆在当前主岛"
                              : "背包中 · 可以摆放"}
                        </small>
                      </div>
                      <button
                        disabled={blocked || !!elsewhere}
                        onClick={() => begin(item)}
                      >
                        {placed ? "移动 / 旋转" : "摆放"}
                      </button>
                      {placed && (
                        <button
                          disabled={blocked}
                          onClick={() => store(item.id)}
                        >
                          收起
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
      {active && (
        <section className="furniture-tray" aria-label="摆放家具">
          <div>
            <strong>
              {furnitureCatalog.find((d) => d.id === active.itemId)?.name}
            </strong>
            <p role="status">{problem || "位置合适，可以放在这里。"}</p>
          </div>
          <div className="furniture-actions">
            <button
              onClick={() => {
                const r = ((rotation + 1) % 4) as 0 | 1 | 2 | 3;
                setRotation(r);
                setPreview((p) => (p ? { ...p, rotation: r } : p));
              }}
            >
              <RotateCw size={16} />
              旋转 {rotation * 90}°
            </button>
            <button
              className="confirm"
              disabled={!preview || !!problem || blocked}
              onClick={() => {
                if (!preview || problem) return;
                const f = preview;
                world.edit((w) => ({
                  ...w,
                  furniture: [
                    ...(w.furniture ?? []).filter((p) => p.id !== f.id),
                    f,
                  ],
                }));
                cancel();
                world.notify("家具放好了，正在保存。点击家具可以移动或收起。");
              }}
            >
              确认摆放
            </button>
            {world.snapshot.furniture?.some((f) => f.id === active.id) && (
              <button onClick={() => store(active.id)}>收起</button>
            )}
            <button onClick={cancel}>取消</button>
          </div>
        </section>
      )}
    </>
  );
  return { button, ui, editor, cancel, active: !!active };
}
