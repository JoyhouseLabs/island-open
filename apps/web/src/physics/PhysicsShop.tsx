import { useEffect, useRef, useState } from "react";
import {
  shopPurchaseSchema,
  type PhysicsAssetCatalog,
  type ShopPurchaseResult,
  type ShopState,
  type User,
  type FurnitureId,
} from "@island/contracts";
import { api, RequestError } from "../api";
import CreditPanel from "../shop/CreditPanel";
import "../shop/shop.css";
export default function PhysicsShop({
  user,
  catalog,
  onChanged,
  onClose,
}: {
  user: User;
  catalog: PhysicsAssetCatalog;
  onChanged: () => void;
  onClose: () => void;
}) {
  const [wallet, setWallet] = useState<ShopState | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const key = `island-shop-purchase:${user.id}`;
  const [pending, setPending] = useState<ReturnType<
    typeof shopPurchaseSchema.parse
  > | null>(() => {
    try {
      const p = shopPurchaseSchema.safeParse(
        JSON.parse(localStorage.getItem(key) ?? "null"),
      );
      return p.success ? p.data : null;
    } catch {
      return null;
    }
  });
  const lock = useRef(false),
    alive = useRef(true);
  const refresh = async () => {
    try {
      const s = await api<ShopState>("/shop");
      if (alive.current) {
        setWallet(s);
        onChanged();
      }
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    }
  };
  useEffect(() => {
    alive.current = true;
    void refresh();
    return () => {
      alive.current = false;
    };
  }, []);
  async function buy(itemId: FurnitureId) {
    if (lock.current) return;
    const request = pending ?? { itemId, idempotencyKey: crypto.randomUUID() };
    try {
      localStorage.setItem(key, JSON.stringify(request));
    } catch {
      setError("无法保留购买请求，请先允许本地存储");
      return;
    }
    lock.current = true;
    setBusy(true);
    setPending(request);
    setError("");
    try {
      const r = await api<ShopPurchaseResult>("/shop/purchase", {
        method: "POST",
        body: JSON.stringify(request),
      });
      if (alive.current) {
        localStorage.removeItem(key);
        setPending(null);
        setWallet(r.state);
        setError("购买成功，可在新增物品中选择这件家具");
        onChanged();
      }
    } catch (e) {
      if (alive.current) {
        if (e instanceof RequestError && e.status >= 400 && e.status < 500) {
          localStorage.removeItem(key);
          setPending(null);
        }
        setError((e as Error).message);
      }
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return (
    <section className="physics-shop" aria-label="岛屿小铺">
      <div className="physics-editor-row">
        <h2>岛屿小铺</h2>
        <strong>{wallet?.credits ?? "…"} Credit</strong>
        <button onClick={onClose}>关闭小铺</button>
        <button disabled={busy} onClick={() => void refresh()}>
          刷新背包
        </button>
      </div>
      <p>购买后永久归账号所有；收起不会退还积分，跨场景摆放须先收起原件。</p>
      <p aria-live="polite">{error}</p>
      {pending && (
        <button disabled={busy} onClick={() => void buy(pending.itemId)}>
          重试原购买请求
        </button>
      )}
      <div className="physics-shop-grid">
        {catalog.shop.map((item) => (
          <article key={item.itemId}>
            <strong>{item.definition.name}</strong>
            <span>{item.price} Credit</span>
            <button
              disabled={
                busy || !!pending || !wallet || wallet.credits < item.price
              }
              onClick={() => void buy(item.itemId)}
            >
              购买 {item.definition.name}
            </button>
          </article>
        ))}
      </div>
      <details
        open={new URLSearchParams(location.search).has("creditRecharge")}
      >
        <summary>积分充值与订单记录</summary>
        <CreditPanel
          userId={user.id}
          guest={user.provider === "guest"}
          onBalance={() => void refresh()}
          refreshKey={wallet?.credits}
        />
      </details>
    </section>
  );
}
