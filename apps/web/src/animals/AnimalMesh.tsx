import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as T from "three";
import type { Species } from "@island/world-core";

export type AnimalAction =
  | "none"
  | "sniff"
  | "rest"
  | "browse"
  | "drink"
  | "greet"
  | "pet";
export type AnimalAnim = {
  phase: number;
  moving: boolean;
  action: AnimalAction;
  /** 0 closed … 1 fully open; the animal drives it while calling out. */
  mouth: number;
};

/** A little dark mouth line below the nose that opens while the animal
 *  calls. Closed it reads as a quiet smile. */
function Mouth({
  anim,
  position,
  width = 0.12,
  color = "#3d4046",
}: {
  anim: AnimalAnim;
  position: [number, number, number];
  width?: number;
  color?: string;
}) {
  const mesh = useRef<T.Mesh>(null);
  useFrame(() => {
    if (!mesh.current) return;
    const open = anim.mouth;
    mesh.current.scale.set(1 - open * 0.25, 1 + open * 3.2, 1);
  });
  return (
    <mesh ref={mesh} position={position}>
      <boxGeometry args={[width, 0.022, 0.02]} />
      <meshStandardMaterial color={color} roughness={1} />
    </mesh>
  );
}

/** A leg that swings around its hip; used four times per animal. */
function QuadLeg({
  x,
  z,
  w,
  h,
  color,
  anim,
  flip,
}: {
  x: number;
  z: number;
  w: number;
  h: number;
  color: string;
  anim: AnimalAnim;
  flip: number;
}) {
  const pivot = useRef<T.Group>(null);
  useFrame(() => {
    if (!pivot.current) return;
    const swing = anim.moving ? Math.sin(anim.phase * 7 + flip * Math.PI) * 0.5 : 0;
    pivot.current.rotation.x = swing;
  });
  return (
    <group ref={pivot} position={[x, h, z]}>
      <mesh position={[0, -h / 2, 0]} castShadow>
        <boxGeometry args={[w, h, w]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
    </group>
  );
}

/** Pose targets per action; poses lerp so actions blend gently. */
const poses: Record<
  AnimalAction,
  { neck: number; body: number; sink: number }
> = {
  none: { neck: 0, body: 0, sink: 0 },
  sniff: { neck: 0.55, body: 0.12, sink: 0.04 },
  rest: { neck: 0.2, body: -0.55, sink: 0.16 },
  browse: { neck: -0.55, body: 0.05, sink: 0 },
  drink: { neck: 1.15, body: 0.18, sink: 0.05 },
  greet: { neck: -0.15, body: 0, sink: 0 },
  pet: { neck: -0.25, body: 0, sink: 0 },
};

function PandaMesh({ anim }: { anim: AnimalAnim }) {
  const body = useRef<T.Group>(null),
    head = useRef<T.Group>(null);
  useFrame(({ clock }) => {
    const pose = poses[anim.action];
    if (body.current) {
      body.current.rotation.x +=
        (pose.body - body.current.rotation.x) * 0.12;
      const hop =
        anim.action === "greet" || anim.action === "pet"
          ? Math.abs(Math.sin(anim.phase * 10)) * 0.18
          : anim.moving
            ? Math.abs(Math.sin(anim.phase * 7)) * 0.03
            : 0;
      body.current.position.y = -pose.sink + hop;
    }
    if (head.current)
      head.current.rotation.x +=
        (pose.neck + (anim.action === "sniff" ? Math.sin(anim.phase * 5) * 0.12 : 0) -
          head.current.rotation.x) *
        0.12;
  });
  return (
    <group ref={body}>
      <mesh position={[0, 0.62, 0]} scale={[0.56, 0.44, 0.66]} castShadow>
        <sphereGeometry args={[1, 14, 12]} />
        <meshStandardMaterial color="#f2f0e8" roughness={0.95} />
      </mesh>
      <group ref={head} position={[0, 0.98, 0.4]}>
        <mesh castShadow>
          <sphereGeometry args={[0.3, 14, 12]} />
          <meshStandardMaterial color="#f2f0e8" roughness={0.95} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.21, 0.24, -0.02]} castShadow>
            <sphereGeometry args={[0.1, 10, 8]} />
            <meshStandardMaterial color="#3d4046" roughness={0.95} />
          </mesh>
        ))}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.12, 0.05, 0.26]} rotation={[0, 0, s * 0.5]}>
            <boxGeometry args={[0.12, 0.08, 0.02]} />
            <meshStandardMaterial color="#3d4046" roughness={1} />
          </mesh>
        ))}
        <mesh position={[0, -0.06, 0.29]}>
          <sphereGeometry args={[0.05, 8, 8]} />
          <meshStandardMaterial color="#3d4046" roughness={1} />
        </mesh>
        <Mouth anim={anim} position={[0, -0.155, 0.288]} width={0.13} />
      </group>
      <QuadLeg x={-0.24} z={0.3} w={0.17} h={0.42} color="#3d4046" anim={anim} flip={0} />
      <QuadLeg x={0.24} z={0.3} w={0.17} h={0.42} color="#3d4046" anim={anim} flip={1} />
      <QuadLeg x={-0.24} z={-0.28} w={0.18} h={0.42} color="#3d4046" anim={anim} flip={1} />
      <QuadLeg x={0.24} z={-0.28} w={0.18} h={0.42} color="#3d4046" anim={anim} flip={0} />
    </group>
  );
}

function GiraffeMesh({ anim }: { anim: AnimalAnim }) {
  const body = useRef<T.Group>(null),
    neck = useRef<T.Group>(null);
  useFrame(() => {
    const pose = poses[anim.action];
    if (body.current) {
      const hop =
        anim.action === "greet" || anim.action === "pet"
          ? Math.abs(Math.sin(anim.phase * 9)) * 0.12
          : anim.moving
            ? Math.abs(Math.sin(anim.phase * 6)) * 0.02
            : 0;
      body.current.position.y = -pose.sink + hop;
      body.current.rotation.x += (pose.body - body.current.rotation.x) * 0.1;
    }
    if (neck.current)
      neck.current.rotation.x +=
        (0.35 + pose.neck - neck.current.rotation.x) * 0.08;
  });
  return (
    <group ref={body}>
      <mesh position={[0, 1.85, 0]} castShadow>
        <boxGeometry args={[0.52, 0.62, 1.15]} />
        <meshStandardMaterial color="#d9b56a" roughness={0.95} />
      </mesh>
      {(
        [
          [0.27, 1.8, 0.25],
          [0.27, 1.95, -0.2],
          [-0.27, 1.78, -0.05],
          [0.2, 2.12, 0.05],
        ] as [number, number, number][]
      ).map(([x, y, z], i) => (
        <mesh key={i} position={[x, y, z]} rotation={[0, i, 0.3]}>
          <boxGeometry args={[0.06, 0.2, 0.24]} />
          <meshStandardMaterial color="#a97f3e" roughness={1} />
        </mesh>
      ))}
      <group ref={neck} position={[0, 2.05, 0.48]} rotation={[0.35, 0, 0]}>
        <mesh position={[0, 0.6, 0]} castShadow>
          <boxGeometry args={[0.24, 1.35, 0.26]} />
          <meshStandardMaterial color="#d9b56a" roughness={0.95} />
        </mesh>
        <group position={[0, 1.35, 0.03]}>
          <mesh castShadow>
            <boxGeometry args={[0.24, 0.24, 0.42]} />
            <meshStandardMaterial color="#d9b56a" roughness={0.95} />
          </mesh>
          {[-1, 1].map((s) => (
            <group key={s}>
              <mesh position={[s * 0.07, 0.2, 0]}>
                <cylinderGeometry args={[0.02, 0.02, 0.14, 6]} />
                <meshStandardMaterial color="#8a6a3a" roughness={1} />
              </mesh>
              <mesh position={[s * 0.07, 0.29, 0]}>
                <sphereGeometry args={[0.035, 8, 6]} />
                <meshStandardMaterial color="#6b4f2a" roughness={1} />
              </mesh>
            </group>
          ))}
          <mesh position={[0, -0.04, 0.24]}>
            <sphereGeometry args={[0.045, 8, 8]} />
            <meshStandardMaterial color="#6b4f2a" roughness={1} />
          </mesh>
          <Mouth anim={anim} position={[0, -0.11, 0.23]} width={0.1} color="#6b4f2a" />
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.16, 0.06, -0.06]} rotation={[0, 0, s * 0.6]}>
              <boxGeometry args={[0.14, 0.04, 0.1]} />
              <meshStandardMaterial color="#c9a355" roughness={1} />
            </mesh>
          ))}
        </group>
      </group>
      <QuadLeg x={-0.17} z={0.4} w={0.13} h={1.55} color="#c9a355" anim={anim} flip={0} />
      <QuadLeg x={0.17} z={0.4} w={0.13} h={1.55} color="#c9a355" anim={anim} flip={1} />
      <QuadLeg x={-0.17} z={-0.42} w={0.14} h={1.55} color="#c9a355" anim={anim} flip={1} />
      <QuadLeg x={0.17} z={-0.42} w={0.14} h={1.55} color="#c9a355" anim={anim} flip={0} />
      <mesh position={[0, 1.95, -0.62]} rotation={[0.5, 0, 0]}>
        <boxGeometry args={[0.06, 0.5, 0.06]} />
        <meshStandardMaterial color="#c9a355" roughness={1} />
      </mesh>
    </group>
  );
}

function WolfMesh({ anim }: { anim: AnimalAnim }) {
  const body = useRef<T.Group>(null),
    head = useRef<T.Group>(null),
    tail = useRef<T.Group>(null);
  useFrame(({ clock }) => {
    const pose = poses[anim.action];
    if (body.current) {
      const hop =
        anim.action === "greet" || anim.action === "pet"
          ? Math.abs(Math.sin(anim.phase * 10)) * 0.16
          : anim.moving
            ? Math.abs(Math.sin(anim.phase * 8)) * 0.035
            : 0;
      body.current.position.y = -pose.sink + hop;
      body.current.rotation.x += (pose.body - body.current.rotation.x) * 0.12;
    }
    if (head.current)
      head.current.rotation.x +=
        (pose.neck + (anim.action === "sniff" ? Math.sin(anim.phase * 5) * 0.14 : 0) -
          head.current.rotation.x) *
        0.12;
    if (tail.current)
      tail.current.rotation.y = Math.sin(anim.phase * 3.4) * 0.35;
  });
  return (
    <group ref={body}>
      <mesh position={[0, 0.72, 0]} scale={[0.42, 0.4, 0.72]} castShadow>
        <sphereGeometry args={[1, 14, 12]} />
        <meshStandardMaterial color="#8d939e" roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.66, 0.4]} scale={[0.3, 0.28, 0.3]}>
        <sphereGeometry args={[1, 12, 10]} />
        <meshStandardMaterial color="#d7dade" roughness={0.95} />
      </mesh>
      <group ref={head} position={[0, 1.02, 0.56]}>
        <mesh castShadow>
          <boxGeometry args={[0.32, 0.28, 0.34]} />
          <meshStandardMaterial color="#8d939e" roughness={0.95} />
        </mesh>
        <mesh position={[0, -0.03, 0.22]}>
          <boxGeometry args={[0.16, 0.12, 0.12]} />
          <meshStandardMaterial color="#d7dade" roughness={0.95} />
        </mesh>
        <Mouth anim={anim} position={[0, -0.075, 0.283]} width={0.09} color="#4a3f37" />
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.1, 0.21, 0]} rotation={[0, 0, s * 0.2]} castShadow>
            <coneGeometry args={[0.08, 0.2, 4]} />
            <meshStandardMaterial color="#7c828d" roughness={0.95} />
          </mesh>
        ))}
        <mesh position={[0, 0.02, 0.19]} scale={[0.13, 0.035, 0.02]}>
          <planeGeometry />
          <meshStandardMaterial
            color="#d9a15e"
            emissive="#d9a15e"
            emissiveIntensity={1.4}
          />
        </mesh>
      </group>
      <group ref={tail} position={[0, 0.86, -0.62]}>
        <mesh rotation={[0.7, 0, 0]} castShadow>
          <coneGeometry args={[0.16, 0.62, 7]} />
          <meshStandardMaterial color="#7c828d" roughness={0.95} />
        </mesh>
      </group>
      <QuadLeg x={-0.18} z={0.34} w={0.13} h={0.5} color="#7c828d" anim={anim} flip={0} />
      <QuadLeg x={0.18} z={0.34} w={0.13} h={0.5} color="#7c828d" anim={anim} flip={1} />
      <QuadLeg x={-0.18} z={-0.3} w={0.14} h={0.5} color="#7c828d" anim={anim} flip={1} />
      <QuadLeg x={0.18} z={-0.3} w={0.14} h={0.5} color="#7c828d" anim={anim} flip={0} />
    </group>
  );
}

/** A water-loving creature in the island's flat-colour style: pale blue
 *  body, a navy head crest and ear fins, a cream neck frill and a split
 *  fish tail that sways while it walks. */
function VaporeonMesh({ anim }: { anim: AnimalAnim }) {
  const body = useRef<T.Group>(null),
    head = useRef<T.Group>(null),
    tail = useRef<T.Group>(null);
  useFrame(() => {
    const pose = poses[anim.action];
    if (body.current) {
      const hop =
        anim.action === "greet" || anim.action === "pet"
          ? Math.abs(Math.sin(anim.phase * 10)) * 0.15
          : anim.moving
            ? Math.abs(Math.sin(anim.phase * 8)) * 0.03
            : 0;
      body.current.position.y = -pose.sink + hop;
      body.current.rotation.x += (pose.body - body.current.rotation.x) * 0.12;
    }
    if (head.current)
      head.current.rotation.x +=
        (pose.neck + (anim.action === "sniff" ? Math.sin(anim.phase * 5) * 0.13 : 0) -
          head.current.rotation.x) *
        0.12;
    if (tail.current) {
      tail.current.rotation.y = Math.sin(anim.phase * 3.1) * 0.4;
      tail.current.rotation.x = -0.2 + (anim.moving ? Math.sin(anim.phase * 7) * 0.15 : 0);
    }
  });
  return (
    <group ref={body}>
      <mesh position={[0, 0.7, -0.04]} scale={[0.46, 0.4, 0.74]} castShadow>
        <sphereGeometry args={[1, 14, 12]} />
        <meshStandardMaterial color="#7cc8e8" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.58, 0.3]} scale={[0.3, 0.27, 0.38]}>
        <sphereGeometry args={[1, 12, 10]} />
        <meshStandardMaterial color="#f2ecd9" roughness={0.9} />
      </mesh>
      {/* Cream frill ringing the neck like a collar of little fins. */}
      <group position={[0, 0.88, 0.26]}>
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i / 8) * Math.PI * 2;
          return (
            <group key={i} rotation={[0, a, 0]}>
              <mesh position={[0.27, 0.05, 0]} rotation={[0.35, 0, -1.15]}>
                <coneGeometry args={[0.055, 0.26, 4]} />
                <meshStandardMaterial color="#f2ecd9" roughness={0.9} />
              </mesh>
            </group>
          );
        })}
      </group>
      {/* Navy fins standing along the spine. */}
      {(
        [
          [1.03, 0.02, 0.22],
          [1.06, -0.24, 0.18],
          [1.04, -0.48, 0.15],
        ] as [number, number, number][]
      ).map(([y, z, h], i) => (
        <mesh key={i} position={[0, y, z]} rotation={[-0.25, 0, 0]} castShadow>
          <coneGeometry args={[0.07, h, 4]} />
          <meshStandardMaterial color="#2f5d94" roughness={0.9} />
        </mesh>
      ))}
      <group ref={head} position={[0, 1.0, 0.5]}>
        <mesh castShadow>
          <sphereGeometry args={[0.28, 14, 12]} />
          <meshStandardMaterial color="#7cc8e8" roughness={0.9} />
        </mesh>
        <mesh position={[0, -0.07, 0.22]} scale={[0.13, 0.09, 0.13]}>
          <sphereGeometry args={[1, 10, 8]} />
          <meshStandardMaterial color="#f2ecd9" roughness={0.9} />
        </mesh>
        <mesh position={[0, -0.005, 0.3]}>
          <sphereGeometry args={[0.045, 8, 8]} />
          <meshStandardMaterial color="#2a3a55" roughness={1} />
        </mesh>
        <Mouth anim={anim} position={[0, -0.115, 0.262]} width={0.11} color="#2a3a55" />
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.12, 0.07, 0.235]}>
            <sphereGeometry args={[0.05, 10, 8]} />
            <meshStandardMaterial color="#26334d" roughness={1} />
          </mesh>
        ))}
        {/* The swept-back head crest. */}
        <mesh position={[0, 0.3, 0.02]} rotation={[-0.45, 0, 0]} castShadow>
          <coneGeometry args={[0.11, 0.34, 4]} />
          <meshStandardMaterial color="#2f5d94" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.27, -0.19]} rotation={[-0.6, 0, 0]} castShadow>
          <coneGeometry args={[0.09, 0.24, 4]} />
          <meshStandardMaterial color="#2f5d94" roughness={0.9} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh
            key={s}
            position={[s * 0.24, 0.12, -0.02]}
            rotation={[-0.3, 0, s * 1.15]}
            castShadow
          >
            <coneGeometry args={[0.07, 0.24, 4]} />
            <meshStandardMaterial color="#2f5d94" roughness={0.9} />
          </mesh>
        ))}
      </group>
      <group ref={tail} position={[0, 0.74, -0.6]}>
        {[-1, 1].map((s) => (
          <mesh
            key={s}
            position={[s * 0.1, 0.14, -0.08]}
            rotation={[-0.5, 0, s * 0.55]}
            castShadow
          >
            <coneGeometry args={[0.11, 0.46, 4]} />
            <meshStandardMaterial color="#f2ecd9" roughness={0.9} />
          </mesh>
        ))}
      </group>
      <QuadLeg x={-0.17} z={0.32} w={0.12} h={0.48} color="#57b0da" anim={anim} flip={0} />
      <QuadLeg x={0.17} z={0.32} w={0.12} h={0.48} color="#57b0da" anim={anim} flip={1} />
      <QuadLeg x={-0.17} z={-0.28} w={0.13} h={0.48} color="#57b0da" anim={anim} flip={1} />
      <QuadLeg x={0.17} z={-0.28} w={0.13} h={0.48} color="#57b0da" anim={anim} flip={0} />
    </group>
  );
}

/** Which mesh each species renders with. The walking fox is the shared GLB
 *  (useFox); admin-placed "fox" animals reuse the panda build, as before.
 *  Adding a species without a mesh entry is a compile error here — the
 *  bespoke geometry lives in this file, one function per species. */
const meshes: Record<
  Species,
  (props: { anim: AnimalAnim }) => ReturnType<typeof PandaMesh>
> = {
  fox: PandaMesh,
  panda: PandaMesh,
  giraffe: GiraffeMesh,
  wolf: WolfMesh,
  vaporeon: VaporeonMesh,
};

export function AnimalMesh({
  species,
  anim,
}: {
  species: Species;
  anim: AnimalAnim;
}) {
  const Mesh = meshes[species];
  return <Mesh anim={anim} />;
}
