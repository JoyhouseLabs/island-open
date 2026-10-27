import { SPECIES, speciesProfiles, type Species } from "@island/contracts";
import { starterTasks, taskProgress } from "@island/world-core";
import { growth } from "../progress/store";
import { proximity } from "./proximity";

export type DialogueNode = {
  text: string;
  choices?: { label: string; reply?: string; close?: boolean }[];
};

/** Built-in species speakers plus the tutor, signs and admin-configured
 *  animals (any string id). Species lines come from the contracts species
 *  registry; anything unknown falls back to guestTalk. */
export type SpeakerKind = Species | "tutor" | (string & {});

const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)]!;

const isSpecies = (kind: SpeakerKind): kind is Species =>
  (SPECIES as readonly string[]).includes(kind);

const fill = (line: string, name: string) =>
  line.replaceAll("${name}", name);

function weatherLine() {
  const { weather, night } = proximity.env;
  if (weather === "thunder") return pick([
    "雷声轰隆隆的，像天上有人在搬椅子。",
    "闪电的时候，整个岛的影子都会亮一下，你看见了吗？",
  ]);
  if (weather === "rain") return pick([
    "雨点打在叶子上，哒、哒、哒，是最好的午睡伴奏。",
    "下小雨的日子，水坑里会有另一个天空。",
  ]);
  if (weather === "wind") return pick([
    "今天风好大，我的耳朵都被吹歪了。",
    "风把云吹得跑来跑去，像一群白色的鱼。",
  ]);
  if (night) return pick([
    "晚上的星星好多呀，你想数到第几颗？",
    "月亮把草地照得亮亮的，适合慢慢走。",
  ]);
  return pick(["今天的太阳暖暖的，很想躺着。", "天气真好，适合出门走走。"]);
}

function seasonLine() {
  const { season } = proximity.env;
  return {
    spring: "花都开了，空气里有甜甜的味道。",
    summer: "夏天的午后，蝉会把时间叫得很长。",
    autumn: "叶子开始变颜色了，捡一片当书签吧。",
    winter: "呼——冬天要围好围巾再出门哦。",
  }[season] ?? "";
}

function nextTaskInfo() {
  const next = starterTasks.find((t) => !growth.state.done[t.id]);
  if (!next) return null;
  const progress = taskProgress(growth.state, next);
  return `我听说你有一件想做的事：「${next.title}」——${next.story}（现在 ${progress}/${next.goal.count}）。`;
}

const tutorSmallTalk = [
  "读书就像点灯，一页一页，心里就慢慢亮了。",
  "有不懂的句子就来问我，我们一起想。",
];
const tutorTaskHint = "先读一页书，再带着问题来找我，好不好？";
const signSmallTalk = [
  "你猜怎么着——路过的人里，数你读我读得最认真。",
  "我站在这里看了好久的海，浪是一下一下数着拍过来的。",
  "风念我身上的字给我听，念错了我就晃一晃。",
];
const guestTalk = [
  "我最近喜欢在这里待着，看你走来走去。",
  "这座岛上每天都有小小的变化，你发现了吗？",
  "风吹过来的时候，我会闭上眼睛听一会儿。",
];

const smallTalkFor = (kind: SpeakerKind): string[] =>
  isSpecies(kind)
    ? speciesProfiles[kind].lines.smallTalk
    : kind === "tutor"
      ? tutorSmallTalk
      : kind === "sign"
        ? signSmallTalk
        : guestTalk;

const taskHintFor = (kind: SpeakerKind): string | undefined =>
  isSpecies(kind)
    ? speciesProfiles[kind].lines.taskHint
    : kind === "tutor"
      ? tutorTaskHint
      : undefined;

export function greeting(kind: SpeakerKind, name: string): DialogueNode {
  const task = nextTaskInfo();
  const opener = isSpecies(kind)
    ? pick(speciesProfiles[kind].lines.greeting.map((l) => fill(l, name)))
    : kind === "tutor"
      ? `${name}合上手里的书，抬起头微笑。`
      : kind === "sign"
        ? `${name}轻轻晃了一下，好像在跟你招手。`
        : `${name}转过头来，正好看见你。`;
  const taskLabel = isSpecies(kind) ? speciesProfiles[kind].lines.taskLabel : undefined;
  const choices = [
    { label: "聊聊天" },
    ...(task && taskHintFor(kind)
      ? [{ label: taskLabel ?? "有什么要做的吗" }]
      : []),
    { label: "再见", close: true },
  ];
  return { text: `${opener} ${weatherLine()}`, choices };
}

export function replyTo(
  kind: SpeakerKind,
  label: string,
): { reply?: string; close?: boolean } {
  if (label === "再见") return { close: true };
  if (label === "聊聊天")
    return {
      reply: `${pick(smallTalkFor(kind))} ${seasonLine() || ""}`.trim(),
    };
  // The task-hint branch, whatever its label.
  const task = nextTaskInfo();
  return {
    reply: task
      ? `${taskHintFor(kind) ?? "我听说了一件事，说不定和你有关——"} ${task}`
      : "现在没有什么要紧事，去玩吧。",
  };
}
