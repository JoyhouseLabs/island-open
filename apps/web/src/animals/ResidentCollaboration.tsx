import { useEffect, useRef, useState } from "react";
import type {
  CollaborationRoom,
  CollaborationTask,
  RunnerDevice,
} from "@island/contracts";
import { api } from "../api";
import { mindRequest } from "./mind";

const labels: Record<CollaborationTask["status"], string> = {
  queued: "等待执行",
  running: "正在思考",
  review: "等待你确认",
  accepted: "已采纳",
  rejected: "未采纳",
  cancelled: "已取消",
  unknown: "执行中断，结果未确认",
  failed: "本轮未完成",
};
type Index = { rooms: CollaborationRoom[]; devices: RunnerDevice[] };

export function ResidentCollaboration({
  agentId,
  name,
}: {
  agentId: string;
  name: string;
}) {
  const [index, setIndex] = useState<Index>({ rooms: [], devices: [] });
  const [roomId, setRoomId] = useState("");
  const [tasks, setTasks] = useState<CollaborationTask[]>([]);
  const [title, setTitle] = useState("一起规划岛上的一天");
  const [instruction, setInstruction] = useState("");
  const [runnerId, setRunnerId] = useState("");
  const [deviceName, setDeviceName] = useState("我的电脑");
  const [token, setToken] = useState("");
  const [devicesOpen, setDevicesOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [version, setVersion] = useState(0);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const alive = useRef(true);
  const retry = useRef<{ fingerprint: string; id: string } | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    let stopped = false;
    const abort = new AbortController();
    async function refresh() {
      try {
        const next = await api<Index>("/collaboration", {
          signal: abort.signal,
        });
        const view = roomId
          ? await api<{ tasks: CollaborationTask[] }>(
              `/collaboration/rooms/${roomId}`,
              { signal: abort.signal },
            )
          : null;
        if (stopped) return;
        setIndex(next);
        setTasks(view?.tasks ?? []);
        setLoaded(true);
      } catch (e) {
        if (!stopped) {
          setError(e instanceof Error ? e.message : "暂时无法读取协同任务。");
          setLoaded(true);
        }
      }
    }
    void refresh();
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, 5000);
    return () => {
      stopped = true;
      abort.abort();
      clearInterval(timer);
    };
  }, [roomId, version]);
  const act = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await work();
      if (alive.current) setVersion((v) => v + 1);
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "操作暂未完成。");
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const pending = tasks.some((t) =>
    ["queued", "running", "review"].includes(t.status),
  );
  return (
    <section className="resident-memory resident-collaboration">
      <h3>居民协同实验</h3>
      <p>
        邀请{name}
        提出方案，再邀请其他伙伴一起完善。你来补充、采纳或拒绝每一轮建议。
      </p>
      <p className="animal-note">
        这里只共享本讨论中已采纳的内容，不自动读取私人聊天记忆。采纳表示保留建议，不会执行岛屿操作。
      </p>
      {error && <p role="alert">{error}</p>}
      {!loaded && <p role="status">正在读取讨论…</p>}
      <label>
        继续已有讨论
        <select
          value={roomId}
          disabled={busy}
          onChange={(e) => {
            setRoomId(e.target.value);
            setTasks([]);
            setDeleteConfirm(false);
            setError("");
          }}
        >
          <option value="">新建讨论</option>
          {index.rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title}
            </option>
          ))}
        </select>
      </label>
      {!roomId && (
        <>
          <label>
            讨论主题
            <input
              value={title}
              maxLength={100}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <button
            disabled={busy || !title.trim()}
            onClick={() =>
              void act(async () => {
                const context = mindRequest(agentId);
                const room = await api<CollaborationRoom>(
                  "/collaboration/rooms",
                  {
                    method: "POST",
                    body: JSON.stringify({
                      title,
                      ...(context.world ? { world: context.world } : {}),
                    }),
                  },
                );
                if (alive.current) {
                  setIndex((v) => ({ ...v, rooms: [room, ...v.rooms] }));
                  setRoomId(room.id);
                }
              })
            }
          >
            创建讨论
          </button>
        </>
      )}
      {roomId && (
        <>
          <ol className="animal-history" aria-live="polite">
            {tasks.map((task) => (
              <li key={task.id}>
                <span>
                  {task.residentName} ·{" "}
                  {task.runnerId ? "本地 Harness" : "云端模型"} ·{" "}
                  {labels[task.status]}
                </span>
                <p>我：{task.instruction}</p>
                {task.output && (
                  <p className="collaboration-output">{task.output}</p>
                )}
                {task.status === "unknown" && (
                  <p>
                    连接中断后没有自动重试。请检查本机状态，再决定是否另开一轮。
                  </p>
                )}
                {task.status === "review" &&
                  (
                    [
                      ["accept", "采纳建议"],
                      ["reject", "不采纳"],
                    ] as const
                  ).map(([action, label]) => (
                    <button
                      key={action}
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          await api(`/collaboration/tasks/${task.id}/review`, {
                            method: "POST",
                            body: JSON.stringify({ action }),
                          });
                        })
                      }
                    >
                      {label}
                    </button>
                  ))}
                {["queued", "running"].includes(task.status) && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        await api(`/collaboration/tasks/${task.id}/review`, {
                          method: "POST",
                          body: JSON.stringify({ action: "cancel" }),
                        });
                      })
                    }
                  >
                    取消本轮
                  </button>
                )}
              </li>
            ))}
          </ol>
          <label>
            本轮由{name}在哪里思考
            <select
              disabled={busy}
              value={runnerId}
              onChange={(e) => setRunnerId(e.target.value)}
            >
              <option value="">云端模型</option>
              {index.devices
                .filter((d) => !d.revoked)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} · 本地 Harness
                  </option>
                ))}
            </select>
          </label>
          {runnerId && (
            <p className="animal-note">
              将讨论内容发送给这台设备及其配置的模型服务。设备离线时排队，24
              小时后取消；不会自动切换到云端。
            </p>
          )}
          <label>
            给{name}的任务或补充
            <textarea
              maxLength={2000}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
            />
          </label>
          <button
            disabled={busy || pending || !instruction.trim()}
            onClick={() =>
              void act(async () => {
                const resident = { speakerId: mindRequest(agentId).speakerId };
                const data = {
                  resident,
                  instruction,
                  runnerId: runnerId || null,
                };
                const fingerprint = JSON.stringify({ roomId, ...data });
                if (retry.current?.fingerprint !== fingerprint)
                  retry.current = { fingerprint, id: crypto.randomUUID() };
                await api(`/collaboration/rooms/${roomId}/turns`, {
                  method: "POST",
                  body: JSON.stringify({
                    ...data,
                    requestId: retry.current.id,
                  }),
                });
                if (alive.current) {
                  setInstruction("");
                  retry.current = null;
                }
              })
            }
          >
            邀请{name}思考
          </button>
          <p className="animal-note">
            要换一位伙伴，点选岛上的另一只动物，在“协同”中选择这份讨论。
          </p>
          <button
            disabled={busy}
            onClick={() => setDeleteConfirm(!deleteConfirm)}
          >
            删除这份讨论
          </button>
          {deleteConfirm && (
            <p>
              将删除本讨论和轮次，正在运行的任务会停止接收结果。
              <button
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    await api(`/collaboration/rooms/${roomId}`, {
                      method: "DELETE",
                    });
                    if (alive.current) {
                      setRoomId("");
                      setTasks([]);
                      setDeleteConfirm(false);
                    }
                  })
                }
              >
                确认删除讨论
              </button>
            </p>
          )}
        </>
      )}
      <button
        aria-expanded={devicesOpen}
        onClick={() => {
          setDevicesOpen(!devicesOpen);
          setToken("");
        }}
      >
        管理本地设备
      </button>
      {devicesOpen && (
        <div>
          <p>
            在自己的电脑安装 Island Runner（Node 24.9+）。设备凭据有效 7
            天，可以随时撤销。
          </p>
          <label>
            设备名称
            <input
              maxLength={60}
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
            />
          </label>
          <button
            disabled={busy || !deviceName.trim()}
            onClick={() =>
              void act(async () => {
                const d = await api<{ token: string; id: string }>(
                  "/collaboration/devices",
                  {
                    method: "POST",
                    body: JSON.stringify({ name: deviceName }),
                  },
                );
                if (alive.current) {
                  setToken(d.token);
                  setRunnerId(d.id);
                }
              })
            }
          >
            新建设备凭据
          </button>
          {token && (
            <div>
              <p>
                仅本次显示，请粘贴到本机 Runner 的 init 提示中。不要发给其他人。
              </p>
              <textarea aria-label="一次性设备凭据" readOnly value={token} />
              <button onClick={() => setToken("")}>隐藏凭据</button>
            </div>
          )}
          <p className="animal-note">
            <a
              href="https://github.com/JoyhouseLabs/island-open/tree/main/packages/island-runner"
              target="_blank"
              rel="noreferrer"
            >
              安装与启动说明
            </a>
            。连接地址：{window.location.origin}。DeepSeek key 只在本机配置。
          </p>
          <ul>
            {index.devices.map((d) => (
              <li key={d.id}>
                {d.name} ·{" "}
                {d.revoked
                  ? "已过期或撤销"
                  : d.lastSeenAt &&
                      Date.now() - Date.parse(d.lastSeenAt) < 30000
                    ? "最近在线"
                    : "等待连接"}
                {!d.revoked && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        await api(`/collaboration/devices/${d.id}`, {
                          method: "DELETE",
                        });
                        if (alive.current && runnerId === d.id) setRunnerId("");
                      })
                    }
                  >
                    撤销
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
