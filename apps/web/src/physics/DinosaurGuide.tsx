import { useEffect, useRef } from "react";
import { dinosaurHabitats, type DinosaurHabitatId } from "@island/world-core";
import { observations } from "../scenes/dinosaur-observations";

export type DinosaurFocus = DinosaurHabitatId | "all";
export default function DinosaurGuide({
  focus,
  choose,
  close,
}: {
  focus: DinosaurFocus;
  choose(id: DinosaurFocus): void;
  close(): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current!;
    node.showModal();
    return () => node.close();
  }, []);
  const card = focus === "all" ? null : observations[focus];
  return (
    <dialog
      ref={dialog}
      className="physics-content-dialog physics-dinosaur-guide"
      aria-labelledby="dinosaur-guide-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <header className="physics-actions">
        <h2 id="dinosaur-guide-title">恐龙公园导览</h2>
        <button autoFocus onClick={close}>
          继续探索
        </button>
      </header>
      <p>
        沿浅色环路探索四个观察区域。选择区域可拉近观察，关闭导览后回到原来的镜头。
      </p>
      <nav className="physics-actions" aria-label="公园观察区域">
        <button aria-pressed={focus === "all"} onClick={() => choose("all")}>
          查看全园
        </button>
        {dinosaurHabitats.map((h) => (
          <button
            key={h.id}
            aria-pressed={focus === h.id}
            onClick={() => choose(h.id)}
          >
            {h.title}
          </button>
        ))}
      </nav>
      {card && (
        <section aria-live="polite">
          <h3>{card.title}</h3>
          <p>{card.text}</p>
          <p>{card.prompt}</p>
          {card.source && (
            <a href={card.source} target="_blank" rel="noreferrer">
              阅读博物馆资料 ↗
            </a>
          )}
        </section>
      )}
      <p>想象中的自然公园：远古动物与现代孔雀同园，模型比例为观察而调整。</p>
    </dialog>
  );
}
