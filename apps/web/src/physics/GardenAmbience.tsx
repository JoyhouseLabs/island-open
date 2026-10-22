import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh, MeshBasicMaterial } from "three";
import { gardenPond } from "@island/world-core";
import PresenceLabel from "../presence/PresenceLabel";

/** Water and its ripples are visual only; the pond bed and stones are physical template geometry. */
export default function GardenAmbience({
  nursery,
  night,
}: {
  nursery: boolean;
  night: boolean;
}) {
  const [ripple, setRipple] = useState<{
      x: number;
      z: number;
      age: number;
    } | null>(null),
    ring = useRef<Mesh>(null);
  useFrame((_, dt) => {
    if (!ripple || !ring.current) return;
    ripple.age += Math.min(dt, 0.1);
    ring.current.visible = ripple.age < 2.8;
    ring.current.scale.setScalar(1 + ripple.age * 1.8);
    (ring.current.material as MeshBasicMaterial).opacity = Math.max(
      0,
      0.55 - ripple.age * 0.2,
    );
  });
  if (nursery)
    return (
      <PresenceLabel
        name="实验种植园 · 苗床与温室"
        position={[0, 12, -14]}
        maxDistance={90}
      />
    );
  return (
    <>
      <PresenceLabel
        name="私家花园"
        position={[-22, 12, -23]}
        maxDistance={90}
      />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[gardenPond.x, 0.08, gardenPond.z]}
        scale={[gardenPond.rx * 0.9, gardenPond.rz * 0.9, 1]}
        onClick={(event) => {
          event.stopPropagation();
          setRipple({ x: event.point.x, z: event.point.z, age: 0 });
        }}
      >
        <circleGeometry args={[1, 48]} />
        <meshStandardMaterial
          color={night ? "#345e65" : "#73aaa5"}
          transparent
          opacity={0.8}
          roughness={0.3}
          depthWrite={false}
        />
      </mesh>
      {Array.from({ length: 9 }, (_, i) => (
        <mesh
          key={i}
          rotation={[-Math.PI / 2, 0, i]}
          position={[
            gardenPond.x + Math.cos(i * 2.4) * 5,
            0.11,
            gardenPond.z + Math.sin(i * 2.4) * 3,
          ]}
        >
          <circleGeometry args={[0.7, 12, 0, 5.8]} />
          <meshStandardMaterial color="#718d60" />
        </mesh>
      ))}
      {ripple && (
        <mesh
          ref={ring}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[ripple.x, 0.14, ripple.z]}
        >
          <ringGeometry args={[0.48, 0.53, 40]} />
          <meshBasicMaterial
            color="#e4f4df"
            transparent
            opacity={0.5}
            depthWrite={false}
          />
        </mesh>
      )}
    </>
  );
}
