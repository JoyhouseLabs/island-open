import { starterTasks, taskProgress } from "@island/world-core";
import { growth } from "../progress/store";
import { proximity } from "./proximity";

export type DialogueNode = {
  text: string;
  choices?: { label: string; reply?: string; close?: boolean }[];
};

/** Built-in speakers plus admin-configured animals (any string id). */
export type SpeakerKind = "panda" | "giraffe" | "wolf" | "fox" | "tutor" | (string & {});

const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)]!;

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

const smallTalk: Record<SpeakerKind, string[]> = {
  panda: [
    "我刚才靠在长椅上打了个盹，梦见了一整片竹子林。",
    "吃饱了晒太阳，是世界上第二幸福的事。第一是吃饱了睡觉。",
    "你要是累了，也可以像我一样，坐下来什么也不做。",
  ],
  giraffe: [
    "从我的高度看过去，海和天在很远的地方轻轻挨着。",
    "最高的那棵树上有一片心形的叶子，我谁也没告诉。",
    "我走路很慢，可是慢慢走，能看见的东西最多。",
  ],
  wolf: [
    "山上的风有自己的方向，跟着它走就不会迷路。",
    "我跑得很快，但是我不追任何东西，跑只是因为喜欢。",
    "晚上我会对着星星练习嚎叫，呜——你要听吗？",
  ],
  fox: [
    "我是这座岛的邮差，纸条都是我送的，可别告诉别人。",
    "团团又在睡觉，高高的脖子今天也伸得很直。",
    "我的尾巴在夜里会发光，这样回家就不会走丢。",
  ],
  tutor: [
    "读书就像点灯，一页一页，心里就慢慢亮了。",
    "有不懂的句子就来问我，我们一起想。",
  ],
  sign: [
    "你猜怎么着——路过的人里，数你读我读得最认真。",
    "我站在这里看了好久的海，浪是一下一下数着拍过来的。",
    "风念我身上的字给我听，念错了我就晃一晃。",
  ],
};
const guestTalk = [
  "我最近喜欢在这里待着，看你走来走去。",
  "这座岛上每天都有小小的变化，你发现了吗？",
  "风吹过来的时候，我会闭上眼睛听一会儿。",
];

const taskTalk: Record<SpeakerKind, string> = {
  panda: "呼……你要是不知道做什么，我这里有一张狐狸送的纸条，你看看？",
  giraffe: "我从高处看到了一件事，说不定和你有关——",
  wolf: "风把一句话吹到了我耳朵里，你听听看。",
  fox: "今天正好有一张纸条要交给你！",
  tutor: "先读一页书，再带着问题来找我，好不好？",
};

export function greeting(kind: SpeakerKind, name: string): DialogueNode {
  const task = nextTaskInfo();
  const hello: Record<SpeakerKind, string> = {
    panda: pick([`呼啊……${name}被你吵醒啦，不过没关系。`, `${name}在这里晒太阳，你来得正好。`]),
    giraffe: `${name}低下头看你——从这里往下看，你好像一颗小蘑菇。`,
    wolf: `${name}竖起耳朵，朝你轻轻点了点头。`,
    fox: pick([`${name}停下了脚步，尾巴摇了摇。`, `哟，${name}正巧路过，有话要跟你说。`]),
    tutor: `${name}合上手里的书，抬起头微笑。`,
    sign: `${name}轻轻晃了一下，好像在跟你招手。`,
  };
  const opener = hello[kind] ?? `${name}转过头来，正好看见你。`;
  const choices = [
    { label: "聊聊天" },
    ...(task && taskTalk[kind]
      ? [{ label: kind === "fox" ? "今天的纸条" : "有什么要做的吗" }]
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
      reply: `${pick(smallTalk[kind] ?? guestTalk)} ${seasonLine() || ""}`.trim(),
    };
  // The task-hint branch, whatever its label.
  const task = nextTaskInfo();
  return {
    reply: task
      ? `${taskTalk[kind] ?? "我听说了一件事，说不定和你有关——"} ${task}`
      : "现在没有什么要紧事，去玩吧。",
  };
}
