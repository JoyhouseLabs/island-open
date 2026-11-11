import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { sceneIds, sceneRegistry, speciesProfiles } from "@island/contracts";
import { menus, useMenuPanel } from "../navigation/store";
import {
  chooseStory,
  restoreStoryRun,
  storyRunKey,
  type StoryRun,
} from "./playback";
import "./stories.css";
export default function StoryPlayLayer({ userId }: { userId: string | null }) {
  const [run, setRun] = useState<StoryRun | null>(null),
    [folded, setFolded] = useState(false),
    [error, setError] = useState("");
  const location = useLocation(),
    navigate = useNavigate(),
    menu = useMenuPanel();
  const key = storyRunKey(userId);
  const go = (path: string) => {
    const travel = menus.actions?.().travel;
    if (travel) void travel(path);
    else navigate(path);
  };
  useEffect(() => {
    const load = () => {
      setRun(null);
      setError("");
      setFolded(false);
      try {
        const raw = localStorage.getItem(key);
        if (raw) setRun(restoreStoryRun(JSON.parse(raw)));
      } catch {
        setError("试玩进度暂时无法读取，请返回故事工坊重新开始。");
      }
    };
    load();
    window.addEventListener("island-story-run", load);
    return () => window.removeEventListener("island-story-run", load);
  }, [key]);
  if (!sceneIds.some((id) => location.pathname === `/${id}`) || menu)
    return null;
  if (!run)
    return error ? (
      <aside className="story-play">
        <p role="status">{error}</p>
        <button onClick={() => go("/stories")}>回故事工坊</button>
      </aside>
    ) : null;
  const node = run.story.nodes.find((n) => n.id === run.path.at(-1))!;
  const here = location.pathname === `/${node.scene}`;
  const save = (next: StoryRun | null) => {
    try {
      if (next) localStorage.setItem(key, JSON.stringify(next));
      else localStorage.removeItem(key);
      setError("");
    } catch {
      setError("本机存储不可用，当前试玩进度无法保存。");
    }
    setRun(next);
  };
  return (
    <aside
      className={`story-play${folded ? " story-play-folded" : ""}`}
      aria-label="故事试玩"
    >
      <header>
        <strong>{run.story.title}</strong>
        <button onClick={() => setFolded(!folded)}>
          {folded ? "展开故事" : "暂时收起"}
        </button>
      </header>
      {!folded && (
        <>
          <small>
            剧情试玩 · 第 {run.path.length} 张卡 ·{" "}
            {sceneRegistry.find((s) => s.id === node.scene)?.name}
          </small>
          {!here ? (
            <>
              <p>
                下一段故事发生在
                {sceneRegistry.find((s) => s.id === node.scene)?.name}。
              </p>
              <button onClick={() => go(`/${node.scene}`)}>前往故事地点</button>
            </>
          ) : (
            <>
              <h3>{node.title}</h3>
              <small>
                {node.speaker ? speciesProfiles[node.speaker].label : "旁白"}
              </small>
              <p className="story-prose">{node.text}</p>
              {node.choices.map((c, i) => (
                <button
                  className="story-choice"
                  key={i}
                  onClick={() => save(chooseStory(run, i))}
                >
                  {c.label}
                </button>
              ))}
              {node.kind === "ending" && (
                <p role="status">✧ 故事到这里告一段落。</p>
              )}
            </>
          )}
          {error && <p role="alert">{error}</p>}
          <footer>
            <button
              onClick={() => {
                if (run.path.length > 1)
                  save({ ...run, path: run.path.slice(0, -1) });
              }}
              disabled={run.path.length < 2}
            >
              上一步
            </button>
            <button onClick={() => go("/stories")}>回工坊</button>
            <button onClick={() => save(null)}>结束试玩</button>
          </footer>
        </>
      )}
    </aside>
  );
}
