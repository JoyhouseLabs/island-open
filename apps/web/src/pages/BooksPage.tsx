import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { BookOpen, FileText } from "lucide-react";
import { books as builtinBooks, type Book } from "@island/contracts";
import { contentFeed } from "../contentStore";
import { useHomeSession } from "../HomeSession";

/**
 * The shared bookshelf: built-in classics plus everything the admin has
 * published (including PDF books). Picking one opens the real-book reader.
 */
export default function BooksPage() {
  const navigate = useNavigate();
  const { world } = useHomeSession();
  const [shelf, setShelf] = useState<Book[]>(builtinBooks);
  useEffect(() => {
    document.title = "共读书架 · 心灵家园";
    let alive = true;
    void contentFeed()
      .then((feed) => alive && setShelf(feed.books))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return (
    <main className="app books-page">
      <header className="books-head">
        <Link to="/library" className="small-button">
          回书屋
        </Link>
        <div>
          <h1>共读书架</h1>
          <p>
            选一本书，慢慢翻。你写的笔记，读同一本书的人都能看到——像一起坐在灯下读书。
          </p>
        </div>
        <Link to={world.user ? "/island" : "/library"} className="small-button">
          回我的岛
        </Link>
      </header>
      <div className="books-grid">
        {shelf.map((book) => (
          <button
            key={book.id}
            className="book-card"
            onClick={() => navigate(`/books/${book.id}`)}
          >
            <div className={`book-spine-preview${book.pdf ? " pdf" : ""}`}>
              {book.pdf ? <FileText size={22} /> : <BookOpen size={22} />}
              <span>
                {book.chapters.length > 0 ? `${book.chapters.length} 页` : "PDF"}
              </span>
            </div>
            <strong>{book.title}</strong>
            <small>{book.author}</small>
            <p>{book.note}</p>
          </button>
        ))}
      </div>
    </main>
  );
}
