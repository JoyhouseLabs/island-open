export type ChapterMedia =
  | { type: "image"; url: string; caption?: string }
  | { type: "video"; url: string; caption?: string };
export type BookChapter = {
  id: string;
  title: string;
  lines: string[];
  /** Curated lesson media (images / videos) shown beside the text. */
  media?: ChapterMedia[];
};
export type Book = {
  id: string;
  title: string;
  author: string;
  note: string;
  chapters: BookChapter[];
  /** Published PDF books read page by page instead of chapters. */
  pdf?: string;
};
export type VideoSource =
  | { kind: "bilibili"; bvid: string }
  | { kind: "bilibili"; aid: string }
  | { kind: "youtube"; id: string }
  | { kind: "file"; url: string }
  /** Anything embeddable is unknown (b23.tv short links, arbitrary pages). */
  | { kind: "link"; url: string };

/** 千字文全文：二百五十句，每行八字。 */
const qianziwenRows = (() => {
  const text = `天地玄黄，宇宙洪荒。日月盈昃，辰宿列张。寒来暑往，秋收冬藏。闰余成岁，律吕调阳。云腾致雨，露结为霜。金生丽水，玉出昆冈。剑号巨阙，珠称夜光。果珍李柰，菜重芥姜。海咸河淡，鳞潜羽翔。龙师火帝，鸟官人皇。始制文字，乃服衣裳。推位让国，有虞陶唐。吊民伐罪，周发殷汤。坐朝问道，垂拱平章。爱育黎首，臣伏戎羌。遐迩一体，率宾归王。鸣凤在竹，白驹食场。化被草木，赖及万方。盖此身发，四大五常。恭惟鞠养，岂敢毁伤。女慕贞洁，男效才良。知过必改，得能莫忘。罔谈彼短，靡恃己长。信使可覆，器欲难量。墨悲丝染，诗赞羔羊。景行维贤，克念作圣。德建名立，形端表正。空谷传声，虚堂习听。祸因恶积，福缘善庆。尺璧非宝，寸阴是竞。资父事君，曰严与敬。孝当竭力，忠则尽命。临深履薄，夙兴温凊。似兰斯馨，如松之盛。川流不息，渊澄取映。容止若思，言辞安定。笃初诚美，慎终宜令。荣业所基，籍甚无竟。学优登仕，摄职从政。存以甘棠，去而益咏。乐殊贵贱，礼别尊卑。上和下睦，夫唱妇随。外受傅训，入奉母仪。诸姑伯叔，犹子比儿。孔怀兄弟，同气连枝。交友投分，切磨箴规。仁慈隐恻，造次弗离。节义廉退，颠沛匪亏。性静情逸，心动神疲。守真志满，逐物意移。坚持雅操，好爵自縻。都邑华夏，东西二京。背邙面洛，浮渭据泾。宫殿盘郁，楼观飞惊。图写禽兽，画彩仙灵。丙舍旁启，甲帐对楹。肆筵设席，鼓瑟吹笙。升阶纳陛，弁转疑星。右通广内，左达承明。既集坟典，亦聚群英。杜稿钟隶，漆书壁经。府罗将相，路侠槐卿。户封八县，家给千兵。高冠陪辇，驱毂振缨。世禄侈富，车驾肥轻。策功茂实，勒碑刻铭。磻溪伊尹，佐时阿衡。奄宅曲阜，微旦孰营。桓公匡合，济弱扶倾。绮回汉惠，说感武丁。俊乂密勿，多士寔宁。晋楚更霸，赵魏困横。假途灭虢，践土会盟。何遵约法，韩弊烦刑。起翦颇牧，用军最精。宣威沙漠，驰誉丹青。九州禹迹，百郡秦并。岳宗泰岱，禅主云亭。雁门紫塞，鸡田赤城。昆池碣石，钜野洞庭。旷远绵邈，岩岫杳冥。治本于农，务兹稼穑。俶载南亩，我艺黍稷。税熟贡新，劝赏黜陟。孟轲敦素，史鱼秉直。庶几中庸，劳谦谨敕。聆音察理，鉴貌辨色。贻厥嘉猷，勉其祗植。省躬讥诫，宠增抗极。殆辱近耻，林皋幸即。两疏见机，解组谁逼。索居闲处，沉默寂寥。求古寻论，散虑逍遥。欣奏累遣，戚谢欢招。渠荷的历，园莽抽条。枇杷晚翠，梧桐蚤凋。陈根委翳，落叶飘摇。游鹍独运，凌摩绛霄。耽读玩市，寓目囊箱。易輶攸畏，属耳垣墙。具膳餐饭，适口充肠。饱饫烹宰，饥厌糟糠。亲戚故旧，老少异粮。妾御绩纺，侍巾帷房。纨扇圆洁，银烛炜煌。昼眠夕寐，蓝笋象床。弦歌酒宴，接杯举觞。矫手顿足，悦豫且康。嫡后嗣续，祭祀蒸尝。稽颡再拜，悚惧恐惶。笺牒简要，顾答审详。骸垢想浴，执热愿凉。驴骡犊特，骇跃超骧。诛斩贼盗，捕获叛亡。布射僚丸，嵇琴阮啸。恬笔伦纸，钧巧任钓。释纷利俗，并皆佳妙。毛施淑姿，工颦妍笑。年矢每催，曦晖朗曜。璇玑悬斡，晦魄环照。指薪修祜，永绥吉劭。矩步引领，俯仰廊庙。束带矜庄，徘徊瞻眺。孤陋寡闻，愚蒙等诮。谓语助者，焉哉乎也。`;
  const rows: string[] = [];
  for (let i = 0; i < text.length; i += 10) {
    // Each source row is two four-character phrases with punctuation.
    const row = text.slice(i, i + 10);
    if (row.trim()) rows.push(row);
  }
  // Group rows into pages of eight rows (sixteen phrases per page).
  const pages: string[][] = [];
  for (let i = 0; i < rows.length; i += 8) pages.push(rows.slice(i, i + 8));
  return pages;
})();

const xueEr: [string, string][] = [
  [
    "开篇",
    "学而时习之，不亦说乎？有朋自远方来，不亦乐乎？人不知而不愠，不亦君子乎？",
  ],
  [
    "孝弟为本",
    "其为人也孝弟，而好犯上者，鲜矣；不好犯上，而好作乱者，未之有也。君子务本，本立而道生。孝弟也者，其为仁之本与！",
  ],
  ["巧言令色", "巧言令色，鲜矣仁。"],
  [
    "吾日三省",
    "吾日三省吾身：为人谋而不忠乎？与朋友交而不信乎？传不习乎？",
  ],
  [
    "节用爱人",
    "道千乘之国，敬事而信，节用而爱人，使民以时。",
  ],
  [
    "行有余力",
    "弟子入则孝，出则弟，谨而信，泛爱众，而亲仁。行有余力，则以学文。",
  ],
  [
    "虽曰未学",
    "贤贤易色；事父母，能竭其力；事君，能致其身；与朋友交，言而有信。虽曰未学，吾必谓之学矣。",
  ],
  [
    "过则勿惮改",
    "君子不重则不威，学则不固。主忠信，无友不如己者，过则勿惮改。",
  ],
  ["慎终追远", "慎终追远，民德归厚矣。"],
  ["温良恭俭让", "夫子温良恭俭让以得之。夫子之求之也，其诸异乎人之求之与？"],
  [
    "三年无改",
    "父在，观其志；父没，观其行；三年无改于父之道，可谓孝矣。",
  ],
  ["和为贵", "礼之用，和为贵。先王之道，斯为美。"],
  [
    "信近于义",
    "信近于义，言可复也。恭近于礼，远耻辱也。因不失其亲，亦可宗也。",
  ],
  [
    "好学而已",
    "君子食无求饱，居无求安，敏于事而慎于言，就有道而正焉，可谓好学也已。",
  ],
  ["患不知人", "不患人之不己知，患不知人也。"],
];

const weiZheng: [string, string][] = [
  ["为政以德", "为政以德，譬如北辰，居其所而众星共之。"],
  ["思无邪", "《诗》三百，一言以蔽之，曰：思无邪。"],
  [
    "道之以德",
    "道之以政，齐之以刑，民免而无耻；道之以德，齐之以礼，有耻且格。",
  ],
  [
    "三十而立",
    "吾十有五而志于学，三十而立，四十而不惑，五十而知天命，六十而耳顺，七十而从心所欲，不逾矩。",
  ],
  ["无违", "生，事之以礼；死，葬之以礼，祭之以礼。"],
  ["父母其疾之忧", "孟武伯问孝。子曰：父母唯其疾之忧。"],
  [
    "不敬何以别乎",
    "今之孝者，是谓能养。至于犬马，皆能有养；不敬，何以别乎？",
  ],
  ["色难", "子夏问孝。子曰：色难。"],
  ["温故知新", "温故而知新，可以为师矣。"],
  ["君子不器", "君子不器。"],
  ["学思并进", "学而不思则罔，思而不学则殆。"],
  ["是知也", "知之为知之，不知为不知，是知也。"],
  ["人而无信", "人而无信，不知其可也。大车无輗，小车无軏，其何以行之哉？"],
  ["见义勇为", "非其鬼而祭之，谄也。见义不为，无勇也。"],
];

function pagesToChapters(id: string, pages: string[][]): BookChapter[] {
  return pages.map((rows, i) => ({
    id: `${id}-p${i + 1}`,
    title: `第 ${i + 1} 页`,
    lines: rows,
  }));
}

/**
 * Curated media keyed by chapter id. Content-side data: URLs must be
 * same-origin relative paths or https (mixed content would be blocked).
 */
const curatedMedia: Record<string, ChapterMedia[]> = {
  "qian-p1": [
    {
      type: "image",
      url: "/assets/lessons/qianziwen-opening.svg",
      caption: "天地玄黄 · 宇宙洪荒",
    },
    {
      type: "video",
      url: "https://www.bilibili.com/video/BV1sK4y1a7JJ",
      caption: "跟读朗读：千字文 · 儿童启蒙",
    },
  ],
  "qian-p2": [
    {
      type: "video",
      url: "https://www.bilibili.com/video/BV1DX4BzyE54",
      caption: "拼音动画完整版",
    },
  ],
  "qian-p3": [
    {
      type: "video",
      url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
      caption: "示例直链视频（占位内容，正式课件可替换）",
    },
  ],
  "xue-1": [
    {
      type: "image",
      url: "/assets/lessons/lunyu-xueer.svg",
      caption: "学而时习之，不亦说乎",
    },
  ],
};

const withMedia = (chapters: BookChapter[]): BookChapter[] =>
  chapters.map((c) => {
    const media = curatedMedia[c.id];
    return media ? { ...c, media } : c;
  });

export const books: Book[] = [
  {
    id: "qianziwen",
    title: "千字文",
    author: "周兴嗣",
    note: "一千字无一重复的启蒙韵文，八句一页慢慢读。",
    chapters: withMedia(pagesToChapters("qian", qianziwenRows)),
  },
  {
    id: "lunyu-xueer",
    title: "论语 · 学而",
    author: "孔子及弟子",
    note: "开学第一篇：学习、交友、孝顺与自省。",
    chapters: withMedia(
      xueEr.map(([title, text], i) => ({
        id: `xue-${i + 1}`,
        title: `${i + 1}. ${title}`,
        lines: [text],
      })),
    ),
  },
  {
    id: "lunyu-weizheng",
    title: "论语 · 为政",
    author: "孔子及弟子",
    note: "为学与修身：从三十而立到见义勇为。",
    chapters: withMedia(
      weiZheng.map(([title, text], i) => ({
        id: `zheng-${i + 1}`,
        title: `${i + 1}. ${title}`,
        lines: [text],
      })),
    ),
  },
];

/** Accepts common YouTube link shapes and returns the video id, if any. */
export function youtubeId(url: string): string | null {
  const patterns = [
    /youtu\.be\/([\w-]{6,})/,
    /[?&]v=([\w-]{6,})/,
    /youtube(?:-nocookie)?\.com\/(?:embed|shorts|live)\/([\w-]{6,})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1]!;
  }
  return null;
}

/** Returns a BV id ("BV…") or a bare av number from a bilibili video link. */
export function bilibiliId(url: string): string | null {
  const bv = url.match(/BV[0-9A-Za-z]{8,}/);
  if (bv) return bv[0]!;
  const av = url.match(/bilibili\.com\/video\/av(\d+)/i);
  return av ? av[1]! : null;
}

/** Picks a renderer for a video link: bilibili / youtube iframe, native
 *  <video> for direct media files, or a plain external link otherwise. */
export function videoSource(url: string): VideoSource {
  const trimmed = url.trim();
  const bv = trimmed.match(/BV[0-9A-Za-z]{8,}/);
  if (bv) return { kind: "bilibili", bvid: bv[0]! };
  const av = trimmed.match(/bilibili\.com\/video\/av(\d+)/i);
  if (av) return { kind: "bilibili", aid: av[1]! };
  const yt = youtubeId(trimmed);
  if (yt) return { kind: "youtube", id: yt };
  if (/\.(mp4|webm|mov|m4v)([?#]|$)/i.test(trimmed))
    return { kind: "file", url: trimmed };
  return { kind: "link", url: trimmed };
}

/** Locates a chapter for tutoring context; ids come from client requests. */
export function findChapter(
  bookId: string,
  chapterId: string,
): { book: Book; chapter: BookChapter; index: number } | null {
  const book = books.find((b) => b.id === bookId);
  if (!book) return null;
  const index = book.chapters.findIndex((c) => c.id === chapterId);
  const chapter = book.chapters[index];
  return chapter ? { book, chapter, index } : null;
}
