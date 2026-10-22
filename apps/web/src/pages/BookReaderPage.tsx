import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import {
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Trash2,
  Users,
  Volume2,
} from "lucide-react";
import type { Book, BookNote, BookReader } from "@island/contracts";
import { books as builtinBooks } from "@island/contracts";
import { useContentFeed } from "../contentStore";
import { contentAssetBytes } from "../api";
import { useHomeSession } from "../HomeSession";
import { emitGrowth } from "../progress/store";
import { loadPdf, PdfPage } from "../reading/PdfPages";
import {
  deleteNote,
  fetchNotes,
  fetchReaders,
  postNote,
  saveProgress,
  streamExplain,
} from "../reading/api";

type PdfBook = Awaited<ReturnType<typeof loadPdf>> | null;

/**
 * The real-book reader: a two-page spread that flips like paper, with the
 * page's own text (chapter or extracted PDF), shared notes beside it, a
 * 共读伙伴 strip, and an AI companion that explains the open page.
 */
export default function BookReaderPage() {
  const { bookId = "" } = useParams();
  const { world } = useHomeSession();
  const [book, setBook] = useState<Book | null>(null);
  const [pdf, setPdf] = useState<PdfBook>(null);
  const [spread, setSpread] = useState(0); // spread index (2 pages each)
  const [flipping, setFlipping] = useState<"fwd" | "back" | null>(null);
  const [notes, setNotes] = useState<BookNote[]>([]);
  const [noteCursor,setNoteCursor]=useState<string|null>(null);
  const [readers, setReaders] = useState<BookReader[]>([]);
  const [draft, setDraft] = useState("");
  const [explain, setExplain] = useState<string>("");
  const [explainBusy, setExplainBusy] = useState(false);
  const [speaking, setSpeaking] = useState<"page" | "explain" | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const explainAbort = useRef<AbortController | null>(null);
  const progressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const installed = useContentFeed()?.books;
  // Resolve the book from this island's shelf, then the built-in classics.
  useEffect(() => {
    const found =
      installed?.find((b) => b.id === bookId) ??
      builtinBooks.find((b) => b.id === bookId) ??
      null;
    setBook(found);
    if (found) document.title = `${found.title} · 共读 · 心灵家园`;
  }, [bookId, installed]);

  // PDF books load their document once.
  useEffect(() => {
    setPdf(null);
    setSpread(0);
    if (!book?.pdf) return;
    let alive = true;
    void contentAssetBytes(book.pdf)
      .then((bytes) => loadPdf(bytes))
      .then((loaded) => alive && setPdf(loaded))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [book?.pdf, bookId]);

  const pageCount = book ? (book.pdf ? (pdf?.doc.numPages ?? 0) : book.chapters.length) : 0;
  const spreadCount = Math.max(1, Math.ceil(pageCount / 2));
  const leftPage = spread * 2 + 1;
  const rightPage = Math.min(pageCount, spread * 2 + 2);

  const chapterText = useCallback(
    (page: number) => {
      const chapter = book?.chapters[page - 1];
      return chapter ? chapter.lines.join("\n") : "";
    },
    [book],
  );

  // Notes + readers refresh on open and after every write.
  const refresh = useCallback(async () => {
    try {
      const [n, r] = await Promise.all([
        fetchNotes(bookId),
        fetchReaders(bookId),
      ]);
      setNotes(n.notes);setNoteCursor(n.nextCursor);
      setReaders(r);
    } catch {
      /* offline: keep what we have */
    }
  }, [bookId]);
  useEffect(() => {
    if (book) void refresh();
  }, [book, refresh]);

  useEffect(() => {
    if (!book || pageCount === 0) return;
    emitGrowth({ type: "book.opened", detail: book.id });
    if (progressTimer.current) clearTimeout(progressTimer.current);
    progressTimer.current = setTimeout(() => {
      void saveProgress(bookId, leftPage).catch(() => {});
    }, 1500);
    return () => {
      if (progressTimer.current) clearTimeout(progressTimer.current);
    };
  }, [book, bookId, leftPage, pageCount]);

  const turn = (dir: 1 | -1) => {
    if (flipping) return;
    const next = spread + dir;
    if (next < 0 || next >= spreadCount) return;
    setFlipping(dir === 1 ? "fwd" : "back");
    window.setTimeout(() => {
      setSpread(next);
      emitGrowth({ type: "book.page_read", detail: bookId });
      window.setTimeout(() => setFlipping(null), 320);
    }, 260);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") turn(1);
      else if (e.key === "ArrowLeft") turn(-1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  const submitNote = async () => {
    const text = draft.trim();
    if (!text || !book) return;
    try {
      await postNote(bookId, leftPage, text);
      setDraft("");
      emitGrowth({ type: "note.written" });
      await refresh();
    } catch {
      world.notify("笔记尚未保存，输入已保留，请稍后重试。");
    }
  };

  const pageText = book?.pdf
    ? `（PDF 第 ${leftPage} 页）`
    : chapterText(leftPage) || chapterText(rightPage);

  /** One voice at a time: speaking the page or the explanation stops
   *  whatever was playing before it. */
  const speak = async (what: "page" | "explain", text: string) => {
    if (speaking === what) {
      audioRef.current?.pause();
      setSpeaking(null);
      return;
    }
    try {
      const response = await fetch(`/api/books/${bookId}/speak`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page: leftPage, text }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setExplain(data?.error?.message ?? "朗读声一时没有出来。");
        return;
      }
      const blob = await response.blob();
      audioRef.current?.pause();
      const audio = new Audio(URL.createObjectURL(blob));
      audio.onended = () => setSpeaking(null);
      audioRef.current = audio;
      setSpeaking(what);
      void audio.play();
    } catch {
      setSpeaking(null);
    }
  };
  const speakPage = () => {
    if (!book || !pageText) return;
    void speak("page", pageText);
  };
  const speakExplain = () => {
    if (explainBusy || !explain) return;
    void speak("explain", explain);
  };
  useEffect(
    () => () => {
      audioRef.current?.pause();
    },
    [],
  );

  const askExplain = () => {
    if (!book || explainBusy || !pageText) return;
    explainAbort.current?.abort();
    setExplain("");
    setExplainBusy(true);
    explainAbort.current = streamExplain(
      bookId,
      { page: leftPage, text: pageText },
      {
        onDelta: (chunk) => setExplain((cur) => cur + chunk),
        onDone: () => setExplainBusy(false),
        onError: (message) => {
          setExplain(message);
          setExplainBusy(false);
        },
      },
    );
  };
  useEffect(() => () => explainAbort.current?.abort(), []);

  const myId = world.user?.id;
  if (book === null && !builtinBooks.some((b) => b.id === bookId))
    return (
      <main className="app book-reader">
        <div className="scene-loading">
          <h1>这本书不在架上</h1>
          <Link to="/books" className="small-button">
            回书架
          </Link>
        </div>
      </main>
    );

  return (
    <main className="app book-reader">
      <header className="reader-head">
        <Link to="/books" className="small-button">
          <ChevronLeft size={14} /> 书架
        </Link>
        <div className="reader-title">
          <strong>{book?.title ?? "…"}</strong>
          <small>
            {book?.author} · {pageCount > 0 ? `第 ${leftPage}${rightPage > leftPage ? `–${rightPage}` : ""} 页 / 共 ${pageCount} 页` : "正在打开"}
          </small>
        </div>
        <div className="reader-buddies" title="共读伙伴">
          <Users size={14} />
          {readers.length === 0 ? (
            <small>还没人来读</small>
          ) : (
            readers.slice(0, 4).map((r) => (
              <small key={r.name}>
                {r.name.replace("旅人 · ", "")} · P{r.page}
              </small>
            ))
          )}
        </div>
      </header>

      <div className="reader-body">
        <section className="book-stand" aria-label="书页">
          <button
            className="page-turn left"
            onClick={() => turn(-1)}
            disabled={spread === 0}
            aria-label="上一页"
          >
            <ChevronLeft size={20} />
          </button>
          <div className={`book-spread${flipping ? ` flipping-${flipping}` : ""}`}>
            <div className="book-page left-page">
              {book?.pdf ? (
                pdf ? (
                  leftPage <= (pdf.doc.numPages ?? 0) ? (
                    <PdfPage book={pdf} pageNumber={leftPage} width={430} />
                  ) : null
                ) : (
                  <p className="page-hint">正在翻开 PDF…</p>
                )
              ) : (
                <ChapterLeaf book={book} page={leftPage} side="left" />
              )}
              <span className="folio">{leftPage}</span>
            </div>
            <div className="book-spine" />
            <div className="book-page right-page">
              {book?.pdf ? (
                pdf ? (
                  rightPage > leftPage && rightPage <= pdf.doc.numPages ? (
                    <PdfPage book={pdf} pageNumber={rightPage} width={430} />
                  ) : null
                ) : null
              ) : (
                <ChapterLeaf book={book} page={rightPage} side="right" />
              )}
              {rightPage > leftPage && <span className="folio">{rightPage}</span>}
            </div>
          </div>
          <button
            className="page-turn right"
            onClick={() => turn(1)}
            disabled={spread + 1 >= spreadCount}
            aria-label="下一页"
          >
            <ChevronRight size={20} />
          </button>
        </section>

        <aside className="reader-side">
          <div className="explain-card">
            <div className="explain-actions">
              <button
                className="small-button explain-btn"
                onClick={askExplain}
                disabled={explainBusy || !pageText}
              >
                <Sparkles size={14} />
                {explainBusy ? "老师正在讲…" : "小墨老师讲讲这一页"}
              </button>
              <button
                className="small-button explain-btn"
                onClick={speakPage}
                disabled={!pageText}
              >
                <Volume2 size={14} />
                {speaking === "page" ? "停下朗读" : "朗读这一页"}
              </button>
            </div>
            {explain && (
              <div className="explain-body">
                <button
                  className="note-delete explain-speak"
                  onClick={speakExplain}
                  disabled={explainBusy}
                  title={speaking === "explain" ? "停止朗读讲解" : "朗读讲解"}
                  aria-label={speaking === "explain" ? "停止朗读讲解" : "朗读讲解"}
                >
                  <Volume2 size={13} />
                </button>
                <p className="explain-text">{explain}</p>
              </div>
            )}
          </div>

          <div className="notes-card">
            <h3>共读笔记</h3>
            <p className="notes-hint">
              写在这里的笔记，读这本书的人都能看到。
            </p>
            <textarea
              className="note-editor"
              value={draft}
              placeholder={`第 ${leftPage} 页的想法…`}
              maxLength={500}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
                  void submitNote();
              }}
            />
            <div className="note-actions">
              <small>⌘/Ctrl + 回车</small>
              <button
                className="small-button"
                onClick={() => void submitNote()}
                disabled={!draft.trim()}
              >
                贴进书页
              </button>
            </div>
            <ul className="note-list">
              {notes.map((note) => (
                <li
                  key={note.id}
                  className={note.page === leftPage ? "current" : ""}
                >
                  <div className="note-meta">
                    <strong>{note.author.name.replace("旅人 · ", "")}</strong>
                    <small>
                      {note.locationKind==='legacy'?'旧版定位':`版本 ${note.bookVersion??1}`} · 第 {note.page} 页 ·{" "}
                      {new Date(note.createdAt).toLocaleDateString("zh-CN", {
                        month: "numeric",
                        day: "numeric",
                      })}
                    </small>
                    {note.author.id === myId && (
                      <button
                        className="note-delete"
                        aria-label="删除笔记"
                        onClick={() => {
                          void deleteNote(note.id).then(refresh);
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                  <p>{note.text}</p>
                </li>
              ))}
              {noteCursor&&<li><button className="small-button" onClick={()=>{void fetchNotes(bookId,noteCursor).then(r=>{setNotes(n=>[...n,...r.notes.filter(x=>!n.some(y=>y.id===x.id))]);setNoteCursor(r.nextCursor);}).catch(()=>world.notify("读取失败，已有笔记仍保留。"));}}>更早的共读笔记</button></li>}
              {notes.length === 0 && (
                <li className="empty">还没有笔记，你来写第一条吧。</li>
              )}
            </ul>
          </div>
        </aside>
      </div>
    </main>
  );
}

/** One text page: a chapter rendered like a printed leaf. */
function ChapterLeaf({
  book,
  page,
  side,
}: {
  book: Book | null;
  page: number;
  side: "left" | "right";
}) {
  const chapter = book?.chapters[page - 1];
  const media = chapter?.media?.[0];
  if (!chapter)
    return <p className="page-hint">{side === "left" ? "（完）" : ""}</p>;
  return (
    <>
      <h4 className="chapter-title">{chapter.title}</h4>
      <div className="chapter-lines">
        {chapter.lines.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
      {media?.type === "image" && (
        <img className="chapter-media" src={media.url} alt={media.caption ?? ""} />
      )}
      {media?.type === "video" && (
        <a className="chapter-media" href={media.url} target="_blank" rel="noreferrer">
          ▶ {media.caption ?? "相关视频"}
        </a>
      )}
    </>
  );
}
