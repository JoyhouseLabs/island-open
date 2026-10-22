import type { DinosaurHabitatId } from "@island/world-core";

export const observations: Record<
  DinosaurHabitatId,
  { title: string; text: string; prompt: string; source?: string }
> = {
  pterosaur: {
    title: "翼龙 · 乘风的邻居",
    text: "翼龙是会飞的爬行动物，是恐龙的近亲。这里用风格化模型表现翼膜与滑翔，并不是某一种翼龙的精确复原。",
    prompt: "观察它什么时候扇翅，什么时候滑翔。",
    source: "https://www.nhm.ac.uk/discover/the-truth-about-pterosaurs.html",
  },
  raptor: {
    title: "迅猛龙 · 有羽毛的恐龙",
    text: "迅猛龙有羽毛，尾巴长，用两条后腿行走。公园里的小伙伴会散步、停下张望，点击它就能让它停留一会儿。",
    prompt: "找找前肢和尾巴上的羽毛。",
    source: "https://www.amnh.org/explore/news-blogs/velociraptor",
  },
  nest: {
    title: "蛋巢 · 安静观察",
    text: "这是一组想象的恐龙蛋巢。蛋的颜色、大小和排列是艺术设计，不代表迅猛龙的真实巢穴复原。请站在巢边观察。",
    prompt: "数一数，每个巢里有几枚蛋？",
  },
  peacock: {
    title: "现代孔雀 · 羽屏里的眼睛",
    text: "这是今天仍然生活在地球上的蓝孔雀。雄鸟展开的华丽羽屏主要由延长的尾上覆羽组成。点击它，看看展开的羽屏。",
    prompt: "羽屏上有多少个像眼睛一样的花纹？",
    source: "https://nationalzoo.si.edu/animals/common-peafowl",
  },
};
