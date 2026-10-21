import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as T from "three";

export type EmoteKind =
  | "heart"
  | "sparkle"
  | "note"
  | "zzz"
  | "drop"
  | "flower";

/** Little floating icons: hearts when greeting, sparkles when sniffing,
 *  zzz when resting, drops when drinking. All tiny procedural shapes. */
function HeartIcon() {
  return (
    <group>
      {[-0.05, 0.05].map((x) => (
        <mesh key={x} position={[x, 0.05, 0]}>
          <sphereGeometry args={[0.07, 10, 8]} />
          <meshStandardMaterial
            color="#e26d7f"
            emissive="#e26d7f"
            emissiveIntensity={0.5}
            roughness={0.7}
          />
        </mesh>
      ))}
      <mesh position={[0, 0.01, 0]} rotation={[0, 0, Math.PI]}>
        <coneGeometry args={[0.098, 0.14, 10]} />
        <meshStandardMaterial
          color="#e26d7f"
          emissive="#e26d7f"
          emissiveIntensity={0.5}
          roughness={0.7}
        />
      </mesh>
    </group>
  );
}

const emoteColors: Record<EmoteKind, string> = {
  heart: "#e26d7f",
  sparkle: "#e9c86a",
  note: "#8fa3c7",
  zzz: "#cdd8e4",
  drop: "#7fb7d4",
  flower: "#d98fb0",
};

/**
 * A bubble that floats above a head. The parent drives `age` each frame
 * (seconds since spawn); the emote rises, sways and fades out.
 */
export function Emote({
  kind,
  ageRef,
  y,
}: {
  kind: EmoteKind;
  ageRef: { current: number };
  y: number;
}) {
  const group = useRef<T.Group>(null);
  const mats = useRef<T.Material[]>([]);
  useFrame(({ clock }) => {
    if (!group.current) return;
    const age = ageRef.current;
    const k = Math.min(1, age / 2.2);
    group.current.visible = k < 1;
    group.current.position.set(
      Math.sin(clock.elapsedTime * 3) * 0.06,
      y + 0.3 + k * 0.7,
      0,
    );
    const scale = 1 + Math.sin(Math.min(age * 6, Math.PI)) * 0.3;
    group.current.scale.setScalar(k < 0.15 ? k / 0.15 : scale);
    for (const m of mats.current) {
      m.transparent = true;
      m.opacity = 1 - k * k;
    }
  });
  const color = emoteColors[kind];
  return (
    <group ref={group}>
      {kind === "heart" ? (
        <HeartIcon />
      ) : kind === "zzz" ? (
        <group>
          {[0, 1, 2].map((i) => (
            <mesh key={i} position={[i * 0.09 - 0.05, i * 0.11, 0]}>
              <sphereGeometry args={[0.045 - i * 0.008, 8, 6]} />
              <meshStandardMaterial
                ref={(m) => m && mats.current.push(m)}
                color={color}
                emissive={color}
                emissiveIntensity={0.4}
                transparent
              />
            </mesh>
          ))}
        </group>
      ) : kind === "note" ? (
        <group>
          <mesh>
            <sphereGeometry args={[0.06, 8, 7]} />
            <meshStandardMaterial
              ref={(m) => m && mats.current.push(m)}
              color={color}
              emissive={color}
              emissiveIntensity={0.5}
              transparent
            />
          </mesh>
          <mesh position={[0.05, 0.09, 0]}>
            <boxGeometry args={[0.02, 0.16, 0.02]} />
            <meshStandardMaterial
              ref={(m) => m && mats.current.push(m)}
              color={color}
              transparent
            />
          </mesh>
        </group>
      ) : kind === "drop" ? (
        <mesh rotation={[0, 0, Math.PI]}>
          <coneGeometry args={[0.055, 0.12, 8]} />
          <meshStandardMaterial
            ref={(m) => m && mats.current.push(m)}
            color={color}
            emissive={color}
            emissiveIntensity={0.5}
            transparent
          />
        </mesh>
      ) : kind === "flower" ? (
        <group>
          {[0, 1, 2, 3, 4].map((i) => {
            const a = (i / 5) * Math.PI * 2;
            return (
              <mesh key={i} position={[Math.cos(a) * 0.07, Math.sin(a) * 0.07, 0]}>
                <sphereGeometry args={[0.05, 8, 6]} />
                <meshStandardMaterial
                  ref={(m) => m && mats.current.push(m)}
                  color={color}
                  emissive={color}
                  emissiveIntensity={0.5}
                  transparent
                />
              </mesh>
            );
          })}
          <mesh>
            <sphereGeometry args={[0.04, 8, 6]} />
            <meshStandardMaterial
              ref={(m) => m && mats.current.push(m)}
              color="#e9c86a"
              emissive="#e9c86a"
              emissiveIntensity={0.5}
              transparent
            />
          </mesh>
        </group>
      ) : (
        <mesh>
          <octahedronGeometry args={[0.08]} />
          <meshStandardMaterial
            ref={(m) => m && mats.current.push(m)}
            color={color}
            emissive={color}
            emissiveIntensity={0.8}
            transparent
          />
        </mesh>
      )}
    </group>
  );
}
