import type { TutorChatRequest, TutorStatus } from "@island/contracts";
import { api } from "../api";

/** Live handlers for a streaming tutor answer. `error` and `done` are
 *  mutually terminal: only the first one fires. */
export type TutorStreamHandlers = {
  delta: (text: string) => void;
  done: () => void;
  error: (code: string, message: string) => void;
};

export function fetchTutorStatus(): Promise<TutorStatus> {
  return api<TutorStatus>("/tutor/status");
}

/** Streams any SSE chat endpoint. Deliberately not api(): that wrapper forces
 *  response.json() and a 12s timeout, both fatal for a long stream. */
export async function streamChat(
  endpoint: string,
  body: unknown,
  on: TutorStreamHandlers,
  signal?: AbortSignal,
  who = "老师",
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") return;
    on.error("NETWORK", `连不上${who}，稍后再试。`);
    return;
  }
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    on.error(
      data?.error?.code ?? "REQUEST_FAILED",
      data?.error?.message ?? `${who}没有回答，稍后再试。`,
    );
    return;
  }
  const reader = response.body?.getReader();
  if (!reader) {
    on.error("REQUEST_FAILED", `${who}没有回答，稍后再试。`);
    return;
  }
  let settled = false;
  const finish = () => {
    if (!settled) {
      settled = true;
      on.done();
    }
  };
  const fail = (code: string, message: string) => {
    if (!settled) {
      settled = true;
      on.error(code, message);
    }
  };
  const emit = (event: string, data: string) => {
    if (event === "delta") {
      try {
        const parsed = JSON.parse(data) as { text?: unknown };
        if (typeof parsed.text === "string") on.delta(parsed.text);
      } catch {
        /* truncated JSON frame; ignore */
      }
    } else if (event === "done") {
      finish();
    } else if (event === "error") {
      try {
        const parsed = JSON.parse(data) as {
          code?: unknown;
          message?: unknown;
        };
        fail(
          typeof parsed.code === "string" ? parsed.code : "TUTOR_UPSTREAM",
          typeof parsed.message === "string"
            ? parsed.message
            : `${who}的话说到一半断了，再问一次试试。`,
        );
      } catch {
        fail("TUTOR_UPSTREAM", `${who}的话说到一半断了，再问一次试试。`);
      }
    }
  };
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let split: number;
      while ((split = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        let event = "message";
        const dataLines: string[] = [];
        for (const line of frame.split("\n")) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
        }
        if (dataLines.length) emit(event, dataLines.join("\n"));
      }
    }
    // Server closed without an explicit done event — treat it as complete.
    finish();
  } catch (error) {
    if ((error as Error).name === "AbortError") return;
    fail("NETWORK", `和${who}的连接断了，稍后再试。`);
  }
}

/** Streams /api/tutor/chat SSE (the lesson tutor in the library). */
export function streamTutorChat(
  body: TutorChatRequest,
  on: TutorStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  return streamChat("/api/tutor/chat", body, on, signal, "老师");
}
