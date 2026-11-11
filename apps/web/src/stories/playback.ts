import {
  storyDraftSchema,
  storyIssues,
  type StoryDraft,
} from "@island/contracts";
export type StoryRun = { story: StoryDraft; path: string[] };
export function startStory(story: StoryDraft): StoryRun {
  const snapshot = storyDraftSchema.parse(story);
  const issues = storyIssues(snapshot);
  if (issues.length) throw Error(issues[0]);
  return { story: structuredClone(snapshot), path: [snapshot.entry] };
}
export function restoreStoryRun(value: unknown): StoryRun {
  const v = value as StoryRun;
  const run = startStory(v?.story);
  if (
    !Array.isArray(v.path) ||
    v.path.length < 1 ||
    v.path.length > 24 ||
    v.path[0] !== run.story.entry
  )
    throw Error("试玩进度格式不正确");
  for (const id of v.path.slice(1)) {
    const node = run.story.nodes.find((n) => n.id === run.path.at(-1))!;
    if (!node.choices.some((c) => c.next === id)) throw Error("试玩路线不连续");
    run.path.push(id);
  }
  return run;
}
export function chooseStory(run: StoryRun, choice: number): StoryRun {
  const node = run.story.nodes.find((n) => n.id === run.path.at(-1));
  const next = node?.choices[choice];
  if (!next || !Number.isInteger(choice)) throw Error("请选择有效选项");
  return { story: run.story, path: [...run.path, next.next] };
}
export const storyRunKey = (user: string | null) =>
  `island-story-run.v1:${user ?? "local"}`;
export function launchStory(user: string | null, story: StoryDraft) {
  const run = startStory(story);
  localStorage.setItem(storyRunKey(user), JSON.stringify(run));
  window.dispatchEvent(new Event("island-story-run"));
  return run;
}
