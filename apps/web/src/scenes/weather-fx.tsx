import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as T from "three";
import type { Weather } from "@island/contracts";
import { random } from "@island/world-core";
import { acquireStorm, onStormFlash } from "../storm";

/** Weather visuals shared by the legacy rooms and the physics rooms; no
 * old-world state imports so the physics chunks stay clean. */

export const weatherWind: Record<Weather, number> = {
  sun: 0.22,
  rain: 0.55,
  thunder: 0.9,
  wind: 1,
};

/** Rain drops that fall around the camera target and wrap around the sky. */
export function Rain({
  low,
  heavy = false,
  span = 75,
}: {
  low: boolean;
  heavy?: boolean;
  span?: number;
}) {
  const ref = useRef<T.Points>(null),
    speed = heavy ? 36 : 27;
  const positions = useMemo(() => {
    const rng = random(913);
    return new Float32Array(
      Array.from({ length: (low ? 500 : 1100) * 3 }, (_, i) => {
        const axis = i % 3;
        if (axis === 1) return rng() * 58;
        return (rng() - 0.5) * 2 * (axis === 0 ? span * 1.25 : span);
      }),
    );
  }, [low, span]);
  useFrame((_, dt) => {
    if (!ref.current) return;
    const p = ref.current.geometry.attributes.position!;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) - dt * speed;
      p.setY(i, y < 0 ? 58 : y);
    }
    p.needsUpdate = true;
  });
  return (
    <points ref={ref} position={[0, 0, 0]}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#9fc2e0"
        size={0.9}
        transparent
        opacity={0.85}
        depthWrite={false}
      />
    </points>
  );
}

/** A lightning flash on the shared storm clock: two bright spikes then dark. */
export function ThunderFlash() {
  const light = useRef<T.AmbientLight>(null),
    // -2 waits for the next storm flash; -1 marks one received, timed next frame.
    start = useRef(-2);
  useEffect(() => {
    const release = acquireStorm(),
      off = onStormFlash(() => {
        start.current = -1;
      });
    return () => {
      release();
      off();
    };
  }, []);
  useFrame(({ clock }) => {
    if (!light.current) return;
    if (start.current === -1) start.current = clock.elapsedTime;
    const t = clock.elapsedTime - start.current,
      f =
        t < 0.1
          ? 1
          : t < 0.24
            ? 0.12
            : t < 0.38
              ? 0.75
              : t < 0.7
                ? ((0.7 - t) / 0.32) * 0.1
                : 0;
    light.current.intensity = 2.6 * f;
  });
  return <ambientLight ref={light} color="#dbe9ff" intensity={0} />;
}

/** Pale streaks rushing across the room when the weather turns windy. */
export function WindStreaks({
  low,
  count = 14,
  strength = 1,
  span = 70,
}: {
  low: boolean;
  count?: number;
  strength?: number;
  span?: number;
}) {
  const group = useRef<T.Group>(null);
  const streaks = useMemo(() => {
    const rng = random(411);
    return Array.from({ length: low ? Math.ceil(count / 2) : count }, () => ({
      y: 2 + rng() * 15,
      z: (rng() - 0.5) * span * 1.7,
      speed: (9 + rng() * 7) * strength,
      offset: rng() * span * 2.4,
      len: 2 + rng() * 2.5,
    }));
  }, [count, strength, span, low]);
  useFrame(({ clock }) => {
    group.current?.children.forEach((child, i) => {
      const s = streaks[i]!;
      child.position.x =
        ((clock.elapsedTime * s.speed + s.offset) % (span * 2.4)) - span * 1.2;
    });
  });
  return (
    <group ref={group}>
      {streaks.map((s, i) => (
        <mesh key={i} position={[-span * 1.2, s.y, s.z]}>
          <boxGeometry args={[s.len, 0.035, 0.035]} />
          <meshBasicMaterial
            color="#f4f8ef"
            transparent
            opacity={0.16 + strength * 0.14}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

/** Shared weather particles and lightning, used by the island and every room. */
export function WeatherFx({
  weather,
  low,
  span = 70,
}: {
  weather: Weather;
  low: boolean;
  span?: number;
}) {
  const wet = weather === "rain" || weather === "thunder";
  const windy = weather === "wind" || weather === "thunder";
  return (
    <>
      {wet && <Rain low={low} heavy={weather === "thunder"} span={span} />}
      {weather === "thunder" && <ThunderFlash />}
      {windy && (
        <WindStreaks
          low={low}
          strength={weather === "thunder" ? 1.2 : 1.4}
          span={span}
        />
      )}
    </>
  );
}
