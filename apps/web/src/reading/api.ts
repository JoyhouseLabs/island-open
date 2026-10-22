import { api } from "../api";
import type { BookNote, BookReader } from "@island/contracts";

/** Shared-reading endpoints (see apps/api/src/reading.ts). */
export async function fetchNotes(bookId: string,cursor?:string) {
  return api<{notes:BookNote[];nextCursor:string|null}>(`/books/${bookId}/notes?limit=20${cursor?`&cursor=${encodeURIComponent(cursor)}`:''}`);
}
export async function postNote(bookId: string, page: number, text: string) {
  return api<BookNote>(`/books/${bookId}/notes`, {
    method: "POST",
    body: JSON.stringify({ page, text }),
  });
}
export async function deleteNote(noteId: string) {
  return api<{ ok: boolean }>(`/books/notes/${noteId}`, { method: "DELETE", body: "{}" });
}
export async function fetchReaders(bookId: string) {
  const data = await api<{ readers: BookReader[] }>(
    `/books/${bookId}/readers`,
  );
  return data.readers;
}
export async function saveProgress(bookId: string, page: number) {
  return api<{ page: number }>(`/books/${bookId}/progress`, {
    method: "PUT",
    body: JSON.stringify({ page }),
  });
}

/** Streams the AI page explanation (SSE over fetch, tutor-chat style). */
export function streamExplain(
  bookId: string,
  body: { page: number; text: string; question?: string },
  handlers: {
    onDelta: (chunk: string) => void;
    onDone: () => void;
    onError: (message: string) => void;
  },
): AbortController {
  const controller = new AbortController();
  void fetch(`/api/books/${bookId}/explain`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => null);
        handlers.onError(
          data?.error?.message ?? "陪读老师暂时不在，稍后再试试。",
        );
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const event = /event:\s*(\w+)/.exec(frame)?.[1];
          const dataLine = /data:\s*([\s\S]*)/.exec(frame)?.[1];
          // Server frames are {text} / {message} shaped — never pass the
          // parsed object itself along, or it stringifies to [object Object].
          if (event === "delta" && dataLine)
            handlers.onDelta(String(JSON.parse(dataLine).text ?? ""));
          else if (event === "error")
            handlers.onError(
              dataLine
                ? String(JSON.parse(dataLine).message ?? "讲解失败了。")
                : "讲解失败了。",
            );
        }
      }
      handlers.onDone();
    })
    .catch((e) => {
      if ((e as Error).name !== "AbortError")
        handlers.onError("网络不太好，稍后再试试。");
    });
  return controller;
}
