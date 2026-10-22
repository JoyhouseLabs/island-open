import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import type { TrainingAttempt, TrainingPlan as Plan } from "@island/contracts";
import { api } from "../api";
import { useLearner } from "./LearningLayout";
import { Preferences } from "./TrainingCenter";
import "./training.css";
export default function TrainingPlan() {
  const { planId } = useParams(),
    user = useLearner(),
    navigate = useNavigate(),
    location = useLocation();
  const report = location.pathname.includes("/reports/");
  const [plan, setPlan] = useState<Plan | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState("");
  const generation = useRef(0);
  function load() {
    const current = ++generation.current;
    setError("");
    void api<Plan>(`/learning/plans/${planId}`)
      .then((next) => {
        if (current === generation.current) setPlan(next);
      })
      .catch((e) => {
        if (current === generation.current) setError(e.message);
      });
  }
  useEffect(() => {
    setPlan(null);
    setBusy(false);
    setSaved("");
    load();
    return () => {
      generation.current++;
    };
  }, [planId, user.id]);
  async function update(paused: boolean, reviewInDays?: number) {
    if (!plan || busy) return;
    const current = generation.current;
    setBusy(true);
    setError("");
    try {
      const updated = await api<Plan>(`/learning/plans/${plan.id}`, {
        method: "PUT",
        body: JSON.stringify({
          revision: plan.revision,
          preferences: plan.preferences,
          paused,
          ...(reviewInDays ? { reviewInDays } : {}),
        }),
      });
      if (current !== generation.current) return;
      setPlan(updated);
      setSaved(paused ? "计划已暂停，不会扣分或清空记录。" : "安排已保存。");
    } catch (e) {
      if (current === generation.current)
        setError(e instanceof Error ? e.message : "无法保存。");
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  async function start(taskId: string) {
    if (!plan || busy) return;
    const current = generation.current;
    setBusy(true);
    setError("");
    try {
      const a = await api<TrainingAttempt>(
        `/learning/plans/${plan.id}/attempts`,
        { method: "POST", body: JSON.stringify({ taskId }) },
      );
      if (current === generation.current)
        void navigate(`/learn/attempts/${a.id}`);
    } catch (e) {
      if (current === generation.current)
        setError(e instanceof Error ? e.message : "无法开始。");
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  const active = plan?.attempts.find((a) => a.status === "active");
  return (
    <div className="learn-content training-content">
      <Link to="/learn/programs">← 训练包与计划</Link>
      {error && (
        <div className="learn-error" role="alert">
          {error} <button onClick={load}>重新读取云端</button>
        </div>
      )}
      {!plan ? (
        !error && <p role="status">正在读取计划…</p>
      ) : (
        <>
          <span className="learn-eyebrow">
            {report ? "阶段报告 · 证据可追溯" : "我的训练计划"} · 第{" "}
            {plan.program.version} 版
          </span>
          <h1>{plan.program.title}</h1>
          <p>{plan.program.description}</p>
          <div className="training-actions">
            <Link to={`/learn/${report ? "plans" : "reports"}/${plan.id}`}>
              {report ? "返回活动安排" : "查看阶段报告"}
            </Link>
            <button disabled={busy} onClick={() => void update(!plan.paused)}>
              {plan.paused ? "恢复计划" : "暂停计划"}
            </button>
          </div>
          {saved && <p role="status">{saved}</p>}
          {plan.paused && (
            <p className="training-notice">
              已经暂停。过去的记录仍可阅读，准备好时再恢复。
            </p>
          )}
          <div className="training-summary" aria-label="活动进展">
            <span>
              <strong>
                {plan.summary.completedTasks} / {plan.summary.totalTasks}
              </strong>{" "}
              活动已完成
            </span>
            <span>
              <strong>{plan.summary.skippedTasks}</strong> 活动已跳过
            </span>
            <span>
              <strong>{plan.summary.submittedAttempts}</strong> 次已提交尝试
            </span>
          </div>
          {plan.recommendation && !report && (
            <section className="learn-current">
              <div>
                <span className="learn-eyebrow">建议下一步</span>
                <h2>
                  {
                    plan.program.tasks.find(
                      (t) => t.id === plan.recommendation?.taskId,
                    )?.title
                  }
                </h2>
                <p>{plan.recommendation.reason}</p>
                {plan.recommendation.evidenceIds.map((id) => (
                  <Link key={id} to={`/learn/attempts/${id}`}>
                    查看依据 ↗{" "}
                  </Link>
                ))}
              </div>
              <button
                disabled={busy}
                onClick={() => void start(plan.recommendation!.taskId)}
              >
                接着练习 →
              </button>
            </section>
          )}
          {!report && !plan.paused && !plan.recommendation && (
            <p className="training-notice">
              当前没有待推荐的活动。可以休息，也可以从下面选择一项重新开始；跳过不会算作掌握。
            </p>
          )}
          {!report && (
            <details className="training-settings">
              <summary>调整学习安排</summary>
              <Preferences
                value={plan.preferences}
                audience={plan.program.audience}
                onChange={(preferences) => {
                  setPlan({ ...plan, preferences });
                  setSaved("安排有改动，保存后生效。");
                }}
                disabled={busy}
              />
              <button disabled={busy} onClick={() => void update(plan.paused)}>
                保存我的安排
              </button>
            </details>
          )}
          {plan.reviewAt && (
            <p className="training-notice">
              自选回顾：{new Date(plan.reviewAt).toLocaleDateString("zh-CN")}
              。这是可调整的试行间隔，不是截止日期；缺席不扣分。
            </p>
          )}
          {plan.reviewAt && (
            <div className="training-actions">
              <span>调整回顾时间：</span>
              {[1, 3, 7].map((days) => (
                <button
                  key={days}
                  disabled={busy}
                  onClick={() => void update(plan.paused, days)}
                >
                  {days} 天后
                </button>
              ))}
            </div>
          )}
          {!report && (
            <>
              <h2>六次活动 · 可以分段完成</h2>
              <ol className="training-path">
                {plan.program.tasks.map((t, i) => {
                  const unlocked = plan.program.tasks
                    .slice(0, i)
                    .every((t) => plan.completedTaskIds.includes(t.id));
                  const progress = plan.taskProgress.find(
                    (p) => p.taskId === t.id,
                  );
                  const completed = progress?.status === "completed";
                  const labels = {
                    active: "正在进行",
                    revisit: "需要补练 · 查看上次反馈",
                    skipped: "已跳过 · 不算掌握",
                    completed: "已完成 · 可再做一个变式",
                    available: "可以开始",
                    locked: "先完成或跳过前面的活动",
                  };
                  return (
                    <li key={t.id}>
                      <span className="training-number">{i + 1}</span>
                      <div>
                        <h3>{t.title}</h3>
                        <p>{t.objective}</p>
                        <span className="learn-muted">
                          {progress ? labels[progress.status] : "尚无记录"}
                        </span>
                        {progress?.latestAttemptId && (
                          <p>
                            <Link
                              to={`/learn/attempts/${progress.latestAttemptId}`}
                            >
                              上次记录 · {progress.attempts} 次已提交尝试 →
                            </Link>
                          </p>
                        )}
                      </div>
                      <button
                        disabled={
                          busy ||
                          plan.paused ||
                          !unlocked ||
                          (!!active && active.activity.task.id !== t.id)
                        }
                        onClick={() => void start(t.id)}
                      >
                        {active?.activity.task.id === t.id
                          ? "继续"
                          : completed ||
                              progress?.status === "revisit" ||
                              progress?.status === "skipped"
                            ? "再练一次"
                            : "开始"}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </>
          )}
          <h2>目前有哪些证据</h2>
          <p>
            这里只说明具体任务表现，不生成总能力分数。“独立完成”仅表示本次未请求系统提示；文字解释尚未自动评阅，同一变式重复完成不会算成多个新变式。
          </p>
          <div className="learn-grid">
            {plan.skills.map((s) => (
              <article className="learn-card" key={s.id}>
                <h3>{s.title}</h3>
                <strong>{s.state}</strong>
                <p>{s.evidenceIds.length} 次相关记录</p>
                {s.evidenceIds.slice(-2).map((id, i) => (
                  <p key={id}>
                    <Link to={`/learn/attempts/${id}`}>查看记录 {i + 1} →</Link>
                  </p>
                ))}
              </article>
            ))}
          </div>
          <h2>每次尝试都在这里</h2>
          {plan.attempts.length === 0 ? (
            <p>还没有练习证据。先从起点活动开始，也可以跳过起点。</p>
          ) : (
            <ol className="training-history">
              {[...plan.attempts].reverse().map((a) => (
                <li key={a.id}>
                  <Link to={`/learn/attempts/${a.id}`}>
                    {a.activity.task.title} · 第 {a.ordinal} 次
                  </Link>
                  <p>{a.assessment?.summary ?? "尚未提交，可以继续"}</p>
                  <small>
                    {a.submittedAt
                      ? new Date(a.submittedAt).toLocaleString("zh-CN")
                      : "尚未提交"}{" "}
                    · {a.mode === "review" ? "延后回顾 · " : ""}
                    {a.assessment?.assistance === "supported" || a.hint
                      ? "使用过提示"
                      : "未请求提示"}
                  </small>
                </li>
              ))}
            </ol>
          )}
          <p className="learn-muted">
            跳过只解锁后续活动，不计作完成或掌握。成人的个人感受和回应偏好不计作正确率。
          </p>
        </>
      )}
    </div>
  );
}
