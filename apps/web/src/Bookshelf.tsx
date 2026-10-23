import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  MessageCircle,
  Pause,
  Plus,
  Trash2,
  Video,
  Volume2,
  X,
} from "lucide-react";
import {
  books as builtinBooks,
  videoSource,
  youtubeId,
  type Book,
  type ChapterMedia,
} from "@island/contracts";
import { readDraft, writeDraft } from "./drafts";

import { speak, stopSpeaking } from "./tutor/speech";
import {
  TutorChat,
  type AskCommand,
  type ChatMessage,
} from "./tutor/TutorChat";
import { useContentFeed } from "./contentStore";

type ShelfData = {
  notes: Record<string, string>;
  videos: Record<string, string[]>;
};
/** Lesson-tutor state persisted per device: reading progress per book and
 *  the conversation per chapter, plus the book read last. */
type TutorData = {
  progress: Record<string, { chapter: number; line?: number }>;
  chats: Record<string, ChatMessage[]>;
  lastBook?: string;
};
const EMPTY: ShelfData = { notes: {}, videos: {} };
const SHELF_KEY = "library-shelf-v1";
const TUTOR_KEY = "library-tutor-v1";

function VideoFrame({ url }: { url: string }) {
  const source = videoSource(url);
  if (source.kind === "bilibili") {
    const query =
      "bvid" in source ? `bvid=${source.bvid}` : `aid=${source.aid}`;
    return (
      <div className="video-frame">
        <iframe
          src={`//player.bilibili.com/player.html?${query}&autoplay=0&high_quality=1&danmaku=0`}
          title="课文视频"
          allowFullScreen
        />
      </div>
    );
  }
  if (source.kind === "youtube")
    return (
      <div className="video-frame">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${source.id}`}
          title="课文视频"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  if (source.kind === "file")
    return (
      <div className="video-frame">
        <video src={source.url} controls preload="metadata" />
      </div>
    );
  return (
    <a href={source.url} target="_blank" rel="noreferrer">
      在新窗口打开视频 ↗
    </a>
  );
}

/** Curated images and videos attached to the chapter being read. */
function LessonMedia({ items }: { items: ChapterMedia[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="lesson-media">
      <label className="section-caption">这一课的看图与视频</label>
      <div className="media-grid">
        {items.map((m, i) =>
          m.type === "image" ? (
            <figure className="media-card" key={i}>
              <img src={m.url} alt={m.caption ?? "课文配图"} loading="lazy" />
              {m.caption && (
                <figcaption className="media-caption">{m.caption}</figcaption>
              )}
            </figure>
          ) : (
            <figure className="media-card media-video" key={i}>
              {open === m.url ? (
                <VideoFrame url={m.url} />
              ) : (
                <button className="small-button" onClick={() => setOpen(m.url)}>
                  <Video size={14} /> 播放视频
                </button>
              )}
              {m.caption && (
                <figcaption className="media-caption">{m.caption}</figcaption>
              )}
            </figure>
          ),
        )}
      </div>
    </section>
  );
}

export default function Bookshelf({
  onClose,
  initialBookId,
  focusChat = false,
  userId,
  record = (event) => {
    void import("./progress/store").then(({ emitGrowth }) => emitGrowth(event));
  },
}: {
  onClose: () => void;
  initialBookId?: string;
  focusChat?: boolean;
  userId?: string;
  record?: (event: { type: string; detail?: string }) => void;
}) {
  const [ready, setReady] = useState(false),
    [books, setBooks] = useState<Book[]>(builtinBooks),
    [data, setData] = useState<ShelfData>(EMPTY),
    [tutor, setTutor] = useState<TutorData>({ progress: {}, chats: {} }),
    [bookIndex, setBookIndex] = useState<number | null>(null),
    [chapter, setChapter] = useState(0),
    [lineIndex, setLineIndex] = useState(0),
    [linkInput, setLinkInput] = useState(""),
    [linkError, setLinkError] = useState(""),
    [playing, setPlaying] = useState<string | null>(null),
    [showChat, setShowChat] = useState(focusChat),
    [ask, setAsk] = useState<AskCommand>(null),
    [speaking, setSpeaking] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null),
    saveTimer = useRef<number | undefined>(undefined),
    tutorTimer = useRef<number | undefined>(undefined),
    chainStop = useRef(true);

  const shelfKey = userId ? `physics-reading:${userId}:shelf-v1` : SHELF_KEY;
  const tutorKey = userId ? `physics-reading:${userId}:tutor-v1` : TUTOR_KEY;
  const installedBooks = useContentFeed()?.books ?? builtinBooks;
  useEffect(() => {
    let alive = true;
    Promise.all([
      readDraft<ShelfData>(shelfKey).catch(() => null),
      readDraft<TutorData>(tutorKey).catch(() => null),
    ]).then(([shelf, saved]) => {
      const published = installedBooks;
      if (!alive) return;
      // Built-ins load first; admin-published books join once fetched.
      setBooks(published);
      if (shelf) setData({ ...EMPTY, ...shelf });
      if (saved)
        setTutor({
          progress: saved.progress ?? {},
          chats: saved.chats ?? {},
          lastBook: saved.lastBook,
        });
      const wanted = initialBookId ?? saved?.lastBook;
      const index = wanted ? published.findIndex((b) => b.id === wanted) : -1;
      const book = index >= 0 ? published[index] : null;
      if (book) {
        const p = saved?.progress?.[book.id];
        setBookIndex(index);
        setChapter(Math.min(p?.chapter ?? 0, book.chapters.length - 1));
        setLineIndex(p?.line ?? 0);
      }
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [initialBookId, installedBooks, shelfKey, tutorKey]);

  // Reading one page after another keeps its place between visits.
  useEffect(() => {
    if (!ready || bookIndex === null) return;
    const book = books[bookIndex];
    if (!book) return;
    setTutor((prev) => ({
      ...prev,
      lastBook: book.id,
      progress: { ...prev.progress, [book.id]: { chapter, line: lineIndex } },
    }));
  }, [ready, bookIndex, chapter, lineIndex]);
  useEffect(() => {
    if (!ready) return;
    window.clearTimeout(tutorTimer.current);
    tutorTimer.current = window.setTimeout(() => {
      void writeDraft(tutorKey, tutor).catch(() => {});
    }, 400);
  }, [tutor, ready, tutorKey]);

  const persist = (next: ShelfData) => {
    setData(next);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void writeDraft(shelfKey, next).catch(() => {});
    }, 400);
  };

  const book = bookIndex === null ? null : (books[bookIndex] ?? null);
  const current = book?.chapters[chapter];
  const chapterId = current?.id ?? "";
  const lines = current?.lines ?? [];

  const openBook = (i: number) => {
    stopChain();
    setBookIndex(i);
    setChapter(0);
    setLineIndex(0);
    setPlaying(null);
    record({ type: "book.opened", detail: books[i]!.id });
    record({ type: "book.page_read", detail: books[i]!.id });
  };
  const setNote = (text: string) => {
    if (text.trim() && !(data.notes[chapterId] ?? "").trim())
      record({ type: "note.written" });
    persist({ ...data, notes: { ...data.notes, [chapterId]: text } });
  };

  const addVideo = () => {
    const id = youtubeId(linkInput.trim());
    if (!id) {
      setLinkError("请粘贴一个 YouTube 视频链接。");
      return;
    }
    const list = data.videos[chapterId] ?? [];
    if (list.includes(id)) {
      setLinkError("这个视频已经在这一章里了。");
      return;
    }
    setLinkError("");
    setLinkInput("");
    persist({
      ...data,
      videos: { ...data.videos, [chapterId]: [...list, id] },
    });
  };

  const stopChain = () => {
    chainStop.current = true;
    stopSpeaking();
    setSpeaking(false);
  };
  const playFrom = (i: number) => {
    if (chainStop.current) return;
    const line = lines[i];
    if (!line) {
      chainStop.current = true;
      setSpeaking(false);
      return;
    }
    setLineIndex(i);
    void speak(line, { onEnd: () => playFrom(i + 1) });
  };
  const readPage = () => {
    if (!lines.length) return;
    chainStop.current = false;
    setSpeaking(true);
    playFrom(0);
  };
  const readLine = () => {
    const line = lines[lineIndex];
    if (!line) return;
    chainStop.current = true;
    stopSpeaking();
    setSpeaking(true);
    void speak(line, { onEnd: () => setSpeaking(false) });
  };
  const askTutor = (text: string) => {
    setShowChat(true);
    setAsk({ text, nonce: Date.now() });
  };

  const videos = data.videos[chapterId] ?? [];

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);
  useEffect(
    () => () => {
      chainStop.current = true;
      stopSpeaking();
    },
    [],
  );

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={`bookshelf ${showChat ? "with-tutor" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="林间书屋的书架"
      >
        <button className="modal-close" aria-label="合上书架" onClick={onClose}>
          <X size={20} />
        </button>
        {!ready ? (
          <p className="tiny-note">正在翻开书架…</p>
        ) : book && current ? (
          <div className="reader">
            <header className="reader-head">
              <button
                className="small-button"
                onClick={() => setBookIndex(null)}
              >
                <ArrowLeft size={14} /> 书架
              </button>
              <div>
                <strong>{book.title}</strong>
                <small>
                  {book.author} · {current.title} · {chapter + 1}/
                  {book.chapters.length}
                </small>
              </div>
            </header>
            <article className="reader-page">
              {lines.map((line, i) => (
                <p
                  key={i}
                  className={i === lineIndex ? "current" : ""}
                  onClick={() => setLineIndex(i)}
                  title="点这一句，朗读和讲解都会跟着它"
                >
                  {line}
                </p>
              ))}
            </article>
            <div className="reader-tools">
              {speaking ? (
                <button className="small-button active" onClick={stopChain}>
                  <Pause size={14} /> 停止朗读
                </button>
              ) : (
                <>
                  <button
                    className="small-button"
                    disabled={!lines[lineIndex]}
                    onClick={readLine}
                  >
                    <Volume2 size={14} /> 朗读本句
                  </button>
                  <button className="small-button" onClick={readPage}>
                    <Volume2 size={14} /> 朗读整页
                  </button>
                </>
              )}
              <button
                className="small-button"
                disabled={!lines[lineIndex]}
                onClick={() =>
                  askTutor(`请讲解这一句：「${lines[lineIndex]!}」`)
                }
              >
                讲解这一句
              </button>
              <button
                className="small-button"
                onClick={() => askTutor("就这一课考我一个小问题，先别说答案。")}
              >
                考考我
              </button>
              <button
                className={`small-button ${showChat ? "active" : ""}`}
                onClick={() => setShowChat(!showChat)}
              >
                <MessageCircle size={14} /> 问老师
              </button>
            </div>
            <footer className="reader-nav">
              <button
                className="small-button"
                disabled={chapter === 0}
                onClick={() => {
                  stopChain();
                  setChapter((c) => c - 1);
                  setLineIndex(0);
                  setPlaying(null);
                  record({ type: "book.page_read", detail: book.id });
                }}
              >
                <ArrowLeft size={14} /> 上一页
              </button>
              <button
                className="small-button"
                disabled={chapter >= book.chapters.length - 1}
                onClick={() => {
                  stopChain();
                  setChapter((c) => c + 1);
                  setLineIndex(0);
                  setPlaying(null);
                  record({ type: "book.page_read", detail: book.id });
                }}
              >
                下一页 <ArrowRight size={14} />
              </button>
            </footer>
            {current.media && current.media.length > 0 && (
              <LessonMedia items={current.media} />
            )}
            <section className="reader-notes">
              <label htmlFor="reader-note" className="section-caption">
                这一页的笔记
              </label>
              <textarea
                id="reader-note"
                ref={noteRef}
                value={data.notes[chapterId] ?? ""}
                onChange={(e) => setNote(e.target.value)}
                placeholder="抄一句喜欢的，或写下自己的话…（自动保存在本机）"
              />
              <div className="reader-videos">
                <label htmlFor="reader-video" className="section-caption">
                  相关视频（YouTube）
                </label>
                <div className="video-add">
                  <input
                    id="reader-video"
                    value={linkInput}
                    onChange={(e) => setLinkInput(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=…"
                    onKeyDown={(e) => e.key === "Enter" && addVideo()}
                  />
                  <button className="small-button" onClick={addVideo}>
                    <Plus size={14} /> 添加
                  </button>
                </div>
                {linkError && <p className="tiny-note">{linkError}</p>}
                {videos.length > 0 && (
                  <ul className="video-list">
                    {videos.map((id) => (
                      <li key={id}>
                        <button
                          className={`small-button ${playing === id ? "active" : ""}`}
                          onClick={() => setPlaying(playing === id ? null : id)}
                        >
                          <Video size={14} /> {playing === id ? "收起" : "观看"}
                        </button>
                        <a
                          href={`https://www.youtube.com/watch?v=${id}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          在 YouTube 打开 ↗
                        </a>
                        <button
                          className="text-button"
                          aria-label="移除视频"
                          onClick={() =>
                            persist({
                              ...data,
                              videos: {
                                ...data.videos,
                                [chapterId]: videos.filter((v) => v !== id),
                              },
                            })
                          }
                        >
                          <Trash2 size={13} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {playing && (
                  <VideoFrame
                    url={`https://www.youtube.com/watch?v=${playing}`}
                  />
                )}
              </div>
            </section>
          </div>
        ) : (
          <div className="shelf-list">
            <span className="eyebrow">
              <span /> A SHELF IN THE WIND
            </span>
            <h2>今天读哪一本？</h2>
            <p className="panel-copy">
              轻声读，慢慢念。笔记和视频都留在这一页旁边。
            </p>
            {books.map((b, i) => (
              <button
                key={b.id}
                className="shelf-book"
                onClick={() => openBook(i)}
              >
                <span
                  className="shelf-spine"
                  style={{
                    background: ["#b56a5a", "#7d8ea6", "#86a08a"][i % 3],
                  }}
                />
                <span className="shelf-book-info">
                  <strong>{b.title}</strong>
                  <small>
                    {b.author} · {b.chapters.length} 页
                  </small>
                  <small>{b.note}</small>
                </span>
                <BookOpen size={18} />
              </button>
            ))}
            <button
              className={`small-button ${showChat ? "active" : ""}`}
              onClick={() => setShowChat(!showChat)}
            >
              <MessageCircle size={14} /> 找小墨老师
            </button>
          </div>
        )}
        {showChat && (
          <TutorChat
            bookId={book?.id ?? null}
            chapterId={chapterId || null}
            lineIndex={book ? lineIndex : null}
            lines={lines}
            history={chapterId ? (tutor.chats[chapterId] ?? []) : []}
            onHistory={(next) =>
              chapterId &&
              setTutor((prev) => ({
                ...prev,
                chats: { ...prev.chats, [chapterId]: next },
              }))
            }
            ask={ask}
          />
        )}
      </div>
    </div>
  );
}
