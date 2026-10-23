import { useEffect, useRef, useState } from "react";
import {
  forageCatalog,
  starterTasks,
  taskProgress,
  unlocks,
} from "@island/world-core";
import type { AccountInventory } from "./useAccountInventory";
import "./backpack.css";
const coming = new Set([
  "animal.petted",
  "weather.changed",
  "walk.gate_crossed",
]);
export default function AccountBackpack({
  inventory,
  close,
  dress,
  inspect,
}: {
  inventory: AccountInventory;
  close(): void;
  dress(): void;
  inspect(kind: string): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<
    "goals" | "collection" | "rewards" | "journal"
  >("goals");
  const [message, setMessage] = useState("");
  useEffect(() => {
    const node = dialog.current!;
    node.showModal();
    void inventory.refresh();
    return () => node.close();
  }, []);
  const state = inventory.state;
  return (
    <dialog
      ref={dialog}
      className="physics-content-dialog account-backpack"
      aria-labelledby="account-backpack-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <header>
        <h2 id="account-backpack-title">我的背包</h2>
        <button onClick={close}>关闭背包</button>
      </header>
      <p className="backpack-balance">
        {state ? `星星 ${state.stars} ★` : "正在读取账号背包…"}
      </p>
      <p>星星来自探索与阅读，可以兑换帽饰。购买家具使用小铺里的 Credit。</p>
      {inventory.error && <p role="alert">{inventory.error}</p>}
      {message && <p role="status">{message}</p>}
      <div className="backpack-sync">
        <span>
          {inventory.pending
            ? `${inventory.pending} 项记录等待同步`
            : inventory.error
              ? "同步未完成"
              : inventory.busy
                ? "正在同步…"
                : state
                  ? "已与账号同步"
                  : "尚未载入"}
        </span>
        <button
          disabled={inventory.busy}
          onClick={() => void inventory.refresh()}
        >
          同步背包
        </button>
      </div>
      <nav aria-label="背包分区">
        {(
          [
            ["goals", "小目标"],
            ["collection", "收集"],
            ["rewards", "兑换"],
            ["journal", "足迹"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>
      {state && tab === "goals" && (
        <ul className="backpack-goals">
          {starterTasks.map((t) => {
            const progress = taskProgress(state, t),
              done = state.done[t.id],
              unavailable = coming.has(t.goal.event) && !done;
            return (
              <li key={t.id}>
                <div>
                  <strong>{t.title}</strong>
                  <span>
                    {done
                      ? "已完成"
                      : unavailable
                        ? "稍后开放"
                        : `${progress} / ${t.goal.count}`}{" "}
                    · {t.stars}★
                  </span>
                </div>
                <p>{t.story}</p>
                <progress
                  aria-label={t.title}
                  value={progress}
                  max={t.goal.count}
                />
              </li>
            );
          })}
        </ul>
      )}
      {state && tab === "collection" && (
        <>
          <div className="backpack-collection">
            {forageCatalog.map((item) => (
              <article key={item.kind}>
                <span aria-hidden="true">{item.emoji}</span>
                <strong>{item.name}</strong>
                <span>{state.collected[item.kind] ?? 0} / 99</span>
                <small>{item.note}</small>
                <button onClick={() => inspect(item.kind)}>
                  查看{item.name}图鉴
                </button>
              </article>
            ))}
          </div>
          {!Object.keys(state.collected).length && <p>还没有收集到小物件。</p>}
        </>
      )}
      {state && tab === "rewards" && (
        <>
          <ul className="backpack-goals">
            {unlocks
              .filter((u) => u.id.startsWith("hat-"))
              .map((u) => (
                <li key={u.id}>
                  <strong>{u.name}</strong>
                  <p>{u.note}</p>
                  <button
                    disabled={inventory.busy || !!state.owned[u.id]}
                    onClick={async () => {
                      setMessage("");
                      if (await inventory.buy(u.id))
                        setMessage(`已拥有${u.name}，可以到「我的形象」穿戴。`);
                    }}
                  >
                    {state.owned[u.id]
                      ? `已拥有${u.name}`
                      : `兑换${u.name} · ${u.cost}★`}
                  </button>
                  {!state.owned[u.id] && state.stars < u.cost && (
                    <small>还差 {u.cost - state.stars}★</small>
                  )}
                </li>
              ))}
          </ul>
          <button onClick={dress}>去我的形象穿戴</button>
        </>
      )}
      {state &&
        tab === "journal" &&
        (state.deeds.length ? (
          <ol className="backpack-goals">
            {state.deeds.map((d, i) => (
              <li key={`${d.at}:${i}`}>
                <span>{d.text}</span>
                <small>{new Date(d.at).toLocaleString("zh-CN")}</small>
              </li>
            ))}
          </ol>
        ) : (
          <p>在岛上走走、种植或读书，慢慢留下自己的足迹。</p>
        ))}
    </dialog>
  );
}
