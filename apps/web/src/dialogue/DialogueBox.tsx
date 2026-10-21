import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { dialogue, useDialogue } from "./store";

const speakerColors: Record<string, string> = {
  panda: "#f2f0e8",
  giraffe: "#d9b56a",
  wolf: "#8d939e",
  fox: "#e8975f",
  tutor: "#4a5a74",
  player: "#8fa3b0",
};

/** Game-style bottom dialogue: typewriter text, then choices. */
export default function DialogueBox() {
  const open = useDialogue();
  const [shown, setShown] = useState(0);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    setShown(0);
    if (!open) return;
    const text = open.node.text;
    window.clearInterval(timer.current);
    timer.current = window.setInterval(() => {
      setShown((n) => {
        if (n >= text.length) {
          window.clearInterval(timer.current);
          return n;
        }
        return n + 1;
      });
    }, 26);
    return () => window.clearInterval(timer.current);
  }, [open]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "Escape") {
        dialogue.close();
        return;
      }
      if (e.code !== "Space") return;
      e.preventDefault();
      const full = open.node.text.length;
      if (shown < full) setShown(full);
      else if (!open.node.choices) dialogue.continueTalking();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open, shown]);

  if (!open) return null;
  const full = open.node.text;
  const done = shown >= full.length;
  const color = speakerColors[open.speaker.kind] ?? "#9aac8f";
  const hasChoices = !!open.node.choices?.length;
  return (
    <div className="dialogue-layer" role="dialog" aria-label={`与${open.speaker.name ?? "朋友"}对话`}>
      <div className="dialogue-box">
        <span className="dialogue-portrait" style={{ background: color }} />
        <div className="dialogue-main">
          <span className="dialogue-name">{open.speaker.name ?? open.speaker.kind}</span>
          <p className="dialogue-text">
            {full.slice(0, shown)}
            {!done && <i className="dialogue-caret">▌</i>}
          </p>
          {done && hasChoices && (
            <div className="dialogue-choices">
              {open.node.choices!.map((c) => (
                <button key={c.label} onClick={() => dialogue.choose(c.label)}>
                  {c.label}
                </button>
              ))}
            </div>
          )}
          {done && !hasChoices && (
            <div className="dialogue-choices">
              <button onClick={() => dialogue.continueTalking()}>还想聊聊</button>
              <button onClick={() => dialogue.close()}>再见</button>
            </div>
          )}
        </div>
        <button
          className="dialogue-close"
          aria-label="结束对话"
          onClick={() => dialogue.close()}
        >
          <X size={16} />
        </button>
      </div>
      <p className="dialogue-hint">空格 继续 · Esc 结束</p>
    </div>
  );
}
