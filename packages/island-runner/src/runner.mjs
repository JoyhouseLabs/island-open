import WebSocket from "ws";
import { runHarness } from "./harness.mjs";

export function runnerURL(origin) {
  const url = new URL(origin);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !["", "/"].includes(url.pathname)
  )
    throw new Error("Use the Island origin only");
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(loopback && url.protocol === "http:"))
    throw new Error("HTTPS required except localhost");
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/api/collaboration/runner";
  return url.href;
}

export function connectRunner({
  origin,
  token,
  stateDir,
  model,
  execute = runHarness,
  log = console.log,
  signal,
}) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Invalid device token");
  const socket = new WebSocket(runnerURL(origin), {
    headers: { authorization: `Bearer ${token}` },
    maxPayload: 100000,
    handshakeTimeout: 15000,
    followRedirects: false,
  });
  let active = null,
    ready = false,
    awaitingClaim = false,
    lastReply = Date.now(),
    closed = false,
    tick;
  const send = (value) => {
    if (socket.readyState === WebSocket.OPEN)
      socket.send(JSON.stringify(value));
  };
  const stop = () => {
    closed = true;
    active?.abort.abort();
    socket.close();
  };
  signal?.addEventListener("abort", stop, { once: true });
  if (signal?.aborted) stop();
  const done = new Promise((resolve, reject) => {
    socket.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        lastReply = Date.now();
        if (msg.type === "ready") {
          if (msg.protocol !== 1) throw new Error("Unsupported protocol");
          ready = true;
          log("Runner 已连接；等待你在岛上分配讨论任务。");
          send({ type: "claim" });
          awaitingClaim = true;
        } else if (msg.type === "idle") awaitingClaim = false;
        else if (msg.type === "task") {
          awaitingClaim = false;
          const task = msg.task;
          const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
          if (
            active ||
            !task ||
            !uuid.test(task.taskId) ||
            !uuid.test(task.leaseId) ||
            typeof task.prompt !== "string" ||
            task.prompt.length > 90000 ||
            !Number.isFinite(Date.parse(task.expiresAt))
          )
            throw new Error("Invalid assignment");
          const abort = new AbortController();
          active = { task, abort, finished: false, work: null };
          const current = active;
          log(`开始讨论 ${task.taskId}（无文件或 Shell 工具）。`);
          current.work = execute(task, {
            stateDir,
            model,
            signal: abort.signal,
          })
            .then((output) => {
              if (!closed && !abort.signal.aborted) {
                current.finished = true;
                send({
                  type: "complete",
                  taskId: task.taskId,
                  leaseId: task.leaseId,
                  output,
                });
              }
            })
            .catch((error) => {
              if (error?.code === "HARNESS_CLEANUP") {
                log(
                  "无法确认 Harness 已退出，Runner 已停止，请在本机检查进程。",
                );
                stop();
                return;
              }
              if (!closed && !abort.signal.aborted) {
                current.finished = true;
                send({
                  type: "failed",
                  taskId: task.taskId,
                  leaseId: task.leaseId,
                });
              }
            });
        } else if (msg.type === "ack") {
          if (!active?.finished || active.task.taskId !== msg.taskId)
            throw new Error("Invalid receipt");
          log("本轮已回传，请在岛上查看并决定是否采纳。");
          active = null;
        } else if (msg.type !== "heartbeat")
          throw new Error("Unexpected message");
      } catch {
        stop();
      }
    });
    socket.on("open", () => {
      tick = setInterval(() => {
        if (Date.now() - lastReply > 30000) {
          stop();
          socket.terminate();
          return;
        }
        if (!ready) return;
        if (active && !active.finished)
          send({
            type: "heartbeat",
            taskId: active.task.taskId,
            leaseId: active.task.leaseId,
          });
        else if (!active && !awaitingClaim) {
          send({ type: "claim" });
          awaitingClaim = true;
        }
      }, 5000);
    });
    socket.on("error", () => {
      stop();
    });
    socket.on("close", async () => {
      closed = true;
      clearInterval(tick);
      signal?.removeEventListener("abort", stop);
      active?.abort.abort();
      try {
        await active?.work;
        resolve();
      } catch {
        reject(new Error("Harness cleanup failed"));
      }
      log("连接已关闭。进行中的任务不会自动重试；请回到岛上核对状态。");
    });
  });
  return { done, stop };
}
