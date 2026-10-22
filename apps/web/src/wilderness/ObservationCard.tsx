import { wildIdentity, type WildSpecies } from "@island/world-core";
import { wildlifeNames, wildlifeNotes } from "./Wildlife";
const introductions: Record<
  WildSpecies,
  { category: string; text: string; source?: { title: string; url: string } }
> = {
  raptor: {
    category: "有羽毛的恐龙 · 白垩纪晚期",
    text: "迅猛龙用两条后腿行走。化石证据表明它的前肢有长羽毛。真实的迅猛龙比许多电影里的形象小；岛上的模型为方便观察调整了比例。",
    source: {
      title: "英国自然历史博物馆 · 认识迅猛龙",
      url: "https://www.nhm.ac.uk/discover/velociraptor-facts.html",
    },
  },
  pterosaur: {
    category: "会飞的爬行动物 · 翼龙类",
    text: "翼龙与恐龙生活在相近的时代，但不属于恐龙。它们是一大类会飞的爬行动物；这里的造型代表想象中的翼龙，没有指定某一种。",
    source: {
      title: "英国自然历史博物馆 · 认识翼龙",
      url: "https://www.nhm.ac.uk/discover/the-truth-about-pterosaurs.html",
    },
  },
  peacock: {
    category: "现代鸟类 · 孔雀",
    text: "孔雀是今天仍然生活在地球上的鸟。这里参考蓝孔雀的形象：雄鸟展开长长的饰羽，形成带有眼状花纹的羽屏。蓝孔雀是杂食性动物。",
    source: {
      title: "史密森尼国家动物园 · 认识孔雀",
      url: "https://nationalzoo.si.edu/animals/common-peafowl",
    },
  },
  nest: {
    category: "观察地点 · 物种待确认",
    text: "这是岛上的一处蛋巢，暂时没有确认属于哪一种动物。它有自己的地点编号；这个编号不代表某只动物，也不代表巢内每枚蛋。当前可以观察和记录，尚不能孵化。",
  },
};
export default function ObservationCard({
  id,
  recorded,
  onClose,
}: {
  id: string;
  recorded: boolean;
  onClose(): void;
}) {
  const identity = wildIdentity(id);
  if (!identity) return null;
  const card = introductions[identity.kind];
  return (
    <article
      className="wild-observation"
      aria-label={`${wildlifeNames[identity.kind]}介绍卡片`}
    >
      <button className="wild-close" aria-label="关闭观察" onClick={onClose}>
        ×
      </button>
      <span className="wild-card-category">{card.category}</span>
      <h2>{wildlifeNames[identity.kind]}</h2>
      <p className="wild-card-number">
        本家园{identity.kind === "nest" ? "地点" : "动物"}编号{" "}
        <strong data-testid="observation-number">{identity.number}</strong>
      </p>
      <p>{card.text}</p>
      <dl>
        <dt>发现区域</dt>
        <dd>
          {identity.chunk.x}, {identity.chunk.z}
        </dd>
        <dt>手记状态</dt>
        <dd>{recorded ? "已记录 · 回访编号不变" : "走近后可记录"}</dd>
      </dl>
      <h3>一起观察</h3>
      <p>{wildlifeNotes[identity.kind]}</p>
      {card.source && (
        <a href={card.source.url} target="_blank" rel="noreferrer">
          {card.source.title} ↗
        </a>
      )}
      <small className="wild-card-caption">
        这是一座想象中的自然公园，模型与同园场景经过艺术化处理。
      </small>
    </article>
  );
}
