/**
 * The single species registry. Everything the island knows about a built-in
 * animal species — its Chinese label, chat persona, walk-up dialogue lines,
 * voice clip, behaviour numbers, ecology name pieces and optional unlock —
 * lives in one entry here. Adding a species means adding one entry (plus its
 * bespoke mesh in AnimalMesh.tsx and voice recipe in prepare-assets.mjs);
 * every other consumer derives from this table and must not grow its own
 * species lists.
 */
export const SPECIES = ["fox", "panda", "giraffe", "wolf", "vaporeon", "cat"] as const;
export type Species = (typeof SPECIES)[number];

export type Interest = "flower" | "tree" | "bench" | "water" | "grass";

export type SpeciesPersona = {
  temperament: string;
  speechStyle: string;
  likes: string;
};

export type SpeciesProfile = {
  /** 中文称呼，服务端提示词与管理台共用。 */
  label: string;
  persona: SpeciesPersona;
  /** 走近空格对话的台词；${name} 会被替换成居民名字。 */
  lines: {
    greeting: string[];
    smallTalk: string[];
    taskHint: string;
    /** 任务提示按钮文字；默认「有什么要做的吗」。 */
    taskLabel?: string;
  };
  /** 叫声素材 id（prepare-assets 合成）。 */
  voice: string;
  /** Mouth-open intervals in the voice asset, in seconds. */
  voiceBeats?: readonly (readonly [number, number])[];
  behavior: {
    /** 常规游荡速度。 */
    speed: number;
    /** 表情气泡高度。 */
    headY: number;
    /** 脚下影子色；缺省 #c9b184。 */
    shadow?: string;
    /** 命中该偏好时低头采食（长颈鹿吃树叶）。 */
    browse?: Interest;
  };
  ecology: {
    /** 生态出生朋友的目标偏好。 */
    prefer: Interest;
    /** 出生朋友的名字库。 */
    nameParts: { first: string[]; second: string[] };
  };
  /** 该物种搬入需要的成长解锁；缺省直接入住。 */
  unlockId?: string;
};

export const speciesProfiles: Record<Species, SpeciesProfile> = {
  fox: {
    label: "小狐狸",
    persona: {
      temperament: "机灵、热情，有一点点小得意",
      speechStyle: "语速快，爱用感叹号，喜欢先卖个关子",
      likes: "巡岛送信、新鲜事的气味、和每个伙伴打招呼",
    },
    lines: {
      greeting: [
        "${name}停下了脚步，尾巴摇了摇。",
        "哟，${name}正巧路过，有话要跟你说。",
      ],
      smallTalk: [
        "我是这座岛的邮差，纸条都是我送的，可别告诉别人。",
        "团团又在睡觉，高高的脖子今天也伸得很直。",
        "我的尾巴在夜里会发光，这样回家就不会走丢。",
      ],
      taskHint: "今天正好有一张纸条要交给你！",
      taskLabel: "今天的纸条",
    },
    voice: "voice-fox",
    behavior: { speed: 1.8, headY: 1.5 },
    ecology: {
      prefer: "flower",
      nameParts: { first: ["小", "火", "绒"], second: ["尾尾", "尖尖", "灵灵"] },
    },
  },
  panda: {
    label: "熊猫",
    persona: {
      temperament: "慢悠悠、温和，特别有耐心",
      speechStyle: "句子短短的、软软的，偶尔说到一半打个哈欠",
      likes: "竹子的咔嚓声、午后晒太阳、听孩子慢慢讲话",
    },
    lines: {
      greeting: [
        "呼啊……${name}被你吵醒啦，不过没关系。",
        "${name}在这里晒太阳，你来得正好。",
      ],
      smallTalk: [
        "我刚才靠在长椅上打了个盹，梦见了一整片竹子林。",
        "吃饱了晒太阳，是世界上第二幸福的事。第一是吃饱了睡觉。",
        "你要是累了，也可以像我一样，坐下来什么也不做。",
      ],
      taskHint: "呼……你要是不知道做什么，我这里有一张狐狸送的纸条，你看看？",
    },
    voice: "voice-panda",
    behavior: { speed: 1.7, headY: 1.5, shadow: "#9db8a4" },
    ecology: {
      prefer: "flower",
      nameParts: {
        first: ["小", "竹", "圆", "糯", "软"],
        second: ["团子", "滚滚", "圆圆", "宝宝", "乎乎"],
      },
    },
  },
  giraffe: {
    label: "长颈鹿",
    persona: {
      temperament: "安静、周到，看得比别人远",
      speechStyle: "语气平缓温柔，喜欢提醒小伙伴注意小细节",
      likes: "高处的新鲜风、数星星、帮小个子够高处的果子",
    },
    lines: {
      greeting: ["${name}低下头看你——从这里往下看，你好像一颗小蘑菇。"],
      smallTalk: [
        "从我的高度看过去，海和天在很远的地方轻轻挨着。",
        "最高的那棵树上有一片心形的叶子，我谁也没告诉。",
        "我走路很慢，可是慢慢走，能看见的东西最多。",
      ],
      taskHint: "我从高处看到了一件事，说不定和你有关——",
    },
    voice: "voice-giraffe",
    behavior: { speed: 1.3, headY: 3.5, browse: "tree" },
    ecology: {
      prefer: "tree",
      nameParts: {
        first: ["小", "云", "叶", "星", "金"],
        second: ["高高", "梢梢", "望望", "点点", "长长"],
      },
    },
  },
  wolf: {
    label: "狼",
    persona: {
      temperament: "认真、讲义气，外冷内热",
      speechStyle: "话不多但每句都算数，偶尔冒出很酷的短句",
      likes: "月光下的长跑、和伙伴并肩、守着岛上的约定",
    },
    lines: {
      greeting: ["${name}竖起耳朵，朝你轻轻点了点头。"],
      smallTalk: [
        "山上的风有自己的方向，跟着它走就不会迷路。",
        "我跑得很快，但是我不追任何东西，跑只是因为喜欢。",
        "晚上我会对着星星练习嚎叫，呜——你要听吗？",
      ],
      taskHint: "风把一句话吹到了我耳朵里，你听听看。",
    },
    voice: "voice-wolf",
    behavior: { speed: 2.3, headY: 1.6 },
    ecology: {
      prefer: "grass",
      nameParts: {
        first: ["小", "风", "月", "雪", "影"],
        second: ["哨哨", "牙牙", "步步", "鸣鸣", "影影"],
      },
    },
    unlockId: "resident-wolf",
  },
  cat: {
    label: "几何小猫",
    persona: {
      temperament: "温柔、好奇，是用方块和三角形拼成的小伙伴",
      speechStyle: "短句轻轻地说，偶尔喵一声，喜欢陪孩子观察形状",
      likes: "晒太阳、线条胡须、搭积木、和朋友找找身边的图形",
    },
    lines: {
      greeting: ["喵！${name}摇了摇细长的尾巴，迈着四只小脚朝你走来。"],
      smallTalk: [
        "我的脸方方的，耳朵尖尖的。你还发现了什么形状？",
        "我的身体像一块小积木，抱起来软乎乎的。",
        "胡须细细长长的，吹来一阵风，就想跟着你去散步。",
      ],
      taskHint: "喵，要不要一起找找岛上的长方形和三角形？",
    },
    voice: "voice-cat",
    voiceBeats: [[0.02, 0.58], [0.72, 1.28], [1.42, 1.98]],
    behavior: { speed: 1.5, headY: 1.65, shadow: "#c7b393" },
    ecology: {
      prefer: "flower",
      nameParts: {
        first: ["小", "方", "暖", "橘"],
        second: ["方", "米", "喵", "团"],
      },
    },
  },
  vaporeon: {
    label: "水伊布",
    persona: {
      temperament: "清爽、爱玩水，一见面就想交朋友",
      speechStyle: "语调像水波一样轻快，爱说“哗啦”和“扑通”这样的水声词",
      likes: "池塘边打水花、雨天的小水洼、亮晶晶的鹅卵石、和孩子比赛憋气",
    },
    lines: {
      greeting: [
        "哗啦！${name}甩了甩尾巴上的水珠，朝你游过来。",
        "${name}的头顶小鳍晃了晃，它想跟你打招呼。",
      ],
      smallTalk: [
        "哗啦——刚在池塘里翻了个跟头，水花差点溅到高高身上。",
        "下雨天我会去踩水坑，每一个水坑里都住着一小片天空。",
        "池塘底下有一颗特别圆的鹅卵石，我藏了好久，只告诉你。",
      ],
      taskHint: "扑通——我在水边听到一个消息，说出来和你有关。",
    },
    voice: "voice-vaporeon",
    behavior: { speed: 2, headY: 1.6, shadow: "#a9cbc9" },
    ecology: {
      prefer: "water",
      nameParts: {
        first: ["小", "水", "波", "泡", "蓝"],
        second: ["伊伊", "布布", "泡泡", "灵灵", "滴滴"],
      },
    },
  },
};

export const speciesLabels: Record<Species, string> = Object.fromEntries(
  SPECIES.map((s) => [s, speciesProfiles[s].label]),
) as Record<Species, string>;

/** Default personalities per species, shared by the server prompt builder
 *  and the client deep-chat entry. Kept as its own export for existing
 *  import sites; the data lives in speciesProfiles above. */
export const builtinPersonas: Record<Species, SpeciesPersona> =
  Object.fromEntries(SPECIES.map((s) => [s, speciesProfiles[s].persona])) as Record<
    Species,
    SpeciesPersona
  >;
