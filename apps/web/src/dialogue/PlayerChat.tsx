import { useEffect } from "react";
import { X } from "lucide-react";
import { dialogue, usePlayerChat } from "./store";
import { presence } from "../presence/client";
import { PHRASES, EMOTES } from "../presence/phrases";

/**
 * Talking with another player: quick phrases and emotes instead of free
 * text (the wire protocol only carries enum ids). Picking one sends the
 * bubble to the room — the sender sees it locally right away, everyone
 * else sees it float over the sender's head.
 */
export default function PlayerChat() {
  const chat = usePlayerChat();

  useEffect(() => {
    if (!chat) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") dialogue.closePlayerChat();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [chat]);

  if (!chat) return null;
  const say = (bubble: { phrase?: string; emote?: string }) => {
    presence.sendBubble(bubble);
    dialogue.closePlayerChat();
  };
  return (
    <div className="player-chat-layer">
      <div className="player-chat" role="dialog" aria-label={`和${chat.name}对话`}>
        <header>
          <span>想对 {chat.name} 说——</span>
          <button
            className="dialogue-close"
            onClick={() => dialogue.closePlayerChat()}
            aria-label="关闭"
          >
            <X size={15} />
          </button>
        </header>
        <div className="player-chat-choices">
          {PHRASES.map((p) => (
            <button key={p.id} onClick={() => say({ phrase: p.id })}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="player-chat-emotes">
          {EMOTES.map((e) => (
            <button
              key={e.id}
              onClick={() => say({ emote: e.id })}
              aria-label={`发送${e.label}`}
            >
              {e.label}
            </button>
          ))}
        </div>
        <p className="player-chat-hint">选一句，对方头顶会出现气泡</p>
      </div>
    </div>
  );
}
