import { z } from "zod";
import { subjectSchema } from "./subject.js";

/**
 * Knowledge cards: the cognitive layer of the interaction model. A card
 * describes one subject (a forageable thing or a species) in child-sized
 * Chinese. Built-in cards live here like built-in books do; admin-published
 * cards with the same id override them per island.
 */
const slug = z.string().regex(/^[a-z0-9-]{2,40}$/, "id 只能用小写字母、数字和连字符");

export const cardTaxaSchema = z
  .object({
    phylum: z.string().trim().max(12).default(""),
    class: z.string().trim().max(12).default(""),
    order: z.string().trim().max(12).default(""),
    family: z.string().trim().max(12).default(""),
  })
  .strict();
export const cardFactSchema = z
  .object({
    label: z.string().trim().min(1).max(8),
    text: z.string().trim().min(1).max(60),
  })
  .strict();

export const knowledgeCardSchema = z
  .object({
    /** Convention: the tail of the subject, e.g. "forage-crab", "species-fox". */
    id: slug,
    subject: subjectSchema,
    title: z.string().trim().min(1).max(24),
    /** One line under the title, e.g. "节肢动物门 · 甲壳纲 · 十足目". */
    subtitle: z.string().trim().max(40).default(""),
    taxa: cardTaxaSchema.default({ phylum: "", class: "", order: "", family: "" }),
    facts: z.array(cardFactSchema).max(6).default([]),
    /** The paragraph read aloud to the child (and shown first). */
    look: z.string().trim().min(1).max(200),
    /** Optional illustration from the asset store. */
    image: z.string().uuid().optional(),
  })
  .strict();
export type KnowledgeCard = z.infer<typeof knowledgeCardSchema>;

const card = (c: KnowledgeCard): KnowledgeCard => c;

/** The twelve built-in cards: every forageable kind plus the four species.
 *  Written for roughly-six-year-olds; names match world-core's catalogs. */
export const builtinCards: KnowledgeCard[] = [
  card({
    id: "forage-crab",
    subject: "forage:crab",
    title: "螃蟹",
    subtitle: "节肢动物门 · 甲壳纲 · 十足目",
    taxa: { phylum: "节肢动物门", class: "甲壳纲", order: "十足目", family: "" },
    facts: [
      { label: "走路", text: "有八条腿，却喜欢横着走。" },
      { label: "钳子", text: "两只大钳子既是手，又是盾牌。" },
      { label: "住处", text: "退潮后的湿沙上，常能见到小洞。" },
      { label: "本领", text: "遇到危险就快速钻进沙子里。" },
    ],
    look: "螃蟹穿着硬硬的壳，像小盔甲。它横着走路不是调皮，是因为身体长得扁扁的，这样走最稳。下次在沙滩上看到小沙球，说不定就是螃蟹宝宝留下的哦。",
  }),
  card({
    id: "forage-starfish",
    subject: "forage:starfish",
    title: "海星",
    subtitle: "棘皮动物门 · 海星纲",
    taxa: { phylum: "棘皮动物门", class: "海星纲", order: "", family: "" },
    facts: [
      { label: "腕", text: "常见五条腕，像五角星。" },
      { label: "再生", text: "断掉的腕可以慢慢长回来。" },
      { label: "走路", text: "用肚子下面成百的管足慢慢爬。" },
      { label: "嘴巴", text: "长在身体下面，朝向沙地。" },
    ],
    look: "海星不是鱼，是海里慢慢爬的星星。它的每条腕下面都排着小小的管足，像几百只小吸盘，一步一步挪着走。要是哪条腕受伤了，它还能重新长出来，很厉害吧。",
  }),
  card({
    id: "forage-shell",
    subject: "forage:shell",
    title: "贝壳",
    subtitle: "软体动物门 · 随身带的房子",
    taxa: { phylum: "软体动物门", class: "", order: "", family: "" },
    facts: [
      { label: "来源", text: "是软体动物自己造的外壳。" },
      { label: "长大", text: "壳会跟着主人一起一圈圈长大。" },
      { label: "珍珠", text: "有的壳里会结出亮亮的珍珠层。" },
      { label: "礼物", text: "海浪常常把它们送到沙滩上。" },
    ],
    look: "贝壳是软软的小动物给自己盖的房子，出生就开始造，长大一圈就加一圈新房间的墙。主人离开以后，房子留在沙滩上，成了海浪送我们的礼物。",
  }),
  card({
    id: "forage-pinecone",
    subject: "forage:pinecone",
    title: "松果",
    subtitle: "裸子植物 · 松树的种子球",
    taxa: { phylum: "裸子植物门", class: "", order: "", family: "" },
    facts: [
      { label: "身份", text: "是松树结的球，不是果子。" },
      { label: "鳞片", text: "晒干后鳞片张开，种子就飞出去。" },
      { label: "朋友", text: "松鼠和小鸟都爱来捡它。" },
      { label: "气味", text: "闻起来有森林的香味。" },
    ],
    look: "松果是松树妈妈的种子摇篮。天气干燥时鳞片张开，带小翅膀的种子乘着风飞去远方；下雨变潮，它又轻轻合上。捡一颗放在窗台，能看它开开合合好多天。",
  }),
  card({
    id: "forage-mushroom",
    subject: "forage:mushroom",
    title: "蘑菇",
    subtitle: "真菌 · 森林里的分解小队",
    taxa: { phylum: "担子菌门", class: "", order: "", family: "" },
    facts: [
      { label: "身份", text: "不是植物，是真菌。" },
      { label: "菌丝", text: "地下藏着白色的细丝网。" },
      { label: "出现", text: "常在雨后一夜间冒出来。" },
      { label: "提醒", text: "野外的蘑菇只看不吃。" },
    ],
    look: "蘑菇不打种子也不开花，地面上的小伞只是它的耳朵，真正的大力士是藏在土里的白色菌丝。它把落叶慢慢变成养分，森林谢谢它。野外的蘑菇漂亮也不能吃哦。",
  }),
  card({
    id: "forage-petal",
    subject: "forage:petal",
    title: "花瓣",
    subtitle: "被子植物门 · 花的请柬",
    taxa: { phylum: "被子植物门", class: "", order: "", family: "" },
    facts: [
      { label: "任务", text: "用颜色和香味请昆虫来做客。" },
      { label: "路标", text: "花瓣上的小纹路是给蜜蜂的跑道。" },
      { label: "数量", text: "数花瓣能帮你认出花的名字。" },
      { label: "旅行", text: "风一吹就去草地上跳舞。" },
    ],
    look: "花瓣是花写给昆虫的请柬：颜色是信纸，香味是邮票。有的花瓣上还有细细的条纹，像跑道一样，带着蜜蜂稳稳降落到花心里。风把请柬带出来，就是我们捡到的花瓣。",
  }),
  card({
    id: "forage-pebble",
    subject: "forage:pebble",
    title: "鹅卵石",
    subtitle: "岩石 · 被水磨圆的旅行者",
    taxa: { phylum: "", class: "", order: "", family: "" },
    facts: [
      { label: "身份", text: "不是生物，是一块小石头。" },
      { label: "圆", text: "河水和海浪推着它互相磨。" },
      { label: "从前", text: "很久以前它也有尖尖的棱角。" },
      { label: "条纹", text: "每一颗的花纹都不一样。" },
    ],
    look: "鹅卵石原来是山上有棱有角的小石块，滚进河里以后，水流推着它一路碰一路磨，几千年后才变成圆圆滑滑的样子。捡起来对着光看，每一颗的花纹都是独一份的。",
  }),
  card({
    id: "forage-mote",
    subject: "forage:mote",
    title: "萤光",
    subtitle: "光的小秘密 · 像萤火虫的灯",
    taxa: { phylum: "", class: "", order: "", family: "" },
    facts: [
      { label: "来源", text: "星光落在草尖上的一点亮。" },
      { label: "像谁", text: "萤火虫的尾巴也会这样发光。" },
      { label: "原理", text: "身体里的萤光素和氧气握手。" },
      { label: "特点", text: "是冷光，一点都不烫。" },
    ],
    look: "草尖上这点亮，和夏夜萤火虫的灯是同一种魔法：萤光素和氧气轻轻一握手，就亮了，而且不发热。星星很远，萤火虫很小，它们却在同一片草地上见面。",
  }),
  card({
    id: "species-fox",
    subject: "species:fox",
    title: "狐狸",
    subtitle: "脊索动物门 · 哺乳纲 · 食肉目 · 犬科",
    taxa: { phylum: "脊索动物门", class: "哺乳纲", order: "食肉目", family: "犬科" },
    facts: [
      { label: "耳朵", text: "尖尖的，能听见雪下的声音。" },
      { label: "尾巴", text: "又大又蓬，睡觉时当毯子。" },
      { label: "亲戚", text: "是狗狗的远房亲戚。" },
      { label: "本领", text: "会用尾巴在雪上写心情。" },
    ],
    look: "狐狸是大自然里的小机灵鬼。它的耳朵特别灵，冬天能听见雪下面小老鼠的动静；那条大尾巴又漂亮又能干，跑起来当方向舵，睡觉时盖在身上就是暖和的毯子。",
  }),
  card({
    id: "species-panda",
    subject: "species:panda",
    title: "熊猫",
    subtitle: "脊索动物门 · 哺乳纲 · 食肉目 · 熊科",
    taxa: { phylum: "脊索动物门", class: "哺乳纲", order: "食肉目", family: "熊科" },
    facts: [
      { label: "饭量", text: "一天要吃很多很多竹子。" },
      { label: "手指", text: "手腕上多一块骨头，好握竹子。" },
      { label: "眼圈", text: "黑眼圈是天生的墨镜。" },
      { label: "家乡", text: "中国的山里，是大家的宝贝。" },
    ],
    look: "熊猫看起来圆滚滚慢吞吞，其实是爬树和游泳的小能手。它每天抱着竹子咔嚓咔嚓吃个不停，手腕上还有一根特别的‘小手指’专门握竹竿。黑白的毛色让它在雪地和树影里都不显眼。",
  }),
  card({
    id: "species-giraffe",
    subject: "species:giraffe",
    title: "长颈鹿",
    subtitle: "脊索动物门 · 哺乳纲 · 偶蹄目 · 长颈鹿科",
    taxa: { phylum: "脊索动物门", class: "哺乳纲", order: "偶蹄目", family: "长颈鹿科" },
    facts: [
      { label: "脖子", text: "陆地动物里最长的脖子。" },
      { label: "颈椎", text: "和人一样，只有七块骨头。" },
      { label: "舌头", text: "蓝紫色，特别长。" },
      { label: "睡觉", text: "常常站着打瞌睡。" },
    ],
    look: "长颈鹿的脖子那么长，脖子里的骨头却和我们一样只有七块，只是每一块都特别长。蓝紫色的长舌头一卷，就能吃到树顶最嫩的叶子。它平时站着打瞌睡，躺下太久再站起来可太费劲啦。",
  }),
  card({
    id: "species-wolf",
    subject: "species:wolf",
    title: "狼",
    subtitle: "脊索动物门 · 哺乳纲 · 食肉目 · 犬科",
    taxa: { phylum: "脊索动物门", class: "哺乳纲", order: "食肉目", family: "犬科" },
    facts: [
      { label: "团队", text: "和家里人一起生活、一起行动。" },
      { label: "嚎叫", text: "用长嚎互相报位置。" },
      { label: "脚印", text: "像大一号的狗狗脚印。" },
      { label: "祖先", text: "狗狗的老祖宗就是狼。" },
    ],
    look: "狼是讲团队的小伙伴：一起出发，一起休息，用长嚎告诉远处的家人‘我在这里’。它跑起来又稳又久，脚印像大一号的狗爪印。家里的狗狗，很久很久以前就是狼变的呢。",
  }),
];
