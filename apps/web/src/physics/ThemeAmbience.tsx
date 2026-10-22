import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh, MeshBasicMaterial } from "three";
import { physicalThemeSpecs, pondShape } from "@island/world-core";
import PresenceLabel from "../presence/PresenceLabel";

/** Decorative water only. All walkable land, bridge and dock surfaces live in the shared template. */
export default function ThemeAmbience({
  template,
  night,
}: {
  template: string;
  night: boolean;
}) {
  const spec = physicalThemeSpecs.find((s) => `core:${s.key}` === template);
  const [ripple, setRipple] = useState<{
      x: number;
      z: number;
      age: number;
    } | null>(null),
    ring = useRef<Mesh>(null);
  useFrame((_, dt) => {
    if (!ripple || !ring.current) return;
    ripple.age += Math.min(dt, 0.1);
    ring.current.visible = ripple.age < 3;
    ring.current.scale.setScalar(1 + ripple.age * 2);
    (ring.current.material as MeshBasicMaterial).opacity = Math.max(
      0,
      0.5 - ripple.age / 6,
    );
  });
  if (!spec) return null;
  return (
    <>
      <PresenceLabel
        name={spec.name}
        position={[0, 7, spec.gate]}
        maxDistance={100}
      />
      {spec.key === "pond" && (
        <>
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[pondShape.x, 0.06, pondShape.z]}
            scale={[pondShape.rx, pondShape.rz, 1]}
            onClick={(e) => {
              e.stopPropagation();
              setRipple({ x: e.point.x, z: e.point.z, age: 0 });
            }}
          >
            <circleGeometry args={[1, 64]} />
            <meshStandardMaterial
              color={night ? "#2d5259" : "#6fa39e"}
              transparent
              opacity={0.8}
              roughness={0.3}
              depthWrite={false}
            />
          </mesh>
          {Array.from({ length: 11 }, (_, i) => {
            const a = i * 2.4;
            return (
              <mesh
                key={i}
                rotation={[-Math.PI / 2, 0, a]}
                position={[
                  Math.cos(a) * 14,
                  0.09,
                  pondShape.z + Math.sin(a) * 11,
                ]}
              >
                <circleGeometry args={[1, 14, 0.2, 5.7]} />
                <meshStandardMaterial color="#6f8d60" />
              </mesh>
            );
          })}
          {ripple && (
            <mesh
              ref={ring}
              rotation={[-Math.PI / 2, 0, 0]}
              position={[ripple.x, 0.11, ripple.z]}
            >
              <ringGeometry args={[0.65, 0.71, 40]} />
              <meshBasicMaterial
                color="#e4f4df"
                transparent
                opacity={0.5}
                depthWrite={false}
              />
            </mesh>
          )}
        </>
      )}
      {spec.key === "beach" && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.9, 0]}>
          <planeGeometry args={[800, 800]} />
          <meshStandardMaterial
            color={night ? "#25444e" : "#7aa7b3"}
            roughness={0.35}
          />
        </mesh>
      )}
      {spec.key === "starlight" && (
        <group>
          {Array.from({ length: 90 }, (_, i) => {
            const a = i * 2.399963,
              r = 20 + Math.sqrt(i) * 5;
            return (
              <mesh
                key={i}
                position={[
                  Math.cos(a) * r,
                  18 + (i % 13) * 1.8,
                  Math.sin(a) * r,
                ]}
              >
                <sphereGeometry args={[0.07, 5, 4]} />
                <meshBasicMaterial color="#d6e6ff" />
              </mesh>
            );
          })}
        </group>
      )}
    </>
  );
}
