import { useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as T from "three";
import type { DinosaurHabitatId } from "@island/world-core";

type V3 = [number, number, number];
function Oval({ at, size, color }: { at: V3; size: V3; color: string }) {
  return (
    <mesh position={at} scale={size} castShadow>
      <sphereGeometry args={[1, 10, 8]} />
      <meshStandardMaterial color={color} roughness={0.85} flatShading />
    </mesh>
  );
}
function Limb({
  a,
  b,
  radius,
  color,
}: {
  a: V3;
  b: V3;
  radius: number;
  color: string;
}) {
  const start = new T.Vector3(...a),
    end = new T.Vector3(...b);
  const delta = end.clone().sub(start);
  const q = new T.Quaternion().setFromUnitVectors(
    new T.Vector3(0, 1, 0),
    delta.clone().normalize(),
  );
  return (
    <mesh
      position={start.add(end).multiplyScalar(0.5)}
      quaternion={q}
      castShadow
    >
      <cylinderGeometry args={[radius * 0.65, radius, delta.length(), 7]} />
      <meshStandardMaterial color={color} roughness={0.9} flatShading />
    </mesh>
  );
}
function Eyes({ y, z, width }: { y: number; z: number; width: number }) {
  return (
    <>
      {[-1, 1].map((s) => (
        <group key={s}>
          <Oval
            at={[s * width, y, z]}
            size={[0.14, 0.19, 0.2]}
            color="#f9e5aa"
          />
          <Oval
            at={[s * (width + 0.1), y, z + 0.04]}
            size={[0.065, 0.12, 0.1]}
            color="#23352a"
          />
        </group>
      ))}
    </>
  );
}
function Wing({ side }: { side: number }) {
  return (
    <mesh castShadow>
      <bufferGeometry onUpdate={(g) => g.computeVertexNormals()}>
        <bufferAttribute
          attach="attributes-position"
          args={[
            new Float32Array([
              0,
              0,
              0.8,
              side * 2.6,
              0.2,
              1,
              side * 7,
              0,
              -1.5,
              0,
              0,
              0.8,
              side * 7,
              0,
              -1.5,
              side * 2,
              0,
              -1.8,
              0,
              0,
              0.8,
              side * 2,
              0,
              -1.8,
              0,
              0,
              -1.4,
            ]),
            3,
          ]}
        />
      </bufferGeometry>
      <meshStandardMaterial
        color="#d99b73"
        side={T.DoubleSide}
        roughness={1}
        flatShading
      />
    </mesh>
  );
}
export function Pterosaur({
  index,
  onInspect,
  interactive,
  habitat,
}: AnimalProps) {
  const body = useRef<T.Group>(null),
    left = useRef<T.Group>(null),
    right = useRef<T.Group>(null);
  useFrame(({ clock }) => {
    const t =
      clock.elapsedTime * 0.12 + index * Math.PI + (habitat?.phase ?? 0);
    if (!body.current) return;
    const x = (habitat?.x ?? -40) + Math.cos(t) * (habitat?.radius ?? 23),
      z = (habitat?.z ?? -40) + Math.sin(t) * (habitat?.radius ?? 17);
    body.current.position.set(
      x,
      (habitat ? habitat.ground(x, z) + 12 : 26) +
        Math.sin(t * 2) * 3 +
        index * 4,
      z,
    );
    body.current.rotation.set(
      0,
      Math.atan2(-23 * Math.sin(t), 17 * Math.cos(t)),
      Math.sin(t) * 0.12,
    );
    const flap = Math.sin(clock.elapsedTime * 3 + index) * 0.22;
    if (left.current) left.current.rotation.z = flap;
    if (right.current) right.current.rotation.z = -flap;
  });
  return (
    <group
      ref={body}
      onClick={inspectClick(interactive, () => onInspect("pterosaur"))}
    >
      <Oval at={[0, 0, 0]} size={[0.75, 0.7, 2]} color="#b96f50" />
      <Oval at={[0, 0.8, 1.7]} size={[0.5, 0.65, 0.9]} color="#cc845a" />
      <Limb a={[0, 0.8, 2]} b={[0, 0.6, 4.2]} radius={0.45} color="#e5bf83" />
      <Limb a={[0, 1, 1.4]} b={[0, 2.2, -0.2]} radius={0.45} color="#b4664a" />
      <Eyes y={1} z={1.9} width={0.45} />
      <group ref={left}>
        <Wing side={-1} />
        <Limb a={[0, 0, 0.8]} b={[-7, 0, -1.5]} radius={0.12} color="#a66b50" />
      </group>
      <group ref={right}>
        <Wing side={1} />
        <Limb a={[0, 0, 0.8]} b={[7, 0, -1.5]} radius={0.12} color="#a66b50" />
      </group>
      {[-1, 1].map((s) => (
        <Limb
          key={s}
          a={[s * 0.4, -0.3, -1.2]}
          b={[s * 0.8, -0.8, -2.2]}
          radius={0.13}
          color="#8e644e"
        />
      ))}
    </group>
  );
}
function inspectClick(interactive: boolean, action: () => void) {
  return (e: ThreeEvent<MouseEvent>) => {
    if (!interactive || e.delta > 5) return;
    e.stopPropagation();
    action();
  };
}
type AnimalProps = {
  index: number;
  onInspect: (id: DinosaurHabitatId) => void;
  interactive: boolean;
  habitat?: {
    x: number;
    z: number;
    radius: number;
    phase: number;
    ground(x: number, z: number): number;
  };
};

export function Raptor({
  index,
  onInspect,
  interactive,
  habitat,
}: AnimalProps) {
  const body = useRef<T.Group>(null),
    legs = useRef<T.Group>(null),
    head = useRef<T.Group>(null);
  const pauseUntil = useRef(0),
    time = useRef(0),
    lastClock = useRef(0);
  const color = ["#7d9461", "#9f7954", "#7a908a"][index % 3]!;
  useFrame(({ clock }, dt) => {
    lastClock.current = clock.elapsedTime;
    const now = clock.elapsedTime,
      resting = now < pauseUntil.current || Math.sin(now * 0.25 + index) > 0.84;
    if (!resting) time.current += Math.min(dt, 0.05) * 0.3;
    const t = time.current + index * 2.1 + (habitat?.phase ?? 0);
    if (body.current) {
      const x = (habitat?.x ?? -27) + Math.cos(t) * (habitat?.radius ?? 10),
        z = (habitat?.z ?? 5) + Math.sin(t) * (habitat?.radius ?? 8);
      body.current.position.set(
        x,
        (habitat?.ground(x, z) ?? 0) +
          (resting ? 0 : Math.abs(Math.sin(t * 18)) * 0.16),
        z,
      );
      body.current.rotation.y = Math.atan2(-10 * Math.sin(t), 8 * Math.cos(t));
    }
    legs.current?.children.forEach((leg, i) => {
      leg.rotation.x = resting ? 0 : Math.sin(t * 18 + i * Math.PI) * 0.5;
    });
    if (head.current)
      head.current.rotation.y = resting ? Math.sin(now * 1.1) * 0.3 : 0;
  });
  return (
    <group
      ref={body}
      onClick={inspectClick(interactive, () => {
        pauseUntil.current = lastClock.current + 5;
        onInspect("raptor");
      })}
    >
      <Oval at={[0, 2.3, 0]} size={[0.8, 0.95, 1.8]} color={color} />
      <Oval at={[0, 2.05, 0.8]} size={[0.6, 0.7, 1.1]} color="#c8ba8a" />
      <Limb a={[0, 2.4, -1.3]} b={[0, 2.7, -5.4]} radius={0.55} color={color} />
      <group ref={head}>
        <Limb a={[0, 2.6, 1.1]} b={[0, 3.7, 1.8]} radius={0.5} color={color} />
        <Oval at={[0, 3.8, 2]} size={[0.65, 0.6, 1.1]} color={color} />
        <Oval at={[0, 3.55, 2.5]} size={[0.53, 0.25, 0.8]} color="#c8ba8a" />
        <Eyes y={4} z={2.3} width={0.6} />
      </group>
      <group ref={legs}>
        {[-1, 1].map((s) => (
          <group key={s} position={[s * 0.6, 1.8, -0.3]}>
            <Limb
              a={[0, 0, 0]}
              b={[s * 0.15, -0.7, 0.5]}
              radius={0.35}
              color={color}
            />
            <Limb
              a={[s * 0.15, -0.7, 0.5]}
              b={[s * 0.15, -1.55, 0]}
              radius={0.18}
              color="#bfa577"
            />
            <Oval
              at={[s * 0.15, -1.6, 0.4]}
              size={[0.28, 0.16, 0.65]}
              color="#8b775b"
            />
          </group>
        ))}
      </group>
      {[-1, 1].map((s) => (
        <group key={s}>
          <Limb
            a={[s * 0.6, 2.7, 0.9]}
            b={[s * 1.2, 2.2, 1.6]}
            radius={0.2}
            color={color}
          />
          {[0, 1, 2, 3].map((i) => (
            <Limb
              key={i}
              a={[s * 0.9, 2.35, 1.2 + i * 0.12]}
              b={[s * (1.7 + i * 0.12), 2.05, 0.7 + i * 0.3]}
              radius={0.15}
              color="#d0b783"
            />
          ))}
        </group>
      ))}
      {[0, 1, 2, 3].map((i) => (
        <Oval
          key={i}
          at={[0, 2.8, -2 - i * 0.65]}
          size={[0.5 - i * 0.08, 0.1, 0.65]}
          color="#d0b783"
        />
      ))}
    </group>
  );
}

export function Peacock({
  index,
  onInspect,
  interactive,
  habitat,
}: AnimalProps) {
  const body = useRef<T.Group>(null),
    fan = useRef<T.Group>(null),
    clockTime = useRef(0),
    displayUntil = useRef(0);
  useFrame(({ clock }) => {
    const now = clock.elapsedTime,
      t = now * 0.11 + index * Math.PI + (habitat?.phase ?? 0);
    clockTime.current = now;
    const display =
      now < displayUntil.current
        ? 1
        : 0.35 + (Math.sin(now * 0.35 + index) + 1) * 0.325;
    if (body.current) {
      const x = (habitat?.x ?? 19) + Math.cos(t) * (habitat?.radius ?? 5),
        z = (habitat?.z ?? 27) + Math.sin(t) * (habitat?.radius ?? 6);
      body.current.position.set(x, habitat?.ground(x, z) ?? 0, z);
      body.current.rotation.y = 0.2 + Math.sin(t) * 0.55;
    }
    if (fan.current) {
      fan.current.scale.x = display;
      fan.current.rotation.x = -0.15 - (1 - display) * 0.8;
    }
  });
  return (
    <group
      ref={body}
      onClick={inspectClick(interactive, () => {
        displayUntil.current = clockTime.current + 6;
        onInspect("peacock");
      })}
    >
      <group ref={fan} position={[0, 1.4, -0.8]}>
        {Array.from({ length: 11 }, (_, i) => {
          const a = (i - 5) * 0.24;
          return (
            <group key={i} rotation={[0, 0, a]}>
              <Oval
                at={[0, 2.3, 0]}
                size={[0.48, 2.5, 0.12]}
                color={i % 2 ? "#398c76" : "#578b54"}
              />
              <Oval
                at={[0, 3.8, 0.13]}
                size={[0.33, 0.45, 0.08]}
                color="#d1b265"
              />
              <Oval
                at={[0, 3.8, 0.2]}
                size={[0.22, 0.31, 0.06]}
                color="#237f9b"
              />
              <Oval
                at={[0, 3.8, 0.25]}
                size={[0.1, 0.16, 0.04]}
                color="#213e6b"
              />
            </group>
          );
        })}
      </group>
      <Oval at={[0, 1.4, 0]} size={[0.75, 0.8, 1.15]} color="#217786" />
      <Limb a={[0, 1.6, 0.6]} b={[0, 3, 1]} radius={0.35} color="#267cb3" />
      <Oval at={[0, 3.1, 1.1]} size={[0.4, 0.42, 0.5]} color="#2274ad" />
      <Limb a={[0, 3.1, 1.4]} b={[0, 3, 2]} radius={0.2} color="#d5bd87" />
      <Eyes y={3.25} z={1.2} width={0.35} />
      {[-1, 1].map((s) => (
        <Limb
          key={s}
          a={[s * 0.35, 1, 0]}
          b={[s * 0.35, 0.1, 0.3]}
          radius={0.09}
          color="#9a8965"
        />
      ))}
      {[-1, 0, 1].map((s) => (
        <Limb
          key={s}
          a={[0, 3.4, 1]}
          b={[s * 0.22, 4, 0.9]}
          radius={0.065}
          color="#3ba4ac"
        />
      ))}
    </group>
  );
}
