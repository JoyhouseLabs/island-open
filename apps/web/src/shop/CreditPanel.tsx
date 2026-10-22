import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  createRechargeSchema,
  type RechargeOptions,
  type RechargeOrder,
  type ShopHistory,
} from "@island/contracts";
import { api, RequestError } from "../api";
const date = (v: string) =>
  new Date(v).toLocaleString("zh-CN", { hour12: false });
const money = (fen: number) => (fen / 100).toFixed(2);
const status = { PENDING: "等待支付确认", PAID: "已到账", CLOSED: "已关闭" };
type Pending = {
  packId: string;
  channel: "native" | "h5";
  idempotencyKey: string;
};
export default function CreditPanel({
  userId,
  guest,
  onBalance,
  refreshKey,
}: {
  userId: string;
  guest: boolean;
  onBalance: () => void;
  refreshKey?: number;
}) {
  const [options, setOptions] = useState<RechargeOptions | null>(null),
    [history, setHistory] = useState<ShopHistory | null>(null);
  const [page, setPage] = useState(0),
    [selected, setSelected] = useState(""),
    [channel, setChannel] = useState<"native" | "h5">("native");
  const [current, setCurrent] = useState<RechargeOrder | null>(null),
    [qr, setQr] = useState("");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const lock = useRef(false),
    alive = useRef(true),
    loadId = useRef(0);
  const key = `island-recharge-request:${userId}`;
  const [pending, setPending] = useState<Pending | null>(() => {
    try {
      const p = createRechargeSchema.safeParse(
        JSON.parse(localStorage.getItem(key) ?? "null"),
      );
      return p.success ? p.data : null;
    } catch {
      return null;
    }
  });
  const insideWechat = /MicroMessenger/i.test(navigator.userAgent);
  const loadHistory = async () => {
    const id = ++loadId.current;
    try {
      const h = await api<ShopHistory>(`/credits/history?page=${page}`);
      if (alive.current && loadId.current === id) setHistory(h);
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "记录暂未加载成功。");
    }
  };
  useEffect(() => {
    alive.current = true;
    void api<RechargeOptions>("/credits/options")
      .then((v) => {
        if (alive.current) {
          setOptions(v);
          setSelected(v.packs[0]?.id ?? "");
        }
      })
      .catch(() => {
        if (alive.current) setError("充值配置暂时无法读取，请稍后重试。");
      });
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    void loadHistory();
  }, [page, refreshKey]);
  useEffect(() => {
    let cancelled = false;
    setQr("");
    if (
      current?.channel === "native" &&
      current.status === "PENDING" &&
      current.payUrl
    )
      void QRCode.toDataURL(current.payUrl, {
        width: 248,
        margin: 2,
        errorCorrectionLevel: "M",
      })
        .then((v) => {
          if (!cancelled) setQr(v);
        })
        .catch(() => {
          if (!cancelled) setError("二维码暂时无法显示，请重新打开订单。");
        });
    return () => {
      cancelled = true;
    };
  }, [current?.id, current?.payUrl, current?.status]);
  const create = async () => {
    if (lock.current || !options?.enabled || guest) return;
    const request = pending ?? {
      packId: selected,
      channel,
      idempotencyKey: crypto.randomUUID(),
    };
    try {
      localStorage.setItem(key, JSON.stringify(request));
    } catch {
      setError("无法保存充值凭证，请允许浏览器本地存储后再试。");
      return;
    }
    setPending(request);
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const next = await api<RechargeOrder>("/credits/recharges", {
        method: "POST",
        body: JSON.stringify(request),
      });
      if (!alive.current) return;
      localStorage.removeItem(key);
      setPending(null);
      setCurrent(next);
      await loadHistory();
    } catch (e) {
      if (!alive.current) return;
      if (e instanceof RequestError && e.status >= 400 && e.status < 500) {
        localStorage.removeItem(key);
        setPending(null);
      }
      setError(
        e instanceof Error ? e.message : "充值单暂未确认，请重试原订单。",
      );
    } finally {
      if (alive.current) {
        setBusy(false);
        lock.current = false;
      }
    }
  };
  const check = async (id: string, resume = false) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const next = await api<RechargeOrder>(
        `/credits/recharges/${id}/${resume ? "resume" : "check"}`,
        { method: "POST", body: "{}" },
      );
      if (alive.current) {
        setCurrent(next);
        if (next.status === "PAID") onBalance();
        await loadHistory();
      }
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "暂未确认支付，请稍后查询。");
    } finally {
      if (alive.current) {
        setBusy(false);
        lock.current = false;
      }
    }
  };
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("creditRecharge");
    if (id && /^IC[a-f0-9]{30}$/.test(id)) void check(id);
  }, []);
  // Poll a displayed unpaid order only; returning to the page always queries the API.
  useEffect(() => {
    if (current?.status !== "PENDING") return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void check(current.id);
    }, 6000);
    return () => clearInterval(timer);
  }, [current?.id, current?.status, page]);
  const pack = options?.packs.find((p) => p.id === selected);
  return (
    <div className="credit-panel">
      <h3>充值 Credit 积分</h3>
      {guest ? (
        <p className="shop-notice">
          充值前请使用正式账号登录，以便长期保存积分和购买记录。
        </p>
      ) : !options?.enabled ? (
        <p className="shop-notice">
          微信支付充值暂未开放。已有 Credit 仍可用于购买。
        </p>
      ) : (
        <>
          <div className="credit-packs">
            {options.packs.map((p) => (
              <button
                key={p.id}
                disabled={busy || !!pending}
                aria-pressed={selected === p.id}
                onClick={() => setSelected(p.id)}
              >
                <strong>{p.credits} Credit</strong>
                <span>¥{money(p.amountFen)}</span>
              </button>
            ))}
          </div>
          <label className="credit-channel">
            支付方式{" "}
            <select
              value={channel}
              disabled={busy || !!pending}
              onChange={(e) => setChannel(e.target.value as "native" | "h5")}
            >
              <option value="native">微信扫码</option>
              {options.h5 && !insideWechat && (
                <option value="h5">手机浏览器唤起微信</option>
              )}
            </select>
          </label>
          <p className="shop-note">
            {insideWechat
              ? "当前提供扫码充值。可在电脑打开小岛后用微信扫码；微信内直接支付尚未开放。"
              : "选择档位后生成充值单，在微信中确认付款。"}
            积分用于岛内物品购买。
          </p>
          <button
            disabled={busy || (!pack && !pending)}
            onClick={() => void create()}
          >
            {pending
              ? "重试原充值订单"
              : `确认充值 ${pack?.credits ?? "—"} Credit · ¥${pack ? money(pack.amountFen) : "—"}`}
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="shop-error">
          {error}
        </p>
      )}
      {current && (
        <section className="credit-payment">
          <h4>
            {current.credits} Credit · ¥{money(current.amountFen)}
          </h4>
          <p role="status">{status[current.status]}</p>
          {qr && (
            <img src={qr} width={248} height={248} alt="微信充值付款二维码" />
          )}
          {current.status === "PENDING" &&
            current.payUrl &&
            current.channel === "h5" && (
              <a
                className="credit-pay-link"
                href={`${current.payUrl}&redirect_url=${encodeURIComponent(
                  (() => {
                    const target = new URL(location.href);
                    target.searchParams.set("creditRecharge", current.id);
                    return target.href;
                  })(),
                )}`}
              >
                打开微信支付
              </a>
            )}
          <small>订单号：{current.id}</small>
          <small>有效至：{date(current.expiresAt)}</small>
          {current.status === "PENDING" &&
            !current.payUrl &&
            Date.parse(current.expiresAt) > Date.now() && (
              <button
                disabled={busy}
                onClick={() => void check(current.id, true)}
              >
                重新获取付款码 / 链接
              </button>
            )}
          {current.status === "PENDING" && (
            <button disabled={busy} onClick={() => void check(current.id)}>
              我已支付，查询结果
            </button>
          )}
        </section>
      )}
      <h3>充值记录</h3>
      {!history?.recharges.length && (
        <p className="shop-note">暂无充值记录。</p>
      )}
      {history?.recharges.map((r) => (
        <article className="credit-record" key={r.id}>
          <strong>
            {r.credits} Credit · ¥{money(r.amountFen)} · {status[r.status]}
          </strong>
          <small>
            {date(r.createdAt)} · {r.id}
          </small>
          {r.transactionId && <small>微信交易号：{r.transactionId}</small>}
          {r.status === "PENDING" && (
            <button disabled={busy} onClick={() => void check(r.id)}>
              查看 / 查询付款
            </button>
          )}
        </article>
      ))}
      <h3>家具购买记录</h3>
      {!history?.purchases.length && (
        <p className="shop-note">暂无购买记录。</p>
      )}
      {history?.purchases.map((p) => (
        <article className="credit-record" key={p.id}>
          <strong>
            {p.itemName} × 1 · −{p.price} Credit
          </strong>
          <small>
            {date(p.createdAt)} · 已完成 · 余额 {p.balanceAfter}
          </small>
          <small>订单号：{p.id}</small>
        </article>
      ))}
      <h3>积分流水</h3>
      {!history?.ledger.length && <p className="shop-note">暂无积分流水。</p>}
      {history?.ledger.map((l) => (
        <article className="credit-record" key={l.id}>
          <strong>
            {l.description} · {l.delta > 0 ? "+" : ""}
            {l.delta} Credit
          </strong>
          <small>
            {date(l.createdAt)} · 变动后余额 {l.balanceAfter}
          </small>
          <small>关联订单：{l.reference}</small>
        </article>
      ))}
      <div className="credit-pages">
        <button
          disabled={page === 0 || busy}
          onClick={() => setPage((p) => p - 1)}
        >
          上一页
        </button>
        <span>第 {page + 1} 页</span>
        <button
          disabled={!history?.hasMore || busy}
          onClick={() => setPage((p) => p + 1)}
        >
          下一页
        </button>
      </div>
    </div>
  );
}
