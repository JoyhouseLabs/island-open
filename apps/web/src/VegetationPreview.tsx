// An isolated Vite development fixture: never reads accounts or writes saves.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { createWorld } from "@island/world-core";
import type { Season } from "@island/contracts";
import Island from "./Island";
import "./styles.css";
const sample = createWorld();
function Preview() {
  const [season, setSeason] = useState<Season>("summer");
  const [close, setClose] = useState(true);
  const [quality, setQuality] = useState<"high" | "low">("high");
  const [asset, setAsset] = useState("loading");
  const [focus, setFocus] = useState<{
    x: number;
    z: number;
    stamp: number;
  } | null>({ x: -76, z: -30, stamp: 1 });
  return (
    <main className="app">
      <div className="scene">
        <Island
          world={{ ...sample, environment: { hour: 14, season } }}
          tool="explore"
          focus={focus}
          quality={quality}
          onPlace={() => {}}
          onSelect={() => {}}
          onAsset={setAsset}
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: 24,
          top: 24,
          background: "#f8f9efed",
          borderRadius: 16,
          padding: "18px 22px",
          maxWidth: "calc(100% - 48px)",
        }}
      >
        <strong>枝叶研究 · 递归分枝</strong>
        <p style={{ fontSize: 12 }}>独立预览，不读取或更改你的家园存档。</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {(["spring", "summer", "autumn", "winter"] as const).map((s, i) => (
            <button
              className="small-button"
              key={s}
              aria-pressed={season === s}
              onClick={() => setSeason(s)}
            >
              {["春", "夏", "秋", "冬"][i]}
            </button>
          ))}
          <button
            className="small-button"
            onClick={() => {
              setClose(!close);
              setFocus(close ? null : { x: -76, z: -30, stamp: Date.now() });
            }}
          >
            {close ? "查看全岛" : "靠近森林"}
          </button>
          <button
            className="small-button"
            onClick={() => setQuality(quality === "high" ? "low" : "high")}
          >
            {quality === "high" ? "切换轻量" : "切换精细"}
          </button>
        </div>
        <small style={{ display: "block", marginTop: 12, color: "#809275" }}>
          固定种子 ·{" "}
          {quality === "high" ? "叶片预算 660 / 棵" : "叶片预算 330 / 棵"} ·{" "}
          {asset === "ready" ? "资源就绪" : "资源加载中"}
        </small>
      </div>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);
