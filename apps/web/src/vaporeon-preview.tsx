import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import { AnimalMesh, type AnimalAnim, type AnimalAction } from "./animals/AnimalMesh";

type MouthMode = "closed" | "open" | "auto";
function Model({ action, moving, paused, mouthMode }: { action: AnimalAction; moving: boolean; paused: boolean; mouthMode: MouthMode }) {
  const anim = useRef<AnimalAnim>({ phase: 0, moving, action, mouth: 0 });
  useFrame((_, delta) => {
    if (!paused) anim.current.phase += delta;
    anim.current.moving = moving;
    anim.current.action = action;
    anim.current.mouth = mouthMode === "open" ? 1 : mouthMode === "closed" ? 0 : Math.max(0, Math.sin(anim.current.phase * 5));
  });
  return <AnimalMesh species="vaporeon" anim={anim.current} />;
}
const views = { 脸部: [0, 1.25, 2.3], 尾巴: [3.4, 2.4, -3.1], 正面: [0, 1.6, 5.8], 侧面: [5.5, 1.8, -0.6], 背面: [0, 2.7, -6], 斜侧: [4, 2.4, 4.5] } as const;
function App() {
  const [view, setView] = useState<keyof typeof views>("脸部");
  const [action, setAction] = useState<AnimalAction>("none");
  const [moving, setMoving] = useState(false);
  const [paused, setPaused] = useState(false);
  const [mouthMode, setMouthMode] = useState<MouthMode>("closed");
  return <main style={{ height: "100dvh", background: "#e8eddb", color: "#294c57", fontFamily: "system-ui", display: "flex", flexDirection: "column" }}>
    <header style={{ padding: "12px 20px" }}><h1 style={{ margin: "0 0 5px", fontSize: 24 }}>水伊布 · 新造型</h1><span>看看眼睛里的光，试试张嘴和闭嘴</span></header>
    <div style={{ flex: 1, minHeight: 0 }}><Canvas key={view} shadows camera={{ position: [...views[view]], fov: 38 }}>
      <ambientLight intensity={1.6} /><directionalLight position={[3, 6, 4]} intensity={2.3} castShadow />
      <Model action={action} moving={moving} paused={paused} mouthMode={mouthMode} />
      <ContactShadows position={[0, -0.015, -0.6]} opacity={0.3} scale={7} blur={2.5} far={4} />
      <OrbitControls target={view === "脸部" ? [0, 1.16, 0.5] : view === "尾巴" ? [0.55, 0.8, -0.35] : [0, 0.8, -0.6]} minDistance={view === "脸部" ? 1 : 3} maxDistance={9} enablePan={false} />
    </Canvas></div>
    <footer style={{ padding: "12px 16px 20px", display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
      {(Object.keys(views) as (keyof typeof views)[]).map(v => <button key={v} onClick={() => setView(v)} aria-pressed={view === v}>{v}</button>)}
      {([["closed", "闭嘴"], ["open", "张嘴"], ["auto", "连续开合"]] as const).map(([mode, label]) => <button key={mode} onClick={() => setMouthMode(mode)} aria-pressed={mouthMode === mode}>{label}</button>)}
      <button onClick={() => setMoving(!moving)} aria-pressed={moving}>走路</button>
      <button onClick={() => setAction(action === "drink" ? "none" : "drink")} aria-pressed={action === "drink"}>喝水</button>
      <button onClick={() => setAction(action === "pet" ? "none" : "pet")} aria-pressed={action === "pet"}>摸摸</button>
      <button onClick={() => setPaused(!paused)} aria-pressed={paused}>{paused ? "继续摇尾" : "暂停摇尾"}</button>
    </footer><style>{`button{font:inherit;min-height:44px;padding:8px 16px;border:1px solid #76959b;border-radius:20px;color:#294c57;background:#fff;cursor:pointer}button[aria-pressed=true]{background:#294c57;color:#fff}button:focus-visible{outline:3px solid #d99c43;outline-offset:2px}`}</style>
  </main>;
}
createRoot(document.getElementById("root")!).render(<App />);
