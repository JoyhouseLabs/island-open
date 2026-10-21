/** Read-aloud for lessons: server TTS (GLM-TTS wav) first, browser
 *  speechSynthesis as the always-works fallback. Call speak() directly
 *  inside a click handler — the AudioContext is unlocked there. */

let context: AudioContext | null = null;
let source: AudioBufferSourceNode | null = null;
let utterance: SpeechSynthesisUtterance | null = null;

/** Created synchronously in the click gesture so later starts are allowed. */
function audioContext(): AudioContext | null {
  try {
    if (!context) context = new AudioContext();
    if (context.state === "suspended") void context.resume();
    return context;
  } catch {
    return null;
  }
}

function zhVoice(): SpeechSynthesisVoice | null {
  try {
    return (
      speechSynthesis
        .getVoices()
        .find((v) => v.lang.toLowerCase().startsWith("zh")) ?? null
    );
  } catch {
    return null;
  }
}

export function stopSpeaking() {
  if (source) {
    try {
      source.stop();
    } catch {
      /* already stopped */
    }
    source = null;
  }
  if (utterance) {
    try {
      speechSynthesis.cancel();
    } catch {
      /* already stopped */
    }
    utterance = null;
  }
}

export function isSpeaking(): boolean {
  return !!source || !!utterance;
}

async function speakViaServer(
  text: string,
  onEnd: (() => void) | undefined,
): Promise<boolean> {
  try {
    const response = await fetch("/api/tutor/speech", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) return false;
    const bytes = await response.arrayBuffer();
    if (!bytes.byteLength) return false;
    const ctx = audioContext();
    if (!ctx) return false;
    const buffer = await ctx.decodeAudioData(bytes);
    stopSpeaking();
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.connect(ctx.destination);
    node.onended = () => {
      if (source === node) source = null;
      onEnd?.();
    };
    source = node;
    node.start();
    return true;
  } catch {
    return false;
  }
}

function speakViaBrowser(text: string, onEnd: (() => void) | undefined) {
  stopSpeaking();
  const line = new SpeechSynthesisUtterance(text);
  line.lang = "zh-CN";
  line.rate = 0.9;
  const voice = zhVoice();
  if (voice) line.voice = voice;
  line.onend = () => {
    if (utterance === line) utterance = null;
    onEnd?.();
  };
  utterance = line;
  try {
    speechSynthesis.speak(line);
  } catch {
    utterance = null;
    onEnd?.();
  }
}

export async function speak(
  text: string,
  opts: { onEnd?: () => void } = {},
): Promise<void> {
  // Unlock audio synchronously while we are still in the click gesture.
  audioContext();
  const played = await speakViaServer(text, opts.onEnd);
  if (!played) speakViaBrowser(text, opts.onEnd);
}
