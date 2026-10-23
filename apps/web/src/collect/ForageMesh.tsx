import * as T from "three";
import type { ForageKind } from "@island/world-core";
/** Five-point star outline shared by every starfish pickup. */
const starfishShape = (() => {
  const s = new T.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.075 : 0.17,
      a = (i / 10) * Math.PI * 2 - Math.PI / 2,
      x = Math.cos(a) * r,
      y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  return s;
})();

export default function ForageMesh({ kind }: { kind: ForageKind }) {
  switch (kind) {
    case "petal":
      return (
        <mesh rotation={[-0.6, 0, 0.4]} castShadow>
          <circleGeometry args={[0.16, 8]} />
          <meshStandardMaterial
            color="#e8a7b8"
            side={T.DoubleSide}
            roughness={0.8}
          />
        </mesh>
      );
    case "pinecone":
      return (
        <mesh castShadow>
          <coneGeometry args={[0.11, 0.3, 7]} />
          <meshStandardMaterial color="#8a6238" roughness={1} flatShading />
        </mesh>
      );
    case "mushroom":
      return (
        <group>
          <mesh castShadow>
            <cylinderGeometry args={[0.04, 0.05, 0.14, 6]} />
            <meshStandardMaterial color="#efe3cf" />
          </mesh>
          <mesh position={[0, 0.11, 0]} castShadow>
            <sphereGeometry
              args={[0.12, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2]}
            />
            <meshStandardMaterial color="#c96f5a" roughness={0.9} flatShading />
          </mesh>
        </group>
      );
    case "shell":
      return (
        <mesh rotation={[0.2, 0, 0]} scale={[1, 0.45, 0.9]} castShadow>
          <sphereGeometry args={[0.13, 8, 6]} />
          <meshStandardMaterial color="#efe3cf" roughness={0.6} />
        </mesh>
      );
    case "starfish":
      return (
        <mesh rotation={[-Math.PI / 2, 0, 0.4]} castShadow>
          <extrudeGeometry
            args={[starfishShape, { depth: 0.055, bevelEnabled: false }]}
          />
          <meshStandardMaterial
            color="#e98a6f"
            roughness={0.9}
            flatShading
            side={T.DoubleSide}
          />
        </mesh>
      );
    case "crab":
      return (
        <group>
          <mesh scale={[1, 0.62, 0.82]} castShadow>
            <sphereGeometry args={[0.13, 10, 8]} />
            <meshStandardMaterial color="#d95f43" roughness={0.7} />
          </mesh>
          <mesh position={[0.1, 0.01, 0.12]} castShadow>
            <sphereGeometry args={[0.055, 8, 6]} />
            <meshStandardMaterial color="#d95f43" roughness={0.7} />
          </mesh>
          <mesh position={[-0.1, 0.01, 0.12]} castShadow>
            <sphereGeometry args={[0.055, 8, 6]} />
            <meshStandardMaterial color="#d95f43" roughness={0.7} />
          </mesh>
          <mesh position={[0.05, 0.11, 0.09]}>
            <sphereGeometry args={[0.022, 6, 6]} />
            <meshStandardMaterial color="#2b2b33" />
          </mesh>
          <mesh position={[-0.05, 0.11, 0.09]}>
            <sphereGeometry args={[0.022, 6, 6]} />
            <meshStandardMaterial color="#2b2b33" />
          </mesh>
        </group>
      );
    case "mote":
      return (
        <mesh castShadow>
          <sphereGeometry args={[0.08, 8, 8]} />
          <meshStandardMaterial
            color="#d9f2df"
            emissive="#9fe6b4"
            emissiveIntensity={1.6}
          />
        </mesh>
      );
    default:
      return (
        <mesh castShadow>
          <dodecahedronGeometry args={[0.12, 0]} />
          <meshStandardMaterial color="#9aa3a0" roughness={1} flatShading />
        </mesh>
      );
  }
}
