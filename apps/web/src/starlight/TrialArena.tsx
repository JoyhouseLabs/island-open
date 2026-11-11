import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as T from "three";
import type { StarTrial } from "@island/contracts";
import { AnimalMesh, type AnimalAnim } from "../animals/AnimalMesh";
function Actors({ trial }: { trial: StarTrial }) {
  const anim = useRef<AnimalAnim>({
    phase: 0,
    moving: false,
    action: "none",
    mouth: 0,
  });
  const pulse = useRef<T.Mesh>(null),
    target = useRef<T.Group>(null),
    age = useRef(2),
    revision = useRef(trial.log.length + ":" + trial.turn);
  const reduced = useMemo(
    () => matchMedia("(prefers-reduced-motion: reduce)"),
    [],
  );
  useEffect(() => {
    const next = trial.log.length + ":" + trial.turn;
    if (revision.current !== next) {
      age.current = 0;
      revision.current = next;
    }
  }, [trial.log.length, trial.turn]);
  useFrame((_, dt) => {
    if (trial.phase === "paused" || reduced.matches) return;
    anim.current.phase += Math.min(dt, 0.05);
    age.current += dt;
    anim.current.action =
      trial.phase === "won"
        ? "greet"
        : trial.phase === "rest"
          ? "rest"
          : "none";
    const beam = trial.log.at(-1)?.includes("光波，");
    if (pulse.current) {
      pulse.current.visible = !!beam && age.current < 0.65;
      pulse.current.position.x = -1.1 + Math.min(1, age.current / 0.65) * 2.5;
    }
    if (target.current) {
      target.current.rotation.y += dt * 0.3;
      target.current.position.y = 0.9 + Math.sin(anim.current.phase * 2) * 0.06;
    }
  });
  return (
    <>
      <group
        position={[-1.25, 0, 0]}
        rotation={[0, Math.PI / 2, 0]}
        scale={0.7}
      >
        <AnimalMesh species="umbreon" anim={anim.current} />
      </group>
      <group ref={target} position={[1.3, 0.9, 0]}>
        <mesh>
          <octahedronGeometry args={[0.46]} />
          <meshStandardMaterial
            color={trial.shadow === 0 ? "#9fcfbd" : "#b4a0e3"}
            emissive="#7063ad"
            emissiveIntensity={0.4}
          />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.66, 0.03, 6, 32]} />
          <meshStandardMaterial color="#e1d6ff" />
        </mesh>
      </group>
      <mesh ref={pulse} visible={false} position={[-1, 0.8, 0]}>
        <sphereGeometry args={[0.14, 12, 8]} />
        <meshBasicMaterial color="#ffe494" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <circleGeometry args={[3.2, 32]} />
        <meshStandardMaterial color="#263c4c" />
      </mesh>
    </>
  );
}
export default function TrialArena({ trial }: { trial: StarTrial }) {
  return (
    <div
      className="star-arena"
      role="img"
      aria-label="月亮伊布与训练星影的友好试炼"
    >
      <Canvas
        dpr={[1, 1.25]}
        camera={{ position: [0, 3.5, 6], fov: 34 }}
        fallback={<p>立体预览不可用，仍可通过下方按钮进行试炼。</p>}
      >
        <color attach="background" args={["#152637"]} />
        <ambientLight intensity={1.8} />
        <directionalLight position={[2, 5, 3]} intensity={2.5} />
        <Actors trial={trial} />
      </Canvas>
    </div>
  );
}
