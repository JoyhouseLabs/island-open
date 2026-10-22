import { useEffect, useRef, useState } from "react";
import { Send, Volume2, VolumeX, X } from "lucide-react";
import type { Season, Weather } from "@island/contracts";
import { streamChat } from "../tutor/chatClient";
import { isSpeaking, speak, stopSpeaking } from "../tutor/speech";
import { proximity } from "./proximity";
import { dialogue, useNpcChat } from "./store";

type Message = { role: "user" | "assistant"; content: string };

/**
 * The deep-chat panel behind the scripted greeting's 「再多聊聊」: a small
 * streaming conversation with any speaker that has a persona — an admin
 * companion, a built-in resident or a talking sign. The server keeps
 * per-account memory, so what a speaker remembers depends on who is talking
 * to it. Replies are read aloud (toggleable), like reading to the child.
 */
export default function NpcChat() {
  const session = useNpcChat(),
    [messages, setMessages] = useState<Message[]>([]),
    [input, setInput] = useState(""),
    [streaming, setStreaming] = useState(false),
    [error, setError] = useState(""),
    [voiceOn, setVoiceOn] = useState(true);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Each companion gets a fresh local transcript.
    setMessages([]);
    setInput("");
    setError("");
    stopSpeaking();
  }, [session?.subject]);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages, streaming]);
  useEffect(() => {
    if (!session) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        dialogue.closeNpc();
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [session]);
  useEffect(() => () => stopSpeaking(), []);
  if (!session) return null;
  const send = () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    setError("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setStreaming(true);
    const env = {
      weather: proximity.env.weather as Weather,
      season: proximity.env.season as Season,
      hour: proximity.env.night ? 21 : 10,
    };
    setMessages((m) => [...m, { role: "assistant", content: "" }]);
    let reply = "";
    void streamChat(
      "/api/npc/chat",
      {
        speakerId: session.subject,
        message: text,
        env,
        ...(session.world?.worldId
          ? { world: session.world.worldId, token: session.world.token }
          : {}),
      },
      {
        delta: (chunk) => {
          reply += chunk;
          setMessages((m) => {
            const last = m[m.length - 1]!;
            return last.role === "assistant"
              ? [...m.slice(0, -1), { role: "assistant", content: last.content + chunk }]
              : [...m, { role: "assistant", content: chunk }];
          });
        },
        done: () => {
          setStreaming(false);
          if (reply && voiceOn && !isSpeaking()) void speak(reply.slice(0, 300));
        },
        error: (code, message) => {
          setStreaming(false);
          setError(message);
          setMessages((m) => {
            const last = m[m.length - 1]!;
            return last.role === "assistant" && !last.content
              ? m.slice(0, -1)
              : m;
          });
        },
      },
      undefined,
      session.name,
    );
  };
  return (
    <div className="npc-chat" role="dialog" aria-label={`和${session.name}聊天`}>
      <header>
        <strong>{session.name}</strong>
        <span className="npc-chat-hint">智能对话</span>
        <button
          aria-label={voiceOn ? "关闭语音" : "打开语音"}
          title={voiceOn ? "关闭语音" : "打开语音"}
          onClick={() => {
            setVoiceOn((v) => !v);
            stopSpeaking();
          }}
        >
          {voiceOn ? <Volume2 size={15} /> : <VolumeX size={15} />}
        </button>
        <button aria-label="结束聊天" onClick={() => dialogue.closeNpc()}>
          <X size={15} />
        </button>
      </header>
      <div className="npc-chat-log" ref={scroller}>
        {messages.map((m, i) => (
          <p key={i} className={m.role}>
            {m.content || (streaming && i === messages.length - 1 ? "…" : "")}
          </p>
        ))}
        {!messages.length && (
          <p className="assistant">
            打个招呼吧。{session.name}记得和你说过的每件事。
          </p>
        )}
      </div>
      {error && <p className="npc-chat-error">{error}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`跟${session.name}说点什么…`}
          maxLength={400}
          autoFocus
        />
        <button type="submit" disabled={!input.trim() || streaming} aria-label="发送">
          <Send size={15} />
        </button>
      </form>
    </div>
  );
}
