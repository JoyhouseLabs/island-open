import { animalDetails } from "./detailsStore";
import { useEffect, useRef, useState } from "react";
import type { AgentView } from "@island/contracts";
import { api } from "../api";
import { allAgents, playerAgent } from "./registry";
import { personaFor } from "./personas";
import { dialogue } from "../dialogue/store";

import { rests } from "./mindState";
export function mindRequest(agentId: string) {
  const p = personaFor(agentId);
  if (!p) throw new Error("这位居民暂未接入智能对话。");
  return {
    speakerId: p.subject,
    ...(p.world ? { world: p.world.worldId, token: p.world.token } : {}),
  };
}
export function useResidentMind(agentId: string) {
  const generation = useRef(0);
  const [view, setView] = useState<AgentView | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    setView(null);
    setError("");
    let alive = true;
    const version = ++generation.current;
    const abort = new AbortController();
    void Promise.resolve()
      .then(() =>
        api<AgentView>("/npc/agent/view", {
          method: "POST",
          body: JSON.stringify(mindRequest(agentId)),
          signal: abort.signal,
        }),
      )
      .then((v) => {
        if (alive && version === generation.current) setView(v);
      })
      .catch((e) => {
        if (alive && version === generation.current) setError(e.message);
      });
    return () => {
      alive = false;
      generation.current++;
      abort.abort();
    };
  }, [agentId]);
  const mutate = async (path: string, extra: object) => {
    const version = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const request = mindRequest(agentId);
      if (path === "forget") {
        animalDetails.clearHistory(agentId);
      }
      await api("/npc/agent/" + path, {
        method: "POST",
        body: JSON.stringify({ ...request, ...extra }),
      });
      const next = await api<AgentView>("/npc/agent/view", {
        method: "POST",
        body: JSON.stringify(request),
      });
      if (version !== generation.current) return false;
      setView(next);
      return true;
    } catch (e) {
      if (version === generation.current)
        setError(e instanceof Error ? e.message : "暂时无法保存。");
      return false;
    } finally {
      if (version === generation.current) setBusy(false);
    }
  };
  return { view, error, busy, mutate };
}
export function ResidentMemory({ agentId }: { agentId: string }) {
  const mind = useResidentMind(agentId);
  return <ResidentMemoryContent mind={mind} />;
}
export function ResidentMemoryContent({
  mind,
}: {
  mind: ReturnType<typeof useResidentMind>;
}) {
  const { view, error, busy, mutate } = mind;
  const [note, setNote] = useState(""),
    [confirm, setConfirm] = useState(false);
  return (
    <section className="resident-memory">
      <h3>居民记忆与技能</h3>
      {error && <p role="status">{error}</p>}
      {!view && !error && <p>正在读取居民档案…</p>}
      {view && (
        <>
          <p>
            {view.config.name || "这位伙伴"} ·{" "}
            {view.config.enabled ? "智能对话已开启" : "智能对话已暂停"}
          </p>
          <p>
            五行：{view.config.attributes.element} · 阴阳：
            {view.config.attributes.yinYang}
          </p>
          {view.config.background && <p>{view.config.background}</p>}
          {!!view.config.goals.length && (
            <p>目标：{view.config.goals.join("；")}</p>
          )}
          <p>
            自主生活：{view.config.autonomy.enabled ? "在线时开启" : "未开启"}
            。对话模型：{view.config.persona?.model || "沿用角色或平台默认模型"}
            。
          </p>
          <h4>可以调用的技能</h4>
          <p>{view.skills.map((s) => s.label).join("、") || "尚未分配技能"}</p>
          <h4>短期记忆</h4>
          <p className="animal-note">
            最近 {view.config.memory.shortTermHours} 小时内，最多{" "}
            {view.config.memory.recentMessages} 条；按你的账号独立保存。
          </p>
          <ol className="animal-history">
            {view.shortTerm.map((m) => (
              <li key={m.id}>
                <span>
                  {m.role === "user"
                    ? "我"
                    : m.role === "event"
                      ? "已记录的事件"
                      : "伙伴"}
                </span>
                <p>{m.content}</p>
              </li>
            ))}
          </ol>
          {!view.shortTerm.length && <p>还没有短期记忆。</p>}
          <h4>长期记忆</h4>
          <p className="animal-note">
            摘要由模型整理，可能有误；角色笔记是推断。关闭长期记忆后不用于回答，已存内容可通过清空删除。
          </p>
          {view.summary && <p>{view.summary}</p>}
          <ul className="animal-history">
            {view.longTerm.map((m) => (
              <li key={m.id}>
                <span>
                  {m.source === "user" ? "你希望记住的事" : "角色笔记（推断）"}
                </span>
                <p>{m.content}</p>
                <button
                  disabled={busy}
                  onClick={() => void mutate("forget", { memoryId: m.id })}
                >
                  忘记这条
                </button>
              </li>
            ))}
          </ul>
          <small>
            忘记一条时也会清除短期上下文和摘要，避免从旧对话重新记起。
          </small>
          <label>
            希望伙伴记住的事
            <textarea
              disabled={busy}
              value={note}
              maxLength={600}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <button
            disabled={busy || !note.trim() || !view.config.memory.longTerm}
            onClick={() =>
              void mutate("remember", { content: note }).then((ok) => {
                if (ok) setNote("");
              })
            }
          >
            记住这件事
          </button>
          <button disabled={busy} onClick={() => setConfirm(!confirm)}>
            清空这位伙伴的记忆
          </button>
          {confirm && (
            <p>
              会删除你与此岛居民的短期记录、摘要和长期笔记。
              <button
                disabled={busy}
                onClick={() =>
                  void mutate("forget", {}).then((ok) => {
                    if (ok) setConfirm(false);
                  })
                }
              >
                确认清空
              </button>
            </p>
          )}
          <h4>最近的自主决定</h4>
          <ul className="animal-history">
            {view.runs.map((r) => (
              <li key={r.id}>
                <p>{r.intent || "一次决策"}</p>
                <span>
                  {r.skill || "未调用技能"} ·{" "}
                  {{
                    running: "进行中",
                    completed: "决策完成",
                    failed: "未完成",
                    cancelled: "已取消",
                  }[r.status] ?? r.status}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
export function ResidentLife({
  worldId,
  enabled,
}: {
  worldId: string | undefined;
  enabled: boolean;
}) {
  useEffect(() => {
    if (!enabled || !worldId) return;
    let closed = false,
      busy = false,
      cursor = 0;
    const abort = new AbortController();
    const tick = async () => {
      if (closed || busy || document.hidden || dialogue.open || dialogue.npc)
        return;
      const p = playerAgent();
      if (!p) return;
      const actors = allAgents().filter(
        (a) =>
          a.kind !== "player" &&
          a.kind !== "tutor" &&
          Math.hypot(a.x - p.x, a.z - p.z) < 35 &&
          personaFor(a.id),
      );
      if (!actors.length) return;
      const actor = actors[cursor++ % actors.length]!;
      busy = true;
      try {
        const result = await api<{ status: string; action?: string }>(
          "/npc/agent/decide",
          {
            method: "POST",
            body: JSON.stringify({
              ...mindRequest(actor.id),
              world: worldId,
              requestId: crypto.randomUUID(),
            }),
            signal: AbortSignal.any([abort.signal, AbortSignal.timeout(90000)]),
          },
        );
        if (
          !closed &&
          !document.hidden &&
          result.status === "completed" &&
          result.action === "rest"
        )
          rests.set(actor.id, Date.now() + 15000);
      } catch {
        /* Offline/disabled/rate-limited residents keep their ordinary behavior. */
      } finally {
        busy = false;
      }
    };
    const timer = window.setInterval(() => void tick(), 30000);
    return () => {
      closed = true;
      abort.abort();
      clearInterval(timer);
      rests.clear();
    };
  }, [worldId, enabled]);
  return null;
}
