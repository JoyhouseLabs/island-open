import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import type { LearningCatalog, LearningSession } from "@island/contracts";
import { api } from "../api";
import { useLearner, useAdaptiveLearning } from "./LearningLayout";
import { readReturn } from "./travel";
import CatPicture from "./CatPicture";
export default function LearningHome() {
  const adaptiveLearning = useAdaptiveLearning();
  const user = useLearner(),
    navigate = useNavigate(),
    { lessonId } = useParams(),
    [search] = useSearchParams();
  const [data, setData] = useState<LearningCatalog | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = () => {
    setError("");
    void api<LearningCatalog>("/learning/catalog")
      .then(setData)
      .catch((e) => setError(e.message));
  };
  useEffect(load, [user.id]);
  const active =
    data?.sessions.find((s) => s.id === search.get("active")) ??
    data?.sessions.find((s) => s.status === "active");
  async function start(id: string, resume = false) {
    setBusy(true);
    setError("");
    try {
      const s = await api<LearningSession>(`/learning/lessons/${id}/start`, {
        method: "POST",
        body: JSON.stringify({ returnContext: readReturn(user.id) }),
      });
      load();
      void navigate(
        resume ? `/learn/sessions/${s.id}` : `/learn?active=${s.id}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "任务暂时无法开始。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="learn-content">
      <section className="learn-hero">
        <div>
          <span className="learn-eyebrow">好奇心，从这里出发</span>
          <h1>
            {user.name}，<br />
            今天想发现什么？
          </h1>
          <p>在小岛上收集问题，在这里慢慢找到自己的答案。</p>
        </div>
        <CatPicture />
      </section>
      {adaptiveLearning && !lessonId && (
        <section className="learn-current">
          <div>
            <span className="learn-eyebrow">新的学习方式</span>
            <h2>选一个目标，开始系统练习</h2>
            <p>学生几何与成人回应练习 · 个人计划、每次反馈、补练与回顾</p>
          </div>
          <Link className="learn-primary" to="/learn/programs">
            打开训练中心 →
          </Link>
        </section>
      )}
      {error && (
        <div className="learn-error" role="alert">
          {error} <button onClick={load}>重新读取</button>
        </div>
      )}
      {!data && !error && <p role="status">正在读取任务与作品…</p>}
      {active && (
        <section className="learn-current">
          <div>
            <span className="learn-eyebrow">
              {active.status === "completed" ? "刚刚完成" : "正在进行"}
            </span>
            <h2>{active.lesson.title}</h2>
            <p>
              {active.completedSteps.length} / {active.lesson.steps.length}{" "}
              个活动 · 进度已保存在云端
            </p>
          </div>
          <Link
            className="learn-primary"
            to={`/learn/sessions/${active.id}`}
            aria-disabled={busy}
            onClick={(event) => {
              event.preventDefault();
              if (!busy) void start(active.lessonId, true);
            }}
          >
            {active.status === "completed" ? "查看作品与纪念章" : "继续学习 →"}
          </Link>
        </section>
      )}
      {!lessonId &&
        data?.lessons.some((x) => x.lesson.series?.id === "geometry-ai") && (
          <section className="learn-series">
            <span className="learn-eyebrow">循序渐进的探索路径</span>
            <h2>几何与模型 · AI 基础</h2>
            <p>
              先观察与描述，再调整参数，最后用样例训练和检验。前三课自由探索，后两课按前置任务解锁；可以和家长一起完成。
            </p>
            <ol>
              {data.lessons
                .filter((x) => x.lesson.series?.id === "geometry-ai")
                .sort((a, b) => a.lesson.series!.order - b.lesson.series!.order)
                .map((x) => (
                  <li key={x.lesson.id}>
                    <Link to={`/learn/lessons/${x.lesson.id}`}>
                      {x.lesson.title}
                    </Link>
                    {data.sessions.some(
                      (s) =>
                        s.lessonId === x.lesson.id && s.status === "completed",
                    )
                      ? " ✓"
                      : x.locked
                        ? " · 待解锁"
                        : ""}
                  </li>
                ))}
            </ol>
          </section>
        )}
      <h2>{lessonId ? "课程邀请" : "可以探索的活动"}</h2>
      <div className="learn-grid">
        {data?.lessons
          .filter((x) => !lessonId || x.lesson.id === lessonId)
          .sort(
            (a, b) =>
              (a.lesson.series?.order ?? 99) - (b.lesson.series?.order ?? 99),
          )
          .map(({ lesson, locked }) => {
            const session = data.sessions.find((s) => s.lessonId === lesson.id);
            return (
              <article
                className="learn-card"
                key={lesson.id}
                data-lesson-id={lesson.id}
              >
                <span className="learn-eyebrow">
                  {lesson.trigger === "library" ? "林间书屋的邀请" : "自由探索"}{" "}
                  · 约 {lesson.minutes} 分钟
                </span>
                {lesson.series && (
                  <p className="learn-eyebrow">
                    {lesson.series.title} · 第 {lesson.series.order} 课
                  </p>
                )}
                <h3>{lesson.title}</h3>
                <p>{lesson.description}</p>
                {!!lesson.goals?.length && (
                  <ul className="learn-goals">
                    {lesson.goals.map((g) => (
                      <li key={g}>{g}</li>
                    ))}
                  </ul>
                )}
                {locked && (
                  <p>
                    先完成：
                    {data.lessons.find(
                      (x) => x.lesson.id === lesson.prerequisite,
                    )?.lesson.title ?? lesson.prerequisite}
                  </p>
                )}
                <p>
                  {lesson.steps.length} 个活动{" "}
                  {locked ? "· 需先完成前置活动" : "· 可以随时休息"}
                </p>
                <button
                  disabled={busy || (locked && !session)}
                  onClick={() => void start(lesson.id)}
                >
                  {session
                    ? session.status === "completed"
                      ? "欣赏成果"
                      : "接着探索"
                    : "接受任务"}
                </button>
              </article>
            );
          })}
      </div>
      {lessonId &&
        data &&
        !data.lessons.some((x) => x.lesson.id === lessonId) && (
          <p>
            这份课程尚未开放。<Link to="/learn">看看其他活动</Link>
          </p>
        )}
      <h2>我的探索收藏</h2>
      <div className="learn-grid">
        {data?.sessions
          .filter((s) => s.status === "completed")
          .map((s) => (
            <article className="learn-card" key={s.id}>
              <span className="learn-badge">✧ {s.badge}</span>
              <h3>{s.lesson.title}</h3>
              <Link to={`/learn/sessions/${s.id}`}>打开学习成果 →</Link>
            </article>
          ))}
      </div>
      {data && !data.sessions.some((s) => s.status === "completed") && (
        <p className="learn-muted">
          完成活动后，你的作品与探索纪念会收藏在这里。
        </p>
      )}
    </div>
  );
}
