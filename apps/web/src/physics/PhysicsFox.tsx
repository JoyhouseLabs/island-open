import { useRef, useState, type ReactNode } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Group } from "three";
import type { PhysicsTerrainTile } from "@island/contracts";
import { FoxEyes } from "../animals/FoxDressing";
import { Emote } from "../animals/Emote";
import { useFoxModel } from "../scenes/useFox";
import { dialogue } from "../dialogue/store";
import { groundAt } from "./PhysicsResidents";

function lerpAngle(from: number, to: number, t: number) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < Math.PI) d += Math.PI * 2;
  return from + d * t;
}

/** The child's fox companion, now in physics rooms too. It trots after the
 * player, stops a couple of steps away, turns to listen while chatting and
 * shows a heart when petted. Decorative only — no collider, no growth events;
 * the shared deep-chat panel does the talking. */
export default function PhysicsFox({
  terrain,
  paused,
  player,
  onTalk,
}: {
  terrain: PhysicsTerrainTile[];
  paused: boolean;
  player(): { x: number; z: number } | null;
  onTalk(): void;
}) {
  const { model } = useFoxModel(),
    { gl } = useThree(),
    root = useRef<Group>(null),
    st = useRef({ x: NaN, z: NaN, yaw: 0, moving: false }),
    emoteAge = useRef(99),
    [petting, setPetting] = useState(false);
  useFrame((_, rawDt) => {
    if (paused) return;
    const dt = Math.min(rawDt, 0.05),
      s = st.current,
      me = player();
    if (!me) return;
    if (Number.isNaN(s.x)) {
      s.x = me.x + 2;
      s.z = me.z + 1;
    }
    const talking = dialogue.talkingWith("fox"),
      dx = me.x - s.x,
      dz = me.z - s.z,
      distance = Math.hypot(dx, dz) || 1;
    s.moving = false;
    if (talking) {
      s.yaw = lerpAngle(s.yaw, Math.atan2(dx, dz), 1 - Math.exp(-dt * 6));
    } else if (distance > 3.4) {
      // Trot after the player, stopping a couple of steps behind.
      const step = Math.min(2.6 * dt, distance - 2.2);
      s.x += (dx / distance) * step;
      s.z += (dz / distance) * step;
      s.yaw = lerpAngle(s.yaw, Math.atan2(dx, dz), 1 - Math.exp(-dt * 5));
      s.moving = true;
    }
    emoteAge.current += dt;
    model?.mixer.update(dt);
    root.current?.position.set(s.x, groundAt(terrain, s.x, s.z), s.z);
    if (root.current) root.current.rotation.y = s.yaw;
    // A slow observable trace for tests and debugging.
    gl.domElement.dataset.fox = `${s.x.toFixed(1)},${s.z.toFixed(1)},${
      s.moving ? 1 : 0
    }`;
  });
  const pet = (e: ThreeEvent<MouseEvent>): boolean => {
    if (e.delta > 5) return false;
    e.stopPropagation();
    emoteAge.current = 0;
    setPetting(true);
    return true;
  };
  const emote: ReactNode = petting ? (
    <Emote kind="heart" ageRef={emoteAge} y={1.5} />
  ) : null;
  return (
    <group
      ref={root}
      onClick={(e) => {
        if (paused) return;
        if (pet(e)) return;
        e.stopPropagation();
        onTalk();
      }}
    >
      {model ? (
        <>
          <primitive object={model.scene} />
          <FoxEyes model={model.scene} />
          {emote}
        </>
      ) : (
        <group>
          <FoxEyes />
          {emote}
          <mesh position={[0, 0.55, 0]} castShadow>
            <boxGeometry args={[0.42, 0.5, 1.05]} />
            <meshStandardMaterial color="#b87944" />
          </mesh>
          <mesh position={[0, 0.95, 0.55]} castShadow>
            <boxGeometry args={[0.34, 0.32, 0.42]} />
            <meshStandardMaterial color="#cb8a52" />
          </mesh>
          <mesh position={[0, 0.72, -0.62]} rotation={[0.6, 0, 0]}>
            <coneGeometry args={[0.16, 0.72, 7]} />
            <meshStandardMaterial color="#d9c9a8" />
          </mesh>
          {[-0.12, 0.12].map((x) => (
            <mesh key={x} position={[x, 1.18, 0.48]}>
              <coneGeometry args={[0.1, 0.26, 5]} />
              <meshStandardMaterial color="#8a5a33" />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}
