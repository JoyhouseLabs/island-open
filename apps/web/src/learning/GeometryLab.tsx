import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  solidFacts,
  solidKinds,
  type GeometryTask,
  type GeometryWork,
} from "@island/contracts";
import type { Highlight } from "./GeometryCanvas";
const GeometryCanvas = lazy(() => import("./GeometryCanvas"));
export default function GeometryLab({
  work,
  task,
  disabled,
  onChange,
}: {
  work: GeometryWork;
  task: GeometryTask;
  disabled: boolean;
  onChange: (work: GeometryWork) => void;
}) {
  const [progress, setProgress] = useState(1),
    [playing, setPlaying] = useState(false),
    [highlight, setHighlight] = useState<Highlight>("all");
  const progressRef = useRef(progress);
  progressRef.current = progress;
  useEffect(() => {
    if (!playing || disabled) return;
    let frame = 0,
      previous = 0;
    const tick = (time: number) => {
      if (document.hidden) {
        previous = time;
        frame = requestAnimationFrame(tick);
        return;
      }
      const next = Math.min(
        1,
        progressRef.current +
          (previous ? Math.min(time - previous, 80) / 5000 : 0),
      );
      previous = time;
      progressRef.current = next;
      setProgress(next);
      if (next >= 1) setPlaying(false);
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, disabled]);
  const fact = solidFacts[work.solid],
    round = work.solid === "cone" || work.solid === "cylinder";
  return (
    <div className="geometry-lab">
      <fieldset disabled={disabled} className="geometry-selector">
        <legend>选择一个立体朋友</legend>
        {solidKinds.map((s) => (
          <button
            type="button"
            key={s}
            aria-pressed={work.solid === s}
            onClick={() => {
              onChange({ ...work, solid: s });
              setProgress(1);
              setPlaying(false);
            }}
          >
            {solidFacts[s].name}
            {work.observed.includes(s) ? " ✓" : ""}
          </button>
        ))}
      </fieldset>
      <Suspense
        fallback={
          <div className="geometry-canvas" role="status">
            正在搭建几何实验台…
          </div>
        }
      >
        <GeometryCanvas
          work={work}
          progress={progress}
          highlight={highlight}
          target={task.target}
        />
      </Suspense>
      <p className="learn-muted">
        拖动旋转，双指或滚轮缩放。
        {task.target
          ? "左边是你的模型，右边是目标模型。"
          : "玫红虚线表示垂直于底面的高，不是斜边。"}
      </p>
      <fieldset disabled={disabled} className="geometry-animation">
        <legend>形成过程</legend>
        <button
          type="button"
          onClick={() => {
            if (playing) setPlaying(false);
            else {
              if (progress >= 1) {
                setProgress(0);
                progressRef.current = 0;
              }
              setPlaying(true);
            }
          }}
        >
          {playing ? "暂停动画" : progress < 1 ? "继续形成" : "播放形成动画"}
        </button>
        <label>
          形成进度{" "}
          <input
            aria-label="形成进度"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={progress}
            onChange={(e) => {
              setPlaying(false);
              setProgress(Number(e.target.value));
            }}
          />
          <output>{Math.round(progress * 100)}%</output>
        </label>
        <p>{fact.formation}</p>
        <p className="learn-muted">
          进度为 0 时只有底面，还不是完整的立体；下方特征描述的是形成后的形体。
        </p>
      </fieldset>
      <fieldset disabled={disabled} className="geometry-highlights">
        <legend>找一找它的特征</legend>
        {(
          [
            ["all", "整体"],
            ["base", "底面"],
            ["sides", "侧面"],
            ["vertices", "顶点"],
            ["height", "高"],
          ] as const
        ).map(([key, label]) => (
          <button
            type="button"
            key={key}
            aria-pressed={highlight === key}
            onClick={() => setHighlight(key)}
          >
            {label}
          </button>
        ))}
      </fieldset>
      <dl className="geometry-facts">
        <div>
          <dt>底面</dt>
          <dd>{fact.base}</dd>
        </div>
        <div>
          <dt>表面</dt>
          <dd>{fact.surfaces}</dd>
        </div>
        <div>
          <dt>顶点</dt>
          <dd>{fact.vertices}</dd>
        </div>
        <div>
          <dt>棱与边界</dt>
          <dd>{fact.edges}</dd>
        </div>
      </dl>
      <p>{fact.invariant}</p>
      <fieldset disabled={disabled} className="geometry-parameters">
        <legend>一次改变一个参数，先预测再观察</legend>
        <label>
          高 <output>{work.height.toFixed(1)}</output>
          <input
            aria-label="模型高度"
            type="range"
            min={0.8}
            max={3.2}
            step={0.1}
            value={work.height}
            onChange={(e) =>
              onChange({ ...work, height: Number(e.target.value) })
            }
          />
        </label>
        <label>
          {round ? "底面半径" : "底边长"}{" "}
          <output>{work.size.toFixed(1)}</output>
          <input
            aria-label="底面大小"
            type="range"
            min={0.6}
            max={2}
            step={0.1}
            value={work.size}
            onChange={(e) =>
              onChange({ ...work, size: Number(e.target.value) })
            }
          />
        </label>
        <p className="learn-muted">
          数值使用统一模型单位。
          {task.target &&
            `目标：${solidFacts[task.target.solid].name}，高 ${task.target.height}，${task.target.solid === "cone" || task.target.solid === "cylinder" ? "半径" : "底边长"} ${task.target.size}。`}
        </p>
      </fieldset>
      <button
        type="button"
        disabled={disabled || work.observed.includes(work.solid)}
        onClick={() =>
          onChange({ ...work, observed: [...work.observed, work.solid] })
        }
      >
        记入观察记录
      </button>
      <p className="learn-muted">
        已记录 {work.observed.length} / 4 种形体。
        {task.mode === "parameters"
          ? "这一课重点是匹配目标参数。"
          : "观察并记录全部四种形体后，再完成活动。"}
      </p>
      <label htmlFor="geometry-note">我的发现：什么变了，什么没有变？</label>
      <textarea
        id="geometry-note"
        rows={3}
        maxLength={500}
        disabled={disabled}
        value={work.note}
        placeholder="我把高调大了，发现……但顶点数量……"
        onChange={(e) => onChange({ ...work, note: e.target.value })}
      />
    </div>
  );
}
