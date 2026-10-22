import { useEffect, useRef, useState } from "react";
import { Link, useBlocker } from "react-router";
import {
  Clapperboard,
  ImageIcon,
  Sparkles,
  Volume2,
  Wand2,
} from "lucide-react";
import type {
  StudioStatus,
  StudioTask,
  StudioVoiceover,
} from "@island/contracts";
import { api, RequestError } from "../api";
import { useActivity } from "../activities/context";
import { useSavedDraft } from "../activities/useSavedDraft";
import {
  emptyStudioDraft,
  studioDraftSchema,
  studioHistorySchema,
  studioTaskRecordSchema,
} from "@island/contracts";

/** The AI 工坊: type an idea, get a picture or a short animated clip.
 *  Results feed back as references — 画一张 → 让它动起来. */
export default function StudioPage() {
  const activity = useActivity();
  const [saved, setSaved, draftError] = useSavedDraft(
    `island-studio-workspace-v2:${activity.user.id}`,
    emptyStudioDraft,
    (value) => studioDraftSchema.parse(value),
  );
  const { kind, prompt, duration, aspect, reference, history } = saved;
  const setKind = (kind: "image" | "video") =>
    setSaved((s) => ({ ...s, kind }));
  const setPrompt = (prompt: string) => setSaved((s) => ({ ...s, prompt }));
  const setDuration = (duration: number) =>
    setSaved((s) => ({ ...s, duration }));
  const setAspect = (aspect: "16:9" | "9:16" | "1:1") =>
    setSaved((s) => ({ ...s, aspect }));
  const setReference = (reference: string | null) =>
    setSaved((s) => ({ ...s, reference }));
  const [status, setStatus] = useState<StudioStatus | null>(null);
  const [historyReady, setHistoryReady] = useState(false);
  const [task, setTask] = useState<StudioTask | null>(null);
  const [resultKind, setResultKind] = useState<"image" | "video">(kind);
  const [resultPrompt, setResultPrompt] = useState(prompt);
  const [starting, setStarting] = useState(false);
  const busy = starting || !!saved.pending;
  const [message, setMessage] = useState("");
  const [vo, setVo] = useState<StudioVoiceover | null>(null);
  const [voicing, setVoicing] = useState(false);
  const alive = useRef(true);
  const blocking = starting || voicing || (!!draftError && !!saved.pending);
  const blocker = useBlocker(blocking);
  useEffect(() => {
    if (blocker.state === "blocked") {
      setMessage("请求仍在提交或保存，请稍等完成后再离开。");
      blocker.reset();
    }
  }, [blocker]);
  useEffect(() => {
    if (!blocking) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [blocking]);

  useEffect(() => {
    alive.current = true;
    document.title = "AI 工坊 · 心灵家园";
    void api<StudioStatus>("/studio/status")
      .then((v) => {
        if (alive.current) setStatus(v);
      })
      .catch(() => {
        if (alive.current) setMessage("暂时无法连接工坊，请稍后重试。");
      });
    void api("/studio/tasks")
      .then((value) => {
        const remote = studioHistorySchema.parse(value).tasks;
        if (!alive.current) return;
        setSaved((s) => {
          const ownPending =
            remote.find(
              (r) =>
                r.task.taskId === s.pending?.taskId &&
                ["pending", "running"].includes(r.task.status),
            ) ??
            remote.find((r) => ["pending", "running"].includes(r.task.status));
          return {
            ...s,
            pending: ownPending
              ? {
                  taskId: ownPending.task.taskId,
                  kind: ownPending.kind,
                  prompt: ownPending.prompt,
                }
              : null,
            history: remote
              .filter((r) => r.task.status === "succeeded" && r.task.outputs[0])
              .map((r) => ({
                taskId: r.task.taskId,
                kind: r.kind,
                prompt: r.prompt,
                url: r.task.outputs[0]!,
                at: Date.parse(r.createdAt),
              })),
          };
        });
        setHistoryReady(true);
      })
      .catch(() => {
        if (alive.current)
          setMessage("作品列表暂时无法读取，请刷新后重试。草稿仍保留。");
      });
    return () => {
      alive.current = false;
    };
  }, []);
  const job = saved.pending;
  useEffect(() => {
    if (!job || !historyReady) return;
    let active = true,
      timer: ReturnType<typeof setTimeout>;
    const abort = new AbortController();
    setResultKind(job.kind);
    setResultPrompt(job.prompt);
    const poll = async () => {
      try {
        const next = studioTaskRecordSchema.parse(
          await api<StudioTask>(
            `/studio/tasks/${job.kind}/${encodeURIComponent(job.taskId)}`,
            {
              signal: AbortSignal.any([
                abort.signal,
                AbortSignal.timeout(30000),
              ]),
            },
          ),
        );
        if (!active) return;
        setTask(next);
        const first = next.outputs[0];
        if (next.status === "succeeded" && first) {
          setSaved((s) => ({
            ...s,
            pending: null,
            history: [
              { ...job, url: first, at: Date.now() },
              ...s.history.filter((h) => h.taskId !== job.taskId),
            ].slice(0, 24),
          }));
          activity.record({ type: "studio.created", detail: job.kind });
          setMessage("作品已完成，可在此账号的作品列表查看。");
          return;
        }
        if (next.status === "failed") {
          setSaved((s) => ({ ...s, pending: null }));
          setMessage(next.error ?? "这次没有生成出来，换个说法试试。");
          return;
        }
      } catch (e) {
        if (!active) return;
        if (e instanceof RequestError && [401, 403, 404].includes(e.status)) {
          setMessage("无法访问这个生成任务，请重新登录原账号后刷新。");
          return;
        }
        setMessage("暂时无法查询生成进度，任务编号已保留，会继续重试。");
      }
      if (active) timer = setTimeout(() => void poll(), 3000);
    };
    timer = setTimeout(() => void poll(), 1200);
    return () => {
      active = false;
      clearTimeout(timer);
      abort.abort();
    };
  }, [job?.taskId, job?.kind, historyReady]);

  const create = async () => {
    const text = prompt.trim();
    if (!text || busy || !historyReady) return;
    setStarting(true);
    setMessage("");
    setTask(null);
    setVo(null);
    try {
      const started = await api<StudioTask>("/studio/tasks", {
        method: "POST",
        body: JSON.stringify({
          kind,
          prompt: text,
          ...(reference ? { referenceUrl: reference } : {}),
          ...(kind === "video"
            ? { durationSeconds: duration }
            : { aspectRatio: aspect }),
        }),
      });
      if (!started.taskId) throw new Error(started.error ?? "工坊没接下单子。");
      setSaved((s) => ({
        ...s,
        pending: { taskId: started.taskId, kind, prompt: text },
      }));
      if (alive.current) {
        setTask(started);
        setResultKind(kind);
        setResultPrompt(text);
      }
    } catch (e) {
      if (alive.current)
        setMessage(e instanceof Error ? e.message : "工坊暂时没法接单。");
    } finally {
      if (alive.current) setStarting(false);
    }
  };

  /** Gateway clips are silent; this narrates one server-side (TTS + ffmpeg). */
  const addVoice = async () => {
    const url = task?.outputs[0];
    if (!url || voicing) return;
    setVoicing(true);
    setMessage("");
    try {
      const made = await api<StudioVoiceover>("/studio/voiceover", {
        method: "POST",
        body: JSON.stringify({ videoUrl: url, prompt: resultPrompt }),
        // TTS + download + mux takes a minute or more; the shared 12s
        // default would abandon a job the server is still cooking.
        signal: AbortSignal.timeout(240_000),
      });
      if (alive.current) {
        setVo(made);
        setMessage(`旁白：${made.narration}`);
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "配音没能完成，稍后再试。");
    } finally {
      setVoicing(false);
    }
  };

  const configured = status?.configured ?? false;

  return (
    <main className="app studio-page">
      <header className="books-head">
        <Link to={activity.returnTo} className="small-button">
          返回家园
        </Link>
        <div>
          <h1>AI 工坊</h1>
          <p>
            说出一个画面，工坊帮你画出来；也可以让画动起来。
            {!configured && " （工坊暂未开放，请稍后再来）"}
          </p>
        </div>
      </header>

      <section className="studio-form">
        <div className="studio-kind">
          <button
            className={kind === "image" ? "active" : ""}
            onClick={() => setKind("image")}
          >
            <ImageIcon size={15} /> 画一张
          </button>
          <button
            className={kind === "video" ? "active" : ""}
            onClick={() => setKind("video")}
          >
            <Clapperboard size={15} /> 动起来
          </button>
        </div>
        <textarea
          className="studio-prompt"
          value={prompt}
          placeholder={
            kind === "image"
              ? "比如：月光下的沙滩，一只小狐狸提着灯笼…"
              : "比如：小狐狸提着灯笼在沙滩上慢慢走，海浪轻轻拍岸…"
          }
          maxLength={600}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <div className="studio-options">
          {kind === "image" ? (
            <>
              {(["16:9", "9:16", "1:1"] as const).map((a) => (
                <button
                  key={a}
                  className={aspect === a ? "active" : ""}
                  onClick={() => setAspect(a)}
                >
                  {a}
                </button>
              ))}
            </>
          ) : (
            <>
              {[5, 8, 10].map((d) => (
                <button
                  key={d}
                  className={duration === d ? "active" : ""}
                  onClick={() => setDuration(d)}
                >
                  {d} 秒
                </button>
              ))}
            </>
          )}
          {reference && (
            <button
              className="reference-chip"
              onClick={() => setReference(null)}
            >
              参考图已选 ✕
            </button>
          )}
        </div>
        <button
          className="primary-button studio-go"
          onClick={() => void create()}
          disabled={busy || !prompt.trim() || !configured || !historyReady}
        >
          <Wand2 size={16} />
          {busy ? "工坊赶工中…" : reference ? "照着它做" : "开始生成"}
        </button>
        {message && (
          <p className="studio-message" role="status">
            {message}
          </p>
        )}
        {draftError && <p role="alert">{draftError}</p>}
        {saved.pending && (
          <p className="studio-hint">
            {draftError
              ? "本机任务记录尚未保存，请等待本页生成完成。"
              : "生成任务已记录。离开或刷新后会继续查询，同一账号返回后可恢复。"}
          </p>
        )}
        {reference && (
          <img className="studio-reference" src={reference} alt="参考图" />
        )}
      </section>

      {(task || busy) && (
        <section className="studio-result" aria-live="polite">
          {task?.outputs[0] &&
            (resultKind === "image" ? (
              <img src={task.outputs[0]} alt={resultPrompt} />
            ) : (
              <video
                key={vo?.videoUrl ?? task.outputs[0]}
                src={vo?.videoUrl ?? task.outputs[0]}
                controls
                autoPlay
                loop
                muted={!vo}
              />
            ))}
          {!task?.outputs[0] && (
            <p className="studio-hint">
              <Sparkles size={14} />
              {task?.status === "running" || task?.status === "pending"
                ? "工坊正在做，一般要几十秒…"
                : "…"}
            </p>
          )}
          {task?.outputs[0] && (
            <div className="studio-actions">
              {resultKind === "image" && (
                <button
                  className="small-button"
                  onClick={() => {
                    setReference(task.outputs[0] ?? null);
                    setKind("video");
                    setMessage("已把这张画当作动画的第一帧。");
                  }}
                >
                  <Clapperboard size={14} /> 让它动起来
                </button>
              )}
              {resultKind === "video" && status?.voiceover && (
                <button
                  className="small-button"
                  disabled={voicing}
                  onClick={() => void addVoice()}
                >
                  <Volume2 size={14} />
                  {voicing ? "配音中…" : vo ? "重新配音" : "给视频配旁白"}
                </button>
              )}
              <button
                className="small-button"
                onClick={() => {
                  setReference(task.outputs[0] ?? null);
                  setMessage("已设为参考图，改改描述再生成。");
                }}
              >
                <ImageIcon size={14} /> 照着它再画
              </button>
            </div>
          )}
        </section>
      )}

      {history.length > 0 && (
        <section className="studio-history">
          <h3>我的作品</h3>
          <div className="studio-grid">
            {history.map((item) => (
              <button
                key={item.taskId}
                className="studio-card"
                onClick={() => {
                  setTask({
                    taskId: item.taskId,
                    status: "succeeded",
                    outputs: [item.url],
                    error: null,
                  });
                  setResultKind(item.kind);
                  setResultPrompt(item.prompt);
                  setVo(null);
                  if (item.kind === "image") setReference(item.url);
                }}
                title={
                  item.kind === "image"
                    ? "打开作品并设为参考图"
                    : "打开视频作品"
                }
              >
                {item.kind === "image" ? (
                  <img src={item.url} alt={item.prompt} />
                ) : (
                  <video src={item.url} muted loop playsInline />
                )}
                <small>{item.prompt.slice(0, 30)}</small>
              </button>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
