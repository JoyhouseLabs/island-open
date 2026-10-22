import { useEffect, useRef, useState } from "react";
import {
  Mic,
  Send,
  SlidersHorizontal,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { TutorChatRequest, TutorStatus } from "@island/contracts";
import { fetchTutorStatus, streamTutorChat } from "./chatClient";
import { isSpeaking, speak, stopSpeaking } from "./speech";
import {
  dictationSupported,
  startDictation,
  transcribe,
  type DictationSession,
} from "./asr";
import {
  getVoicePrefs,
  setVoicePref,
  useVoicePrefs,
} from "../dialogue/voicePrefs";
import { VoicePrefsPanel } from "../dialogue/VoicePrefsPanel";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  at: number;
};
type ChatItem = ChatMessage & { streaming?: boolean };
export type AskCommand = { text: string; nonce: number } | null;

const HISTORY_WINDOW = 10;
const SAVED_MESSAGES = 30;

/**
 * The docked half of 小墨老师: a lesson-scoped chat pane. Quick actions
 * and free questions both stream through /api/tutor/chat with the chapter
 * (and current line) as context. History is owned by the parent and
 * persisted per chapter. With a configured ASR backend the child can talk
 * instead of typing: recognized text sends itself, and the reply is read
 * aloud (再听我说) for fully hands-free reading help.
 */
export function TutorChat({
  bookId,
  chapterId,
  lineIndex,
  lines,
  history,
  onHistory,
  ask,
}: {
  bookId: string | null;
  chapterId: string | null;
  lineIndex: number | null;
  lines: string[];
  history: ChatMessage[];
  onHistory: (next: ChatMessage[]) => void;
  ask?: AskCommand;
}) {
  const prefs = useVoicePrefs(),
    [status, setStatus] = useState<TutorStatus | null>(null),
    [messages, setMessages] = useState<ChatItem[]>(history),
    [input, setInput] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [showPrefs, setShowPrefs] = useState(false),
    [mic, setMic] = useState<"idle" | "recording" | "recognizing">("idle");
  const logRef = useRef<HTMLDivElement>(null),
    abortRef = useRef<AbortController | null>(null),
    lastNonce = useRef(0);
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
  useEffect(() => {
    fetchTutorStatus()
      .then(setStatus)
      .catch(() => setStatus({ chat: false, speech: false, asr: false, model: null }));
  }, []);
  // A chapter switch loads that chapter's saved conversation.
  useEffect(() => {
    setMessages(history.slice(-SAVED_MESSAGES));
    setError("");
  }, [chapterId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const node = logRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages]);
  useEffect(
    () => () => {
      abortRef.current?.abort();
      micSession.current?.cancel();
      micAbort.current?.abort();
      stopSpeaking();
    },
    [],
  );
  const micAvailable = !!status?.asr && dictationSupported();
  const currentLine = lineIndex == null ? null : (lines[lineIndex] ?? null);
  const send = (question: string) => {
    const trimmed = question.trim().slice(0, 400);
    if (!trimmed || busy || !bookId || !chapterId || !status?.chat) return;
    setError("");
    setInput("");
    const sent: ChatItem[] = [
      ...messages,
      { role: "user", content: trimmed, at: Date.now() },
      { role: "assistant", content: "", at: Date.now(), streaming: true },
    ];
    setMessages(sent);
    setBusy(true);
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    const request: TutorChatRequest = {
      bookId,
      chapterId,
      lineIndex: lineIndex ?? undefined,
      question: trimmed,
      history: messages
        .filter((m) => !m.streaming && m.content)
        .slice(-HISTORY_WINDOW)
        .map(({ role, content }) => ({ role, content })),
    };
    const patch = (content: string, streaming: boolean) =>
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last) next[next.length - 1] = { ...last, content, streaming };
        return next;
      });
    let acc = "";
    streamTutorChat(
      request,
      {
        delta: (text) => {
          acc += text;
          patch(acc, true);
        },
        done: () => {
          setBusy(false);
          setMessages((prev) => {
            const next = prev.map((m) => ({ ...m, streaming: false }));
            onHistory(
              next
                .filter((m) => m.content)
                .slice(-SAVED_MESSAGES)
                .map(({ role, content, at }) => ({ role, content, at })),
            );
            return next;
          });
          const p = getVoicePrefs();
          if (acc && p.autoTts && !isSpeaking())
            void speak(acc.slice(0, 300), {
              onEnd: () => {
                const q = getVoicePrefs();
                // Hands-free: when the reply is read out, the mic reopens —
                // unless the child is already typing something.
                if (q.autoListen && !inputRef.current) openMicRef.current();
              },
            });
        },
        error: (code, message) => {
          setBusy(false);
          setError(message);
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && !last.content) next.pop();
            else if (last) next[next.length - 1] = { ...last, streaming: false };
            return next;
          });
          if (code === "TUTOR_NOT_CONFIGURED") setStatus(null);
        },
      },
      abort.signal,
    ).catch(() => {
      setBusy(false);
    });
  };
  // Quick actions fired from the reader tools arrive as ask commands.
  useEffect(() => {
    if (ask && ask.nonce !== lastNonce.current) {
      lastNonce.current = ask.nonce;
      send(ask.text);
    }
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const cancelMic = () => {
    micSession.current?.cancel();
    micSession.current = null;
    micAbort.current?.abort();
    micAbort.current = null;
    setMic("idle");
  };
  const openMic = () => {
    if (micRef.current !== "idle" || busy) return;
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

  const quick = [
    currentLine
      ? { label: "讲解这一句", text: `请讲解这一句：「${currentLine}」` }
      : null,
    { label: "考考我", text: "就这一课考我一个小问题，先别说答案。" },
    currentLine
      ? { label: "标注拼音", text: `请给这一句标注拼音并领读一遍：「${currentLine}」` }
      : null,
  ].filter((q): q is { label: string; text: string } => !!q);
  return (
    <div className="tutor-pane">
      <div className="tutor-head">
        <span className="tutor-badge" aria-hidden>
          <Sparkles size={14} />
        </span>
        <div>
          <strong>小墨老师</strong>
          <small>
            {status?.chat ? "陪你读这一课" : "今天不在书屋里"}
          </small>
        </div>
        <div className="tutor-voice-controls">
          <button
            aria-label="语音设置"
            title="语音设置"
            className={showPrefs ? "on" : undefined}
            onClick={() => setShowPrefs((v) => !v)}
          >
            <SlidersHorizontal size={14} />
          </button>
          <button
            aria-label={prefs.autoTts ? "关闭语音" : "打开语音"}
            title={prefs.autoTts ? "关闭语音" : "打开语音"}
            onClick={() => {
              setVoicePref("autoTts", !prefs.autoTts);
              stopSpeaking();
            }}
          >
            {prefs.autoTts ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>
        </div>
      </div>
      {showPrefs && <VoicePrefsPanel />}
      {!bookId || !chapterId ? (
        <p className="tutor-note">先从书架上选一本书，老师就来陪你读。</p>
      ) : status && !status.chat ? (
        <p className="tutor-note">
          老师今天不在书屋里，先把课文读给小墨听吧。（稍后再来问问题）
        </p>
      ) : (
        <>
          <div className="tutor-log" ref={logRef}>
            {messages.length === 0 && (
              <p className="tutor-note">
                问问「小墨老师」这一课的意思，或点下面的快捷问题。
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`tutor-msg ${m.role}`}>
                {m.content || (m.streaming ? "" : "…")}
                {m.streaming && <span className="tutor-streaming" />}
              </div>
            ))}
            {error && <p className="tutor-note">{error}</p>}
          </div>
          <div className="tutor-quick">
            {quick.map((q) => (
              <button
                key={q.label}
                className="small-button"
                disabled={busy}
                onClick={() => send(q.text)}
              >
                {q.label}
              </button>
            ))}
          </div>
          <form
            className="tutor-compose"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            {micAvailable &&
              (mic === "recording" ? (
                <button
                  type="button"
                  className="tutor-mic dictating"
                  aria-label="停止说话"
                  title="停止说话"
                  onClick={stopMic}
                >
                  <span className="mic-dot" />
                  <Square size={11} />
                </button>
              ) : (
                <button
                  type="button"
                  className="tutor-mic"
                  aria-label={mic === "recognizing" ? "正在想…" : "开始说话"}
                  title={mic === "recognizing" ? "正在想…" : "点一下开始说话"}
                  disabled={mic === "recognizing" || busy}
                  onClick={openMic}
                >
                  <Mic size={15} />
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
                    : "问老师这一课的任何问题…"
              }
              maxLength={400}
              disabled={busy}
              aria-label="问小墨老师"
            />
            <button
              type="submit"
              className="small-button"
              disabled={busy || !input.trim()}
              aria-label="发送"
            >
              <Send size={14} />
            </button>
          </form>
        </>
      )}
    </div>
  );
}
