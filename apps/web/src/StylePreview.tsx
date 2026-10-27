// An isolated Vite development fixture: never reads accounts or writes saves.
// 左右并排对比内置动物的两种渲染——现状（纯色 PBR 哑光）与卡通色阶（toon ramp）。
// 右侧通过遍历对象图替换材质实现，不改动 AnimalMesh 本身。
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import * as T from "three";
import { AnimalMesh, type AnimalAnim } from "./animals/AnimalMesh";
import "./styles.css";

type Kind = "panda" | "giraffe" | "wolf";

const kinds: { kind: Kind; label: string; z: number }[] = [
  { kind: "wolf", label: "风哨 · 小狼", z: -4.6 },
  { kind: "panda", label: "团团 · 熊猫", z: 0.2 },
  { kind: "giraffe", label: "高高 · 长颈鹿", z: 5.0 },
];

const CHIP: React.CSSProperties = {
  background: "#f8f9efee",
  borderRadius: 999,
  padding: "4px 12px",
  fontSize: 13,
  color: "#5a6b4f",
  whiteSpace: "nowrap",
  boxShadow: "0 2px 8px #0002",
};

/** 把子树里的 MeshStandardMaterial 换成同色 MeshToonMaterial；
 *  可选描边（背面壳）。卸载或参数变化时恢复原材质。 */
function ToonSwap({
  steps,
  outline,
  children,
}: {
  steps: number;
  outline: boolean;
  children: ReactNode;
}) {
  const group = useRef<T.Group>(null);
  useEffect(() => {
    const root = group.current;
    if (!root) return;
    const colors = new Uint8Array(steps + 1);
    for (let i = 0; i <= steps; i++)
      colors[i] = Math.round((i / steps) * 255);
    const gradientMap = new T.DataTexture(colors, colors.length, 1, T.RedFormat);
    gradientMap.minFilter = T.NearestFilter;
    gradientMap.magFilter = T.NearestFilter;
    gradientMap.generateMipmaps = false;
    gradientMap.needsUpdate = true;
    const cache = new Map<string, T.MeshToonMaterial>();
    const outlineMat = new T.MeshBasicMaterial({
      color: "#3a4438",
      side: T.BackSide,
    });
    // Collect first, mutate after: adding shells during traverse() would
    // visit the new meshes in the same pass and they have no .emissive.
    const meshes: T.Mesh[] = [];
    root.traverse((obj) => {
      const mesh = obj as T.Mesh;
      if ((mesh as { isMesh?: boolean }).isMesh) meshes.push(mesh);
    });
    const shells: T.Object3D[] = [];
    const originals: [T.Mesh, T.Material][] = [];
    for (const mesh of meshes) {
      const std = mesh.material as T.MeshStandardMaterial;
      const key = `${std.color.getHexString()}|${std.emissive.getHexString()}|${std.emissiveIntensity}`;
      let toon = cache.get(key);
      if (!toon) {
        toon = new T.MeshToonMaterial({
          color: std.color.clone(),
          gradientMap,
        });
        if (std.emissive.getHexString() !== "000000") {
          toon.emissive.copy(std.emissive);
          toon.emissiveIntensity = std.emissiveIntensity;
        }
        cache.set(key, toon);
      }
      originals.push([mesh, std]);
      mesh.material = toon;
      if (
        outline &&
        mesh.geometry.type !== "PlaneGeometry" &&
        std.emissiveIntensity <= 1
      ) {
        const shell = new T.Mesh(mesh.geometry, outlineMat);
        shell.scale.setScalar(1.05);
        mesh.add(shell);
        shells.push(shell);
      }
    }
    return () => {
      for (const [mesh, mat] of originals) mesh.material = mat;
      for (const shell of shells) shell.removeFromParent();
      for (const mat of cache.values()) mat.dispose();
      outlineMat.dispose();
      gradientMap.dispose();
    };
  }, [steps, outline]);
  return <group ref={group}>{children}</group>;
}

/** 让两侧同一物种共用同一个 anim 对象，动作完全同步，方便对比。 */
const CYCLE: { action: AnimalAnim["action"]; until: number; mouth: number }[] = [
  { action: "none", until: 3.5, mouth: 0 },
  { action: "sniff", until: 5.5, mouth: 0 },
  { action: "greet", until: 7.2, mouth: 0.7 },
  { action: "none", until: 8, mouth: 0 },
];

function AnimDriver({ anims }: { anims: AnimalAnim[] }) {
  const t = useRef(0);
  useFrame((_, dt) => {
    t.current = (t.current + dt) % CYCLE[CYCLE.length - 1]!.until;
    const step = CYCLE.find((s) => t.current < s.until)!;
    for (const a of anims) {
      a.phase += dt * 1.6;
      a.moving = true;
      a.action = step.action;
      a.mouth =
        step.mouth > 0
          ? 0.3 + 0.4 * Math.abs(Math.sin(a.phase * 4))
          : 0;
    }
  });
  return null;
}

function Stage({
  column,
  steps,
  outline,
  anims,
}: {
  column: "current" | "toon";
  steps: number;
  outline: boolean;
  anims: Record<Kind, AnimalAnim>;
}) {
  const x = column === "current" ? -4.6 : 4.6;
  const content = (
    <>
      {kinds.map(({ kind, z }) => (
        <group key={kind} position={[x, 0, z]} rotation={[0, column === "current" ? 0.42 : -0.42, 0]}>
          <AnimalMesh species={kind} anim={anims[kind]} />
        </group>
      ))}
      <Html position={[x, 4.6, 0]} center>
        <span style={CHIP}>
          {column === "current" ? "现状 · 纯色 PBR" : "卡通色阶 · toon"}
        </span>
      </Html>
    </>
  );
  return column === "toon" ? (
    <ToonSwap steps={steps} outline={outline}>
      {content}
    </ToonSwap>
  ) : (
    content
  );
}

function Turntable({
  spin,
  children,
}: {
  spin: boolean;
  children: ReactNode;
}) {
  const group = useRef<T.Group>(null);
  useFrame((_, dt) => {
    if (group.current && spin) group.current.rotation.y += dt * 0.25;
  });
  return <group ref={group}>{children}</group>;
}

function Fixture() {
  const [steps, setSteps] = useState(3);
  const [outline, setOutline] = useState(false);
  const [islandLight, setIslandLight] = useState(true);
  const [spin, setSpin] = useState(false);
  const anims = useMemo<Record<Kind, AnimalAnim>>(
    () => ({
      panda: { phase: 0, moving: true, action: "none", mouth: 0 },
      giraffe: { phase: 0.7, moving: true, action: "none", mouth: 0 },
      wolf: { phase: 1.4, moving: true, action: "none", mouth: 0 },
    }),
    [],
  );
  const maxMode = steps === 2 && outline && !islandLight;
  return (
    <main className="app">
      <div className="scene">
        <Canvas
          shadows
          dpr={[1, 1.5]}
          camera={{ position: [11.5, 4.6, 12.5], fov: 35, near: 0.5, far: 200 }}
          gl={{ antialias: true }}
          onCreated={({ gl }) => {
            gl.toneMapping = T.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1.05;
          }}
        >
          <color attach="background" args={["#c9e4f2"]} />
          <ambientLight intensity={islandLight ? 1.2 : 0.4} />
          <hemisphereLight
            args={["#eaf5e5", "#7b8d6b", islandLight ? 1.8 : 0.5]}
          />
          <directionalLight
            position={islandLight ? [55, 95, 40] : [45, 70, 30]}
            color={islandLight ? "#fff0cd" : "#fff3d6"}
            intensity={islandLight ? 2.6 : 2.3}
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-camera-left={-16}
            shadow-camera-right={16}
            shadow-camera-top={16}
            shadow-camera-bottom={-16}
            shadow-camera-far={200}
            shadow-bias={-0.0005}
            shadow-normalBias={0.05}
          />
          <mesh rotation-x={-Math.PI / 2} receiveShadow>
            <circleGeometry args={[15, 48]} />
            <meshStandardMaterial color="#a5c77e" roughness={1} />
          </mesh>
          <Turntable spin={spin}>
            <AnimDriver anims={Object.values(anims)} />
            <Stage column="current" steps={steps} outline={outline} anims={anims} />
            <Stage column="toon" steps={steps} outline={outline} anims={anims} />
          </Turntable>
          <OrbitControls target={[0, 1.6, 0]} enableDamping />
        </Canvas>
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
        <strong>动物渲染风格对比</strong>
        <p style={{ fontSize: 12 }}>独立预览，不读取或更改你的家园存档。</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <button
            className="small-button"
            aria-pressed={maxMode}
            onClick={() => {
              const on = !maxMode;
              setSteps(on ? 2 : 3);
              setOutline(on);
              setIslandLight(!on);
            }}
          >
            {maxMode ? "回到默认对比" : "一键看最大差异"}
          </button>
          <small>色阶</small>
          {[2, 3, 4, 5].map((n) => (
            <button
              className="small-button"
              key={n}
              aria-pressed={steps === n}
              onClick={() => setSteps(n)}
            >
              {n}
            </button>
          ))}
          <button
            className="small-button"
            aria-pressed={outline}
            onClick={() => setOutline(!outline)}
          >
            {outline ? "描边 开" : "描边 关"}
          </button>
          <button
            className="small-button"
            onClick={() => setIslandLight(!islandLight)}
          >
            {islandLight ? "灯光：主岛同款" : "灯光：卡通调光"}
          </button>
          <button className="small-button" onClick={() => setSpin(!spin)}>
            {spin ? "转台 停" : "转台 转"}
          </button>
        </div>
        <small style={{ display: "block", marginTop: 12, color: "#809275" }}>
          左列现状（纯色 PBR 哑光）· 右列卡通色阶 · 拖动旋转视角，滚轮缩放
        </small>
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);
