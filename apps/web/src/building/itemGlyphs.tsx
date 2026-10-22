import type { CSSProperties } from "react";
import type { DeviceInstance } from "@island/contracts";

/** Painted item pictures for the builder. Original marks, not imported game art. */
export const glyphIds = [
  "stone",
  "wood",
  "glass",
  "bookshelf",
  "sign",
  "nameplate",
  "display",
  "shovel",
  "flower",
  "tree",
  "bench",
  "blocks",
  "notebook",
] as const;
export type GlyphId = (typeof glyphIds)[number];

const glyphs: Record<GlyphId, string> = {
  stone: `<rect x="4" y="6" width="24" height="20" rx="2" fill="#8e9997"/><rect x="4" y="6" width="24" height="6" fill="#b7c2bf"/><rect x="4" y="20" width="24" height="6" fill="#667370"/><circle cx="11" cy="15" r="1.3" fill="#556360"/><circle cx="20" cy="13" r="1" fill="#e4eae8"/><circle cx="18" cy="19" r="1.2" fill="#556360"/><circle cx="13" cy="21" r=".8" fill="#d5dbd8"/>`,
  wood: `<rect x="4" y="6" width="24" height="20" rx="1" fill="#c4a06a"/><rect x="4" y="6" width="24" height="5" fill="#e0c48a"/><rect x="4" y="21" width="24" height="5" fill="#8f6840"/><path d="M7 9h18M7 14h18M7 19h18" stroke="#7a5734" stroke-width="1" fill="none"/>`,
  glass: `<rect x="5" y="6" width="22" height="20" rx="2" fill="#d7f1f3" stroke="#6eaeB4" stroke-width="1.4"/><path d="M8 10h9" stroke="#fff" stroke-width="2"/><rect x="15" y="14" width="8" height="8" fill="#9fd4d8" opacity=".9"/>`,
  bookshelf: `<rect x="3" y="4" width="26" height="24" rx="1" fill="#8b5e3c"/><rect x="5" y="6" width="5" height="9" fill="#cf8971"/><rect x="11" y="6" width="4" height="9" fill="#81a4a0"/><rect x="16" y="6" width="5" height="9" fill="#c9a15c"/><rect x="22" y="6" width="5" height="9" fill="#a67cae"/><rect x="3" y="15" width="26" height="2" fill="#6e4528"/><rect x="5" y="18" width="4" height="8" fill="#7d8ea6"/><rect x="10" y="18" width="6" height="8" fill="#b56a5a"/><rect x="17" y="18" width="4" height="8" fill="#86a08a"/><rect x="22" y="18" width="5" height="8" fill="#c9a15c"/>`,
  sign: `<rect x="14" y="18" width="4" height="10" rx="1" fill="#8b5e3c"/><rect x="4" y="3" width="24" height="16" rx="2" fill="#f0e2c0" stroke="#8b5e3c" stroke-width="1.5"/><path d="M8 8h16M8 12h11" stroke="#6d5a3a" stroke-width="1.4" fill="none"/>`,
  nameplate: `<circle cx="16" cy="5" r="2" fill="#c9a15c"/><path d="M16 7v3" stroke="#8b5e3c" stroke-width="1.4"/><rect x="5" y="10" width="22" height="14" rx="2" fill="#f7edd4" stroke="#8b5e3c" stroke-width="1.6"/><path d="M9 17h14" stroke="#6d5a3a" stroke-width="1.6"/>`,
  display: `<rect x="7" y="22" width="18" height="4" rx="1" fill="#8b5e3c"/><rect x="6" y="6" width="20" height="16" rx="2" fill="#e7f6f4" stroke="#6ea39c" stroke-width="1.5"/><rect x="12" y="10" width="8" height="8" rx="1" fill="#cf8971"/><path d="M8 8h6" stroke="#fff" stroke-width="1.4"/>`,
  shovel: `<path d="M20 3l8 8" stroke="#d7b98a" stroke-width="3.2" stroke-linecap="round"/><path d="M18 11L8 21" stroke="#c4a06a" stroke-width="3" stroke-linecap="round"/><path d="M4 22l-1 7 8-2 3-6-6-3z" fill="#d5dee0" stroke="#5e6c6a" stroke-width="1"/>`,
  flower: `<rect x="11" y="16" width="10" height="8" rx="1" fill="#c47b68"/><ellipse cx="16" cy="24" rx="8" ry="3" fill="#a86554"/><rect x="15" y="12" width="2" height="6" fill="#54855e"/><circle cx="16" cy="11" r="3.2" fill="#e07a8a"/><circle cx="12.5" cy="13" r="2.2" fill="#f0b4c0"/><circle cx="19.5" cy="13" r="2.2" fill="#f0b4c0"/>`,
  tree: `<rect x="14" y="20" width="4" height="8" fill="#8b5e3c"/><path d="M16 4l8 10H8z" fill="#6f9a62"/><path d="M16 9l9 11H7z" fill="#54855e"/><path d="M16 14l10 12H6z" fill="#3f6e4c"/>`,
  bench: `<rect x="6" y="7" width="20" height="3" rx="1" fill="#e0c48a"/><rect x="6" y="7" width="3" height="8" fill="#a07c48"/><rect x="23" y="7" width="3" height="8" fill="#a07c48"/><rect x="4" y="14" width="24" height="4" rx="1" fill="#c4a06a"/><rect x="6" y="18" width="3" height="7" fill="#8b5e3c"/><rect x="23" y="18" width="3" height="7" fill="#8b5e3c"/>`,
  blocks: `<rect x="12" y="14" width="14" height="12" rx="1" fill="#8e9997"/><rect x="8" y="9" width="14" height="12" rx="1" fill="#c4a06a"/><rect x="3" y="4" width="14" height="12" rx="1" fill="#d7f1f3" stroke="#6eaeB4"/>`,
  notebook: `<path d="M7 5h14l4 4v18H7z" fill="#f4efe2" stroke="#8b5e3c" stroke-width="1.4"/><path d="M21 5v4h4" fill="#e7d7b4"/><path d="M11 14h10M11 18h10M11 22h7" stroke="#6d5a3a" stroke-width="1.2"/>`,
};

const hotspots: Record<GlyphId, [number, number]> = {
  stone: [16, 16],
  wood: [16, 16],
  glass: [16, 16],
  bookshelf: [16, 20],
  sign: [16, 28],
  nameplate: [16, 22],
  display: [16, 24],
  shovel: [8, 28],
  flower: [16, 26],
  tree: [16, 28],
  bench: [16, 24],
  blocks: [16, 18],
  notebook: [16, 20],
};

function svg(id: GlyphId) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${glyphs[id]}</svg>`;
}

export function glyphSrc(id: GlyphId) {
  return `data:image/svg+xml,${encodeURIComponent(svg(id))}`;
}

/** CSS cursor whose picture is the held tool. The hotspot sits on the working end. */
export function cursorFor(id: GlyphId) {
  const [x, y] = hotspots[id];
  return `url("${glyphSrc(id)}") ${x} ${y}, auto`;
}

export function cursorStyle(id: GlyphId | null): CSSProperties | undefined {
  if (!id) return undefined;
  return { ["--tool-cursor" as string]: cursorFor(id) };
}

export function ItemGlyph({ id, size = 36 }: { id: GlyphId; size?: number }) {
  return (
    <span
      className="item-glyph"
      style={{ width: size, height: size }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: svg(id) }}
    />
  );
}

const byDefinition: Record<DeviceInstance["definitionId"], GlyphId> = {
  "island:bookshelf": "bookshelf",
  "island:sign": "sign",
  "island:nameplate": "nameplate",
  "island:display-case": "display",
};

export function glyphForDevice(id: DeviceInstance["definitionId"]): GlyphId {
  return byDefinition[id];
}

export function glyphForKind(
  kind: DeviceInstance["definitionId"] | "bench" | "flower",
): GlyphId {
  if (kind === "bench") return "bench";
  if (kind === "flower") return "flower";
  return byDefinition[kind];
}

export function glyphForBlock(
  id: "island:stone" | "island:wood" | "island:glass",
): GlyphId {
  if (id === "island:wood") return "wood";
  if (id === "island:glass") return "glass";
  return "stone";
}

export function glyphForTool(tool: string): GlyphId | null {
  if (tool === "tree" || tool === "flower" || tool === "bench") return tool;
  if (tool === "remove") return "shovel";
  return null;
}
