import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  catWorkSchema,
  geometryWorkSchema,
  modelWorkSchema,
  initialGeometry,
  solidFacts,
  type CatWork,
  type LearningResponse,
  type LearningSession,
  type LessonView,
} from "@island/contracts";
import { api, RequestError } from "../api";
import { useLearner } from "./LearningLayout";
import CatPicture, { initialCat } from "./CatPicture";
import { learningTravel, returnUrl } from "./travel";
const GeometryLab = lazy(() => import("./GeometryLab"));
const ModelLab = lazy(() => import("./ModelLab"));
export default function LearningPlayer() {
  const { sessionId } = useParams(),
    user = useLearner(),
    navigate = useNavigate();
  const [session, setSession] = useState<LearningSession | null>(null),
    [error, setError] = useState("");
  const load = () => {
    setError("");
    setSession(null);
    void api<LearningSession>(`/learning/sessions/${sessionId}`)
      .then(setSession)
      .catch((e) => setError(e.message));
  };
  useEffect(load, [sessionId, user.id]);
  const exit = () => {
    if (session) {
      learningTravel.pending =
        session.returnContext.destination === "physics" ||
        session.returnContext.destination === "physics-home"
          ? null
          : session.returnContext;
      void navigate(returnUrl(session.returnContext));
    }
  };
  if (!session)
    return (
      <section className="learn-empty">
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button onClick={load}>重新读取</button>
            <Link to="/learn">返回学习主页</Link>
          </>
        ) : (
          <p role="status">正在恢复学习进度…</p>
        )}
      </section>
    );
  const step = session.lesson.steps[session.completedSteps.length];
  const artwork = Object.values(session.responses)
    .map((r) => catWorkSchema.safeParse(r))
    .find((p) => p.success)?.data;
  return (
    <div className="learn-content learn-player">
      <nav className="learn-breadcrumb">
        <Link to="/learn">← 学习主页</Link>
        <span>
          {session.lesson.title} · 第 {session.version} 版
        </span>
      </nav>
      <ol className="learn-steps">
        {session.lesson.steps.map((s, i) => (
          <li
            key={s.id}
            aria-current={s.id === step?.id ? "step" : undefined}
            className={session.completedSteps.includes(s.id) ? "done" : ""}
          >
            <span>{session.completedSteps.includes(s.id) ? "✓" : i + 1}</span>
            {s.title}
          </li>
        ))}
      </ol>
      {session.status === "completed" ? (
        <section className="learn-complete">
          <span className="learn-badge">✧ {session.badge}</span>
          <h1>又多了一个小小发现</h1>
          {artwork && (
            <>
              <CatPicture work={artwork} />
              <blockquote>{artwork.note}</blockquote>
            </>
          )}
          {session.lesson.steps.map((s) => {
            const g = geometryWorkSchema.safeParse(session.responses[s.id]);
            const m = modelWorkSchema.safeParse(session.responses[s.id]);
            return g.success ? (
              <article className="learn-card" key={s.id}>
                <h2>{s.title}</h2>
                <p>
                  {solidFacts[g.data.solid].name} · 高 {g.data.height} ·
                  底面大小 {g.data.size}
                </p>
                <blockquote>{g.data.note}</blockquote>
              </article>
            ) : m.success ? (
              <article className="learn-card" key={s.id}>
                <h2>{s.title}</h2>
                <p>模型参数 k = {m.data.weight.toFixed(3)}</p>
                <blockquote>{m.data.note}</blockquote>
              </article>
            ) : null;
          })}
          <p>
            作品与进度已保存到云端。探索完成不代表已经掌握全部知识，可以和家长一起聊聊你的发现。
          </p>
          <button className="learn-primary" onClick={exit}>
            带着发现，返回小岛 →
          </button>
          <Link to="/learn">继续挑选活动</Link>
        </section>
      ) : (
        step && (
          <Activity
            key={`${session.id}:${step.id}`}
            session={session}
            step={step}
            userId={user.id}
            onSaved={setSession}
            onReload={load}
            onExit={exit}
          />
        )
      )}
    </div>
  );
}
function Activity({
  session,
  step,
  userId,
  onSaved,
  onReload,
  onExit,
}: {
  session: LearningSession;
  step: LessonView["steps"][number];
  userId: string;
  onSaved: (s: LearningSession) => void;
  onReload: () => void;
  onExit: () => void;
}) {
  const key = `island-learning-draft:${userId}:${session.id}:${step.id}`;
  const previousModel = session.lesson.steps
    .slice(
      0,
      session.lesson.steps.findIndex((s) => s.id === step.id),
    )
    .map((s) => modelWorkSchema.safeParse(session.responses[s.id]))
    .filter((r) => r.success)
    .at(-1)?.data;
  const fallback: LearningResponse =
    step.kind === "geometry-lab"
      ? initialGeometry()
      : step.kind === "model-lab"
        ? {
            type: "model",
            weight:
              step.model.mode === "adapt" ? (previousModel?.weight ?? 2) : 1,
            note: "",
          }
        : step.kind === "cat-shapes"
          ? initialCat
          : step.kind === "reading"
            ? true
            : 0;
  const [initial] = useState(() => {
    try {
      const draft = JSON.parse(localStorage.getItem(key) ?? "null");
      if (
        draft &&
        Number.isInteger(draft.revision) &&
        ((step.kind === "geometry-lab" &&
          geometryWorkSchema.safeParse(draft.response).success) ||
          (step.kind === "model-lab" &&
            modelWorkSchema.safeParse(draft.response).success) ||
          (step.kind === "cat-shapes" &&
            catWorkSchema.safeParse(draft.response).success) ||
          (step.kind === "choice" &&
            Number.isInteger(draft.response) &&
            draft.response >= 0 &&
            draft.response < (step.options?.length ?? 0)))
      )
        return {
          response: draft.response as LearningResponse,
          revision: draft.revision as number,
        };
    } catch {
      /* Server checkpoint remains available. */
    }
    return {
      response: session.responses[step.id] ?? fallback,
      revision: session.revision,
    };
  });
  const [response, setResponse] = useState<LearningResponse>(initial.response);
  const [needsReview, setNeedsReview] = useState(
    initial.revision !== session.revision,
  );
  const [busy, setBusy] = useState(false),
    lock = useRef(false),
    [error, setError] = useState(""),
    [conflict, setConflict] = useState(false),
    [notice, setNotice] = useState(""),
    [separated, setSeparated] = useState(false);
  const serialize = (value: LearningResponse | undefined) => {
    const parsed = [
      catWorkSchema.safeParse(value),
      geometryWorkSchema.safeParse(value),
      modelWorkSchema.safeParse(value),
    ].find((p) => p.success);
    return JSON.stringify(parsed?.success ? parsed.data : value);
  };
  const dirty = serialize(response) !== serialize(session.responses[step.id]);
  useEffect(() => {
    try {
      if (dirty)
        localStorage.setItem(
          key,
          JSON.stringify({
            revision: needsReview ? initial.revision : session.revision,
            response,
          }),
        );
      else localStorage.removeItem(key);
    } catch {
      setNotice("此浏览器无法保留本地草稿，请及时保存进度。");
    }
  }, [key, response, dirty, needsReview, session.revision, initial.revision]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function save(complete: boolean, exit = false) {
    if (lock.current || needsReview) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setConflict(false);
    setNotice("");
    try {
      const result = await api<LearningSession>(
        `/learning/sessions/${session.id}/steps/${step.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            revision: session.revision,
            response,
            complete,
          }),
        },
      );
      try {
        localStorage.removeItem(key);
      } catch {
        /* Cloud checkpoint succeeded. */
      }
      onSaved(result);
      setNotice("进度已保存到云端。");
      if (exit) onExit();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败，本地草稿会保留。");
      setConflict(e instanceof RequestError && e.status === 409);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const work = catWorkSchema.safeParse(response);
  const updateCat = (patch: Partial<CatWork>) =>
    setResponse({ ...(work.success ? work.data : initialCat), ...patch });
  return (
    <section className="learn-activity">
      <span className="learn-eyebrow">慢慢来，随时都可以休息</span>
      <h1>{step.title}</h1>
      {needsReview && (
        <div className="learn-error" role="alert">
          <p>
            云端有更新的进度。这台设备还保留着一份草稿，请选择要继续的内容。
          </p>
          <button onClick={() => setNeedsReview(false)}>
            继续使用本机草稿
          </button>
          <button
            onClick={() => {
              setResponse(session.responses[step.id] ?? fallback);
              setNeedsReview(false);
            }}
          >
            使用云端记录
          </button>
        </div>
      )}
      <p className="learn-instruction">{step.text}</p>
      {step.kind === "reading" && session.lessonId === "cat-shape-lab" && (
        <>
          <CatPicture separated={separated} />
          <button onClick={() => setSeparated((s) => !s)}>
            {separated ? "组合起来" : "拆开看看"}
          </button>
          <p className="learn-muted">3 个圆 · 2 个三角形 · 3 个椭圆</p>
        </>
      )}
      {step.kind === "choice" && (
        <fieldset disabled={busy || needsReview} className="learn-choices">
          <legend>选择你的答案</legend>
          {step.options?.map((option, i) => (
            <label key={i}>
              <input
                type="radio"
                name="answer"
                checked={response === i}
                onChange={() => setResponse(i)}
              />
              {option}
            </label>
          ))}
        </fieldset>
      )}
      {step.kind === "cat-shapes" && work.success && (
        <div className="learn-workspace">
          <CatPicture work={work.data} />
          <fieldset disabled={busy || needsReview}>
            <legend>我的小猫设计</legend>
            <label>
              头的宽度{" "}
              <input
                aria-label="头的宽度"
                type="range"
                min="0.7"
                max="1.4"
                step="0.05"
                value={work.data.headWidth}
                onChange={(e) =>
                  updateCat({ headWidth: Number(e.target.value) })
                }
              />
            </label>
            <div className="learn-colors">
              {(["#e7a35b", "#97b7a3", "#91b7d5", "#c4a3cc"] as const).map(
                (color, i) => (
                  <button
                    type="button"
                    key={color}
                    style={{ background: color }}
                    aria-label={["暖橙色", "草绿色", "天空蓝", "丁香紫"][i]}
                    aria-pressed={work.data.color === color}
                    onClick={() => updateCat({ color })}
                  />
                ),
              )}
            </div>
            <label htmlFor="learning-reflection">
              我的发现（可以请家长代写）
            </label>
            <textarea
              id="learning-reflection"
              maxLength={500}
              rows={4}
              value={work.data.note}
              placeholder="我把小猫的头变宽了，发现……"
              onChange={(e) => updateCat({ note: e.target.value })}
            />
          </fieldset>
        </div>
      )}
      <Suspense fallback={<p role="status">正在准备实验…</p>}>
        {step.kind === "geometry-lab" &&
          geometryWorkSchema.safeParse(response).success && (
            <GeometryLab
              work={geometryWorkSchema.parse(response)}
              task={step.geometry}
              disabled={busy || needsReview}
              onChange={setResponse}
            />
          )}
        {step.kind === "model-lab" &&
          modelWorkSchema.safeParse(response).success && (
            <ModelLab
              work={modelWorkSchema.parse(response)}
              task={step.model}
              disabled={busy || needsReview}
              onChange={setResponse}
            />
          )}
      </Suspense>
      {error && (
        <div className="learn-error" role="alert">
          {error}
          {conflict && (
            <button onClick={onReload}>保留草稿，重新读取进度</button>
          )}
        </div>
      )}
      <p className="learn-muted" role="status">
        {notice ||
          (dirty
            ? "当前修改保留在此浏览器；点击保存后可跨设备继续。"
            : "当前进度已保存到云端。")}
      </p>
      <footer className="learn-actions">
        <button
          disabled={busy || needsReview}
          className="learn-primary"
          onClick={() => void save(true)}
        >
          {busy
            ? "正在保存…"
            : step.kind === "cat-shapes"
              ? "完成创作"
              : "完成这项活动 →"}
        </button>
        <button disabled={busy || needsReview} onClick={() => void save(false)}>
          保存进度
        </button>
        <button
          disabled={busy || needsReview}
          onClick={() => void save(false, true)}
        >
          保存并回到小岛
        </button>
      </footer>
    </section>
  );
}
