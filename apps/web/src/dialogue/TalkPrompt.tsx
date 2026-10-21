import { useEffect } from "react";
import { Footprints } from "lucide-react";
import { proximity, useNearSpeaker } from "./proximity";
import { dialogue, useDialogue, useNpcChat, usePlayerChat } from "./store";

/**
 * Renders nothing until someone is in talking range; then a soft chip
 * invites the player to press 空格 (or tap it) to start a conversation.
 * Also owns the global Space shortcut that starts the talk.
 */
export default function TalkPrompt() {
  const speaker = useNearSpeaker();
  const open = useDialogue(),
    npc = useNpcChat(),
    playerChat = usePlayerChat();

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.code !== "Space" || dialogue.open || dialogue.npc || dialogue.playerChat)
        return;
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      const near = proximity.speaker;
      if (near) {
        e.preventDefault();
        dialogue.requestTalk(near);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  if (!speaker || open || npc || playerChat) return null;
  const name = speaker.name ?? speaker.kind;
  const verb =
    speaker.kind === "tutor"
      ? `向${name}请教`
      : speaker.kind === "visitor"
        ? `和${name}打个招呼`
        : `和${name}说说话`;
  return (
    <button
      className="talk-prompt"
      onClick={() => dialogue.requestTalk(speaker)}
      aria-label={verb}
    >
      <Footprints size={13} />
      空格 · {verb}
    </button>
  );
}
