import { useEffect, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as T from "three";
import { playerAgent, reportAgent, dropAgent } from "../animals/registry";

function lerpAngle(from: number, to: number, t: number) {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return from + delta * t;
}
/** Facing the boardwalk where readers arrive, from the default spot. */
const BASE_YAW = Math.atan2(-5, 8);
const ROBE = "#4a5a74",
  SASH = "#a8814f",
  SKIN = "#e8c39e",
  HAIR = "#2f3540",
  PAPER = "#f0e6d2";

/**
 * 小墨老师: the library's resident tutor, built from the same low-poly
 * vocabulary as the island's other residents. Sways gently over an open
 * book, turns toward a player who walks close, and opens the lesson chat
 * when tapped.
 */
export function TutorMesh({
  position = [5, 0, 12],
  alert = false,
  onClick,
}: {
  position?: [number, number, number];
  alert?: boolean;
  onClick?: () => void;
}) {
  const root = useRef<T.Group>(null),
    torso = useRef<T.Group>(null),
    head = useRef<T.Group>(null),
    sparkle = useRef<T.Group>(null);
  // The tutor joins the agent registry so walk-by prompts can find her.
  useEffect(() => {
    reportAgent("tutor", {
      kind: "tutor",
      x: position[0],
      z: position[2],
      name: "小墨老师",
    });
    return () => dropAgent("tutor");
  }, [position]);
  const [hover, setHover] = useState(false);
  const click = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 5) return;
    e.stopPropagation();
    onClick?.();
  };
  useEffect(
    () => () => {
      document.body.style.cursor = "auto";
    },
    [],
  );
  useFrame(({ clock }, rawDt) => {
    const t = clock.elapsedTime,
      dt = Math.min(rawDt, 0.1);
    if (torso.current) {
      torso.current.rotation.z = Math.sin(t * 0.8) * 0.03;
      torso.current.scale.y = 1 + Math.sin(t * 1.7) * 0.012;
    }
    if (head.current) {
      head.current.rotation.x = Math.sin(t * 1.2) * 0.06;
      head.current.rotation.y = Math.sin(t * 0.5) * 0.08;
    }
    if (sparkle.current) {
      sparkle.current.position.y = 4.35 + Math.sin(t * 2) * 0.12;
      sparkle.current.rotation.y = t * 1.4;
    }
    if (root.current) {
      const player = playerAgent();
      const target = player
        ? Math.atan2(player.x - position[0], player.z - position[2])
        : BASE_YAW;
      root.current.rotation.y = lerpAngle(
        root.current.rotation.y,
        target,
        1 - Math.exp(-dt * (player ? 5 : 1.6)),
      );
    }
  });
  return (
    <group position={position}>
      {/* A soft patch of ground, like the animals' spots. */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.5, 22]} />
        <meshStandardMaterial color="#a9895f" roughness={1} />
      </mesh>
      <group
        ref={root}
        rotation={[0, BASE_YAW, 0]}
        onClick={click}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = "auto";
        }}
      >
        <group ref={torso}>
          {/* Robe, sash and shoulders. */}
          <mesh position={[0, 0.85, 0]} castShadow>
            <cylinderGeometry args={[0.55, 0.78, 1.7, 10]} />
            <meshStandardMaterial color={ROBE} roughness={0.95} />
          </mesh>
          <mesh position={[0, 1.38, 0]}>
            <cylinderGeometry args={[0.62, 0.66, 0.16, 10]} />
            <meshStandardMaterial color={SASH} roughness={0.9} />
          </mesh>
          <mesh position={[0, 1.78, 0]} castShadow>
            <sphereGeometry args={[0.5, 12, 10]} />
            <meshStandardMaterial color={ROBE} roughness={0.95} />
          </mesh>
          {/* Sleeves meeting an open book in front. */}
          {[-1, 1].map((side) => (
            <group
              key={side}
              position={[side * 0.52, 1.68, 0.1]}
              rotation={[-0.7, 0, side * -0.35]}
            >
              <mesh position={[0, -0.36, 0]} castShadow>
                <boxGeometry args={[0.22, 0.75, 0.22]} />
                <meshStandardMaterial color={ROBE} roughness={0.95} />
              </mesh>
              <mesh position={[0, -0.78, 0]}>
                <sphereGeometry args={[0.13, 8, 8]} />
                <meshStandardMaterial color={SKIN} roughness={0.9} />
              </mesh>
            </group>
          ))}
          <group position={[0, 1.28, 0.62]} rotation={[0.35, 0, 0]}>
            {[-0.05, 0.05].map((side, i) => (
              <mesh key={side} rotation={[side * 6, 0, 0]} castShadow>
                <boxGeometry args={[0.72, 0.04, 0.52]} />
                <meshStandardMaterial
                  color={i ? PAPER : "#b56a5a"}
                  roughness={0.9}
                />
              </mesh>
            ))}
          </group>
          <group ref={head}>
            <mesh position={[0, 2.22, 0]} castShadow>
              <sphereGeometry args={[0.42, 12, 10]} />
              <meshStandardMaterial color={SKIN} roughness={0.9} />
            </mesh>
            {/* Hair cap and bun. */}
            <mesh position={[0, 2.36, -0.03]} scale={[1, 0.72, 1]}>
              <sphereGeometry args={[0.44, 12, 10]} />
              <meshStandardMaterial color={HAIR} roughness={1} />
            </mesh>
            <mesh position={[0, 2.66, -0.08]}>
              <cylinderGeometry args={[0.1, 0.13, 0.18, 8]} />
              <meshStandardMaterial color={HAIR} roughness={1} />
            </mesh>
            <mesh position={[0, 2.82, -0.08]}>
              <sphereGeometry args={[0.12, 8, 8]} />
              <meshStandardMaterial color={HAIR} roughness={1} />
            </mesh>
            {/* Face: eyes, brows and a short beard. */}
            {[-0.15, 0.15].map((x) => (
              <mesh key={x} position={[x, 2.28, 0.37]}>
                <sphereGeometry args={[0.045, 8, 8]} />
                <meshStandardMaterial color="#2c2a26" roughness={0.8} />
              </mesh>
            ))}
            {[-0.16, 0.16].map((x) => (
              <mesh key={x} position={[x, 2.38, 0.36]} rotation={[0, 0, x < 0 ? 0.18 : -0.18]}>
                <boxGeometry args={[0.16, 0.03, 0.03]} />
                <meshStandardMaterial color={HAIR} roughness={1} />
              </mesh>
            ))}
            <mesh position={[0, 1.98, 0.3]} rotation={[0.32, 0, 0]}>
              <coneGeometry args={[0.2, 0.42, 8]} />
              <meshStandardMaterial color="#d8d3c3" roughness={1} />
            </mesh>
          </group>
        </group>
        {/* A quiet "the tutor is here" light above the hat. */}
        <group ref={sparkle} position={[0, 4.35, 0]} visible={alert || hover}>
          <mesh>
            <octahedronGeometry args={[0.16]} />
            <meshStandardMaterial
              color="#f0c264"
              emissive="#f0c264"
              emissiveIntensity={1.4}
              roughness={0.5}
            />
          </mesh>
        </group>
      </group>
    </group>
  );
}
