/** Quick-phrase chat vocabulary. The wire only carries the enum ids; these
 *  Chinese labels live here for the chat panel and speech bubbles. */
export const PHRASES: { id: string; label: string }[] = [
  { id: "hi", label: "你好！" },
  { id: "play", label: "一起玩吧" },
  { id: "pretty", label: "这里真美" },
  { id: "bye", label: "再见" },
];

/** Emote chips and their floating icon kinds (Emote.tsx renders them). */
export const EMOTES: { id: string; label: string }[] = [
  { id: "heart", label: "❤️" },
  { id: "sparkle", label: "✨" },
  { id: "note", label: "🎵" },
  { id: "flower", label: "🌻" },
];

export function phraseLabel(id: string) {
  return PHRASES.find((p) => p.id === id)?.label ?? "";
}
