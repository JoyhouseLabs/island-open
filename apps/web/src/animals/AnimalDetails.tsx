import { ResidentMemoryContent, useResidentMind } from "./mind";
import {
  Component,
  Suspense,
  lazy,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { X, Hand, MessageCircle } from "lucide-react";
import { speciesProfiles, type IntelligenceStatus } from "@island/contracts";
import { animalDetails, type AnimalSelection } from "./detailsStore";
import { agentById, playerAgent } from "./registry";
import { personaFor } from "./personas";
import { featuresStatus, intelligenceStatus } from "../contentStore";
import {
  dialogue,
  useDialogue,
  useNpcChat,
  usePlayerChat,
} from "../dialogue/store";
import "./animal-details.css";

const Portrait = lazy(() => import("./AnimalPortrait"));
const interests = {
  water: "池塘与水边",
  flower: "花丛",
  tree: "树荫",
  bench: "长椅",
  grass: "草地",
};
const actions: Record<string, string> = {
  none: "自在休息",
  sniff: "闻闻周围",
  rest: "正在休息",
  browse: "看看植物",
  drink: "在水边喝水",
  greet: "打个招呼",
  pet: "享受摸摸",
};
class PortraitBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <p className="animal-portrait-fallback">
        立体预览暂不可用，仍可查看档案。
      </p>
    ) : (
      this.props.children
    );
  }
}

function Details({ animal }: { animal: AnimalSelection }) {
  const mind = useResidentMind(animal.id);
  const displayName = mind.view?.config.name || animal.name;
  const [tab, setTab] = useState<"profile" | "history" | "model">("profile");
  const [status, setStatus] = useState<IntelligenceStatus | null>(null);
  const [live, setLive] = useState(() => agentById(animal.id));
  const [feedback, setFeedback] = useState("");
  const closeButton = useRef<HTMLButtonElement>(null);
  const open = useDialogue(),
    npc = useNpcChat(),
    playerChat = usePlayerChat();
  const talking = !!open || !!npc || !!playerChat;
  useEffect(() => {
    let alive = true;
    void Promise.all([intelligenceStatus(), featuresStatus()]).then(
      ([next]) => {
        if (alive) setStatus(next);
      },
    );
    const timer = window.setInterval(() => setLive(agentById(animal.id)), 500);
    closeButton.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !dialogue.open && !dialogue.npc)
        animalDetails.close();
    };
    window.addEventListener("keydown", key);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("keydown", key);
    };
  }, [animal.id]);
  const profile = speciesProfiles[animal.species];
  const persona = personaFor(animal.id);
  const deepChat =
    !!status?.npc && !!persona && mind.view?.config.enabled !== false;
  const messages = animalDetails.history(animal.id);
  const traits =
    mind.view?.config.persona ?? persona?.persona ?? profile.persona;
  const talk = () => {
    const agent = agentById(animal.id);
    if (!agent) {
      setFeedback("这位伙伴已经离开这里，重新点选一下吧。");
      return;
    }
    const player = playerAgent();
    dialogue.requestTalk({
      ...agent,
      id: animal.id,
      distance: player ? Math.hypot(agent.x - player.x, agent.z - player.z) : 0,
    });
    animalDetails.close();
  };
  return (
    <aside
      className="animal-details"
      role="dialog"
      aria-label={`${animal.name}的伙伴档案`}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !talking) animalDetails.close();
        e.stopPropagation();
      }}
    >
      <header className="animal-details-heading">
        <div>
          <span className="animal-eyebrow">岛上的伙伴</span>
          <h2>{displayName}</h2>
          <p>
            {profile.label} · {interests[animal.prefer]}
          </p>
        </div>
        <button
          ref={closeButton}
          className="animal-close"
          aria-label="关闭伙伴档案"
          onClick={animalDetails.close}
        >
          <X size={22} />
        </button>
      </header>
      <div className="animal-portrait" aria-label={`${animal.name}的立体造型`}>
        <PortraitBoundary>
          <Suspense
            fallback={
              <p className="animal-portrait-fallback">伙伴正在转过身来…</p>
            }
          >
            <Portrait species={animal.species} />
          </Suspense>
        </PortraitBoundary>
        <span className="animal-state">
          {actions[live?.action ?? "none"] ?? "在岛上活动"}
        </span>
      </div>
      <div className="animal-actions">
        <button
          onClick={() => {
            animal.pet();
            setFeedback(`${animal.name}收到了你的摸摸。`);
          }}
          disabled={talking}
        >
          <Hand size={17} />
          摸摸
        </button>
        <button onClick={talk} disabled={talking}>
          <MessageCircle size={17} />
          说说话
        </button>
      </div>
      <p className="animal-feedback" role="status">
        {feedback || "拖动预览，可以看看伙伴的另一面。"}
      </p>
      <nav className="animal-tabs" aria-label="伙伴档案栏目">
        {(
          [
            ["profile", "属性与能力"],
            ["history", "对话记录"],
            ["model", "角色与模型"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            aria-pressed={tab === value}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="animal-details-body">
        {tab === "profile" && (
          <>
            <section>
              <h3>认识我</h3>
              <dl>
                <div>
                  <dt>性格设定</dt>
                  <dd>{traits.temperament}</dd>
                </div>
                <div>
                  <dt>说话风格</dt>
                  <dd>{traits.speechStyle}</dd>
                </div>
                <div>
                  <dt>爱去的地方</dt>
                  <dd>{interests[animal.prefer]}</dd>
                </div>
              </dl>
            </section>
            <section>
              <h3>我现在会做什么</h3>
              <ul className="animal-abilities">
                <li>
                  <strong>散步与探索</strong>
                  <span>在自己的活动范围里走走看看。</span>
                </li>
                <li>
                  <strong>回应摸摸</strong>
                  <span>用动作和爱心回应你；叫声遵循动物声音开关。</span>
                </li>
                <li>
                  <strong>跟你走一小段</strong>
                  <span>靠近时，有机会跟着你散步。</span>
                </li>
                {animal.prefer === "water" && (
                  <li>
                    <strong>到水边喝水</strong>
                    <span>寻找水边，低下头来喝水。</span>
                  </li>
                )}
                {animal.prefer === "bench" && (
                  <li>
                    <strong>找地方休息</strong>
                    <span>走到喜欢的长椅附近歇一歇。</span>
                  </li>
                )}
                {profile.behavior.browse === animal.prefer && (
                  <li>
                    <strong>看看植物</strong>
                    <span>走向喜欢的植物，低头或探身观察。</span>
                  </li>
                )}
                <li>
                  <strong>日常对话</strong>
                  <span>打招呼、聊一聊岛上的小事。</span>
                </li>
                <li>
                  <strong>
                    智能对话{" "}
                    <small>
                      {deepChat ? "已开启" : status ? "暂未开启" : "读取中"}
                    </small>
                  </strong>
                  <span>
                    {deepChat
                      ? "在对话里选“再多聊聊”，可以继续提问。"
                      : "启用后可由大模型回答更多问题。"}
                  </span>
                </li>
              </ul>
            </section>
          </>
        )}
        {tab === "history" && (
          <section>
            <h3>这次在岛上聊过的话</h3>
            <p className="animal-note">
              只显示本次会话已记录的内容，最多保留最近 40
              条。刷新、退出账号或切换家园后清空。
            </p>
            {messages.length ? (
              <>
                <ol className="animal-history">
                  {messages.map((m, i) => (
                    <li key={i} className={m.role}>
                      <span>
                        {m.role === "user" ? "我" : animal.name} ·{" "}
                        {m.source === "ai" ? "智能对话" : "日常对话"}
                      </span>
                      <p>{m.text}</p>
                    </li>
                  ))}
                </ol>
                <button
                  className="animal-clear"
                  onClick={() => animalDetails.clearHistory(animal.id)}
                >
                  清空这份记录
                </button>
              </>
            ) : (
              <p className="animal-empty">
                还没有记录。点“说说话”，打个招呼吧。
              </p>
            )}
          </section>
        )}
        {tab === "model" && (
          <>
            <ResidentMemoryContent mind={mind} />
          </>
        )}
      </div>
    </aside>
  );
}

export default function AnimalDetails({ scope }: { scope: string }) {
  useSyncExternalStore(animalDetails.subscribe, animalDetails.getVersion);
  useEffect(() => {
    animalDetails.bind(scope);
    dialogue.close();
    dialogue.closeNpc();
    return () => {
      if (animalDetails.scope === scope) {
        animalDetails.bind(null);
        dialogue.close();
        dialogue.closeNpc();
      }
    };
  }, [scope]);
  const selected = animalDetails.selected;
  if (!selected || animalDetails.scope !== scope) return null;
  return <Details key={selected.id} animal={selected} />;
}
