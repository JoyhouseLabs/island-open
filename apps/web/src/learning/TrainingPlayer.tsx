import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import {
  initialGeometry,
  solidFacts,
  solidKinds,
  trainingAnswerSchema,
  type TrainingAnswer,
  type TrainingAttempt,
  type TrainingPlan,
  type GeometryWork,
} from "@island/contracts";
import { api } from "../api";
import { useLearner } from "./LearningLayout";
import "./training.css";
const GeometryCanvas = lazy(() => import("./GeometryCanvas"));
const emptyAnswer = (): TrainingAnswer => ({ choices: {}, explanation: "" });

function Diagram({
  model,
  formation,
  heightLines,
}: {
  model: Pick<GeometryWork, "solid" | "height" | "size">;
  formation: number;
  heightLines: boolean;
}) {
  const top = 180 - model.height * 42 * formation;
  const radius = model.size * 45;
  const round = model.solid === "cylinder" || model.solid === "cone";
  const pyramid = model.solid !== "cylinder";
  const triangular = model.solid === "triangular-pyramid";
  return (
    <svg
      viewBox="0 0 320 230"
      role="img"
      aria-label="形体平面示意图，A 为内部线段，B 为侧面线段"
      className="training-diagram"
    >
      <title>形体平面示意图</title>
      <desc>
        {round ? "底面呈圆形" : triangular ? "底面是三角形" : "底面是四边形"}；
        {pyramid ? "顶部收于一点" : "顶部与底部大小相同"}。图中虚线 A
        与底面垂直，B 沿侧面倾斜。
      </desc>
      {pyramid ? (
        <path
          d={`M ${160 - radius} 180 L 160 ${top} L ${160 + radius} 180 L 160 202 Z`}
          fill="#c0d6d4"
          stroke="#456862"
          strokeWidth="2"
        />
      ) : (
        <path
          d={`M ${160 - radius} ${top} L ${160 - radius} 180 A ${radius} 22 0 0 0 ${160 + radius} 180 L ${160 + radius} ${top}`}
          fill="#c0d6d4"
          stroke="#456862"
          strokeWidth="2"
        />
      )}
      {round ? (
        <ellipse
          cx="160"
          cy="180"
          rx={radius}
          ry="22"
          fill="#d4dfae"
          stroke="#456862"
          strokeWidth="2"
        />
      ) : (
        <path
          d={
            triangular
              ? `M ${160 - radius} 175 L ${160 + radius} 175 L 160 202 Z`
              : `M ${160 - radius} 180 L 160 158 L ${160 + radius} 180 L 160 202 Z`
          }
          fill="#d4dfae"
          stroke="#456862"
          strokeWidth="2"
        />
      )}
      {!pyramid && (
        <ellipse
          cx="160"
          cy={top}
          rx={radius}
          ry="22"
          fill="#d4dfae"
          stroke="#456862"
          strokeWidth="2"
        />
      )}
      {pyramid && !round && (
        <line x1="160" y1={top} x2="160" y2="202" stroke="#456862" />
      )}
      {heightLines && (
        <>
          <line
            x1="160"
            y1={top}
            x2="160"
            y2="180"
            stroke="#9a496b"
            strokeWidth="2"
            strokeDasharray="4 3"
          />
          <text x="142" y={(top + 180) / 2}>
            A
          </text>
          <line
            x1="160"
            y1={top}
            x2={160 + radius}
            y2="180"
            stroke="#956b2b"
            strokeWidth="2"
          />
          <text x={175 + radius / 2} y={(top + 180) / 2}>
            B
          </text>
        </>
      )}
    </svg>
  );
}
export default function TrainingPlayer() {
  const { attemptId } = useParams(),
    user = useLearner();
  const [attempt, setAttempt] = useState<TrainingAttempt | null>(null),
    [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [answer, setAnswer] = useState<TrainingAnswer>(emptyAnswer),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const [three, setThree] = useState(false),
    [formation, setFormation] = useState(1);
  const generation = useRef(0);
  const [draftConflict, setDraftConflict] = useState<TrainingAnswer | null>(
    null,
  );
  const submission = useRef<string>(crypto.randomUUID());
  const draftKey = `island-training:${user.id}:${attemptId}`;
  useEffect(() => {
    let cancelled = false;
    generation.current++;
    setBusy(false);
    setDraftConflict(null);
    setAttempt(null);
    setPlan(null);
    setError("");
    setNotice("");
    submission.current = crypto.randomUUID();
    void api<TrainingAttempt>(`/learning/attempts/${attemptId}`)
      .then(async (a) => {
        const p = await api<TrainingPlan>(`/learning/plans/${a.planId}`);
        if (cancelled) return;
        setAttempt(a);
        setPlan(p);
        setThree(p.preferences.presentation === "3d");
        setFormation(1);
        let restored = a.answer;
        if (a.status === "active") {
          try {
            const raw = JSON.parse(
              localStorage.getItem(draftKey) ?? "null",
            ) as {
              revision?: number;
              answer?: unknown;
              submissionId?: string;
            } | null;
            const parsed = trainingAnswerSchema.safeParse(raw?.answer);
            if (raw && parsed.success && raw.revision === a.revision) {
              restored = parsed.data;
              if (raw.submissionId) submission.current = raw.submissionId;
              setNotice("已恢复这台设备尚未提交的草稿。");
            } else if (raw && parsed.success) {
              setDraftConflict(parsed.data);
              setNotice("云端和本机各有一份记录，请选择要继续编辑的内容。");
            }
          } catch {
            /* Storage can be unavailable; cloud checkpoints still work. */
          }
        } else {
          try {
            localStorage.removeItem(draftKey);
          } catch {
            /* Optional local cache. */
          }
        }
        setAnswer(restored);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
      generation.current++;
    };
  }, [attemptId, user.id, draftKey]);
  function change(next: TrainingAnswer) {
    setAnswer(next);
    setNotice("尚未保存到云端。");
    if (attempt?.status !== "active") return;
    try {
      localStorage.setItem(
        draftKey,
        JSON.stringify({
          revision: attempt.revision,
          answer: next,
          submissionId: submission.current,
        }),
      );
    } catch {
      setNotice("本机草稿不可用，请点击保存到云端。");
    }
  }
  async function save(submit: boolean, skip = false) {
    if (!attempt || busy) return;
    const current = generation.current;
    setBusy(true);
    setError("");
    try {
      const a = await api<TrainingAttempt>(
        `/learning/attempts/${attempt.id}/${submit ? "submissions" : "draft"}`,
        {
          method: submit ? "POST" : "PUT",
          body: JSON.stringify({
            revision: attempt.revision,
            answer,
            ...(submit ? { submissionId: submission.current, skip } : {}),
          }),
        },
      );
      if (current !== generation.current) return;
      setAttempt(a);
      setAnswer(a.answer);
      setNotice(
        submit
          ? "这次尝试和评估已保存在云端。"
          : "已保存到云端，可以稍后继续。",
      );
      try {
        localStorage.removeItem(draftKey);
      } catch {
        /* Cloud save succeeded. */
      }
    } catch (e) {
      if (current === generation.current)
        setError(e instanceof Error ? e.message : "保存失败，请保留页面重试。");
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  async function hint() {
    if (!attempt || busy) return;
    const current = generation.current;
    setBusy(true);
    setError("");
    try {
      // Save the current structured choices first, so hint selection uses this attempt.
      const saved = await api<TrainingAttempt>(
        `/learning/attempts/${attempt.id}/draft`,
        {
          method: "PUT",
          body: JSON.stringify({ revision: attempt.revision, answer }),
        },
      );
      if (current !== generation.current) return;
      setAttempt(saved);
      const a = await api<TrainingAttempt>(
        `/learning/attempts/${attempt.id}/hint`,
        { method: "POST", body: "{}", signal: AbortSignal.timeout(35000) },
      );
      if (current !== generation.current) return;
      setAttempt(a);
      setAnswer(a.answer);
      setNotice("提示使用已记入本次尝试；可在下次变式中独立试试。");
      try {
        localStorage.removeItem(draftKey);
      } catch {
        /* Cloud is authoritative. */
      }
    } catch (e) {
      // Keep the revision associated with our input. A timed-out hint may have
      // reserved assistance, so explicitly reload rather than silently adopting
      // a different device's revision and overwriting its answer.
      if (current === generation.current)
        setError(
          e instanceof Error ? e.message : "提示暂时无法连接，请重新读取。",
        );
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  function exportDraft() {
    const raw = JSON.stringify({ answer: draftConflict ?? answer });
    const url = URL.createObjectURL(
      new Blob([raw], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "training-draft.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  function resolveDraft(useLocal: boolean) {
    if (!attempt || !draftConflict) return;
    setDraftConflict(null);
    if (useLocal) change(draftConflict);
    else {
      setAnswer(attempt.answer);
      try {
        localStorage.removeItem(draftKey);
      } catch {
        /* Optional cache. */
      }
      setNotice("已选择云端内容。");
    }
  }
  const activity = attempt?.activity;
  const disabled =
    busy ||
    !!draftConflict ||
    attempt?.status === "submitted" ||
    plan?.paused === true;
  const work: GeometryWork = {
    ...initialGeometry(),
    ...activity?.model,
    solid: answer.solid ?? activity?.model?.solid ?? "cone",
    height: answer.height ?? activity?.model?.height ?? 2,
    size: answer.size ?? activity?.model?.size ?? 1,
  };
  const tower =
    activity?.task.id === "transfer" &&
    answer.choices.roof &&
    answer.choices.support;
  if (
    tower &&
    solidKinds.includes(answer.choices.roof as GeometryWork["solid"])
  )
    work.solid = answer.choices.roof as GeometryWork["solid"];
  return (
    <div className="learn-content training-content">
      <Link to={attempt ? `/learn/plans/${attempt.planId}` : "/learn/programs"}>
        ← 返回计划 / 休息一下
      </Link>
      {error && (
        <div className="learn-error" role="alert">
          {error}
          <div className="training-actions">
            <button onClick={() => window.location.reload()}>
              重新读取云端
            </button>
            <button onClick={exportDraft}>导出本机输入</button>
          </div>
        </div>
      )}
      {draftConflict && (
        <section className="training-draft-conflict" aria-label="草稿冲突处理">
          <h2>选择要继续编辑的记录</h2>
          <p>云端内容已显示在下方。本机草稿尚未覆盖它，请先比较，再选择。</p>
          <details>
            <summary>查看本机草稿</summary>
            <ul>
              {Object.entries(draftConflict.choices).map(([key, value]) => (
                <li key={key}>
                  {
                    attempt?.activity.questions.find((q) => q.id === key)
                      ?.prompt
                  }
                  ：
                  {attempt?.activity.questions
                    .find((q) => q.id === key)
                    ?.options.find((o) => o.id === value)?.text ?? value}
                </li>
              ))}
            </ul>
            {draftConflict.solid && (
              <p>
                模型：{solidFacts[draftConflict.solid].name} · 高{" "}
                {draftConflict.height} · 底面大小 {draftConflict.size}
              </p>
            )}
            <p>{draftConflict.explanation}</p>
          </details>
          <div className="training-actions">
            <button onClick={() => resolveDraft(true)}>
              恢复本机草稿继续编辑
            </button>
            <button onClick={() => resolveDraft(false)}>保留云端内容</button>
            <button onClick={exportDraft}>导出本机草稿</button>
          </div>
        </section>
      )}
      {notice && (
        <p role="status" className="training-notice">
          {notice}
        </p>
      )}
      {!attempt || !activity ? (
        !error && <p role="status">正在打开练习…</p>
      ) : (
        <>
          <span className="learn-eyebrow">
            {plan?.program.audience === "adult" ? "成人练习" : "空间实验"} · 第{" "}
            {attempt.ordinal} 次尝试 ·{" "}
            {attempt.mode === "review" ? "延后回顾" : "每一次尝试独立保留"}
          </span>
          <h1>{activity.task.title}</h1>
          {plan && (
            <p className="training-position">
              第{" "}
              {plan.program.tasks.findIndex((t) => t.id === activity.task.id) +
                1}{" "}
              / {plan.program.tasks.length} 项活动 · 可随时保存后休息
            </p>
          )}
          <p className="training-objective">{activity.task.objective}</p>
          <p>{activity.introduction}</p>
          {plan?.paused && (
            <p className="learn-error">
              计划已经暂停，请回到计划恢复后再继续。
            </p>
          )}
          {activity.model && (
            <section className="training-lab">
              <div className="training-actions">
                <button onClick={() => setThree(!three)}>
                  {three ? "切换平面图" : "打开三维观察"}
                </button>
                <span>可用键盘和数值框完成，不需要麦克风</span>
              </div>
              {activity.target && (
                <p>
                  <strong>目标约束：</strong>
                  {solidFacts[activity.target.solid].name} · 高{" "}
                  {activity.target.height} · 底面大小 {activity.target.size}
                </p>
              )}
              {three ? (
                <Suspense fallback={<p>正在载入三维实验…</p>}>
                  <GeometryCanvas
                    work={work}
                    progress={formation}
                    highlight="none"
                    target={activity.target}
                    support={
                      tower
                        ? (answer.choices.support as GeometryWork["solid"])
                        : undefined
                    }
                    label="练习形体三维模型"
                  />
                </Suspense>
              ) : (
                <Diagram
                  model={activity.target ?? work}
                  formation={formation}
                  heightLines={activity.questions.some(
                    (q) => q.id === "height",
                  )}
                />
              )}
              {tower && !three && (
                <>
                  <p>支撑部件（上图是塔顶）</p>
                  <Diagram
                    model={{
                      solid: answer.choices.support as GeometryWork["solid"],
                      height: 1.2,
                      size: 0.65,
                    }}
                    formation={1}
                    heightLines={false}
                  />
                </>
              )}
              {three && activity.questions.some((q) => q.id === "height") && (
                <Diagram
                  model={activity.target ?? work}
                  formation={1}
                  heightLines
                />
              )}
              {activity.formation && (
                <label className="training-range">
                  拖动观察形成过程（不会自动播放）
                  <input
                    aria-label="形成过程"
                    type="range"
                    min="0.05"
                    max="1"
                    step="0.01"
                    value={formation}
                    onChange={(e) => setFormation(Number(e.target.value))}
                  />
                </label>
              )}
              {activity.adjustable && (
                <fieldset className="training-preferences" disabled={disabled}>
                  <legend>我的模型参数</legend>
                  {activity.target && (
                    <label>
                      形体
                      <select
                        value={work.solid}
                        onChange={(e) =>
                          change({
                            ...answer,
                            solid: e.target.value as GeometryWork["solid"],
                            height: work.height,
                            size: work.size,
                          })
                        }
                      >
                        {solidKinds.map((s) => (
                          <option key={s} value={s}>
                            {solidFacts[s].name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label>
                    高度
                    <input
                      aria-label="模型高度"
                      type="number"
                      min="0.8"
                      max="3.2"
                      step="0.1"
                      value={work.height}
                      onChange={(e) => {
                        if (e.target.value)
                          change({
                            ...answer,
                            solid: work.solid,
                            size: work.size,
                            height: Number(e.target.value),
                          });
                      }}
                    />
                  </label>
                  <label>
                    底面大小
                    <input
                      aria-label="模型底面大小"
                      type="number"
                      min="0.6"
                      max="2"
                      step="0.1"
                      value={work.size}
                      onChange={(e) => {
                        if (e.target.value)
                          change({
                            ...answer,
                            solid: work.solid,
                            height: work.height,
                            size: Number(e.target.value),
                          });
                      }}
                    />
                  </label>
                </fieldset>
              )}
              {activity.target && !three && (
                <>
                  <p>我的模型（上图为目标）</p>
                  <Diagram model={work} formation={1} heightLines={false} />
                </>
              )}
            </section>
          )}
          <fieldset className="training-questions" disabled={disabled}>
            <legend>这一次的选择</legend>
            {activity.questions.map((q) => (
              <fieldset key={q.id}>
                <legend>{q.prompt}</legend>
                {q.options.map((o) => (
                  <label
                    key={o.id}
                    className={answer.choices[q.id] === o.id ? "selected" : ""}
                  >
                    <input
                      type="radio"
                      name={q.id}
                      checked={answer.choices[q.id] === o.id}
                      onChange={() =>
                        change({
                          ...answer,
                          choices: { ...answer.choices, [q.id]: o.id },
                        })
                      }
                    />
                    {o.text}
                  </label>
                ))}
              </fieldset>
            ))}
          </fieldset>
          {activity.explanationRequired && (
            <label className="training-explanation">
              记录你的依据或预测（也可以请家长代写；文字暂不自动评分）
              <textarea
                maxLength={500}
                value={answer.explanation}
                disabled={disabled}
                onChange={(e) =>
                  change({ ...answer, explanation: e.target.value })
                }
              />
            </label>
          )}
          {activity.task.kind === "scenario" && (
            <p className="learn-muted">
              不采集私人日记。可以在心里或纸上练习自己的说法；这里只保存你明确选择的选项。情绪本身没有对错。
            </p>
          )}
          {attempt.hint && (
            <aside className="training-notice">
              <strong>
                {attempt.hint.source === "ai-selected"
                  ? "AI 从固定引导中选择的提示"
                  : "教学引导"}
              </strong>
              <p>{attempt.hint.text}</p>
            </aside>
          )}
          {attempt.status === "active" && (
            <div className="training-actions training-submit-bar">
              <button disabled={disabled} onClick={() => void save(false)}>
                保存到云端
              </button>
              <button
                className="learn-primary"
                disabled={disabled}
                onClick={() => void save(true)}
              >
                提交这次尝试
              </button>
              <button
                disabled={disabled || !!attempt.hint}
                onClick={() => void hint()}
              >
                {busy ? "正在处理…" : "需要一点提示"}
              </button>
              {(activity.task.stage === "baseline" ||
                activity.task.kind === "scenario") && (
                <button
                  disabled={disabled}
                  onClick={() => void save(true, true)}
                >
                  跳过这项（不算掌握）
                </button>
              )}
            </div>
          )}
          {attempt.assessment && (
            <section className="training-result">
              <span className="learn-eyebrow">
                这次的反馈 · {attempt.assessment.rubricVersion}
              </span>
              <h2>{attempt.assessment.summary}</h2>
              <ul>
                {attempt.assessment.evidence.map((e) => (
                  <li key={e.skill}>
                    {plan?.program.skills.find((s) => s.id === e.skill)?.title}
                    ：{e.detail}
                  </li>
                ))}
              </ul>
              <div className="training-actions">
                <Link
                  className="learn-primary"
                  to={`/learn/plans/${attempt.planId}`}
                >
                  查看下一步 →
                </Link>
                <Link to={`/learn/reports/${attempt.planId}`}>
                  查看阶段报告
                </Link>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
