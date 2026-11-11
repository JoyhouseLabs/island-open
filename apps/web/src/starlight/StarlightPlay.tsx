import {
  trialSkillIds,
  trialSkills,
  type TrialSkillId,
} from "@island/contracts";
import {
  confirmedTrialEffect,
  TRIAL_EFFECT_SECONDS,
  type TrialEffect,
  trialCue,
  type TrialCue,
} from "./trialEffects";
import { useTrialMotion } from "./useTrialMotion";
import {
  trialShortcut,
  trialSkillKeys,
  trialSkillUnavailable,
} from "./trialKeyboard";
import { menus, useMenuPanel } from "../navigation/store";
import { animalDetails } from "../animals/detailsStore";
import { useEffect, useRef, useState } from "react";
import type {
  BlueprintId,
  IslandEntity,
  MaterialId,
  PlayPlacement,
  PlayStructure,
  StarlightState,
  StarlightAction,
} from "@island/contracts";
import {
  HARVEST_REACH,
  materialNames,
  playBlueprints,
  playPlacementError,
  playResourceNodes,
  resourceStage,
  trialIntent,
} from "@island/world-core";
import { playerAgent } from "../animals/registry";
import { moveBus } from "../player/avatar";
import { greetings, restDestinations } from "../animals/mindState";
import { useStarlightState } from "./useStarlightState";
import "./starlight.css";
export type PlayPreview = {
  isNew?: boolean;
  item: PlayStructure;
  placement: PlayPlacement;
  error: string | null;
};
export type PlaySceneBindings = {
  state: StarlightState;
  now: number;
  enabled: boolean;
  frozen: boolean;
  trialView: boolean;
  motion: boolean;
  effect: TrialEffect | null;
  effectStarted: number;
  cue: TrialCue;
  effectsPaused: boolean;
  onTrial: () => void;
  selectedNode: string | null;
  preview: PlayPreview | null;
  onGround: (x: number, z: number) => void;
  onNode: (id: string) => void;
  onItem: (id: string) => void;
};
export function useStarlightActivity(options: {
  enabled: boolean;
  worldId: string | null;
  localKey: string;
  entities: IslandEntity[];
  walking: boolean;
  onWalk: () => void;
  editing: boolean;
  token?: string;
  readOnly?: boolean;
}) {
  const data = useStarlightState(options);
  const { motion, setMotion } = useTrialMotion();
  const menu = useMenuPanel();
  const [effect, setEffect] = useState<TrialEffect | null>(null);
  const [effectBusy, setEffectBusy] = useState(false);
  const [effectStarted, setEffectStarted] = useState(0);
  const [responding, setResponding] = useState(false);
  useEffect(() => {
    setResponding(false);
    if (!effect) {
      setEffectBusy(false);
      return;
    }
    setEffectBusy(motion);
    const timer = window.setTimeout(
      () => {
        setEffectBusy(false);
        if (motion) setEffect(null);
      },
      motion ? TRIAL_EFFECT_SECONDS * 1000 : 0,
    );
    const response = motion
      ? window.setTimeout(() => setResponding(true), 1150)
      : undefined;
    return () => {
      clearTimeout(timer);
      clearTimeout(response);
    };
  }, [effect?.id, motion]);
  const act = async (action: StarlightAction) => {
    if (action.op === "trial.turn" && effectBusy) return null;
    const before = data.state.trial;
    const result = await data.act(action);
    if (result && action.op === "trial.turn") {
      const next = confirmedTrialEffect(
        before,
        result.state.trial,
        action.skill,
      );
      if (next) {
        setEffectStarted(performance.now());
        setEffect(next);
        setEffectBusy(motion);
      }
    } else if (result && action.op.startsWith("trial.")) {
      setEffect(null);
      setEffectBusy(false);
    }
    return result;
  };
  const [open, setOpen] = useState(false),
    [tab, setTab] = useState<"materials" | "build" | "trial">("materials");
  const [nodeId, setNodeId] = useState<string | null>(null),
    [preview, setPreview] = useState<PlayPreview | null>(null);
  const [clock, setClock] = useState(Date.now()),
    [distance, setDistance] = useState<number | null>(null),
    [notice, setNotice] = useState("");
  const [restingAt, setRestingAt] = useState<string | null>(null);
  const panel = useRef<HTMLElement>(null);
  const now = clock + data.offset;
  const node = playResourceNodes.find((n) => n.id === nodeId);
  useEffect(() => {
    setNotice("");
  }, [data.message]);
  const activeTrial =
    data.state.trial?.phase === "active" ||
    data.state.trial?.phase === "paused";
  useEffect(() => {
    if (!options.enabled) return;
    const timer = setInterval(() => {
      setClock(Date.now());
      const player = playerAgent();
      setDistance(
        node && options.walking && player
          ? Math.hypot(node.x - player.x, node.z - player.z)
          : null,
      );
    }, 250);
    return () => clearInterval(timer);
  }, [options.enabled, options.walking, node]);
  useEffect(() => {
    setEffect(null);
    setEffectBusy(false);
    setPreview(null);
    setNodeId(null);
    setNotice("");
    setOpen(false);
  }, [options.worldId, options.localKey]);
  useEffect(() => {
    if (options.editing) {
      setPreview(null);
      setOpen(false);
    }
  }, [options.editing]);
  useEffect(() => {
    if (open) panel.current?.focus();
  }, [open, tab]);
  const onNode = (id: string) => {
    if (options.readOnly || options.editing || preview || activeTrial) return;
    animalDetails.close();
    setNodeId(id);
    setTab("materials");
    setOpen(true);
    setNotice("");
  };
  const onItem = (id: string) => {
    if (options.readOnly || options.editing || preview || activeTrial) return;
    const item = data.state.structures.find((i) => i.id === id);
    if (item?.blueprint === "mat" && item.placement) {
      restDestinations.set("starlight-月亮伊布", {
        x: item.placement.x,
        z: item.placement.z,
        until: Date.now() + 30_000,
      });
      setRestingAt(id);
      setNotice("已邀请月亮伊布来休息垫，路上遇到障碍时可换个位置。");
    }
    if (item?.blueprint === "basket") {
      menus.open("bag", "materials");
      return;
    }
    setTab("build");
    setOpen(true);
  };
  const onGround = (x: number, z: number) => {
    if (!preview) return;
    const placement = {
      ...preview.placement,
      x: Math.round(x * 2) / 2,
      z: Math.round(z * 2) / 2,
    };
    setPreview({
      ...preview,
      placement,
      error: playPlacementError(
        data.state,
        preview.item.id,
        placement,
        options.entities,
      ),
    });
  };
  const beginPlace = (item: PlayStructure, isNew = false) => {
    const placement = item.placement ?? {
      x: 8,
      z: 15,
      rotation: 0,
      color: "gold" as const,
    };
    setPreview({
      item,
      isNew,
      placement,
      error: playPlacementError(
        data.state,
        item.id,
        placement,
        options.entities,
      ),
    });
    setTab("build");
    setOpen(true);
  };
  const changePreview = (patch: Partial<PlayPlacement>) => {
    if (!preview) return;
    const placement = { ...preview.placement, ...patch };
    setPreview({
      ...preview,
      placement,
      error: playPlacementError(
        data.state,
        preview.item.id,
        placement,
        options.entities,
      ),
    });
  };
  const harvest = async () => {
    const player = playerAgent();
    if (!node || !player || !options.walking || preview || activeTrial) return;
    await data.act({
      op: "harvest",
      nodeId: node.id,
      position: { x: player.x, z: player.z },
    });
  };
  useEffect(() => {
    if (!open || tab !== "materials" || !node || options.readOnly) return;
    const key = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== "e" ||
        event.repeat ||
        (event.target as HTMLElement)?.closest(
          "input,textarea,select,button,[contenteditable=true]",
        )
      )
        return;
      event.preventDefault();
      void harvest();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  const onTrial = () => {
    if (options.readOnly || options.editing || preview) return;
    animalDetails.close();
    setTab("trial");
    setOpen(true);
  };
  const trialView =
    options.enabled && !options.readOnly && open && tab === "trial";
  const close = async () => {
    if (data.busy) return;
    if (data.state.trial?.phase === "active") {
      const result = await act({ op: "trial.pause" });
      if (!result) return;
    }
    setOpen(false);
    setPreview(null);
  };
  const cue = trialCue(
    data.state.trial,
    data.busy || !!data.pending,
    effectBusy ? effect : null,
    responding,
    !!menu,
  );
  return {
    ...data,
    cue,
    displayTurn: effectBusy && effect ? effect.turn : data.state.trial?.turn,
    act,
    motion,
    setMotion,
    effectBusy,
    trialView,
    onTrial,
    panel,
    open,
    setOpen,
    tab,
    setTab,
    node,
    now,
    distance,
    notice,
    preview,
    restingAt,
    onNode,
    onItem,
    onGround,
    beginPlace,
    beginBlueprint: (blueprint: BlueprintId) =>
      beginPlace(
        { id: crypto.randomUUID(), blueprint, version: 1, placement: null },
        true,
      ),
    changePreview,
    setPreview,
    harvest,
    close,
    walking: options.walking,
    onWalk: options.onWalk,
    editing: options.editing,
    enabled: options.enabled,
    activeTrial,
    scene: {
      state: data.state,
      now,
      preview,
      frozen: !!activeTrial || !!preview || trialView,
      trialView,
      motion,
      effect,
      effectStarted,
      cue,
      effectsPaused: !!menu || data.state.trial?.phase === "paused",
      onTrial,
      selectedNode: nodeId,
      enabled: !options.readOnly && !options.editing && !activeTrial,
      onNode,
      onItem,
      onGround,
    } satisfies PlaySceneBindings,
    snack: async () => {
      if (await data.act({ op: "snack" }))
        greetings.set("starlight-月亮伊布", Date.now() + 5000);
    },
  };
}
export type StarlightActivity = ReturnType<typeof useStarlightActivity>;
export function StarlightControls({ play: p }: { play: StarlightActivity }) {
  if (!p.enabled || p.readOnly) return null;
  const locked = p.busy || !p.ready || !!p.pending;
  const skillLocked = locked || p.effectBusy;
  const trial = p.state.trial;
  const placed = p.state.structures.some(
    (s) => s.blueprint === "lantern" && s.placement,
  );
  const stage = p.node ? resourceStage(p.state, p.node.id, p.now) : null;
  const skillButton = (id: TrialSkillId) => {
    const skill = trialSkills[id];
    const reason = trialSkillUnavailable(trial, id);
    return (
      <button
        key={id}
        aria-keyshortcuts={trialSkillKeys[id]}
        disabled={skillLocked || !!reason}
        title={reason || skill.note}
        onClick={() => void p.act({ op: "trial.turn", skill: id })}
      >
        <span className="trial-skill-symbol" aria-hidden="true">
          {skill.symbol}
        </span>
        {skill.name}{" "}
        <kbd className="trial-key" aria-hidden="true">
          {trialSkillKeys[id]}
        </kbd>
        <small>
          耗 {skill.cost} 点 ·{" "}
          {id === "beam" ? `冲击 ${trial?.focused ? 5 : 3}` : skill.note}
        </small>
        {reason && <small className="trial-skill-reason">{reason}</small>}
      </button>
    );
  };

  return (
    <div className="starlight-ui">
      {!p.open && (
        <div className="star-launch-group">
          <button
            className="star-launch"
            disabled={p.editing}
            onClick={() => {
              p.setOpen(true);
              if (p.activeTrial) p.setTab("trial");
            }}
          >
            ☾ {p.activeTrial ? "继续星影试炼" : "我的观星角"}
          </button>
          <button
            className="star-trial-launch"
            disabled={p.editing || !!p.preview}
            onClick={p.onTrial}
          >
            ✧ 星影试炼台
          </button>
        </div>
      )}
      {p.open && (
        <section
          className={`star-panel${p.trialView ? " star-battle-panel" : ""}`}
          ref={p.panel}
          tabIndex={0}
          aria-label={p.trialView ? "星影试炼操作面板" : "我的观星角"}
          onKeyDown={(e) => {
            const editable = !!(e.target as HTMLElement).closest(
              'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="combobox"],[role="spinbutton"]',
            );
            const action = trialShortcut(
              e.nativeEvent,
              {
                enabled: p.trialView && !p.editing && !document.hidden,
                locked: locked || !!menus.panel,
                effectBusy: p.effectBusy,
                trial,
              },
              editable,
            );
            if (action) {
              e.preventDefault();
              e.stopPropagation();
              void p.act(action);
              return;
            }
            if (
              e.key === "Escape" &&
              !e.repeat &&
              !e.nativeEvent.isComposing &&
              !editable &&
              !e.defaultPrevented
            ) {
              e.preventDefault();
              e.stopPropagation();
              void p.close();
            }
          }}
        >
          <header>
            <div>
              <span className="star-eyebrow">与月亮伊布一起</span>
              <h2>{p.trialView ? "星影试炼台" : "我的观星角"}</h2>
            </div>
            <button
              aria-label="关闭观星角"
              disabled={p.busy}
              onClick={() => void p.close()}
            >
              ×
            </button>
          </header>
          {!p.trialView && (
            <>
              <p className="star-save">
                {p.cloud
                  ? "材料与作品保存到云端"
                  : "本机体验 · 不会自动转入登录账号"}
              </p>
              <p className="star-quest">
                {placed
                  ? "观星灯已点亮！继续布置，或试试星影试炼。"
                  : "找 2 根落枝和 2 颗石子，做一盏观星灯。"}
              </p>
            </>
          )}
          <nav aria-label="观星角活动">
            {(
              [
                ["materials", "采摘与点心"],
                ["build", "蓝图背包"],
                ["trial", "可选试炼"],
              ] as const
            ).map(([id, title]) => (
              <button
                key={id}
                aria-pressed={p.tab === id}
                disabled={!!p.preview || (p.activeTrial && id !== "trial")}
                onClick={() =>
                  id === "build"
                    ? menus.open("bag", "blueprints")
                    : p.setTab(id)
                }
              >
                {title}
              </button>
            ))}
          </nav>
          {!p.ready && (
            <p>
              正在读取记录…{" "}
              <button onClick={() => void p.refresh()}>重新读取</button>
            </p>
          )}
          {p.error && (
            <p role="alert" className="star-error">
              {p.error}
            </p>
          )}
          {p.pending && (
            <p>
              上次操作结果待确认。
              <button
                disabled={p.busy || !p.ready}
                onClick={async () => {
                  const result = await p.retry();
                  if (result) p.setPreview(null);
                }}
              >
                重试同一次操作
              </button>
            </p>
          )}
          {p.storageWarning && <p role="status">{p.storageWarning}</p>}
          <p className="star-feedback" role="status" aria-live="polite">
            {p.busy ? "正在确认，请稍等…" : p.notice || p.message}
          </p>
          {p.tab === "materials" && (
            <>
              <div className="star-materials">
                {Object.entries(materialNames).map(([id, name]) => (
                  <div key={id}>
                    <span>{name}</span>
                    <strong>
                      {p.state.materials[id as MaterialId]}
                      <small> / 99</small>
                    </strong>
                  </div>
                ))}
              </div>
              <div className="star-card">
                <h3>先选一个采摘点</h3>
                <div className="star-node-list">
                  {playResourceNodes.map((n) => (
                    <button
                      key={n.id}
                      aria-pressed={p.node?.id === n.id}
                      disabled={locked}
                      onClick={() => p.onNode(n.id)}
                    >
                      {materialNames[n.material]} · {n.x > 0 ? "东侧" : "西侧"}
                    </button>
                  ))}
                </div>
                {p.node && stage && (
                  <>
                    <p>
                      {materialNames[p.node.material]} · {stage.label}
                      {stage.remaining
                        ? ` · 约 ${Math.ceil(stage.remaining / 1000)} 秒`
                        : ` · 可得 ${p.node.quantity} 个`}
                    </p>
                    <p>
                      {p.distance === null
                        ? "开启化身行走，再走近它。"
                        : p.distance <= HARVEST_REACH
                          ? "就在身边，可以采摘了。"
                          : `距离约 ${p.distance.toFixed(1)} 米，走近一点。`}
                    </p>
                    <div className="star-actions">
                      <button
                        onClick={() => {
                          if (!p.walking) p.onWalk();
                          moveBus.send(p.node!.x, p.node!.z);
                        }}
                      >
                        走向这里
                      </button>
                      <button
                        className="star-primary"
                        disabled={
                          locked ||
                          p.distance === null ||
                          p.distance > HARVEST_REACH ||
                          stage.remaining > 0
                        }
                        onClick={() => void p.harvest()}
                      >
                        {p.node.material === "moonfruit" ? "采摘" : "捡起"}（E）
                      </button>
                    </div>
                  </>
                )}
              </div>
              <div className="star-card">
                <h3>伙伴点心</h3>
                <p>3 颗月光果，送给月亮伊布。已送出 {p.state.snacks} 份。</p>
                <button
                  disabled={
                    locked || p.state.materials.moonfruit < 3 || p.activeTrial
                  }
                  onClick={() => void p.snack()}
                >
                  送一份点心 · 月光果 −3
                </button>
              </div>
            </>
          )}
          {p.tab === "build" && (
            <>
              {p.preview ? (
                <div className="star-card">
                  <h3>摆放{playBlueprints[p.preview.item.blueprint].name}</h3>
                  <p>
                    点地面选位置；也可用箭头微调。确认建造才扣材料，移动和取消不扣材料。
                  </p>
                  <div className="star-actions">
                    {(
                      [
                        [-0.5, 0, "←"],
                        [0, -0.5, "↑"],
                        [0, 0.5, "↓"],
                        [0.5, 0, "→"],
                      ] as const
                    ).map(([x, z, label]) => (
                      <button
                        key={label}
                        aria-label={`移动${label}`}
                        onClick={() =>
                          p.changePreview({
                            x: p.preview!.placement.x + x,
                            z: p.preview!.placement.z + z,
                          })
                        }
                      >
                        {label}
                      </button>
                    ))}
                    <button
                      onClick={() =>
                        p.changePreview({
                          rotation: (p.preview!.placement.rotation + 1) % 4,
                        })
                      }
                    >
                      旋转 90°
                    </button>
                  </div>
                  <label>
                    颜色{" "}
                    <select
                      value={p.preview.placement.color}
                      onChange={(e) =>
                        p.changePreview({
                          color: e.target.value as PlayPlacement["color"],
                        })
                      }
                    >
                      <option value="gold">月光金</option>
                      <option value="mint">薄荷绿</option>
                      <option value="violet">星夜紫</option>
                      {p.state.starReward && (
                        <option value="star">试炼星纹</option>
                      )}
                    </select>
                  </label>
                  <p role="status">
                    {p.preview.error ?? "位置合适，可以摆放。"}
                  </p>
                  <div className="star-actions">
                    <button
                      disabled={p.busy}
                      onClick={() => p.setPreview(null)}
                    >
                      取消
                    </button>
                    <button
                      className="star-primary"
                      disabled={locked || !!p.preview.error}
                      onClick={async () => {
                        if (
                          await p.act(
                            p.preview!.isNew
                              ? {
                                  op: "build",
                                  blueprint: p.preview!.item.blueprint,
                                  placement: p.preview!.placement,
                                }
                              : {
                                  op: "place",
                                  id: p.preview!.item.id,
                                  placement: p.preview!.placement,
                                },
                          )
                        )
                          p.setPreview(null);
                      }}
                    >
                      {p.preview.isNew ? "确认建造并扣料" : "确认摆放"}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {Object.entries(playBlueprints).map(([id, b]) => (
                    <div className="star-card" key={id}>
                      <h3>{b.name}</h3>
                      <p>{b.note}</p>
                      <p>
                        {Object.entries(b.cost)
                          .map(
                            ([key, cost]) =>
                              `${materialNames[key as MaterialId]} ${p.state.materials[key as MaterialId]}/${cost}`,
                          )
                          .join(" · ")}
                      </p>
                      <button
                        disabled={
                          locked ||
                          p.activeTrial ||
                          p.state.structures.length >= 24 ||
                          Object.entries(b.cost).some(
                            ([key, cost]) =>
                              p.state.materials[key as MaterialId] < cost,
                          )
                        }
                        onClick={() => p.beginBlueprint(id as BlueprintId)}
                      >
                        预览蓝图
                      </button>
                    </div>
                  ))}
                  <h3>我的作品 · {p.state.structures.length}/24</h3>
                  <p>
                    移动不耗材料，收起仍保留作品。自由建造沿用原来的布置入口。
                  </p>
                  {p.state.structures.map((item) => (
                    <div key={item.id} className="star-card">
                      <h3>
                        {playBlueprints[item.blueprint].name} ·{" "}
                        {item.placement ? "已摆放" : "背包中"}
                      </h3>
                      <div className="star-actions">
                        <button
                          disabled={locked || p.activeTrial}
                          onClick={() => p.beginPlace(item)}
                        >
                          {item.placement ? "移动 / 配色" : "摆放"}
                        </button>
                        {item.placement && (
                          <button
                            disabled={locked || p.activeTrial}
                            onClick={() =>
                              void p.act({ op: "store", id: item.id })
                            }
                          >
                            收起
                          </button>
                        )}
                        {item.placement && item.blueprint === "mat" && (
                          <button
                            disabled={locked || p.activeTrial}
                            onClick={() => p.onItem(item.id)}
                          >
                            邀请休息
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
          {p.tab === "trial" && (
            <>
              <label className="trial-motion">
                <input
                  type="checkbox"
                  checked={p.motion}
                  onChange={(e) => p.setMotion(e.target.checked)}
                />
                播放战斗动画
              </label>
              {(!trial || trial.phase === "abandoned") && (
                <div className="star-card">
                  <h3>月亮伊布的星光投影</h3>
                  <p>
                    和训练星影练习观察与守护。没有倒计时，不损失材料或建筑；跳过也能完成观星角。
                  </p>
                </div>
              )}
              {trial && (
                <div className="star-card star-trial">
                  <h3>
                    {trial.phase === "won"
                      ? "试炼完成 ✧"
                      : trial.phase === "rest"
                        ? "休息一下，再试一次"
                        : trial.phase === "abandoned"
                          ? "已结束试炼"
                          : `第 ${p.displayTurn} 回合${trial.phase === "paused" ? " · 已暂停" : ""}`}
                  </h3>
                  <p>
                    月亮伊布 <strong>{trial.energy}/10</strong>　星影{" "}
                    <strong>{trial.shadow}/10</strong>
                  </p>
                  <div className="star-energy">
                    <progress
                      aria-label="月亮伊布能量"
                      value={trial.energy}
                      max={10}
                    />
                    <progress
                      aria-label="星影能量"
                      value={trial.shadow}
                      max={10}
                    />
                  </div>
                  <p>
                    行动点 {trial.points}/4
                    {trial.focused ? " · 已观察：下次光波 5 点" : ""}
                  </p>
                  <p
                    className="trial-turn-cue"
                    role="status"
                    aria-live="polite"
                  >
                    {p.cue.actor && <span aria-hidden="true">▼ </span>}
                    {p.cue.label}
                  </p>
                  {p.activeTrial && !p.effectBusy && (
                    <p className="star-intent">
                      {trialIntent(trial.turn).label}
                    </p>
                  )}
                  {trial.phase === "active" && (
                    <>
                      <div className="star-skills">
                        {trialSkillIds.slice(0, 3).map((id) => skillButton(id))}
                      </div>
                      <details className="trial-extra-skills">
                        <summary>更多招式 · 连击 / 突袭 / 恢复（4–6）</summary>
                        <div className="star-skills">
                          {trialSkillIds.slice(3).map((id) => skillButton(id))}
                        </div>
                      </details>
                      <p>每次选择都会推进一回合，星影行动后恢复 2 行动点。</p>
                      <button
                        disabled={locked}
                        aria-keyshortcuts="p"
                        onClick={() => void p.act({ op: "trial.pause" })}
                      >
                        暂停并保存{" "}
                        <kbd className="trial-key" aria-hidden="true">
                          P
                        </kbd>
                      </button>
                    </>
                  )}
                  {trial.phase === "paused" && (
                    <button
                      disabled={locked}
                      aria-keyshortcuts="p"
                      onClick={() => void p.act({ op: "trial.resume" })}
                    >
                      继续这个回合{" "}
                      <kbd className="trial-key" aria-hidden="true">
                        P
                      </kbd>
                    </button>
                  )}
                  {p.activeTrial && (
                    <button
                      disabled={locked}
                      onClick={() => void p.act({ op: "trial.leave" })}
                    >
                      结束本次试炼 · 无损失
                    </button>
                  )}
                  {p.activeTrial && (
                    <p className="trial-key-help">
                      键盘 1–6 出招 · P 暂停 / 继续 · Esc
                      收起。快捷键仅在此面板内有效，点选面板或用 Tab 移入即可。
                    </p>
                  )}
                  <p className="trial-feedback" aria-live="polite">
                    {p.effectBusy ? "正在展示这一回合…" : trial.log.at(-1)}
                  </p>
                  <details className="trial-history">
                    <summary>查看最近回合</summary>
                    <ol className="star-log" aria-label="最近回合">
                      {trial.log.map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ol>
                  </details>
                </div>
              )}
              {!p.activeTrial && (
                <button
                  className="star-primary"
                  disabled={locked}
                  onClick={() => {
                    p.setPreview(null);
                    void p.act({ op: "trial.start" });
                  }}
                >
                  开始星影试炼
                </button>
              )}
              {p.state.starReward && (
                <p>✧ 星纹灯色已解锁，去蓝图与作品里给观星灯换色吧。</p>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
