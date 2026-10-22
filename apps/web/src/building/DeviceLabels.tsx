import { deviceDefinitions, type WorldSnapshot } from "@island/contracts";
import { glyphForDevice, ItemGlyph } from "./itemGlyphs";
import { useLayoutEffect, useRef } from "react";
export type DeviceScreenPoint = { id: string; x: number; y: number };
/** One React DOM tree, shared by all devices. No per-device Html roots. */
export default function DeviceLabels({
  world,
  points,
  onSelect,
}: {
  world: WorldSnapshot;
  points: DeviceScreenPoint[];
  onSelect: (id: string) => void;
}) {
  const layer = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = layer.current;
    if (!root) return;
    const placed: {
      left: number;
      right: number;
      top: number;
      bottom: number;
    }[] = [];
    // Icons make labels wider. Keep every label's click target separate, using
    // measured sizes rather than guessing from Chinese/Latin text lengths.
    const width = root.clientWidth,
      height = root.clientHeight;
    const measured = Array.from(
      root.querySelectorAll<HTMLButtonElement>("button"),
      (button) => ({ button, w: button.offsetWidth, h: button.offsetHeight }),
    );
    // Complete all layout reads before writing positions, avoiding one forced
    // browser layout per label in a room with many devices.
    for (const { button, w, h } of measured) {
      const p = points.find((p) => p.id === button.dataset.deviceId);
      if (!p) continue;
      const gap = 6;
      const x = Math.max(w / 2 + gap, Math.min(width - w / 2 - gap, p.x));
      const initialY = Math.max(
        h / 2 + gap,
        Math.min(height - h / 2 - gap, p.y),
      );
      const candidates = [
        initialY,
        ...placed.flatMap((b) => [b.top - h / 2 - gap, b.bottom + h / 2 + gap]),
      ]
        .filter((y) => y >= h / 2 + gap && y <= height - h / 2 - gap)
        .sort((a, b) => Math.abs(a - initialY) - Math.abs(b - initialY));
      const boxAt = (y: number) => ({
        left: x - w / 2,
        right: x + w / 2,
        top: y - h / 2,
        bottom: y + h / 2,
      });
      const y =
        candidates.find((y) => {
          const box = boxAt(y);
          return !placed.some(
            (b) =>
              box.left < b.right + gap &&
              box.right > b.left - gap &&
              box.top < b.bottom + gap &&
              box.bottom > b.top - gap,
          );
        }) ?? initialY;
      button.style.left = `${x}px`;
      button.style.top = `${y}px`;
      placed.push(boxAt(y));
    }
  }, [points, world.devices]);
  return (
    <div className="device-label-layer" ref={layer}>
      {points.map((p) => {
        const d = world.devices?.find((d) => d.id === p.id);
        if (!d) return null;
        return (
          <button
            key={p.id}
            data-device-id={p.id}
            className="device-label"
            style={{ left: p.x, top: p.y }}
            onClick={() => onSelect(p.id)}
          >
            <ItemGlyph id={glyphForDevice(d.definitionId)} size={28} />
            {d.payload.kind === "nameplate"
              ? d.payload.name || "未命名"
              : deviceDefinitions[d.definitionId].name}
          </button>
        );
      })}
    </div>
  );
}
