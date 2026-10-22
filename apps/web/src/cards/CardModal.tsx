import { useEffect, useState } from "react";
import { Volume2, X } from "lucide-react";
import type { KnowledgeCard } from "@island/contracts";
import { cardForSubject, featuresStatus, useContentFeed } from "../contentStore";
import { isSpeaking, speak, stopSpeaking } from "../tutor/speech";
import { closeCard, useOpenCardSubject } from "./store";

/** Read-aloud text assembled from the card, capped at the TTS limit. */
function readAloudText(card: KnowledgeCard) {
  const facts = card.facts.map((f) => `${f.label}：${f.text}。`).join("");
  return `${card.title}。${card.subtitle ? card.subtitle + "。" : ""}${card.look}。${facts}`.slice(
    0,
    300,
  );
}

/** The optional illustration, fetched as an object URL. */
function CardImage({ card }: { card: KnowledgeCard }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!card.image) return;
    let objectUrl: string | null = null;
    let alive = true;
    void fetch(`/api/content/asset/${card.image}`)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error("下载失败"))))
      .then((blob) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        /* a missing picture never blocks the card */
      });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [card.image]);
  if (!url) return null;
  return (
    <img
      className="card-image"
      src={url}
      alt={`${card.title}的图片`}
      loading="lazy"
    />
  );
}

/**
 * A knowledge card, opened by clicking a forage thing or a backpack cell.
 * Stays completely absent while the feature flag is off.
 */
export default function CardModal() {
  const subject = useOpenCardSubject();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const feed = useContentFeed();

  useEffect(() => {
    void featuresStatus().then((f) => setEnabled(f.cards));
  }, []);

  useEffect(() => {
    if (!subject) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        stopSpeaking();
        closeCard();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [subject]);

  useEffect(() => {
    // Leaving or switching cards always stops the voice.
    return () => stopSpeaking();
  }, [subject]);

  if (!subject || enabled === false) return null;
  const card = cardForSubject(feed, subject);

  const read = () => {
    if (!card) return;
    if (isSpeaking()) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    void speak(readAloudText(card), { onEnd: () => setSpeaking(false) });
  };

  return (
    <div
      className="modal-backdrop"
      onClick={() => {
        stopSpeaking();
        closeCard();
      }}
    >
      <div
        className="card-modal"
        role="dialog"
        aria-label={card ? `${card.title}的小卡片` : "知识卡片"}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="modal-close"
          aria-label="关闭卡片"
          onClick={() => {
            stopSpeaking();
            closeCard();
          }}
        >
          <X size={18} />
        </button>
        <span className="eyebrow">FIELD NOTES · 小小图鉴</span>
        {!card ? (
          <p className="card-look">
            {feed ? "这位朋友的小卡片还在路上。" : "卡片加载中…"}
          </p>
        ) : (
          <>
            <h2>{card.title}</h2>
            {card.subtitle && <p className="card-subtitle">{card.subtitle}</p>}
            <CardImage card={card} />
            {card.facts.length > 0 && (
              <div className="card-facts">
                {card.facts.map((f) => (
                  <div className="card-fact" key={f.label + f.text}>
                    <strong>{f.label}</strong>
                    <span>{f.text}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="card-look">{card.look}</p>
            <button className="small-button card-read" onClick={read}>
              <Volume2 size={14} />
              {speaking ? "停一停" : "读给我听"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
