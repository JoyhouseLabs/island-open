import { useEffect, useMemo, useRef } from "react";
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

/** Vaporeon's small curved smile opens into a rounded mouth with a tongue. */
function VaporeonMouth({ anim }: { anim: AnimalAnim }) {
  const closed = useRef<T.Mesh>(null), open = useRef<T.Group>(null);
  const smile = useMemo(() => new T.CatmullRomCurve3([
    new T.Vector3(-0.048, 0, 0),
    new T.Vector3(-0.026, -0.003, 0),
    new T.Vector3(0, 0.008, 0),
    new T.Vector3(0.025, -0.009, 0),
    new T.Vector3(0.047, -0.012, 0),
  ]), []);
  const cavity = useMemo(() => {
    const shape = new T.Shape();
    shape.moveTo(-0.052, 0.012);
    shape.quadraticCurveTo(0, 0.03, 0.052, 0.012);
    shape.bezierCurveTo(0.05, -0.035, 0.032, -0.075, 0, -0.077);
    shape.bezierCurveTo(-0.032, -0.075, -0.05, -0.035, -0.052, 0.012);
    shape.closePath();
    return shape;
  }, []);
  const tongue = useMemo(() => {
    const shape = new T.Shape();
    shape.moveTo(-0.03, -0.047);
    shape.quadraticCurveTo(0, -0.027, 0.03, -0.047);
    shape.quadraticCurveTo(0.021, -0.069, 0, -0.07);
    shape.quadraticCurveTo(-0.021, -0.069, -0.03, -0.047);
    shape.closePath();
    return shape;
  }, []);
  useFrame(() => {
    const amount = T.MathUtils.clamp(anim.mouth, 0, 1);
    if (closed.current) closed.current.visible = amount <= 0.08;
    if (open.current) {
      open.current.visible = amount > 0.08;
      open.current.scale.set(1 - amount * 0.06, 0.55 + amount * 0.45, 1);
    }
  });
  return <group position={[0, -0.075, 0.283]}>
    <mesh ref={closed}>
      <tubeGeometry args={[smile, 20, 0.0045, 6, false]} />
      <meshBasicMaterial color="#26323d" />
    </mesh>
    <group ref={open} visible={false}>
      <mesh>
        <extrudeGeometry args={[cavity, { depth: 0.012, bevelEnabled: false, curveSegments: 12 }]} />
        <meshBasicMaterial color="#522c3d" />
      </mesh>
      <mesh position={[0, 0, 0.032]}>
        <shapeGeometry args={[tongue, 12]} />
        <meshBasicMaterial color="#e7899d" />
      </mesh>
    </group>
  </group>;
}

/** A water-loving creature in the island's flat-colour style: pale blue
 *  body, a navy head crest and ear fins, a cream neck frill and a split
 *  fish tail that sways while it walks. */
function VaporeonMesh({ anim }: { anim: AnimalAnim }) {
  const body = useRef<T.Group>(null),
    head = useRef<T.Group>(null),
    tail = useRef<T.Group>(null),
    tailFin = useRef<T.Group>(null);
  const eye = useMemo(() => {
    // Soft, slightly angular eyes matching the reference's rounded silhouette.
    const shape = new T.Shape();
    shape.moveTo(-0.046, 0.05);
    shape.quadraticCurveTo(-0.002, 0.066, 0.04, 0.043);
    shape.quadraticCurveTo(0.056, 0.032, 0.05, 0.01);
    shape.lineTo(0.04, -0.045);
    shape.quadraticCurveTo(-0.002, -0.06, -0.042, -0.04);
    shape.quadraticCurveTo(-0.058, -0.005, -0.046, 0.05);
    shape.closePath();
    return shape;
  }, []);
  const earFin = useMemo(() => {
    const shape = new T.Shape();
    shape.moveTo(0, 0.07);
    shape.lineTo(0.52, 0.34);
    shape.quadraticCurveTo(0.4, 0.08, 0.4, -0.16);
    shape.quadraticCurveTo(0.3, -0.12, 0.25, -0.23);
    shape.quadraticCurveTo(0.15, -0.16, 0.05, -0.2);
    shape.closePath();
    return shape;
  }, []);
  const collar = useMemo(() => {
    const shape = new T.Shape();
    for (let i = 0; i < 24; i++) {
      const angle = i / 24 * Math.PI * 2;
      const radius = i % 2 === 0 ? 0.38 : 0.33;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    shape.closePath();
    return shape;
  }, []);
  const fluke = useMemo(() => {
    // Broad, forked fish fin in the horizontal plane, with a narrow root.
    const shape = new T.Shape();
    shape.moveTo(-0.055, 0);
    shape.bezierCurveTo(-0.25, -0.01, -0.51, 0.12, -0.5, 0.55);
    shape.bezierCurveTo(-0.25, 0.56, -0.06, 0.35, 0, 0.13);
    shape.bezierCurveTo(0.06, 0.35, 0.25, 0.56, 0.5, 0.55);
    shape.bezierCurveTo(0.51, 0.12, 0.25, -0.01, 0.055, 0);
    shape.closePath();
    return shape;
  }, []);
  const { tailGeometry, tailRidgeGeometry } = useMemo(() => {
    const curve = new T.CatmullRomCurve3([
      new T.Vector3(0, 0, 0),
      new T.Vector3(0.15, -0.12, -0.5),
      new T.Vector3(0.68, -0.18, -0.6),
      new T.Vector3(0.95, -0.08, 0.12),
      new T.Vector3(0.95, 0.16, 1.05),
    ]);
    const geometry = new T.TubeGeometry(curve, 24, 1, 8, false);
    const positions = geometry.getAttribute("position");
    for (let ring = 0; ring <= 24; ring++) {
      const t = ring / 24;
      const center = curve.getPointAt(t);
      const radius = 0.15 * (1 - t) + 0.055 * t;
      for (let side = 0; side <= 8; side++) {
        const i = ring * 9 + side;
        positions.setXYZ(i,
          center.x + (positions.getX(i) - center.x) * radius,
          center.y + (positions.getY(i) - center.y) * radius,
          center.z + (positions.getZ(i) - center.z) * radius);
      }
    }
    geometry.computeVertexNormals();
    // A continuous, thick dorsal ridge follows the same curve as the tail.
    // Four vertices per cross-section form a closed strip with 14 tapered spikes.
    const ridgePositions: number[] = [], ridgeIndices: number[] = [];
    const sections = 28;
    for (let i = 0; i <= sections; i++) {
      const t = 0.02 + 0.94 * i / sections;
      const center = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t);
      const across = new T.Vector3(tangent.z, 0, -tangent.x).normalize();
      const radius = 0.15 * (1 - t) + 0.055 * t;
      const halfWidth = 0.018 * (1 - 0.45 * t);
      const spike = i % 2 === 1 ? 0.14 * (1 - t) + 0.05 * t : 0.025;
      const top = i === sections ? 0.005 : spike;
      for (const [side, height] of [[-1, -0.03], [1, -0.03], [1, top], [-1, top]] as const) {
        ridgePositions.push(center.x + across.x * side * halfWidth,
          center.y + radius + height, center.z + across.z * side * halfWidth);
      }
      if (i < sections) {
        for (let side = 0; side < 4; side++) {
          const a = i * 4 + side, b = i * 4 + (side + 1) % 4;
          ridgeIndices.push(a, b, b + 4, a, b + 4, a + 4);
        }
      }
    }
    const end = sections * 4;
    ridgeIndices.push(0, 2, 1, 0, 3, 2, end, end + 1, end + 2, end, end + 2, end + 3);
    const ridge = new T.BufferGeometry();
    ridge.setAttribute("position", new T.Float32BufferAttribute(ridgePositions, 3));
    ridge.setIndex(ridgeIndices);
    ridge.computeVertexNormals();
    return { tailGeometry: geometry, tailRidgeGeometry: ridge };
  }, []);
  useEffect(() => () => {
    tailGeometry.dispose();
    tailRidgeGeometry.dispose();
  }, [tailGeometry, tailRidgeGeometry]);
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
      tail.current.rotation.y = Math.sin(anim.phase * 3.1) * 0.14;
      tail.current.rotation.x = 0.02 + (anim.moving ? Math.sin(anim.phase * 7) * 0.04 : 0);
    }
    if (tailFin.current)
      tailFin.current.rotation.y = Math.PI + Math.sin(anim.phase * 3.1 - 0.65) * 0.22;
  });
  return (
    <group ref={body}>
      <mesh position={[0, 0.7, -0.04]} scale={[0.4, 0.36, 0.74]} castShadow>
        <sphereGeometry args={[1, 14, 12]} />
        <meshStandardMaterial color="#7cc8e8" roughness={0.9} />
      </mesh>
      {/* Navy fins standing along the spine. */}
      {(
        [
          [1.12, 0.02, 0.4],
          [1.13, -0.24, 0.32],
          [1.1, -0.48, 0.27],
        ] as [number, number, number][]
      ).map(([y, z, h], i) => (
        <mesh key={i} position={[0, y, z]} rotation={[-0.25, 0, 0]} castShadow>
          <coneGeometry args={[0.07, h, 4]} />
          <meshStandardMaterial color="#2f5d94" roughness={0.9} />
        </mesh>
      ))}
      <group ref={head} position={[0, 1.15, 0.5]}>
        {/* A broad white neck ruff behind the blue face. */}
        <mesh position={[0, -0.12, 0.015]} rotation={[-0.35, 0, 0]} castShadow>
          <extrudeGeometry args={[collar, { depth: 0.045, bevelEnabled: false }]} />
          <meshStandardMaterial color="#f2f0e8" roughness={0.9} />
        </mesh>
        <mesh castShadow>
          <sphereGeometry args={[0.28, 14, 12]} />
          <meshStandardMaterial color="#7cc8e8" roughness={0.9} />
        </mesh>
        <mesh position={[0, -0.005, 0.278]}>
          <sphereGeometry args={[0.025, 8, 8]} />
          <meshStandardMaterial color="#2a3a55" roughness={1} />
        </mesh>
        <VaporeonMouth anim={anim} />
        {[-1, 1].map((s) => (
          <group key={s} position={[s * 0.12, 0.067, 0.25]} rotation={[0, s * 0.38, -s * 0.14]}>
            <mesh>
              <extrudeGeometry args={[eye, { depth: 0.018, bevelEnabled: false, curveSegments: 12 }]} />
              <meshBasicMaterial color="#18242c" />
            </mesh>
            <mesh position={[0, 0, 0.038]} scale={[0.84, 0.84, 1]}>
              <shapeGeometry args={[eye, 12]} />
              <meshBasicMaterial color="#343d42" />
            </mesh>
            {/* Both catchlights sit high and toward the nose, like the reference. */}
            <mesh position={[-s * 0.012, 0.023, 0.058]} scale={[0.011, 0.018, 1]} rotation={[0, 0, -0.15]}>
              <circleGeometry args={[1, 20]} />
              <meshBasicMaterial color="#ffffff" toneMapped={false} />
            </mesh>
          </group>
        ))}
        {/* The swept-back head crest. */}
        <mesh position={[0, 0.39, -0.02]} rotation={[-0.45, 0, 0]} castShadow>
          <coneGeometry args={[0.065, 0.54, 4]} />
          <meshStandardMaterial color="#2f5d94" roughness={0.9} />
        </mesh>
        {[-1, 1].map((s) => (
          <group key={s} position={[s * 0.2, 0.08, -0.04]} scale={[s, 1, 1]} rotation={[0, s * -0.16, 0]}>
            <mesh castShadow>
              <extrudeGeometry args={[earFin, { depth: 0.04, bevelEnabled: false, curveSegments: 6 }]} />
              <meshStandardMaterial color="#2f5d94" roughness={0.9} />
            </mesh>
            <mesh position={[0.025, -0.012, 0.06]} scale={[0.88, 0.84, 1]}>
              <extrudeGeometry args={[earFin, { depth: 0.018, bevelEnabled: false, curveSegments: 6 }]} />
              <meshStandardMaterial color="#eee3a2" roughness={0.9} />
            </mesh>
            {[[0.34, -0.13], [0.37, 0.02], [0.42, 0.17]].map(([x, y], i) => {
              const end = new T.Vector3(x!, y!, 0);
              const rotation = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), end.clone().normalize());
              return <mesh key={i} position={[x! / 2, y! / 2, 0.09]} quaternion={rotation}>
                <cylinderGeometry args={[0.006, 0.009, end.length(), 5]} />
                <meshStandardMaterial color="#b6b888" roughness={0.9} />
              </mesh>;
            })}
          </group>
        ))}
      </group>
      <group ref={tail} position={[0, 0.74, -0.6]}>
        <mesh geometry={tailGeometry} castShadow>
          <meshStandardMaterial color="#7cc8e8" roughness={0.9} />
        </mesh>
        <mesh geometry={tailRidgeGeometry} castShadow>
          <meshStandardMaterial color="#2f5d94" roughness={0.9} />
        </mesh>
        <group ref={tailFin} position={[0.95, 0.16, 1.05]} rotation={[0, Math.PI, 0.45]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.025, 0.025]} castShadow>
            <extrudeGeometry args={[fluke, { depth: 0.05, bevelEnabled: false, curveSegments: 8 }]} />
            <meshStandardMaterial color="#57b0da" roughness={0.9} />
          </mesh>
        </group>
      </group>
      <QuadLeg x={-0.17} z={0.32} w={0.12} h={0.48} color="#57b0da" anim={anim} flip={0} />
      <QuadLeg x={0.17} z={0.32} w={0.12} h={0.48} color="#57b0da" anim={anim} flip={1} />
      <QuadLeg x={-0.17} z={-0.28} w={0.13} h={0.48} color="#57b0da" anim={anim} flip={1} />
      <QuadLeg x={0.17} z={-0.28} w={0.13} h={0.48} color="#57b0da" anim={anim} flip={0} />
    </group>
  );
}

/** The child's geometric kitten: a chunky rectangular body, a smaller square
 * face, triangle ears/mouth, square eyes, narrow rectangular limbs and tail.
 * Each triangle has depth, so its silhouette survives rotating the camera. */
function CatMesh({ anim }: { anim: AnimalAnim }) {
  const body = useRef<T.Group>(null), head = useRef<T.Group>(null),
    tail = useRef<T.Group>(null), mouth = useRef<T.Mesh>(null),
    closedMouth = useRef<T.Mesh>(null);
  const triangle = useMemo(() => {
    const shape = new T.Shape();
    shape.moveTo(-0.5, 0);
    shape.lineTo(0.5, 0);
    shape.lineTo(0, 1);
    shape.closePath();
    return shape;
  }, []);
  const fur = "#dfa064", paw = "#f4dab1", ink = "#3e4c40";
  useFrame(() => {
    const hello = anim.action === "greet" || anim.action === "pet";
    if (body.current) {
      const y = anim.action === "rest" ? -0.07 :
        anim.moving ? Math.abs(Math.sin(anim.phase * 7)) * 0.02 : 0;
      body.current.position.y += (y - body.current.position.y) * 0.15;
    }
    if (head.current) head.current.rotation.x +=
      (poses[anim.action].neck * 0.35 - head.current.rotation.x) * 0.12;
    if (tail.current) tail.current.rotation.y = Math.sin(anim.phase * 2.4) * (hello ? 0.45 : 0.18);
    if (mouth.current) {
      mouth.current.visible = anim.mouth > 0.08;
      mouth.current.scale.y = 0.0375 * (1 + anim.mouth * 0.3);
    }
    if (closedMouth.current) closedMouth.current.visible = anim.mouth <= 0.08;
  });
  return (
    <group ref={body} name="geometric-cat">
      {/* A short, broad horizontal torso: this kitten always stands on four paws. */}
      <mesh position={[0, 0.64, 0]} castShadow>
        <boxGeometry args={[0.64, 0.58, 0.9]} />
        <meshStandardMaterial color={fur} roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.37, 0]}>
        <boxGeometry args={[0.4, 0.12, 0.66]} />
        <meshStandardMaterial color={paw} roughness={0.95} />
      </mesh>
      <group ref={head} position={[0, 0.98, 0.49]}>
        <mesh castShadow>
          <boxGeometry args={[0.52, 0.52, 0.5]} />
          <meshStandardMaterial color={fur} roughness={0.95} />
        </mesh>
        {[-1, 1].map((side) => (
          <group key={side}>
            <mesh position={[side * 0.17, 0.24, -0.02]} scale={[0.21, 0.24, 1]} castShadow>
              <extrudeGeometry args={[triangle, { depth: 0.18, bevelEnabled: false }]} />
              <meshStandardMaterial color={fur} roughness={0.95} />
            </mesh>
            <mesh position={[side * 0.17, 0.28, 0.185]} scale={[0.11, 0.14, 1]}>
              <extrudeGeometry args={[triangle, { depth: 0.018, bevelEnabled: false }]} />
              <meshStandardMaterial color="#d88f87" roughness={0.95} />
            </mesh>
            <mesh position={[side * 0.13, 0.055, 0.28]}>
              <boxGeometry args={[0.105, 0.105, 0.025]} />
              <meshStandardMaterial color={ink} roughness={1} />
            </mesh>
            {[-1, 0, 1].map((line) => (
              <mesh key={line} position={[side * 0.3, -0.09 + line * 0.05, 0.29]}
                rotation={[0, 0, side * line * 0.2]}>
                <boxGeometry args={[0.29, 0.009, 0.012]} />
                <meshStandardMaterial color={ink} roughness={1} />
              </mesh>
            ))}
          </group>
        ))}
        {/* A separate square nose above the triangular mouth. */}
        <mesh position={[0, -0.025, 0.31]} name="cat-square-nose">
          <boxGeometry args={[0.06, 0.06, 0.045]} />
          <meshStandardMaterial color="#a76d5c" roughness={1} />
        </mesh>
        <mesh ref={mouth} name="cat-open-mouth" visible={false} position={[0, -0.17, 0.28]} scale={[0.055, 0.0375, 1]}>
          <extrudeGeometry args={[triangle, { depth: 0.022, bevelEnabled: false }]} />
          <meshStandardMaterial color="#875348" roughness={1} />
        </mesh>
        <mesh ref={closedMouth} name="cat-closed-mouth" position={[0, -0.15, 0.29]}>
          <boxGeometry args={[0.065, 0.012, 0.022]} />
          <meshStandardMaterial color="#875348" roughness={1} />
        </mesh>
      </group>
      <QuadLeg x={-0.22} z={0.31} w={0.11} h={0.39} color={paw} anim={anim} flip={0} />
      <QuadLeg x={0.22} z={0.31} w={0.11} h={0.39} color={paw} anim={anim} flip={1} />
      <QuadLeg x={-0.22} z={-0.31} w={0.11} h={0.39} color={paw} anim={anim} flip={1} />
      <QuadLeg x={0.22} z={-0.31} w={0.11} h={0.39} color={paw} anim={anim} flip={0} />
      <group ref={tail} position={[0, 0.7, -0.43]}>
        <mesh position={[0, 0.12, -0.34]} rotation={[0.35, 0, 0]} castShadow>
          <boxGeometry args={[0.09, 0.09, 0.78]} />
          <meshStandardMaterial color={fur} roughness={0.95} />
        </mesh>
      </group>
    </group>
  );
}

/** Reference-inspired, code-built model: charcoal coat, red eyes and
 * gold markings. All motion consumes AnimalAnim, including remote residents. */
function UmbreonMesh({ anim }: { anim: AnimalAnim }) {
  const body = useRef<T.Group>(null), head = useRef<T.Group>(null),
    tail = useRef<T.Group>(null), ears = useRef<T.Group>(null);
  const legs = useRef<(T.Group | null)[]>([]);
  const eyes = useRef<T.Group>(null);
  const reduced = useRef(false);
  const gold = useMemo(() => new T.MeshStandardMaterial({
    color: "#ffe080", emissive: "#f3bd43", emissiveIntensity: 0.7, roughness: 0.65,
  }), []);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => { reduced.current = preference.matches; };
    sync();
    preference.addEventListener("change", sync);
    return () => { preference.removeEventListener("change", sync); };
  }, []);
  useEffect(() => () => gold.dispose(), [gold]);
  useFrame((_, dt) => {
    const t = reduced.current ? 0 : anim.phase;
    const pose = poses[anim.action];
    const happy = anim.action === "pet" || anim.action === "greet";
    const blend = 1 - Math.exp(-Math.min(dt, 0.05) * 9);
    if (body.current) {
      body.current.position.y = -pose.sink + Math.sin(t * 2) * 0.012;
      body.current.rotation.x = T.MathUtils.lerp(body.current.rotation.x, pose.body * 0.3, blend);
    }
    if (head.current) {
      head.current.rotation.x = T.MathUtils.lerp(head.current.rotation.x, pose.neck * 0.65, blend);
      head.current.rotation.z = happy ? Math.sin(t * 3) * 0.09 : Math.sin(t * 0.7) * 0.025;
    }
    if (tail.current) tail.current.rotation.z = Math.sin(t * (happy ? 5 : 1.8)) * (happy ? 0.3 : 0.13);
    if (ears.current) ears.current.rotation.z = Math.sin(t * 1.2) * 0.035;
    legs.current.forEach((leg, i) => {
      if (leg) leg.rotation.x = anim.moving ? Math.sin(t * 7 + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.43 : 0;
    });
    if (eyes.current) eyes.current.scale.y = t % 5.6 > 5.42 ? 0.13 : 1;
    gold.emissiveIntensity = 0.65 + (Math.sin(t * 1.6) + 1) * (happy ? 0.4 : 0.16);
  });
  const fur = "#28363f";
  // A tapered leaf silhouette, made of joined rings instead of cone ears.
  const leaf = useMemo(() => new T.LatheGeometry([
    new T.Vector2(0.07, 0), new T.Vector2(0.16, 0.16),
    new T.Vector2(0.175, 0.36), new T.Vector2(0.145, 0.57),
    new T.Vector2(0.08, 0.8), new T.Vector2(0, 1.04),
  ], 12), []);
  useEffect(() => () => leaf.dispose(), [leaf]);
  return <group ref={body} name="umbreon-model">
    <mesh position={[0, 0.76, -0.08]} scale={[0.32, 0.37, 0.61]} castShadow>
      <sphereGeometry args={[1, 16, 12]} /><meshStandardMaterial color={fur} roughness={0.86} />
    </mesh>
    <mesh position={[0, 0.94, 0.36]} rotation={[-0.25, 0, 0]} scale={[0.27, 0.44, 0.28]} castShadow>
      <sphereGeometry args={[1, 14, 12]} /><meshStandardMaterial color={fur} roughness={0.86} />
    </mesh>
    <group ref={head} position={[0, 1.28, 0.4]}>
      <mesh scale={[0.32, 0.3, 0.33]} castShadow>
        <sphereGeometry args={[1, 18, 14]} /><meshStandardMaterial color={fur} roughness={0.86} />
      </mesh>
      <mesh position={[0, -0.09, 0.24]} scale={[0.2, 0.14, 0.21]} castShadow>
        <sphereGeometry args={[1, 12, 10]} /><meshStandardMaterial color={fur} roughness={0.86} />
      </mesh>
      <mesh position={[0, -0.07, 0.44]} scale={[0.045, 0.026, 0.028]}>
        <sphereGeometry args={[1, 10, 8]} /><meshStandardMaterial color="#101920" />
      </mesh>
      <Mouth anim={anim} position={[0, -0.15, 0.411]} width={0.07} color="#101920" />
      <mesh position={[0, 0.14, 0.286]} rotation={[-0.4, 0, 0]} scale={[0.82, 1.1, 0.45]} material={gold}>
        <torusGeometry args={[0.105, 0.031, 8, 24]} />
      </mesh>
      <group ref={eyes} position={[0, -0.015, 0]}>
        {[-1, 1].map(s => <group key={s} position={[s * 0.215, 0, 0.245]} rotation={[0, s * 0.55, s * -0.16]}>
          <mesh scale={[0.095, 0.062, 0.026]}>
            <sphereGeometry args={[1, 12, 10]} /><meshStandardMaterial color="#ee8056" emissive="#a43a1b" emissiveIntensity={0.3} />
          </mesh>
          <mesh position={[0, 0, 0.025]} scale={[0.02, 0.051, 0.01]}>
            <sphereGeometry args={[1, 10, 8]} /><meshStandardMaterial color="#151c22" />
          </mesh>
          <mesh position={[-0.022, 0.026, 0.033]}>
            <sphereGeometry args={[0.015, 8, 6]} /><meshBasicMaterial color="#fff5df" />
          </mesh>
        </group>)}
      </group>
      <group ref={ears}>
        {[-1, 1].map(s => <group key={s} position={[s * 0.19, 0.2, -0.025]} rotation={[-0.18, 0, -s * 0.42]} scale={[1, 0.82, 0.58]}>
          <mesh geometry={leaf} castShadow><meshStandardMaterial color={fur} roughness={0.86} /></mesh>
          <mesh position={[0, 0.49, 0]} material={gold}>
            <cylinderGeometry args={[0.145, 0.168, 0.145, 12, 1, true]} />
          </mesh>
        </group>)}
      </group>
    </group>
    {([[-0.23, 0.32], [0.23, 0.32], [-0.23, -0.43], [0.23, -0.43]] as const).map(([x, z], i) =>
      <group key={i} ref={el => { legs.current[i] = el; }} position={[x, 0.69, z]}>
        <mesh position={[0, -0.27, 0]} scale={[0.105, 0.36, 0.13]} castShadow>
          <sphereGeometry args={[1, 12, 10]} /><meshStandardMaterial color={fur} roughness={0.86} />
        </mesh>
        <mesh position={[0, -0.625, 0.075]} scale={[0.11, 0.065, 0.18]} castShadow>
          <sphereGeometry args={[1, 12, 8]} /><meshStandardMaterial color={fur} roughness={0.86} />
        </mesh>
        <mesh position={[Math.sign(x) * 0.106, -0.16, 0]} rotation={[0, Math.PI / 2, 0]} scale={[0.75, 1.35, 0.45]} material={gold}>
          <torusGeometry args={[0.093, 0.025, 8, 20]} />
        </mesh>
      </group>)}
    <group ref={tail} position={[0, 0.87, -0.57]}>
      <group rotation={[-0.87, 0, 0]} scale={[1.25, 1.12, 0.8]}>
        <mesh geometry={leaf} castShadow><meshStandardMaterial color={fur} roughness={0.86} /></mesh>
        <mesh position={[0, 0.5, 0]} material={gold}>
          <cylinderGeometry args={[0.14, 0.17, 0.19, 12, 1, true]} />
        </mesh>
      </group>
    </group>
  </group>;
}

/** Upright summit companion; silhouette follows the user's Pikachu reference. */
function PikachuMesh({ anim }: { anim: AnimalAnim }) {
  const body = useRef<T.Group>(null), head = useRef<T.Group>(null),
    tail = useRef<T.Group>(null), eyes = useRef<T.Group>(null);
  const ears = useRef<(T.Group | null)[]>([]), arms = useRef<(T.Group | null)[]>([]),
    feet = useRef<(T.Group | null)[]>([]);
  const reduced = useRef(false);
  const yellow = "#ffdc35", ink = "#262a30", brown = "#9a6033";
  const geometry = useMemo(() => {
    const ring = (r: number, y: number) => new T.Vector2(r, y);
    const ear = new T.LatheGeometry([ring(0.055, 0), ring(0.115, 0.2), ring(0.1, 0.48), ring(0.075, 0.61)], 12);
    const tip = new T.LatheGeometry([ring(0.075, 0.61), ring(0.055, 0.76), ring(0, 0.91)], 12);
    const polygon = (points: [number, number][]) => {
      const shape = new T.Shape(points.map(([x, y]) => new T.Vector2(x, y)));
      shape.closePath();
      return new T.ExtrudeGeometry(shape, { depth: 0.11, bevelEnabled: false });
    };
    return {
      ear, tip,
      tail: polygon([[0.06, 0.3], [0.3, 0.32], [0.12, 0.44], [0.34, 0.75], [0.9, 1.08], [0.75, 1.39], [-0.05, 0.97], [0.11, 0.62], [-0.13, 0.7]]),
      root: polygon([[0, 0], [0.16, 0.02], [0.3, 0.32], [0.06, 0.3], [-0.1, 0.2]]),
    };
  }, []);
  useEffect(() => () => Object.values(geometry).forEach(g => g.dispose()), [geometry]);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => { reduced.current = preference.matches; };
    sync(); preference.addEventListener("change", sync);
    return () => preference.removeEventListener("change", sync);
  }, []);
  useFrame((_, dt) => {
    const t = reduced.current ? 0 : anim.phase;
    const happy = anim.action === "pet" || anim.action === "greet";
    const resting = anim.action === "rest";
    const blend = 1 - Math.exp(-Math.min(dt, 0.05) * 9);
    if (body.current) {
      const hop = anim.moving ? Math.abs(Math.sin(t * 7)) * 0.045 : happy ? Math.abs(Math.sin(t * 4)) * 0.07 : Math.sin(t * 2) * 0.012;
      body.current.position.y = T.MathUtils.lerp(body.current.position.y, (resting ? -0.12 : 0) + hop, blend);
    }
    if (head.current) {
      head.current.rotation.x = T.MathUtils.lerp(head.current.rotation.x, poses[anim.action].neck * 0.35, blend);
      head.current.rotation.z = Math.sin(t * (happy ? 2.7 : 0.8)) * (happy ? 0.09 : 0.025);
    }
    if (tail.current) tail.current.rotation.y = Math.sin(t * (happy ? 5 : 1.8)) * (happy ? 0.24 : 0.12);
    if (eyes.current) eyes.current.scale.y = t % 5.2 > 5.04 ? 0.12 : 1;
    ears.current.forEach((ear, i) => { if (ear) ear.rotation.z = (i ? -1 : 1) * (0.32 + Math.sin(t * 1.6 + i) * 0.045); });
    arms.current.forEach((arm, i) => {
      if (!arm) return;
      arm.rotation.z = (i ? 1 : -1) * (happy ? 0.95 + Math.sin(t * 6) * 0.2 : 0.25);
      arm.rotation.x = anim.moving ? Math.sin(t * 7 + i * Math.PI) * 0.35 : 0;
    });
    feet.current.forEach((foot, i) => { if (foot) foot.rotation.x = anim.moving ? Math.sin(t * 7 + i * Math.PI) * 0.45 : 0; });
  });
  return <group ref={body} name="pikachu-model">
    <mesh position={[0, 0.65, 0]} scale={[0.4, 0.54, 0.31]} castShadow>
      <sphereGeometry args={[1, 18, 14]} /><meshStandardMaterial color={yellow} roughness={0.88} />
    </mesh>
    {/* Rounded brown back stripes stand proud of the coat; no coplanar decals. */}
    {[0.57, 0.79].map(y => <mesh key={y} position={[0, y, -0.29]} scale={[0.27, 0.055, 0.045]}>
      <sphereGeometry args={[1, 14, 8]} /><meshStandardMaterial color={brown} roughness={0.95} />
    </mesh>)}
    {[-1, 1].map((side, i) => <group key={side}>
      <group ref={el => { feet.current[i] = el; }} position={[side * 0.24, 0.23, 0]}>
        <mesh position={[0, -0.13, 0.12]} scale={[0.16, 0.1, 0.25]} castShadow>
          <sphereGeometry args={[1, 14, 10]} /><meshStandardMaterial color={yellow} roughness={0.88} />
        </mesh>
      </group>
      <group ref={el => { arms.current[i] = el; }} position={[side * 0.32, 0.94, 0.08]}>
        <mesh position={[0, -0.18, 0.06]} scale={[0.125, 0.27, 0.13]} castShadow>
          <sphereGeometry args={[1, 14, 10]} /><meshStandardMaterial color={yellow} roughness={0.88} />
        </mesh>
      </group>
    </group>)}
    <group ref={head} position={[0, 1.3, 0.05]}>
      <mesh scale={[0.43, 0.38, 0.36]} castShadow>
        <sphereGeometry args={[1, 20, 16]} /><meshStandardMaterial color={yellow} roughness={0.88} />
      </mesh>
      {[-1, 1].map((side, i) => <group key={side}>
        <group ref={el => { ears.current[i] = el; }} position={[side * 0.28, 0.25, -0.025]} rotation={[-0.12, 0, -side * 0.32]} scale={[1, 0.86, 0.58]}>
          <mesh geometry={geometry.ear} castShadow><meshStandardMaterial color={yellow} roughness={0.88} /></mesh>
          <mesh geometry={geometry.tip} castShadow><meshStandardMaterial color={ink} roughness={0.95} /></mesh>
        </group>
        <mesh position={[side * 0.327, -0.13, 0.236]} rotation={[0, side * 0.45, 0]} scale={[0.102, 0.107, 0.035]}>
          <sphereGeometry args={[1, 16, 12]} /><meshStandardMaterial color="#ee493d" roughness={0.85} />
        </mesh>
      </group>)}
      <group ref={eyes} position={[0, 0.045, 0]}>
        {[-1, 1].map(side => <group key={side} position={[side * 0.19, 0, 0.318]} rotation={[0, side * 0.25, 0]}>
          <mesh scale={[0.071, 0.082, 0.035]}><sphereGeometry args={[1, 14, 10]} /><meshStandardMaterial color={ink} roughness={0.7} /></mesh>
          <mesh position={[-0.018, 0.027, 0.031]}><sphereGeometry args={[0.023, 10, 8]} /><meshBasicMaterial color="#fffbea" /></mesh>
        </group>)}
      </group>
      <mesh position={[0, -0.035, 0.366]} scale={[0.03, 0.019, 0.018]}><sphereGeometry args={[1, 10, 8]} /><meshStandardMaterial color={ink} /></mesh>
      {[-1, 1].map(side => <mesh key={side} position={[side * 0.043, -0.103, 0.35]} rotation={[0, 0, Math.PI]}>
        <torusGeometry args={[0.044, 0.009, 6, 14, Math.PI]} /><meshStandardMaterial color={ink} />
      </mesh>)}
      <Mouth anim={anim} position={[0, -0.15, 0.33]} width={0.065} color="#a7484c" />
    </group>
    <group ref={tail} position={[0.1, 0.34, -0.4]}>
      <mesh geometry={geometry.root} castShadow><meshStandardMaterial color={brown} roughness={0.9} /></mesh>
      <mesh geometry={geometry.tail} castShadow><meshStandardMaterial color={yellow} roughness={0.88} /></mesh>
    </group>
  </group>;
}

/** Flat cloth strips with forked ends; cached samples keep per-frame work bounded. */
function SylveonRibbon({ points, anim, reduced, offset }: {
  points: [number, number, number][];
  anim: AnimalAnim;
  reduced: { current: boolean };
  offset: number;
}) {
  const strip = useMemo(() => {
    const steps = 28, curve = new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p)));
    const geometry = new T.BufferGeometry();
    const base = new Float32Array(((steps + 1) * 2 + 1) * 3);
    const colors = new Float32Array(base.length), weights = new Float32Array(base.length / 3);
    const indices: number[] = [];
    const color = new T.Color();
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, p = curve.getPoint(t), tangent = curve.getTangent(t);
      const normal = new T.Vector3(-tangent.y, tangent.x, 0).normalize();
      const width = 0.065 + Math.sin(t * Math.PI / 2) * 0.035;
      color.set(t < 0.68 ? "#fff8f2" : t < 0.79 ? "#ed9fb7" : t < 0.89 ? "#748fc1" : "#a5e0f0");
      for (let side = 0; side < 2; side++) {
        const v = i * 2 + side, sign = side === 0 ? -1 : 1;
        base.set([p.x + normal.x * width * sign, p.y + normal.y * width * sign, p.z], v * 3);
        color.toArray(colors, v * 3); weights[v] = t;
      }
      if (i < steps - 1) {
        const k = i * 2;
        indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const end = curve.getPoint(1), tangent = curve.getTangent(1), notch = (steps + 1) * 2;
    base.set(end.addScaledVector(tangent, -0.13).toArray(), notch * 3);
    color.toArray(colors, notch * 3); weights[notch] = 1;
    const last = (steps - 1) * 2, tip = steps * 2;
    indices.push(last, last + 1, notch, last, notch, tip, last + 1, tip + 1, notch);
    geometry.setAttribute("position", new T.BufferAttribute(base.slice(), 3).setUsage(T.DynamicDrawUsage));
    geometry.setAttribute("color", new T.BufferAttribute(colors, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
    if (geometry.boundingSphere) geometry.boundingSphere.radius += 0.18;
    return { geometry, base, weights };
  }, [points]);
  useEffect(() => () => strip.geometry.dispose(), [strip]);
  useFrame(() => {
    const attr = strip.geometry.getAttribute("position") as T.BufferAttribute;
    const target = attr.array as Float32Array;
    const t = anim.phase, happy = anim.action === "pet" || anim.action === "greet";
    for (let i = 0; i < strip.weights.length; i++) {
      const w = strip.weights[i]!, k = i * 3;
      const wave = reduced.current ? 0 : Math.sin(t * (happy ? 3 : 1.6) + w * 5 + offset) * w;
      target[k] = strip.base[k]!;
      target[k + 1] = strip.base[k + 1]! + wave * (happy ? 0.075 : 0.04);
      target[k + 2] = strip.base[k + 2]! + wave * 0.06;
    }
    attr.needsUpdate = true; strip.geometry.computeVertexNormals();
  });
  return <mesh geometry={strip.geometry} castShadow>
    <meshStandardMaterial vertexColors side={T.DoubleSide} roughness={0.88} />
  </mesh>;
}

function SylveonBow() {
  const lobe = useMemo(() => {
    const s = new T.Shape();
    s.moveTo(0, 0); s.bezierCurveTo(0.1, 0.12, 0.21, 0.42, 0.31, 0.34);
    s.bezierCurveTo(0.42, 0.15, 0.37, -0.18, 0.26, -0.3);
    s.bezierCurveTo(0.16, -0.35, 0.05, -0.04, 0, 0); s.closePath();
    return new T.ExtrudeGeometry(s, { depth: 0.045, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: 0.009, bevelThickness: 0.009, curveSegments: 10 });
  }, []);
  useEffect(() => () => lobe.dispose(), [lobe]);
  return <group>
    {[-1, 1].map(side => <group key={side} scale={[side, 1, 1]}>
      <mesh geometry={lobe} castShadow><meshStandardMaterial color="#fff8f2" roughness={0.9} /></mesh>
      <mesh geometry={lobe} position={[0.012, 0, 0.075]} scale={[0.56, 0.5, 0.5]}>
        <meshStandardMaterial color="#ef9eb8" roughness={0.88} />
      </mesh>
    </group>)}
    <mesh position={[0, 0, 0.073]} scale={[0.085, 0.105, 0.06]}>
      <sphereGeometry args={[1, 12, 10]} /><meshStandardMaterial color="#ef9eb8" roughness={0.88} />
    </mesh>
  </group>;
}

/** White/pink coat, blue eyes, two bows and four flowing ribbon feelers. */
function SylveonMesh({ anim }: { anim: AnimalAnim }) {
  const body = useRef<T.Group>(null), head = useRef<T.Group>(null), tail = useRef<T.Group>(null), eyes = useRef<T.Group>(null);
  const legs = useRef<(T.Group | null)[]>([]), ears = useRef<(T.Group | null)[]>([]);
  const reduced = useRef(false);
  const white = "#fff8f2", pink = "#ed9fb7", blue = "#91d7ec";
  const leaf = useMemo(() => new T.LatheGeometry([
    new T.Vector2(0.065, 0), new T.Vector2(0.17, 0.2), new T.Vector2(0.17, 0.47),
    new T.Vector2(0.1, 0.76), new T.Vector2(0, 0.98),
  ], 14), []);
  const ribbons = useMemo(() => ({
    neckLeft: [[-0.11, 1.04, 0.7], [-0.65, 0.82, 0.67], [-0.84, 0.46, 0.17], [-0.68, 0.33, -0.26], [-0.46, 0.48, -0.52]],
    neckRight: [[0.1, 1.04, 0.7], [0.53, 0.87, 0.63], [0.98, 1.04, 0.15], [0.85, 1.38, -0.46], [0.39, 1.31, -0.79]],
    earLeft: [[0, 0.02, 0.06], [-0.33, 0.39, 0.13], [-0.66, 0.64, 0.07], [-0.57, 0.97, 0.01], [-0.27, 1.14, 0.02]],
    earRight: [[0.05, 0, 0.04], [0.48, -0.08, 0.02], [0.93, 0.12, -0.14], [1.16, 0.42, -0.25], [1.31, 0.55, -0.26]],
  }) as Record<string, [number, number, number][]>, []);
  useEffect(() => () => leaf.dispose(), [leaf]);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => { reduced.current = preference.matches; };
    sync(); preference.addEventListener("change", sync);
    return () => preference.removeEventListener("change", sync);
  }, []);
  useFrame((_, dt) => {
    const t = reduced.current ? 0 : anim.phase, pose = poses[anim.action];
    const happy = anim.action === "pet" || anim.action === "greet";
    const blend = 1 - Math.exp(-Math.min(dt, 0.05) * 9);
    if (body.current) {
      body.current.position.y = -pose.sink * 0.7 + Math.sin(t * 2) * 0.012;
      body.current.rotation.x = T.MathUtils.lerp(body.current.rotation.x, pose.body * 0.25, blend);
    }
    if (head.current) {
      head.current.rotation.x = T.MathUtils.lerp(head.current.rotation.x, pose.neck * 0.6, blend);
      head.current.rotation.z = Math.sin(t * (happy ? 2.5 : 0.8)) * (happy ? 0.08 : 0.025);
    }
    if (tail.current) tail.current.rotation.z = Math.sin(t * (happy ? 4 : 1.6)) * (happy ? 0.24 : 0.1);
    if (eyes.current) eyes.current.scale.y = t % 5.8 > 5.63 ? 0.13 : 1;
    legs.current.forEach((leg, i) => { if (leg) leg.rotation.x = anim.moving ? Math.sin(t * 7 + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.4 : 0; });
    ears.current.forEach((ear, i) => { if (ear) ear.rotation.z = (i ? -1 : 1) * (0.37 + Math.sin(t * 1.4 + i) * 0.035); });
  });
  return <group ref={body} name="sylveon-model">
    <mesh position={[0, 0.78, -0.08]} scale={[0.32, 0.35, 0.57]} castShadow>
      <sphereGeometry args={[1, 18, 14]} /><meshStandardMaterial color={white} roughness={0.9} />
    </mesh>
    <mesh position={[0, 0.95, 0.33]} scale={[0.26, 0.4, 0.29]} castShadow>
      <sphereGeometry args={[1, 16, 12]} /><meshStandardMaterial color={white} roughness={0.9} />
    </mesh>
    <group ref={head} position={[0, 1.32, 0.42]}>
      <mesh scale={[0.36, 0.33, 0.34]} castShadow>
        <sphereGeometry args={[1, 20, 16]} /><meshStandardMaterial color={pink} roughness={0.88} />
      </mesh>
      {/* Two white face lobes leave a pink forehead and brow between them. */}
      {[-1, 1].map(side => <mesh key={side} position={[side * 0.14, -0.075, 0.18]} scale={[0.21, 0.25, 0.205]}>
        <sphereGeometry args={[1, 16, 12]} /><meshStandardMaterial color={white} roughness={0.9} />
      </mesh>)}
      <group ref={eyes} position={[0, -0.035, 0]}>
        {[-1, 1].map(side => <group key={side} position={[side * 0.175, 0, 0.367]} rotation={[0, side * 0.18, 0]}>
          <mesh scale={[0.105, 0.14, 0.028]}><sphereGeometry args={[1, 16, 12]} /><meshStandardMaterial color="#416784" /></mesh>
          <mesh position={[0, 0, 0.025]} scale={[0.087, 0.121, 0.017]}><sphereGeometry args={[1, 16, 12]} /><meshStandardMaterial color={blue} roughness={0.65} /></mesh>
          <mesh position={[-0.021, 0.044, 0.045]} scale={[0.027, 0.046, 0.009]}><sphereGeometry args={[1, 12, 8]} /><meshBasicMaterial color="#fffefa" /></mesh>
        </group>)}
      </group>
      <mesh position={[0, -0.13, 0.374]} scale={[0.026, 0.016, 0.018]}><sphereGeometry args={[1, 10, 8]} /><meshStandardMaterial color="#56536a" /></mesh>
      <Mouth anim={anim} position={[0, -0.205, 0.337]} width={0.09} color="#746176" />
      {[-1, 1].map((side, i) => <group key={side} ref={el => { ears.current[i] = el; }} position={[side * 0.21, 0.22, -0.015]} rotation={[-0.13, 0, -side * 0.37]} scale={[1, 0.9, 0.53]}>
        <mesh geometry={leaf} castShadow><meshStandardMaterial color={pink} roughness={0.88} /></mesh>
        <mesh geometry={leaf} position={[0, 0.12, 0.12]} scale={[0.5, 0.69, 0.2]}>
          <meshStandardMaterial color="#748fc1" roughness={0.9} />
        </mesh>
      </group>)}
      <group position={[0.29, 0.25, 0.26]} rotation={[0, 0, -0.28]}>
        <group scale={0.66}><SylveonBow /></group>
        <SylveonRibbon points={ribbons.earLeft!} anim={anim} reduced={reduced} offset={0.6} />
        <SylveonRibbon points={ribbons.earRight!} anim={anim} reduced={reduced} offset={2.3} />
      </group>
    </group>
    <group position={[0, 1.03, 0.64]} scale={0.72}><SylveonBow /></group>
    <SylveonRibbon points={ribbons.neckLeft!} anim={anim} reduced={reduced} offset={1.2} />
    <SylveonRibbon points={ribbons.neckRight!} anim={anim} reduced={reduced} offset={3.1} />
    {([[-0.23, 0.31], [0.23, 0.31], [-0.23, -0.42], [0.23, -0.42]] as const).map(([x, z], i) =>
      <group key={i} ref={el => { legs.current[i] = el; }} position={[x, 0.66, z]}>
        <mesh position={[0, -0.23, 0]} scale={[0.105, 0.3, 0.12]} castShadow>
          <sphereGeometry args={[1, 12, 10]} /><meshStandardMaterial color={white} roughness={0.9} />
        </mesh>
        <mesh position={[0, -0.46, 0.035]} scale={[0.108, 0.18, 0.14]} castShadow>
          <sphereGeometry args={[1, 12, 10]} /><meshStandardMaterial color={pink} roughness={0.88} />
        </mesh>
        <mesh position={[0, -0.6, 0.09]} scale={[0.115, 0.06, 0.18]} castShadow>
          <sphereGeometry args={[1, 12, 8]} /><meshStandardMaterial color={pink} roughness={0.88} />
        </mesh>
      </group>)}
    <group ref={tail} position={[0, 0.86, -0.58]}>
      <mesh geometry={leaf} rotation={[-0.95, 0, 0.08]} scale={[0.75, 1.12, 0.6]} castShadow>
        <meshStandardMaterial color={pink} roughness={0.88} />
      </mesh>
    </group>
  </group>;
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
  cat: CatMesh,
  umbreon: UmbreonMesh,
  pikachu: PikachuMesh,
  sylveon: SylveonMesh,
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
