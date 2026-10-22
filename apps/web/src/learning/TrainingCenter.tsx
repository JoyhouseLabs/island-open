import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import type {
  TrainingCatalog,
  TrainingPlan,
  TrainingPreferences,
} from "@island/contracts";
import { api } from "../api";
import { useLearner } from "./LearningLayout";
import "./training.css";
export function Preferences({
  value,
  onChange,
  disabled = false,
  audience,
}: {
  value: TrainingPreferences;
  onChange: (v: TrainingPreferences) => void;
  disabled?: boolean;
  audience?: "student" | "adult";
}) {
  return (
    <fieldset className="training-preferences" disabled={disabled}>
      <legend>按自己的节奏</legend>
      <label>
        每次可用时间
        <select
          value={value.minutes}
          onChange={(e) =>
            onChange({
              ...value,
              minutes: e.target.value as TrainingPreferences["minutes"],
            })
          }
        >
          <option value="5">约 5 分钟</option>
          <option value="10">约 10 分钟</option>
          <option value="15">约 15 分钟</option>
        </select>
      </label>
      {audience !== "adult" && (
        <label>
          几何呈现方式
          <select
            value={value.presentation}
            onChange={(e) =>
              onChange({
                ...value,
                presentation: e.target
                  .value as TrainingPreferences["presentation"],
              })
            }
          >
            <option value="2d">平面图与数值（轻量）</option>
            <option value="3d">三维交互</option>
          </select>
        </label>
      )}
      <label>
        这次的目标
        <select
          value={value.goal}
          onChange={(e) =>
            onChange({
              ...value,
              goal: e.target.value as TrainingPreferences["goal"],
            })
          }
        >
          <option value="explore">先探索</option>
          <option value="practice">多练习</option>
          <option value="review">回顾已学内容</option>
        </select>
      </label>
    </fieldset>
  );
}
export default function TrainingCenter() {
  const user = useLearner(),
    { programId } = useParams(),
    navigate = useNavigate();
  const [data, setData] = useState<TrainingCatalog | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [preferences, setPreferences] = useState<TrainingPreferences>({
    minutes: "10",
    presentation: "2d",
    goal: "explore",
  });
  useEffect(() => {
    const controller = new AbortController();
    void api<TrainingCatalog>("/learning/programs", {
      signal: controller.signal,
    })
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [user.id]);
  async function enroll(id: string) {
    const existing = data?.plans.find((p) => p.programId === id);
    if (existing) {
      void navigate(`/learn/plans/${existing.id}`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const plan = await api<TrainingPlan>(`/learning/programs/${id}/enroll`, {
        method: "POST",
        body: JSON.stringify(preferences),
      });
      void navigate(`/learn/plans/${plan.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "暂时无法开始。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="learn-content training-content">
      <Link to="/learn">← 学习中心</Link>
      <section className="training-hero">
        <span className="learn-eyebrow">学一点 · 练一次 · 看见下一步</span>
        <h1>
          为一个目标，
          <br />
          慢慢积累能力。
        </h1>
        <p>
          选择一个小型训练包。每次尝试独立保存，依据练习结果补学、换个变式，再回来看看。
        </p>
        <div className="training-cycle">
          <span>选择目标</span>
          <span>学习与练习</span>
          <span>查看证据</span>
          <span>补练与回顾</span>
        </div>
      </section>
      {error && (
        <p className="learn-error" role="alert">
          {error}
        </p>
      )}
      {!data && !error && <p role="status">正在读取训练包…</p>}
      {!!data?.plans.length && (
        <section>
          <h2>我的训练计划</h2>
          <div className="learn-grid">
            {data.plans.map((p) => (
              <article className="learn-card" key={p.id}>
                <span className="learn-eyebrow">
                  {p.paused ? "已暂停 · 随时可以回来" : "你的节奏"}
                </span>
                <h3>{p.title}</h3>
                <p>{p.completed} / 6 项活动已完成或跳过</p>
                <Link to={`/learn/plans/${p.id}`}>打开计划 →</Link>
              </article>
            ))}
          </div>
        </section>
      )}
      <h2>{programId ? "训练包详情" : "两个起点，同一个成长循环"}</h2>
      <Preferences
        value={preferences}
        onChange={setPreferences}
        disabled={busy}
        audience={data?.programs.find((p) => p.id === programId)?.audience}
      />
      <div className="learn-grid">
        {data?.programs
          .filter((p) => !programId || p.id === programId)
          .map((p) => (
            <article
              className={`learn-card training-package ${p.audience}`}
              key={p.id}
            >
              <span className="learn-eyebrow">
                {p.audience === "student"
                  ? "学生 · 观察与建模"
                  : "成人 · 日常回应练习"}{" "}
                · 6 次活动
              </span>
              <h2>{p.title}</h2>
              <p>{p.description}</p>
              <ul>
                {p.skills.map((s) => (
                  <li key={s.id}>{s.title}</li>
                ))}
              </ul>
              <p className="learn-muted">{p.boundary}</p>
              {programId && (
                <ol>
                  {p.tasks.map((t) => (
                    <li key={t.id}>
                      <strong>{t.title}</strong> · {t.objective}
                    </li>
                  ))}
                </ol>
              )}
              <div className="training-actions">
                <button
                  className="learn-primary"
                  disabled={busy}
                  onClick={() => void enroll(p.id)}
                >
                  {data.plans.some((x) => x.programId === p.id)
                    ? "继续这个计划"
                    : "创建我的计划"}
                </button>
                {!programId && (
                  <Link to={`/learn/programs/${p.id}`}>了解六次活动</Link>
                )}
              </div>
            </article>
          ))}
      </div>
      {data && programId && !data.programs.some((p) => p.id === programId) && (
        <p>这份训练包尚未开放。</p>
      )}
      <p className="learn-muted">
        首批示范内容。活动完成不等于能力掌握；真实教学效果仍需试用验证。已有单课和作品继续保留。
      </p>
    </div>
  );
}
