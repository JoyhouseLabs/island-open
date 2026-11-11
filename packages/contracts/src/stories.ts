import { z } from "zod";
import { SPECIES } from "./species.js";
import { sceneIds } from "./scenes.js";
const nodeId = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/);
export const storyBriefSchema = z
  .object({
    theme: z.string().trim().min(2).max(500),
    mood: z.enum(["温暖", "神秘但不吓人", "轻松有趣"]),
    cast: z.array(z.enum(SPECIES)).min(1).max(6),
    scene: z.enum(sceneIds),
  })
  .strict();
export const storyNodeSchema = z
  .object({
    id: nodeId,
    title: z.string().max(60),
    kind: z.enum(["dialogue", "choice", "ending"]),
    scene: z.enum(sceneIds),
    speaker: z.enum(SPECIES).nullable(),
    text: z.string().max(900),
    choices: z
      .array(z.object({ label: z.string().max(80), next: nodeId }).strict())
      .max(4),
  })
  .strict();
export const storyDraftSchema = z
  .object({
    version: z.literal(1),
    title: z.string().trim().min(1).max(60),
    synopsis: z.string().max(500),
    cast: z.array(z.enum(SPECIES)).min(1).max(6),
    entry: nodeId,
    nodes: z.array(storyNodeSchema).min(1).max(24),
  })
  .strict();
export type StoryDraft = z.infer<typeof storyDraftSchema>;
export type StoryNode = z.infer<typeof storyNodeSchema>;
export type StoryBrief = z.infer<typeof storyBriefSchema>;
export const storySaveSchema = z
  .object({
    expectedRevision: z.number().int().min(0),
    story: storyDraftSchema,
  })
  .strict();
export type SavedStory = {
  id: string;
  revision: number;
  story: StoryDraft;
  updatedAt: string;
};

/** Editing drafts may be incomplete; AI output and playback must pass these checks. */
export function storyIssues(story: StoryDraft): string[] {
  const issues = new Set<string>();
  const nodes = new Map(story.nodes.map((n) => [n.id, n]));
  if (nodes.size !== story.nodes.length) issues.add("故事卡编号重复");
  if (new Set(story.cast).size !== story.cast.length)
    issues.add("出场角色重复");
  if (!nodes.has(story.entry)) issues.add("请选择有效的开场卡");
  for (const n of story.nodes) {
    const name = n.title || n.id;
    if (!n.text.trim()) issues.add(`${name}：还没有故事内容`);
    if (n.speaker && !story.cast.includes(n.speaker))
      issues.add(`${name}：说话角色不在出场名单中`);
    const count = n.choices.length;
    if (
      (n.kind === "ending" && count !== 0) ||
      (n.kind === "dialogue" && count !== 1) ||
      (n.kind === "choice" && count < 2)
    )
      issues.add(`${name}：对白需 1 个后续，选择需 2–4 个选项，结局不接后续`);
    for (const c of n.choices) {
      if (!c.label.trim()) issues.add(`${name}：选项还没有文字`);
      if (!nodes.has(c.next)) issues.add(`${name}：选项指向不存在的故事卡`);
    }
  }
  const visited = new Set<string>(),
    active = new Set<string>();
  const visit = (id: string) => {
    if (active.has(id)) {
      issues.add("故事中有循环，请让每条路线都能走向结局");
      return;
    }
    if (visited.has(id) || !nodes.has(id)) return;
    visited.add(id);
    active.add(id);
    for (const c of nodes.get(id)!.choices) visit(c.next);
    active.delete(id);
  };
  visit(story.entry);
  if (visited.size !== nodes.size)
    issues.add("有故事卡无法从开场到达，请连接或移除它");
  if (!story.nodes.some((n) => n.kind === "ending"))
    issues.add("至少需要一个结局");
  return [...issues];
}
export function sampleStory(): StoryDraft {
  return {
    version: 1,
    title: "没有亮起的观星灯",
    synopsis: "和伙伴决定，今晚在哪里看星星。",
    cast: ["umbreon", "pikachu", "sylveon"],
    entry: "start",
    nodes: [
      {
        id: "start",
        title: "一份邀请",
        kind: "dialogue",
        scene: "starlight",
        speaker: "umbreon",
        text: "今晚的观星灯没有亮。你愿意陪我想想办法吗？",
        choices: [{ label: "一起想办法", next: "choose" }],
      },
      {
        id: "choose",
        title: "我们的决定",
        kind: "choice",
        scene: "starlight",
        speaker: null,
        text: "山顶传来皮卡丘的招呼，花园里也亮起了微光。我们先去哪里？",
        choices: [
          { label: "去山顶找皮卡丘", next: "mountain_end" },
          { label: "去花园找仙子伊布", next: "garden_end" },
        ],
      },
      {
        id: "mountain_end",
        title: "山顶的星光",
        kind: "ending",
        scene: "mountain",
        speaker: "pikachu",
        text: "原来星灯只是被树叶挡住了！我们一起挪开叶子，在山顶看见了好多星星。",
        choices: [],
      },
      {
        id: "garden_end",
        title: "花园的小聚会",
        kind: "ending",
        scene: "garden",
        speaker: "sylveon",
        text: "仙子伊布用飘带装饰了花架。大家坐在花园里，发现水面也映着星星。今晚的小聚会同样美好。",
        choices: [],
      },
    ],
  };
}
