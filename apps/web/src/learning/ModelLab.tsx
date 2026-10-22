import { useEffect, useState } from "react";
import {
  modelError,
  modelExamples,
  trainModelStep,
  type ModelTask,
  type ModelWork,
} from "@island/contracts";
export default function ModelLab({
  work,
  task,
  disabled,
  onChange,
}: {
  work: ModelWork;
  task: ModelTask;
  disabled: boolean;
  onChange: (work: ModelWork) => void;
}) {
  const [running, setRunning] = useState(false),
    [tested, setTested] = useState(false);
  const error = modelError(work.weight, task.mode);
  useEffect(() => {
    if (!running || disabled) return;
    if (error < 0.0001) {
      setRunning(false);
      return;
    }
    const timer = setInterval(() => {
      if (!document.hidden)
        onChange({ ...work, weight: trainModelStep(work.weight, task.mode) });
    }, 250);
    return () => clearInterval(timer);
  }, [running, disabled, error, work, task.mode, onChange]);
  const target = task.mode === "train" ? 4 : 6;
  return (
    <div className="model-lab">
      <div className="model-formula">
        预测的高 = <strong>{work.weight.toFixed(3)}</strong> × 底边长
      </div>
      <p>
        {task.mode === "train"
          ? "这是一个只有一个参数 k 的小模型。先猜一猜，再用三个样例调整 k。样例是我们设计的数据，不代表所有物体的高都由底边长决定。"
          : "沿用上一项活动学到的参数，继续用新样例调整同一个模型。新任务希望模型预测更高的形体；也要留意它对旧样例的预测可能变差。"}
      </p>
      <fieldset disabled={disabled}>
        <legend>参数与训练</legend>
        <label>
          参数 k
          <input
            aria-label="模型参数 k"
            type="range"
            min={0}
            max={4}
            step={0.01}
            value={work.weight}
            onChange={(e) => {
              setRunning(false);
              onChange({ ...work, weight: Number(e.target.value) });
            }}
          />
        </label>
        <button
          type="button"
          onClick={() => {
            setRunning(false);
            onChange({
              ...work,
              weight: trainModelStep(work.weight, task.mode),
            });
          }}
        >
          训练一步
        </button>{" "}
        <button type="button" onClick={() => setRunning((v) => !v)}>
          {running ? "暂停训练" : "根据样例连续训练"}
        </button>
      </fieldset>
      <table>
        <caption>训练样例：用这些数据调整参数</caption>
        <thead>
          <tr>
            <th>底边长</th>
            <th>样例的高</th>
            <th>模型预测</th>
          </tr>
        </thead>
        <tbody>
          {modelExamples[task.mode].map((p) => (
            <tr key={p.width}>
              <td>{p.width}</td>
              <td>{p.height}</td>
              <td>{(work.weight * p.width).toFixed(3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p role="status">
        训练误差（平均平方误差）：<strong>{error.toFixed(4)}</strong>。降到 0.01
        以下后，记录发现并完成活动。
      </p>
      <div className="model-error-track" aria-hidden="true">
        <span style={{ width: `${Math.min(100, (error / 12) * 100)}%` }} />
      </div>
      <p className="learn-muted">
        每一步根据预测误差计算调整方向。手动拖动是你在调参；点击训练则是程序根据样例更新参数。
      </p>
      <button type="button" disabled={disabled} onClick={() => setTested(true)}>
        用未参加训练的样例检验
      </button>
      {tested && (
        <p className="model-test-result">
          检验样例：底边长 2，期望的高 {target}。当前模型预测{" "}
          {(2 * work.weight).toFixed(3)}，相差{" "}
          {Math.abs(2 * work.weight - target).toFixed(3)}
          。这个样例没有参与参数更新；一个样例通过还不足以证明模型到处适用。
        </p>
      )}
      {task.mode === "adapt" && (
        <p>
          旧任务的训练误差现在是 {modelError(work.weight, "train").toFixed(4)}
          。这是继续训练的简化演示；真实 AI
          微调需要更多数据、参数和独立评估，不只是拖动一个滑块。
        </p>
      )}
      <label htmlFor="model-note">
        我的发现：参数、误差和预测发生了什么变化？
      </label>
      <textarea
        id="model-note"
        rows={3}
        maxLength={500}
        disabled={disabled}
        value={work.note}
        onChange={(e) => onChange({ ...work, note: e.target.value })}
      />
    </div>
  );
}
