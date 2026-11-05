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
