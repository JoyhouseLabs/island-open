/** Browser-side dictation: MediaRecorder captures the child's voice, the
 *  blob posts to /api/tutor/asr, and the server relays it to DashScope's
 *  ASR model for text. Used by every dialogue panel that has a mic button. */

/** The 30s safety cap so a forgotten mic cannot record forever. */
const MAX_MS = 30_000;
/** Anything shorter is a stray tap, not speech. */
const MIN_MS = 300;

export function dictationSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined" &&
    supportedMime() !== null
  );
}
/** Desktop browsers record webm/opus; iOS Safari only offers mp4. */
function supportedMime(): string | null {
  try {
    if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus"))
      return "audio/webm;codecs=opus";
    if (MediaRecorder.isTypeSupported("audio/mp4")) return "audio/mp4";
  } catch {
    /* Older Safari throws on unknown types. */
  }
  return null;
}

export type DictationSession = {
  /** Stop and collect the recording; null when it was just a stray tap. */
  stop: () => Promise<Blob | null>;
  /** Abandon the recording; nothing is uploaded. */
  cancel: () => void;
  /** Fired once at the 30s cap, as if the child released the mic. */
  onAutoStop?: () => void;
};

export async function startDictation(): Promise<DictationSession> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
  });
  const mime = supportedMime() ?? "audio/webm;codecs=opus";
  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(stream, { mimeType: mime });
  const began = performance.now();
  let settled = false;
  let cancelled = false;
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const finish = (): Promise<Blob | null> => {
    if (settled) return Promise.resolve(null);
    settled = true;
    window.clearTimeout(cap);
    return new Promise((resolve) => {
      const teardown = () => {
        for (const track of stream.getTracks()) track.stop();
      };
      recorder.onstop = () => {
        teardown();
        resolve(
          cancelled || performance.now() - began < MIN_MS
            ? null
            : new Blob(chunks, { type: mime.split(";")[0]! }),
        );
      };
      try {
        recorder.stop();
      } catch {
        teardown();
        resolve(null);
      }
    });
  };
  let session: DictationSession;
  const cap = window.setTimeout(() => {
    session.onAutoStop?.();
    void finish();
  }, MAX_MS);
  recorder.start();
  session = {
    stop: finish,
    cancel: () => {
      cancelled = true;
      void finish();
    },
  };
  return session;
}

/** One recording in, one line of text out. Throws with the server's
 *  friendly message (没听清，再说一次试试) on any failure. */
export async function transcribe(
  blob: Blob,
  signal?: AbortSignal,
): Promise<string> {
  const ext = blob.type === "audio/mp4" ? "mp4" : "webm";
  const form = new FormData();
  form.append("file", blob, `speech.${ext}`);
  const response = await fetch("/api/tutor/asr", {
    method: "POST",
    credentials: "same-origin",
    body: form,
    signal: signal ?? AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(detail?.error?.message || "没听清，再说一次试试。");
  }
  const body = (await response.json()) as { text?: unknown };
  return typeof body.text === "string" ? body.text : "";
}
