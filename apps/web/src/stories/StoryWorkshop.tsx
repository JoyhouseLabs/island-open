import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  SPECIES,
  speciesProfiles,
  sceneRegistry,
  storyBriefSchema,
  storyDraftSchema,
  storyIssues,
  sampleStory,
  type SavedStory,
  type StoryDraft,
  type StoryNode,
  type StoryBrief,
} from "@island/contracts";
import { useHomeSession } from "../HomeSession";
import { api } from "../api";
import { launchStory } from "./playback";
import "./stories.css";

type Work = { id: string; revision: number; story: StoryDraft };
const fresh = (): Work => ({
  id: crypto.randomUUID(),
  revision: 0,
  story: sampleStory(),
});
const localKey = (id: string | null) =>
  `island-story-draft.v1:${id ?? "local"}`;
function readWork(value: unknown): Work {
  const v = value as Work;
  if (
    !v ||
    !/^[0-9a-f-]{36}$/i.test(v.id) ||
    !Number.isInteger(v.revision) ||
    v.revision < 0
  )
    throw Error();
  return {
    id: v.id,
    revision: v.revision,
    story: storyDraftSchema.parse(v.story),
  };
}
export default function StoryWorkshop() {
  const { world } = useHomeSession();
  return (
    <Workshop key={world.user?.id ?? "local"} userId={world.user?.id ?? null} />
  );
}
function Workshop({ userId }: { userId: string | null }) {
  const [work, setWork] = useState<Work>(fresh),
    [ready, setReady] = useState(false),
    [storageError, setStorageError] = useState("");
  const [previous, setPrevious] = useState<Work | null>(null),
    [selected, setSelected] = useState("start");
  const [library, setLibrary] = useState<SavedStory[]>([]),
    [aiAvailable, setAiAvailable] = useState(false);
  const [proposal, setProposal] = useState<StoryDraft | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [brief, setBrief] = useState<StoryBrief>({
    theme: "帮月亮伊布准备一场观星会",
    mood: "温暖",
    cast: ["umbreon", "pikachu", "sylveon"],
    scene: "starlight",
  });
  const alive = useRef(true),
    actionLock = useRef(false),
    input = useRef<HTMLInputElement>(null);
  const navigate = useNavigate(),
    key = localKey(userId),
    story = work.story;
  const node = story.nodes.find((n) => n.id === selected) ?? story.nodes[0]!;
  const issues = storyIssues(story);
  useEffect(() => {
    alive.current = true;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const loaded = readWork(JSON.parse(raw));
        setWork(loaded);
        setSelected(loaded.story.entry);
      }
    } catch {
      setStorageError(
        "本机草稿无法读取，已保留原记录。可导出当前稿，或载入云端版本。",
      );
    }
    try {
      const raw = localStorage.getItem(key + ":previous");
      if (raw) setPrevious(readWork(JSON.parse(raw)));
    } catch {
      /* Current draft remains usable. */
    }
    setReady(true);
    return () => {
      alive.current = false;
    };
  }, [key]);
  useEffect(() => {
    if (!ready || storageError) return;
    try {
      localStorage.setItem(key, JSON.stringify(work));
    } catch {
      setStorageError("本机存储不可用，请导出文件或保存到云端。");
    }
  }, [work, ready, key, storageError]);
  const refresh = async () => {
    if (!userId) return;
    try {
      const r = await api<{ stories: SavedStory[]; aiAvailable: boolean }>(
        "/stories",
      );
      if (alive.current) {
        setLibrary(r.stories);
        setAiAvailable(r.aiAvailable);
      }
    } catch (e) {
      if (alive.current)
        setMessage(e instanceof Error ? e.message : "云端列表读取失败");
    }
  };
  useEffect(() => {
    void refresh();
  }, [userId]);
  const run = async (action: () => Promise<void>) => {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (e) {
      if (alive.current)
        setMessage(e instanceof Error ? e.message : "操作未完成，请重试。");
    } finally {
      actionLock.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const replace = (next: Work) => {
    try {
      localStorage.setItem(key + ":previous", JSON.stringify(work));
    } catch {
      setMessage("上一稿仅暂存在本页，请先导出留存。");
    }
    setPrevious(structuredClone(work));
    setWork(next);
    setSelected(next.story.entry);
    setProposal(null);
  };
  const change = (patch: Partial<StoryDraft>) =>
    setWork((w) => ({ ...w, story: { ...w.story, ...patch } }));
  const changeNode = (patch: Partial<StoryNode>) =>
    change({
      nodes: story.nodes.map((n) =>
        n.id === node.id ? { ...n, ...patch } : n,
      ),
    });
  const save = () =>
    run(async () => {
      const saved = await api<SavedStory>(`/stories/${work.id}`, {
        method: "PUT",
        body: JSON.stringify({ expectedRevision: work.revision, story }),
      });
      if (!alive.current) return;
      setWork(saved);
      setMessage("已保存到云端。");
      await refresh();
    });
  const exportStory = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(story, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "island-story.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  useEffect(() => {
    if (proposal)
      document
        .getElementById("story-proposal")
        ?.scrollIntoView({ block: "start" });
  }, [proposal]);
  const test = () => {
    try {
      launchStory(userId, story);
      navigate(`/${story.nodes.find((n) => n.id === story.entry)!.scene}`);
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "无法开始试玩，请检查本机存储。",
      );
    }
  };
  return (
    <main className="story-workshop">
      <header className="story-workshop-head">
        <Link to="/island">← 回我的岛</Link>
        <div>
          <small>ISLAND · STORY WORKSHOP</small>
          <h1>故事工坊</h1>
          <p>把一个小小的念头，编成伙伴们的冒险。</p>
        </div>
        <button disabled={busy || issues.length > 0} onClick={test}>
          ▷ 在岛上试玩
        </button>
      </header>
      <div className="story-toolbar">
        <button disabled={busy} onClick={() => replace(fresh())}>
          新故事 / 示例
        </button>
        <button disabled={busy || !userId} onClick={() => void save()}>
          保存到云端
        </button>
        <button
          disabled={busy}
          onClick={() => {
            replace({ ...work, id: crypto.randomUUID(), revision: 0 });
            setMessage("已另存为本机新稿，可保存到云端。");
          }}
        >
          另存一份
        </button>
        <button onClick={exportStory}>导出故事</button>
        <button disabled={busy} onClick={() => input.current?.click()}>
          导入故事
        </button>
        <button
          disabled={busy || !previous}
          onClick={() => {
            if (previous) replace(previous);
          }}
        >
          恢复上一稿
        </button>
        <input
          hidden
          ref={input}
          type="file"
          accept=".json,application/json"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            void run(async () => {
              if (f.size > 100000) throw Error("故事文件请小于 100 KB。");
              const imported = storyDraftSchema.parse(
                JSON.parse(await f.text()),
              );
              if (alive.current) {
                replace({
                  id: crypto.randomUUID(),
                  revision: 0,
                  story: imported,
                });
                setMessage("故事已导入为本机新稿。");
              }
            });
          }}
        />
      </div>
      <p className="story-save-state">
        {userId
          ? "本机自动留稿 · 云端需点保存"
          : "本机体验 · 登录后可用 AI 和云端保存；可通过导出 / 导入迁移草稿"}{" "}
        · 试玩进度保存在此浏览器
      </p>
      {(message || storageError) && (
        <p className="story-notice" role="status">
          {message} {storageError}
        </p>
      )}
      <div className="story-workspace">
        <aside className="story-side">
          <section>
            <h2>✦ 给故事一个起点</h2>
            <label>
              你想发生什么？
              <textarea
                value={brief.theme}
                maxLength={500}
                onChange={(e) => setBrief({ ...brief, theme: e.target.value })}
                placeholder="比如：伙伴们寻找一封被风吹走的邀请函"
              />
            </label>
            <label>
              故事气氛
              <select
                value={brief.mood}
                onChange={(e) =>
                  setBrief({
                    ...brief,
                    mood: e.target.value as StoryBrief["mood"],
                  })
                }
              >
                {["温暖", "神秘但不吓人", "轻松有趣"].map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
            <label>
              开场地点
              <select
                value={brief.scene}
                onChange={(e) =>
                  setBrief({
                    ...brief,
                    scene: e.target.value as StoryBrief["scene"],
                  })
                }
              >
                {sceneRegistry.map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <fieldset>
              <legend>邀请谁参加？（最多 6 位）</legend>
              <div className="story-cast">
                {SPECIES.map((s) => (
                  <label key={s}>
                    <input
                      type="checkbox"
                      checked={brief.cast.includes(s)}
                      disabled={
                        !brief.cast.includes(s) && brief.cast.length >= 6
                      }
                      onChange={(e) =>
                        setBrief({
                          ...brief,
                          cast: e.target.checked
                            ? [...brief.cast, s]
                            : brief.cast.filter((c) => c !== s),
                        })
                      }
                    />
                    {speciesProfiles[s].label}
                  </label>
                ))}
              </div>
            </fieldset>
            <button
              className="story-primary"
              disabled={
                busy ||
                !aiAvailable ||
                !storyBriefSchema.safeParse(brief).success
              }
              onClick={() =>
                void run(async () => {
                  const r = await api<{ story: StoryDraft }>(
                    "/stories/generate",
                    {
                      method: "POST",
                      body: JSON.stringify(brief),
                      signal: AbortSignal.timeout(45000),
                    },
                  );
                  if (alive.current)
                    setProposal(storyDraftSchema.parse(r.story));
                })
              }
            >
              {busy ? "正在处理…" : "让 AI 起草一个故事"}
            </button>
            {!aiAvailable && (
              <small>
                {userId
                  ? "AI 暂不可用，可先编辑示例或刷新云端状态。"
                  : "登录后可使用 AI 辅助创作。"}
              </small>
            )}
          </section>
          <section>
            <h2>我的云端故事</h2>
            <button disabled={busy || !userId} onClick={() => void refresh()}>
              刷新列表
            </button>
            {library.map((s) => (
              <button
                className="story-library"
                key={s.id}
                disabled={busy}
                onClick={() => replace(s)}
              >
                {s.story.title}
                <small>
                  {new Date(s.updatedAt).toLocaleDateString()} ·{" "}
                  {s.story.nodes.length} 张故事卡
                </small>
              </button>
            ))}
            {library.length === 0 && <p>保存后，你的故事会出现在这里。</p>}
          </section>
        </aside>
        <section className="story-editor">
          <fieldset disabled={busy} className="story-fields">
            <div className="story-section-heading">
              <h2>我的故事卡</h2>
              <span>{story.nodes.length} / 24</span>
            </div>
            <label>
              故事名字
              <input
                value={story.title}
                maxLength={60}
                onChange={(e) =>
                  change({ title: e.target.value || "未命名的故事" })
                }
              />
            </label>
            <label>
              一句话介绍
              <textarea
                value={story.synopsis}
                maxLength={500}
                onChange={(e) => change({ synopsis: e.target.value })}
              />
            </label>
            <fieldset>
              <legend>这篇故事的角色</legend>
              <div className="story-cast">
                {SPECIES.map((s) => (
                  <label key={s}>
                    <input
                      type="checkbox"
                      checked={story.cast.includes(s)}
                      disabled={
                        story.cast.includes(s)
                          ? story.cast.length === 1
                          : story.cast.length >= 6
                      }
                      onChange={(e) =>
                        change({
                          cast: e.target.checked
                            ? [...story.cast, s]
                            : story.cast.filter((c) => c !== s),
                        })
                      }
                    />
                    {speciesProfiles[s].label}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="story-cards" role="group" aria-label="选择故事卡">
              {story.nodes.map((n, i) => (
                <button
                  key={n.id}
                  aria-pressed={node.id === n.id}
                  onClick={() => setSelected(n.id)}
                >
                  <small>
                    {i + 1} ·{" "}
                    {n.kind === "ending"
                      ? "结局"
                      : n.kind === "choice"
                        ? "选择"
                        : "对白"}
                    {story.entry === n.id ? " · 开场" : ""}
                  </small>
                  {n.title || "未命名卡片"}
                </button>
              ))}
            </div>
            <div className="story-inline">
              <button
                disabled={story.nodes.length >= 24}
                onClick={() => {
                  const id =
                    "n" + crypto.randomUUID().replaceAll("-", "").slice(0, 12);
                  change({
                    nodes: [
                      ...story.nodes,
                      {
                        id,
                        title: "新故事卡",
                        kind: "ending",
                        scene: node.scene,
                        speaker: null,
                        text: "",
                        choices: [],
                      },
                    ],
                  });
                  setSelected(id);
                }}
              >
                ＋ 加一张卡
              </button>
              <button onClick={() => change({ entry: node.id })}>
                设为开场
              </button>
              <button
                disabled={story.nodes.length === 1}
                onClick={() => {
                  setPrevious(structuredClone(work));
                  const nodes = story.nodes
                    .filter((n) => n.id !== node.id)
                    .map((n) => ({
                      ...n,
                      choices: n.choices.filter((c) => c.next !== node.id),
                    }));
                  change({
                    nodes,
                    entry: story.entry === node.id ? nodes[0]!.id : story.entry,
                  });
                  setSelected(nodes[0]!.id);
                }}
              >
                移除此卡
              </button>
            </div>
            <article className="story-node">
              <label>
                卡片标题
                <input
                  value={node.title}
                  maxLength={60}
                  onChange={(e) => changeNode({ title: e.target.value })}
                />
              </label>
              <div className="story-inline">
                <label>
                  类型
                  <select
                    value={node.kind}
                    onChange={(e) =>
                      changeNode({
                        kind: e.target.value as StoryNode["kind"],
                        choices:
                          e.target.value === "ending" ? [] : node.choices,
                      })
                    }
                  >
                    <option value="dialogue">对白</option>
                    <option value="choice">选择分支</option>
                    <option value="ending">结局</option>
                  </select>
                </label>
                <label>
                  发生地点
                  <select
                    value={node.scene}
                    onChange={(e) =>
                      changeNode({
                        scene: e.target.value as StoryNode["scene"],
                      })
                    }
                  >
                    {sceneRegistry.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  谁在说话
                  <select
                    value={node.speaker ?? ""}
                    onChange={(e) =>
                      changeNode({
                        speaker: (e.target.value ||
                          null) as StoryNode["speaker"],
                      })
                    }
                  >
                    <option value="">旁白</option>
                    {story.cast.map((s) => (
                      <option key={s} value={s}>
                        {speciesProfiles[s].label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                故事内容
                <textarea
                  className="story-text"
                  value={node.text}
                  maxLength={900}
                  onChange={(e) => changeNode({ text: e.target.value })}
                />
              </label>
              {node.kind !== "ending" && (
                <div className="story-branches">
                  <h3>
                    {node.kind === "choice"
                      ? "玩家可以怎么选？"
                      : "接下来发生什么？"}
                  </h3>
                  {node.choices.map((c, i) => (
                    <div className="story-branch" key={i}>
                      <label>
                        选项文字
                        <input
                          value={c.label}
                          maxLength={80}
                          onChange={(e) =>
                            changeNode({
                              choices: node.choices.map((x, j) =>
                                j === i ? { ...x, label: e.target.value } : x,
                              ),
                            })
                          }
                        />
                      </label>
                      <label>
                        前往哪张卡
                        <select
                          value={c.next}
                          onChange={(e) =>
                            changeNode({
                              choices: node.choices.map((x, j) =>
                                j === i ? { ...x, next: e.target.value } : x,
                              ),
                            })
                          }
                        >
                          {story.nodes.map((n) => (
                            <option key={n.id} value={n.id}>
                              {n.title || n.id}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        onClick={() =>
                          changeNode({
                            choices: node.choices.filter((_, j) => j !== i),
                          })
                        }
                      >
                        移除
                      </button>
                    </div>
                  ))}
                  <button
                    disabled={
                      node.choices.length >= (node.kind === "dialogue" ? 1 : 4)
                    }
                    onClick={() =>
                      changeNode({
                        choices: [
                          ...node.choices,
                          {
                            label: "继续",
                            next:
                              story.nodes.find((n) => n.id !== node.id)?.id ??
                              node.id,
                          },
                        ],
                      })
                    }
                  >
                    ＋ 添加{node.kind === "choice" ? "选项" : "后续"}
                  </button>
                </div>
              )}
            </article>
          </fieldset>
          <section className="story-check">
            <h3>
              {issues.length
                ? "再整理一下，就能试玩"
                : "✓ 每条故事路线都已连好"}
            </h3>
            {issues.length > 0 && (
              <ul>
                {issues.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            )}
            <p>
              试玩会在对应场景展示对白和选择。故事里的物品、动作和奖励暂以叙事表达，不会实际扣材料或改变建筑。
            </p>
            <button disabled={busy || issues.length > 0} onClick={test}>
              ▷ 在岛上试玩
            </button>
          </section>
        </section>
      </div>
      {proposal && (
        <section
          id="story-proposal"
          className="story-proposal"
          role="region"
          aria-label="AI 草稿预览"
        >
          <h2>AI 草稿 · {proposal.title}</h2>
          <p>{proposal.synopsis}</p>
          <p>先看看故事走向；采纳后可以逐卡修改，上一稿可恢复。</p>
          {proposal.nodes.map((n) => (
            <article key={n.id}>
              <h3>
                {n.title} · {sceneRegistry.find((s) => s.id === n.scene)?.name}
              </h3>
              <p>{n.text}</p>
              <small>
                {n.choices
                  .map(
                    (c) =>
                      c.label +
                      " → " +
                      (proposal.nodes.find((x) => x.id === c.next)?.title ??
                        c.next),
                  )
                  .join(" / ") || "结局"}
              </small>
            </article>
          ))}
          <div className="story-inline">
            <button
              className="story-primary"
              onClick={() => {
                replace({ ...work, story: proposal });
                setMessage("AI 草稿已采纳，请检查并修改，再保存或试玩。");
              }}
            >
              采纳到当前故事
            </button>
            <button onClick={() => setProposal(null)}>暂不采纳</button>
          </div>
        </section>
      )}
    </main>
  );
}
