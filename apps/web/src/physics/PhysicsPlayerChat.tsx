import { useEffect } from "react";
import { X } from "lucide-react";
import { dialogue, usePlayerChat } from "../dialogue/store";
import { EMOTES, PHRASES } from "../presence/phrases";
import type { PhysicsConnection } from "./PhysicsConnection";

/**
 * Quick-phrase chat with another player in a physics room: picking one sends
 * the bubble through the room connection — the sender sees it locally right
 * away, everyone else sees it float over the sender's head.
 */
export default function PhysicsPlayerChat({
  conn,
}: {
  conn: PhysicsConnection;
}) {
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
    conn.sendBubble(bubble);
    // Local echo: the room broadcast comes back to the sender as well.
    dialogue.closePlayerChat();
  };
  return (
    <div className="player-chat-layer">
      <div
        className="player-chat"
        role="dialog"
        aria-label={`和${chat.name}对话`}
      >
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
              aria-label={e.label}
              onClick={() => say({ emote: e.id })}
            >
              {e.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
