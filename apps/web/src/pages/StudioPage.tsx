import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Clapperboard, ImageIcon, Sparkles, Volume2, Wand2 } from "lucide-react";
import type { StudioStatus, StudioTask, StudioVoiceover } from "@island/contracts";
import { api } from "../api";
import { emitGrowth } from "../progress/store";

type Creation = {
  kind: "image" | "video";
  prompt: string;
  url: string;
  at: number;
};

const HISTORY_KEY = "island-studio-v1";

/** The AI 工坊: type an idea, get a picture or a short animated clip.
 *  Results feed back as references — 画一张 → 让它动起来. */
export default function StudioPage() {
  const [status, setStatus] = useState<StudioStatus | null>(null);
  const [kind, setKind] = useState<"image" | "video">("image");
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState(5);
  const [aspect, setAspect] = useState<"16:9" | "9:16" | "1:1">("16:9");
  const [reference, setReference] = useState<string | null>(null);
  const [task, setTask] = useState<StudioTask | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [vo, setVo] = useState<StudioVoiceover | null>(null);
  const [voicing, setVoicing] = useState(false);
  const [history, setHistory] = useState<Creation[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]") as Creation[];
    } catch {
      return [];
    }
  });
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    document.title = "AI 工坊 · 心灵家园";
    void api<StudioStatus>("/studio/status")
      .then(setStatus)
      .catch(() => {});
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 24)));
    } catch {
      /* keep what we can in memory */
    }
  }, [history]);

  const poll = (taskId: string, taskKind: "image" | "video", depth = 0) => {
    pollTimer.current = setTimeout(async () => {
      try {
        const next = await api<StudioTask>(
          `/studio/tasks/${taskKind}/${encodeURIComponent(taskId)}`,
          // The shared api() default is 12s; one slow gateway poll would
          // otherwise abort the whole wait. Retry before giving up.
          { signal: AbortSignal.timeout(30_000) },
        );
        setTask(next);
        const first = next.outputs[0];
        if (next.status === "succeeded" && first) {
          setBusy(false);
          setHistory((h) => [
            { kind: taskKind, prompt, url: first, at: Date.now() },
            ...h,
          ]);
          emitGrowth({ type: "studio.created", detail: taskKind });
          return;
        }
        if (next.status === "failed") {
          setBusy(false);
          setMessage(next.error ?? "这次没有生成出来，换个说法试试。");
          return;
        }
        if (depth < 80) poll(taskId, taskKind, depth + 1);
        else {
          setBusy(false);
          setMessage("生成的时间有点长，稍后回来再看历史。");
        }
      } catch {
        // The gateway has slow moments; a failed poll (or several) must not
        // kill the wait while the task itself may still be cooking.
        if (depth < 80) poll(taskId, taskKind, depth + 1);
        else {
          setBusy(false);
          setMessage("生成的时间有点长，稍后回来再看历史。");
        }
      }
    }, depth === 0 ? 1200 : 3000);
  };

  const create = async () => {
    const text = prompt.trim();
    if (!text || busy) return;
    setBusy(true);
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
      setTask(started);
      if (started.taskId) poll(started.taskId, kind);
      else throw new Error(started.error ?? "工坊没接下单子。");
    } catch (e) {
      setBusy(false);
      setMessage(e instanceof Error ? e.message : "工坊暂时没法接单。");
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
        body: JSON.stringify({ videoUrl: url, prompt }),
        // TTS + download + mux takes a minute or more; the shared 12s
        // default would abandon a job the server is still cooking.
        signal: AbortSignal.timeout(240_000),
      });
      setVo(made);
      setMessage(`旁白：${made.narration}`);
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
        <Link to="/island" className="small-button">
          回我的岛
        </Link>
        <div>
          <h1>AI 工坊</h1>
          <p>
            说出一个画面，工坊帮你画出来；也可以让画动起来。
            {!configured && " （工坊还没开炉：服务端需要 AIAI_API_KEY）"}
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
            <button className="reference-chip" onClick={() => setReference(null)}>
              参考图已选 ✕
            </button>
          )}
        </div>
        <button
          className="primary-button studio-go"
          onClick={() => void create()}
          disabled={busy || !prompt.trim() || !configured}
        >
          <Wand2 size={16} />
          {busy ? "工坊赶工中…" : reference ? "照着它做" : "开始生成"}
        </button>
        {message && <p className="studio-message">{message}</p>}
        {reference && (
          <img className="studio-reference" src={reference} alt="参考图" />
        )}
      </section>

      {(task || busy) && (
        <section className="studio-result" aria-live="polite">
          {task?.outputs[0] &&
            (kind === "image" ? (
              <img src={task.outputs[0]} alt={prompt} />
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
              {kind === "image" && (
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
              {kind === "video" && status?.voiceover && (
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
                key={item.url}
                className="studio-card"
                onClick={() => setReference(item.url)}
                title="点它设为参考图"
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
