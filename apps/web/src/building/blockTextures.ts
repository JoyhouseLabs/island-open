import * as T from "three";
const blockMaps = new Map<string, T.CanvasTexture>();
export function blockMap(kind: "stone" | "wood" | "glass") {
  const cached = blockMaps.get(kind);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const g = canvas.getContext("2d")!;
  if (kind === "stone") {
    g.fillStyle = "#8e9997";
    g.fillRect(0, 0, 16, 16);
    g.fillStyle = "#b7c2bf";
    g.fillRect(0, 0, 16, 2);
    g.fillStyle = "#667370";
    g.fillRect(0, 14, 16, 2);
    for (const [x, y, color] of [
      [2, 4, "#5e6b69"],
      [6, 7, "#d5dbd8"],
      [11, 5, "#6a7674"],
      [9, 11, "#c5cdcb"],
      [13, 9, "#556360"],
      [4, 12, "#aeb8b5"],
    ] as const) {
      g.fillStyle = color;
      g.fillRect(x, y, 2, 2);
    }
  } else if (kind === "wood") {
    g.fillStyle = "#c4a06a";
    g.fillRect(0, 0, 16, 16);
    g.fillStyle = "#e0c48a";
    g.fillRect(0, 0, 16, 2);
    g.fillStyle = "#8f6840";
    for (let y = 3; y < 16; y += 4) g.fillRect(0, y, 16, 1);
    g.fillStyle = "#a07c48";
    g.fillRect(4, 6, 1, 8);
    g.fillRect(12, 5, 1, 9);
  } else {
    g.fillStyle = "#d7f1f3";
    g.fillRect(0, 0, 16, 16);
    g.fillStyle = "#ffffff";
    g.fillRect(2, 2, 6, 2);
    g.fillStyle = "#9fd4d8";
    g.fillRect(8, 8, 6, 6);
    g.strokeStyle = "#6eaeb4";
    g.strokeRect(0.5, 0.5, 15, 15);
  }
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.magFilter = T.NearestFilter;
  texture.minFilter = T.NearestFilter;
  texture.needsUpdate = true;
  blockMaps.set(kind, texture);
  return texture;
}
