import { useState } from "react";
import ItemPreview from "./ItemPreview";
import { deviceDefinitions, type DeviceInstance } from "@island/contracts";
import type { useBuilder } from "./useBuilder";
import type { useWorld } from "../useWorld";
import {
  glyphForBlock,
  glyphForDevice,
  glyphForKind,
  ItemGlyph,
  type GlyphId,
} from "./itemGlyphs";

const materials = [
  { id: "island:stone", name: "石块", glyph: "stone" },
  { id: "island:wood", name: "木块", glyph: "wood" },
  { id: "island:glass", name: "玻璃", glyph: "glass" },
] as const;

const kinds = [
  ...Object.entries(deviceDefinitions).map(([id, d]) => ({
    id: id as DeviceInstance["definitionId"],
    name: d.name,
  })),
  { id: "bench" as const, name: "长椅" },
  { id: "flower" as const, name: "花丛" },
];

function storedName(d: DeviceInstance) {
  if (d.payload.kind === "nameplate") return d.payload.name || "命名牌";
  if (d.payload.kind === "sign")
    return d.payload.lines.find((line) => line.trim()) || "告示牌";
  return deviceDefinitions[d.definitionId].name;
}

function Slot({
  label,
  pressed,
  glyph,
  onClick,
}: {
  label: string;
  pressed: boolean;
  glyph: GlyphId;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="item-slot"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
    >
      <span>
        <ItemGlyph id={glyph} size={36} />
      </span>
      <span className="item-slot-name">{label}</span>
    </button>
  );
}

export default function BuildingControls({
  builder: b,
  room,
}: {
  builder: ReturnType<typeof useBuilder>;
  room: ReturnType<typeof useWorld>;
}) {
  const [compact, setCompact] = useState(false);
  if (!b.editor) return null;
  const mode = b.editor.mode;
  const held =
    mode === "build" ? glyphForBlock(b.material) : glyphForKind(b.kind);
  const selectedName =
    mode === "build"
      ? materials.find((m) => m.id === b.material)!.name
      : kinds.find((k) => k.id === b.kind)!.name;
  const descriptions: Partial<Record<GlyphId, string>> = {
    stone: "不透明的实心石块，可搭墙、地板和屋顶，会挡住角色。",
    wood: "带木纹的实心方块，可搭木屋、地板和屋顶，会挡住角色。",
    glass: "半透明的完整方块，适合做窗户；能看穿，但角色不能穿过。",
    bookshelf: "摆好后点击书架，创建笔记本或短笺；上架后朋友才能阅读。",
    sign: "独立立在地上的告示牌，可写四行文字，每行最多 24 字。",
    nameplate: "带支架的立体小牌，为小屋或角落起名，最多 20 字。",
    display: "带透明玻璃的展示柜。摆好后选择已有背包物品，不扣除数量。",
    bench: "可坐的长椅。放在地面或完整支撑的平台上，前方要留出空间。",
    flower: "一簇花，可种在地面或完整支撑的平台上。",
  };
  const stored = (room.snapshot.devices ?? []).filter(
    (d) =>
      d.placement.state === "stored" &&
      b.kind !== "bench" &&
      b.kind !== "flower" &&
      d.definitionId === b.kind,
  );
  const explanation = (
    <section className="item-explanation" aria-label="所选物件说明">
      <strong>{selectedName}</strong>
      <p>{descriptions[held]}</p>
      {!compact && <ItemPreview kind={held} rotation={b.rotation} />}
    </section>
  );
  return (
    <aside
      className={`building-controls${compact ? " is-compact" : ""}`}
      aria-label="建造与整理"
    >
      <strong>
        {mode === "build"
          ? "搭一间自己的小屋"
          : mode === "remove"
            ? "整理这片空间"
            : "布置小屋"}
      </strong>
      <div className="building-panel-actions">
        <button type="button" onClick={() => setCompact(!compact)}>
          {compact ? "展开物件与说明" : "收起面板选位置"}
        </button>
        <button
          type="button"
          onClick={() => {
            window.dispatchEvent(new Event("island-focus-building"));
            setCompact(true);
          }}
        >
          定位绿色建造区
        </button>
      </div>
      <div className="building-settings" hidden={compact}>
        <p>
          {mode === "build"
            ? "先选材料，单击预览位置，双击绿色网格内的地面或方块表面即可放置。"
            : mode === "remove"
              ? "选中树花椅、方块或装置，再确认。收起装置会保留作品。"
              : "先选物件，单击预览位置，双击绿色网格内的地面或建筑顶面即可放置。"}
        </p>
        {mode === "build" && (
          <div>
            <span className="field-label">材料</span>
            <div className="item-row" role="group" aria-label="材料">
              {materials.map((m) => (
                <Slot
                  key={m.id}
                  label={m.name}
                  glyph={m.glyph}
                  pressed={b.material === m.id}
                  onClick={() => b.setMaterial(m.id)}
                />
              ))}
            </div>
          </div>
        )}
        {mode === "build" && explanation}
        {mode === "device" && (
          <>
            <div>
              <span className="field-label">摆什么</span>
              <div className="item-row" role="group" aria-label="摆什么">
                {kinds.map((k) => (
                  <Slot
                    key={k.id}
                    label={k.name}
                    glyph={glyphForKind(k.id)}
                    pressed={b.kind === k.id}
                    onClick={() => {
                      b.setKind(k.id);
                      b.setStoredId("");
                    }}
                  />
                ))}
              </div>
            </div>
            {explanation}
            <div>
              <span className="field-label">新建或重新摆放</span>
              <div className="item-row" role="group" aria-label="待摆放">
                <Slot
                  label="放一件新的"
                  glyph={held}
                  pressed={b.storedId === ""}
                  onClick={() => b.setStoredId("")}
                />
                {stored.map((d) => (
                  <Slot
                    key={d.id}
                    label={storedName(d)}
                    glyph={glyphForDevice(d.definitionId)}
                    pressed={b.storedId === d.id}
                    onClick={() => b.setStoredId(d.id)}
                  />
                ))}
                {stored.length === 0 && (
                  <small>没有收起的{selectedName}，当前将放一件新的。</small>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                b.setRotation(((b.rotation + 1) % 4) as 0 | 1 | 2 | 3)
              }
              aria-label={`旋转，当前朝向 ${b.rotation * 90} 度`}
            >
              <span
                style={{
                  transform: `rotate(${b.rotation * 90}deg)`,
                  display: "inline-block",
                }}
              >
                <ItemGlyph id={held} size={28} />
              </span>
              旋转 90°
            </button>
          </>
        )}
        {mode === "remove" && (
          <p>
            <ItemGlyph id="shovel" size={36} />
            铲子会跟着鼠标走。点选要整理的东西，再确认。
          </p>
        )}
        <label>
          <input
            type="checkbox"
            checked={b.cutaway}
            onChange={(e) => b.setCutaway(e.target.checked)}
          />
          淡化高处方块，看看屋里
        </label>
      </div>
      <div className="building-confirmation">
        {compact && mode !== "remove" && <strong>已选：{selectedName}</strong>}
        <p role="status">
          {b.previewError
            ? `⚠ ${b.previewError}`
            : b.target
              ? mode === "remove"
                ? "✓ 物件已选，可以整理。"
                : "✓ 位置可用，双击此处放置。"
              : mode === "remove"
                ? "点击要整理的物件或方块，再确认整理。"
                : "单击预览，双击放置。找不到空地时点“定位绿色建造区”。"}
        </p>
        {mode === "remove" && (
          <button
            className="primary-button"
            disabled={!b.target || !!b.previewError}
            onClick={b.commit}
          >
            确认整理
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event("island-safe-entry"))}
      >
        回到安全入口
      </button>
    </aside>
  );
}
