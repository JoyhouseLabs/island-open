import { useEffect, useRef, useState } from "react";
import {
  knowledgeCardSchema,
  type KnowledgeCard,
  type SubjectId,
} from "@island/contracts";
import { api } from "../api";
import { CardImage, readAloudText } from "../cards/CardModal";
import { speak, stopSpeaking } from "../tutor/speech";
export default function KnowledgeCardDialog({
  subject,
  accountId,
  sceneId,
  token,
  cardsPath,
  close,
}: {
  subject: SubjectId;
  accountId: string;
  sceneId: string;
  token: string | null;
  /** Rooms read the owner's catalog through scene access; other pages pass their own cards endpoint. */
  cardsPath?: string;
  close(): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [cards, setCards] = useState<KnowledgeCard[] | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [speaking, setSpeaking] = useState(false);
  useEffect(() => {
    const node = dialog.current!;
    node.showModal();
    return () => {
      stopSpeaking();
      node.close();
    };
  }, []);
  useEffect(() => {
    let alive = true;
    setCards(null);
    setError("");
    const query = new URLSearchParams({ accountId });
    if (token) query.set("t", token);
    const path =
      cardsPath ?? `/physics/scenes/${encodeURIComponent(sceneId)}/cards`;
    void api<{ cards: unknown[] }>(`${path}?${query}`)
      .then((result) => {
        const next = result.cards.map((c) => knowledgeCardSchema.parse(c));
        if (alive) setCards(next);
      })
      .catch((e) => {
        if (alive)
          setError(e instanceof Error ? e.message : "图鉴读取失败，请重试");
      });
    return () => {
      alive = false;
    };
  }, [accountId, sceneId, token, cardsPath, retry]);
  useEffect(() => {
    setSpeaking(false);
    return () => stopSpeaking();
  }, [subject]);
  const card = cards?.find((c) => c.subject === subject);
  return (
    <dialog
      ref={dialog}
      className="physics-content-dialog physics-knowledge-card"
      aria-label="小小图鉴"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <header className="physics-actions">
        <h2>小小图鉴</h2>
        <button autoFocus onClick={close}>
          关闭图鉴
        </button>
      </header>
      {error ? (
        <div>
          <p role="alert">{error}</p>
          <button onClick={() => setRetry((n) => n + 1)}>重试图鉴</button>
        </div>
      ) : !cards ? (
        <p role="status">正在翻开图鉴…</p>
      ) : !card ? (
        <p>这份小卡片还在准备中。</p>
      ) : (
        <>
          <h3>{card.title}</h3>
          <p>{card.subtitle}</p>
          <CardImage card={card} />
          <p>{card.look}</p>
          <dl>
            {card.facts.map((f) => (
              <div key={f.label}>
                <dt>{f.label}</dt>
                <dd>{f.text}</dd>
              </div>
            ))}
          </dl>
          <button
            onClick={() => {
              if (speaking) {
                stopSpeaking();
                setSpeaking(false);
                return;
              }
              setSpeaking(true);
              void speak(readAloudText(card), {
                onEnd: () => setSpeaking(false),
              }).catch(() => setSpeaking(false));
            }}
          >
            {speaking ? "停止朗读" : "读给我听"}
          </button>
        </>
      )}
    </dialog>
  );
}
