import { useEffect, useRef, useState } from "react";
import {
  Mic,
  Send,
  SlidersHorizontal,
  Square,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import type { Season, Weather } from "@island/contracts";
import { streamChat } from "../tutor/chatClient";
import { isSpeaking, speak, stopSpeaking } from "../tutor/speech";
import {
  dictationSupported,
  startDictation,
  transcribe,
  type DictationSession,
} from "../tutor/asr";
import { intelligenceStatus } from "../contentStore";
import { proximity } from "./proximity";
import { dialogue, useNpcChat } from "./store";
import { getVoicePrefs, setVoicePref, useVoicePrefs } from "./voicePrefs";
import { VoicePrefsPanel } from "./VoicePrefsPanel";

type Message = { role: "user" | "assistant"; content: string };

/**
 * The deep-chat panel behind the scripted greeting's 「再多聊聊」: a small
 * streaming conversation with any speaker that has a persona — an admin
 * companion, a built-in resident or a talking sign. The server keeps
 * per-account memory, so what a speaker remembers depends on who is talking
 * to it. Replies are read aloud (toggleable), like reading to the child,
 * and a mic button speaks for the child: recognized text goes in (auto-send)
 * and with 「读完自动听我说」the chat keeps flowing by voice alone.
 */
export default function NpcChat() {
  const session = useNpcChat(),
    prefs = useVoicePrefs(),
    [messages, setMessages] = useState<Message[]>([]),
    [input, setInput] = useState(""),
    [streaming, setStreaming] = useState(false),
    [error, setError] = useState(""),
    [asrOn, setAsrOn] = useState(false),
    [showPrefs, setShowPrefs] = useState(false),
    [mic, setMic] = useState<"idle" | "recording" | "recognizing">("idle");
  const scroller = useRef<HTMLDivElement>(null);
  const micSession = useRef<DictationSession | null>(null);
  const micAbort = useRef<AbortController | null>(null);
  // Latest-state mirrors so the TTS onEnd and the 30s auto-stop reach the
  // freshest handlers instead of stale render closures.
  const inputRef = useRef("");
  inputRef.current = input;
  const micRef = useRef(mic);
  micRef.current = mic;
  const openMicRef = useRef<() => void>(() => {});
  const stopMicRef = useRef<() => void>(() => {});

  // Voice dictation needs a configured ASR backend; without it the mic
  // button stays hidden and typing works as before.
  useEffect(() => {
    void intelligenceStatus().then((s) => setAsrOn(s.asr));
  }, []);
  const micAvailable = asrOn && dictationSupported();

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
        cancelMic();
        dialogue.closeNpc();
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [session]);
  useEffect(
    () => () => {
      micSession.current?.cancel();
      micAbort.current?.abort();
      stopSpeaking();
    },
    [],
  );
  if (!session) return null;
  const send = (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || streaming) return;
    setInput("");
    setError("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setStreaming(true);
    // Only pages with a real environment report it; others let the speaker
    // talk without a fabricated season or weather.
    const env = proximity.envKnown
      ? {
          weather: proximity.env.weather as Weather,
          season: proximity.env.season as Season,
          hour: proximity.env.night ? 21 : 10,
        }
      : undefined;
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
          const p = getVoicePrefs();
          if (reply && p.autoTts && !isSpeaking())
            void speak(reply.slice(0, 300), {
              onEnd: () => {
                const q = getVoicePrefs();
                // Hands-free: when the reply is read out, the mic reopens —
                // unless the child is already typing something.
                if (q.autoListen && !inputRef.current) openMicRef.current();
              },
            });
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

  const cancelMic = () => {
    micSession.current?.cancel();
    micSession.current = null;
    micAbort.current?.abort();
    micAbort.current = null;
    setMic("idle");
  };
  const openMic = () => {
    if (micRef.current !== "idle" || streaming) return;
    setError("");
    // The tail of a read-aloud must not leak into the recording.
    stopSpeaking();
    startDictation()
      .then((session) => {
        micSession.current = session;
        setMic("recording");
        session.onAutoStop = () => stopMicRef.current();
      })
      .catch((e: unknown) => {
        setError(
          e instanceof DOMException && e.name === "NotAllowedError"
            ? "麦克风没有打开，请让爸爸妈妈在浏览器里允许麦克风。"
            : "没有找到麦克风，试试用 Chrome 或 Safari。",
        );
      });
  };
  const stopMic = () => {
    const session = micSession.current;
    if (micRef.current !== "recording" || !session) return;
    micSession.current = null;
    setMic("recognizing");
    void (async () => {
      try {
        const blob = await session.stop();
        if (!blob) {
          // A stray tap, not speech — not worth an error.
          setMic("idle");
          return;
        }
        const abort = new AbortController();
        micAbort.current = abort;
        const text = await transcribe(blob, abort.signal);
        micAbort.current = null;
        setMic("idle");
        const trimmed = text.trim();
        if (!trimmed) {
          setError("没听清，再说一次试试。");
          return;
        }
        if (getVoicePrefs().autoSend) send(trimmed);
        else setInput(trimmed);
      } catch {
        micAbort.current = null;
        setMic("idle");
        setError("没听清，再说一次试试。");
      }
    })();
  };
  openMicRef.current = openMic;
  stopMicRef.current = stopMic;

  return (
    <div className="npc-chat" role="dialog" aria-label={`和${session.name}聊天`}>
      <header>
        <strong>{session.name}</strong>
        <span className="npc-chat-hint">智能对话</span>
        <button
          aria-label="语音设置"
          title="语音设置"
          className={showPrefs ? "on" : undefined}
          onClick={() => setShowPrefs((v) => !v)}
        >
          <SlidersHorizontal size={15} />
        </button>
        <button
          aria-label={prefs.autoTts ? "关闭语音" : "打开语音"}
          title={prefs.autoTts ? "关闭语音" : "打开语音"}
          onClick={() => {
            setVoicePref("autoTts", !prefs.autoTts);
            stopSpeaking();
          }}
        >
          {prefs.autoTts ? <Volume2 size={15} /> : <VolumeX size={15} />}
        </button>
        <button
          aria-label="结束聊天"
          onClick={() => {
            cancelMic();
            dialogue.closeNpc();
          }}
        >
          <X size={15} />
        </button>
      </header>
      {showPrefs && <VoicePrefsPanel />}
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
        {micAvailable &&
          (mic === "recording" ? (
            <button
              type="button"
              className="npc-mic dictating"
              aria-label="停止说话"
              title="停止说话"
              onClick={stopMic}
            >
              <span className="mic-dot" />
              <Square size={12} />
            </button>
          ) : (
            <button
              type="button"
              className="npc-mic"
              aria-label={mic === "recognizing" ? "正在想…" : "开始说话"}
              title={mic === "recognizing" ? "正在想…" : "点一下开始说话"}
              disabled={mic === "recognizing" || streaming}
              onClick={openMic}
            >
              <Mic size={16} />
            </button>
          ))}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            mic === "recording"
              ? "正在听你说……"
              : mic === "recognizing"
                ? "正在想你说的话……"
                : `跟${session.name}说点什么…`
          }
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
