/**
 * The unified growth engine: every deed in the world — planting, walking,
 * reading, writing, greeting — is one event; tasks turn events into stars.
 * Pure logic only, so it can be tested and reused anywhere.
 */

export type GrowthEvent = {
  type: string;
  /** Optional qualifier, e.g. which scene, which weather. */
  detail?: string;
};

export type TaskDef = {
  id: string;
  title: string;
  story: string;
  goal: { event: string; count: number; detail?: string };
  stars: number;
};

export type GrowthState = {
  stars: number;
  counts: Record<string, number>;
  done: Record<string, boolean>;
  deeds: { text: string; at: number }[];
  owned: Record<string, boolean>;
  /** Forage collected per kind (petal, pinecone…), shown in the backpack. */
  collected: Record<string, number>;
};

export const emptyGrowth = (): GrowthState => ({
  stars: 0,
  counts: {},
  done: {},
  deeds: [],
  owned: {},
  collected: {},
});

export type UnlockDef = {
  id: string;
  name: string;
  note: string;
  cost: number;
};

/** Stars flow back into the world: hats, a new resident, a lantern. */
export const unlocks: UnlockDef[] = [
  {
    id: "hat-starcrown",
    name: "星星冠",
    note: "一顶金色的小星冠，戴在头上亮亮的。",
    cost: 3,
  },
  {
    id: "hat-copter",
    name: "竹蜻蜓",
    note: "头顶的竹蜻蜓，走路时会呼呼地转。",
    cost: 5,
  },
  {
    id: "decor-lantern",
    name: "许愿星灯",
    note: "星光秘境升起一盏会摇的星灯。",
    cost: 6,
  },
  {
    id: "resident-wolf",
    name: "风哨（小狼）",
    note: "一只小狼愿意搬来听风山脚下住。",
    cost: 8,
  },
];

export function buyUnlock(
  state: GrowthState,
  id: string,
  now = Date.now(),
): { state: GrowthState; ok: boolean; error?: string } {
  const def = unlocks.find((u) => u.id === id);
  if (!def) return { state, ok: false, error: "没有这个小物件。" };
  if (state.owned[id]) return { state, ok: false, error: "已经有了。" };
  if (state.stars < def.cost)
    return { state, ok: false, error: `还差 ${def.cost - state.stars}★。` };
  return {
    state: {
      ...state,
      stars: state.stars - def.cost,
      owned: { ...state.owned, [id]: true },
      deeds: [
        { text: `用 ${def.cost}★ 换来了「${def.name}」`, at: now },
        ...state.deeds,
      ].slice(0, 40),
    },
    ok: true,
  };
}

const keyOf = (e: GrowthEvent) => (e.detail ? `${e.type}:${e.detail}` : e.type);

/** Picking up a forage item: counted and remembered; the first of each
 *  kind earns a star so the collection page fills with little rewards. */
export function collectItem(
  state: GrowthState,
  kind: string,
  name = kind,
  now = Date.now(),
): { state: GrowthState; first: boolean } {
  const had = state.collected[kind] ?? 0;
  const first = had === 0;
  return {
    first,
    state: {
      ...state,
      collected: { ...state.collected, [kind]: had + 1 },
      stars: first ? state.stars + 1 : state.stars,
      deeds: first
        ? [{ text: `第一次捡到「${name}」`, at: now }, ...state.deeds].slice(
            0,
            40,
          )
        : state.deeds,
    },
  };
}

/** Mix exploration and learning freely: both earn the same stars. */
export const starterTasks: TaskDef[] = [
  {
    id: "first-steps",
    title: "迈出第一步",
    story: "选一个形象，用自己的脚踩上沙滩。",
    goal: { event: "avatar.walked", count: 1 },
    stars: 1,
  },
  {
    id: "green-thumb",
    title: "绿手指",
    story: "为世界种下三簇花，颜色随你挑。",
    goal: { event: "flower.planted", count: 3 },
    stars: 1,
  },
  {
    id: "one-tree",
    title: "一棵树的时间",
    story: "种一棵树，它会长大的。",
    goal: { event: "tree.planted", count: 1 },
    stars: 1,
  },
  {
    id: "hello-friend",
    title: "打招呼",
    story: "轻轻点一点一位毛茸茸的居民。",
    goal: { event: "animal.petted", count: 1 },
    stars: 1,
  },
  {
    id: "three-friends",
    title: "三个朋友",
    story: "和居民们多相处一会儿——撸它们三次。",
    goal: { event: "animal.petted", count: 3 },
    stars: 2,
  },
  {
    id: "page-of-light",
    title: "纸上微光",
    story: "在书屋翻开《千字文》，读一页。",
    goal: { event: "book.page_read", count: 1, detail: "qianziwen" },
    stars: 1,
  },
  {
    id: "star-sentence",
    title: "摘星的句子",
    story: "读到喜欢的句子，写一条笔记留下它。",
    goal: { event: "note.written", count: 1 },
    stars: 2,
  },
  {
    id: "storm-watcher",
    title: "看雨的人",
    story: "换一场雷雨，听一听岛的声音。",
    goal: { event: "weather.changed", count: 1, detail: "thunder" },
    stars: 1,
  },
  {
    id: "wanderer",
    title: "小旅人",
    story: "走进三处小天地，每处都有自己的居民和花。",
    goal: { event: "scene.visited", count: 3 },
    stars: 2,
  },
  {
    id: "door-walker",
    title: "过门的人",
    story: "走着穿过两扇门——出岛，或回家。",
    goal: { event: "walk.gate_crossed", count: 2 },
    stars: 1,
  },
];

/** Goals without a detail match every event of that type, whatever the
 *  detail — "visit three scenes" counts library, garden and home alike. */
export function goalCount(
  counts: Record<string, number>,
  goal: TaskDef["goal"],
): number {
  if (goal.detail) return counts[`${goal.event}:${goal.detail}`] ?? 0;
  let n = counts[goal.event] ?? 0;
  const prefix = `${goal.event}:`;
  for (const [k, v] of Object.entries(counts)) if (k.startsWith(prefix)) n += v;
  return n;
}

export function taskProgress(state: GrowthState, task: TaskDef): number {
  return Math.min(task.goal.count, goalCount(state.counts, task.goal));
}

/**
 * Fold one event into the state. Returns the new state plus any tasks that
 * this event completed (the caller shows them and writes deeds).
 */
export function applyGrowthEvent(
  state: GrowthState,
  event: GrowthEvent,
  now = Date.now(),
): { state: GrowthState; completed: TaskDef[] } {
  const counts = { ...state.counts };
  counts[keyOf(event)] = Math.min(10000, (counts[keyOf(event)] ?? 0) + 1);
  const completed: TaskDef[] = [];
  const done = { ...state.done };
  let stars = state.stars;
  for (const task of starterTasks) {
    if (done[task.id]) continue;
    if (goalCount(counts, task.goal) >= task.goal.count) {
      done[task.id] = true;
      stars += task.stars;
      completed.push(task);
    }
  }
  const deeds =
    completed.length > 0
      ? [
          ...completed.map((t) => ({
            text: `完成「${t.title}」 +${t.stars}★`,
            at: now,
          })),
          ...state.deeds,
        ].slice(0, 40)
      : state.deeds;
  return {
    state: {
      stars,
      counts,
      done,
      deeds,
      owned: state.owned,
      collected: state.collected,
    },
    completed,
  };
}
