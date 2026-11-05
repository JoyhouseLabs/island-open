import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { Species } from "@island/contracts";
import { AnimalMesh, type AnimalAnim } from "./AnimalMesh";
function Model({ species }: { species: Species }) {
  const reducedMotion = useRef(window.matchMedia("(prefers-reduced-motion: reduce)"));
  const anim = useRef<AnimalAnim>({ phase: 0, moving: false, action: "none", mouth: 0 });
  useFrame((_, delta) => {
    if (!reducedMotion.current.matches) anim.current.phase += Math.min(delta, 0.05);
  });
  return <AnimalMesh species={species} anim={anim.current} />;
}
export default function AnimalPortrait({ species }: { species: Species }) {
  const tall = species === "giraffe";
  return <Canvas dpr={[1, 1.5]} camera={{ position: tall ? [4, 3, 6] : [3.1, 1.9, 4.5], fov: 36 }} fallback={<p>立体预览暂不可用。</p>}>
    <ambientLight intensity={1.6} /><directionalLight position={[3, 6, 4]} intensity={2.3} />
    <Model species={species} />
    <OrbitControls target={tall ? [0, 1.4, 0] : [0.15, 0.85, -0.2]} enablePan={false} enableZoom={false} />
  </Canvas>;
}
