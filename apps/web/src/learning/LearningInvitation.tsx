import "./learning.css";
import { GraduationCap, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import type {
  LearningCatalog,
  LearningReturn,
  LearningSession,
} from "@island/contracts";
import { api } from "../api";
import type { useWorld } from "../useWorld";
import { learningTravel, rememberReturn } from "./travel";
export default function LearningInvitation({
  parent,
  room,
  compact = false,
}: {
  compact?: boolean;
  parent: ReturnType<typeof useWorld>;
  room: ReturnType<typeof useWorld>;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(false),
    [lessons, setLessons] = useState<LearningCatalog["lessons"]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void api<{ features?: { learning?: boolean } }>("/capabilities")
      .then(async (c) => {
        if (!live || !c.features?.learning) return;
        setEnabled(true);
        if (parent.user) {
          const catalog = await api<LearningCatalog>("/learning/catalog");
          if (live)
            setLessons(
              catalog.lessons.filter((l) => l.lesson.trigger === "library"),
            );
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [parent.user?.id]);
  if (!enabled) return null;
  async function launch(lessonId?: string) {
    setBusy(true);
    setError("");
    try {
      await room.preserveDraft();
      await parent.preserveDraft();
      await room.save();
      await parent.save();
      const p = learningTravel.current;
      const context: LearningReturn = {
        worldId: parent.record?.id ?? null,
        scene: "library",
        position:
          parent.record && p?.scene === "library"
            ? { x: p.x, z: p.z, yaw: p.yaw }
            : null,
      };
      rememberReturn(context, parent.user?.id ?? null);
      if (!parent.user || !lessonId) {
        void navigate("/learn");
        return;
      }
      const s = await api<LearningSession>(
        `/learning/lessons/${lessonId}/start`,
        { method: "POST", body: JSON.stringify({ returnContext: context }) },
      );
      void navigate(`/learn?active=${s.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "学习任务暂时无法打开。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {compact && (
        <button
          className="tool"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <GraduationCap size={20} />
          <span>学习</span>
        </button>
      )}
      {(!compact || open) && (
        <div
          className={`learning-invitation${compact ? " menu-learning" : ""}`}
        >
          {compact && (
            <button
              className="small-button"
              aria-label="关闭学习菜单"
              onClick={() => setOpen(false)}
            >
              <X size={16} />
            </button>
          )}
          <strong>小狐狸的学习邀请</strong>
          <p>一起发现形状，带一件自己的作品回来。</p>
          {lessons
            .filter((l) => !l.locked)
            .slice(0, 2)
            .map(({ lesson, locked }) => (
              <button
                className="small-button"
                key={lesson.id}
                disabled={busy || locked}
                onClick={() => void launch(lesson.id)}
              >
                {locked ? "完成前置活动后解锁" : `开始：${lesson.title}`}
              </button>
            ))}
          <button
            className="small-button"
            disabled={busy}
            onClick={() => void launch()}
          >
            打开学习中心
          </button>
          {error && <p role="alert">{error}</p>}
        </div>
      )}
    </>
  );
}
