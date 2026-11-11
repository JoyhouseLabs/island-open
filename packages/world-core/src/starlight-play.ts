import type {
  BlueprintId,
  IslandEntity,
  MaterialId,
  PlayPlacement,
  PlayStructure,
  StarlightRequest,
  StarlightState,
  StarTrial,
} from "@island/contracts";
import { walkSpecs } from "./walk.js";
import { playResourceNodes, walkObstacles } from "./statics.js";
import { playSurfaces, surfaceObstacle } from "./surfaces.js";

export const materialNames: Record<MaterialId, string> = {
  moonfruit: "月光果",
  branch: "落枝",
  pebble: "石子",
};
export const playBlueprints: Record<
  BlueprintId,
  { name: string; note: string; cost: Partial<Record<MaterialId, number>> }
> = {
  lantern: {
    name: "观星灯",
    note: "照亮观星角，可换颜色",
    cost: { branch: 2, pebble: 2 },
  },
  basket: { name: "储物篮", note: "点击打开材料背包", cost: { branch: 3 } },
  mat: {
    name: "伙伴休息垫",
    note: "点击邀请月亮伊布来休息",
    cost: { branch: 2, moonfruit: 1 },
  },
};
export const HARVEST_COOLDOWN = 90_000;
export const HARVEST_REACH = 3.6;
export function emptyStarlight(): StarlightState {
  return {
    version: 1,
    revision: 0,
    materials: { moonfruit: 0, branch: 0, pebble: 0 },
    harvested: {},
    structures: [],
    snacks: 0,
    starReward: false,
    trial: null,
  };
}
export function resourceStage(state: StarlightState, id: string, now: number) {
  const picked = state.harvested[id];
  const remaining =
    picked === undefined ? 0 : Math.max(0, picked + HARVEST_COOLDOWN - now);
  return {
    remaining,
    label:
      remaining === 0
        ? "已成熟"
        : remaining > 60_000
          ? "刚采过"
          : remaining > 30_000
            ? "幼苗"
            : "生长中",
  };
}
export function playObstacles(structures: PlayStructure[]) {
  return structures.flatMap((s) => {
    if (!s.placement) return [];
    const obstacle = surfaceObstacle(
      playSurfaces[s.blueprint],
      s.placement.x,
      s.placement.z,
    );
    return obstacle ? [obstacle] : [];
  });
}
export function playPlacementError(
  state: StarlightState,
  id: string,
  p: PlayPlacement,
  entities: IslandEntity[] = [],
): string | null {
  if (!walkSpecs.starlight.walkable(p.x, p.z))
    return "这里是石盆、立石或空地边缘，请换个位置。";
  // Reserve a continuous corridor from the south gate to the altar and spawn.
  if (Math.abs(p.x) < 3.5 && p.z > 3)
    return "留出洞口到石盆的通路，放在道路两侧吧。";
  if (Math.hypot(p.x, p.z - 10) < 3) return "这里要留给刚进入秘境的伙伴。";
  if (playResourceNodes.some((n) => Math.hypot(p.x - n.x, p.z - n.z) < 2.3))
    return "离采摘点太近了，留一点采摘空间。";
  if (
    state.structures.some(
      (s) =>
        s.id !== id &&
        s.placement &&
        Math.hypot(p.x - s.placement.x, p.z - s.placement.z) < 2,
    )
  )
    return "和另一件作品挨得太近了。";
  if (
    walkObstacles("starlight", entities).some((o) => {
      const dx = Math.max(0, Math.abs(p.x - o.x) - (o.halfSize?.x ?? o.r));
      const dz = Math.max(0, Math.abs(p.z - o.z) - (o.halfSize?.z ?? o.r));
      return Math.hypot(dx, dz) < 1.1;
    })
  )
    return "会碰到树木、长椅或立石，请留出一点空隙。";
  if (p.color === "star" && !state.starReward)
    return "星纹颜色需要完成一次星影试炼；其他颜色随时可用。";
  return null;
}
export function trialIntent(turn: number) {
  return turn % 2 === 1
    ? { label: "星影正在蓄光，下回合会冲击", damage: 0 }
    : { label: "星影准备冲击：5 点能量", damage: 5 };
}
export class PlayRuleError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
function refuse(code: string, message: string): never {
  throw new PlayRuleError(code, message);
}
/** Pure, versioned rules shared by the server and explicitly local guest play. */
export function applyStarlight(
  current: StarlightState,
  request: StarlightRequest,
  now: number,
  entities: IslandEntity[] = [],
) {
  if (request.expectedRevision !== current.revision)
    refuse("PLAY_CONFLICT", "另一处已经更新了观星角，请刷新后再试。");
  const s = structuredClone(current),
    a = request.action;
  let message = "已保存。";
  const active =
    s.trial && (s.trial.phase === "active" || s.trial.phase === "paused");
  if (active && !a.op.startsWith("trial."))
    refuse("TRIAL_BUSY", "先退出试炼，再继续采摘或建造。");
  if (a.op === "harvest") {
    const node = playResourceNodes.find((n) => n.id === a.nodeId);
    if (!node) refuse("UNKNOWN_RESOURCE", "没有这个采摘点。");
    if (
      !walkSpecs.starlight.walkable(a.position.x, a.position.z) ||
      Math.hypot(node.x - a.position.x, node.z - a.position.z) > HARVEST_REACH
    )
      refuse("TOO_FAR", "走近一点，再采摘吧。");
    if (resourceStage(s, node.id, now).remaining > 0)
      refuse("GROWING", "还在长大，先看看别的材料吧。");
    if (s.materials[node.material] + node.quantity > 99)
      refuse("BAG_FULL", "这种材料最多放 99 个，先制作一点东西吧。");
    s.materials[node.material] += node.quantity;
    s.harvested[node.id] = now;
    message = `${materialNames[node.material]} +${node.quantity}，背包共 ${s.materials[node.material]}。`;
  } else if (a.op === "craft" || a.op === "build") {
    if (s.structures.length >= 24)
      refuse("STRUCTURE_LIMIT", "观星角最多保存 24 件作品。");
    const blueprint = playBlueprints[a.blueprint];
    if (a.op === "build") {
      const error = playPlacementError(
        s,
        request.actionId,
        a.placement,
        entities,
      );
      if (error) refuse("INVALID_PLACEMENT", error);
    }
    for (const [id, count] of Object.entries(blueprint.cost))
      if (s.materials[id as MaterialId] < count)
        refuse(
          "MISSING_MATERIAL",
          `${materialNames[id as MaterialId]}还差 ${count - s.materials[id as MaterialId]} 个。`,
        );
    for (const [id, count] of Object.entries(blueprint.cost))
      s.materials[id as MaterialId] -= count;
    s.structures.push({
      id: request.actionId,
      blueprint: a.blueprint,
      version: 1,
      placement: a.op === "build" ? a.placement : null,
    });
    message =
      a.op === "build"
        ? `${blueprint.name}已建好并摆放，材料已扣除。`
        : `${blueprint.name}做好了，选一个位置吧。`;
  } else if (a.op === "place" || a.op === "store") {
    const item = s.structures.find((i) => i.id === a.id);
    if (!item) refuse("UNKNOWN_STRUCTURE", "没有找到这件作品。");
    if (a.op === "place") {
      const error = playPlacementError(s, a.id, a.placement, entities);
      if (error) refuse("INVALID_PLACEMENT", error);
      item.placement = a.placement;
      message = `${playBlueprints[item.blueprint].name}已摆好，移动不消耗材料。`;
    } else {
      item.placement = null;
      message = "已收进作品背包，随时可以再摆出来。";
    }
  } else if (a.op === "snack") {
    if (s.materials.moonfruit < 3)
      refuse("MISSING_MATERIAL", "伙伴点心需要 3 颗月光果。");
    s.materials.moonfruit -= 3;
    s.snacks++;
    message = "月亮伊布收到月光果点心，开心地向你点头。";
  } else if (a.op === "trial.start") {
    if (active) refuse("TRIAL_BUSY", "已有试炼，请继续或结束它。");
    s.trial = {
      id: request.actionId,
      rulesVersion: 1,
      turn: 1,
      phase: "active",
      energy: 10,
      shadow: 10,
      points: 2,
      focused: false,
      log: ["友好试炼开始，观察星影下一步的动作。"],
    };
    message = "试炼开始，没有倒计时。";
  } else {
    const t = s.trial;
    if (!t || !active) refuse("NO_TRIAL", "没有进行中的试炼。");
    if (a.op === "trial.pause") {
      t.phase = "paused";
      message = "试炼已暂停，当前回合已保存。";
    } else if (a.op === "trial.resume") {
      t.phase = "active";
      message = "继续当前回合。";
    } else if (a.op === "trial.leave") {
      t.phase = "abandoned";
      message = "已结束试炼，背包和家园没有损失。";
    } else if (a.op === "trial.turn") {
      if (t.phase !== "active")
        refuse("TRIAL_PAUSED", "先继续试炼，再选择动作。");
      const cost = a.skill === "beam" ? 2 : a.skill === "guard" ? 1 : 0;
      if (t.points < cost) refuse("NO_POINTS", "行动点不够，先守护或观察吧。");
      t.points -= cost;
      let dealt = 0;
      if (a.skill === "beam") {
        dealt = t.focused ? 5 : 3;
        t.focused = false;
        t.shadow = Math.max(0, t.shadow - dealt);
      }
      if (a.skill === "observe") t.focused = true;
      const hit =
        t.shadow === 0
          ? 0
          : Math.max(
              0,
              trialIntent(t.turn).damage - (a.skill === "guard" ? 3 : 0),
            );
      t.energy = Math.max(0, t.energy - hit);
      const label =
        a.skill === "beam"
          ? `光波，星影能量 -${dealt}`
          : a.skill === "guard"
            ? "守护，抵挡 3 点冲击"
            : "观察，下次光波增强为 5 点";
      t.log = [
        ...t.log,
        `第 ${t.turn} 回合：${label}；伙伴能量 -${hit}。`,
      ].slice(-8);
      if (t.shadow === 0) {
        t.phase = "won";
        s.starReward = true;
        message = "试炼完成！星纹灯色已解锁，可重复使用。";
      } else if (t.energy === 0 || t.turn >= 100) {
        t.phase = "rest";
        message = "休息一下，再试一次。材料和作品都保留。";
      } else {
        t.turn++;
        t.points = Math.min(4, t.points + 2);
        message = "这一回合完成，恢复 2 行动点。";
      }
    }
  }
  s.revision++;
  return { state: s, message };
}
