import { useMemo, useRef } from "react";
import * as T from "three";
import { useFrame } from "@react-three/fiber";
import { random, starlightFeatures } from "@island/world-core";
import { Plants, Box } from "../Plants";
import { useGrowth } from "../progress/store";
import { PlayerRig } from "../player/Player";
import {
  SceneCanvas,
  SceneFrame,
  SkyRig,
  exitClick,
  usePlacer,
  weatherWind,
  type SceneProps,
} from "./shared";

/** Drifting fireflies orbiting the clearing at breathing speed. */
function Fireflies({ low }: { low: boolean }) {
  const points = useRef<T.Points>(null);
  const count = low ? 24 : 52;
  const orbits = useMemo(() => {
    const rng = random(331),
      list: { r: number; a: number; speed: number; y: number; phase: number }[] = [];
    for (let i = 0; i < count; i++)
      list.push({
        r: 3 + rng() * 24,
        a: rng() * Math.PI * 2,
        speed: (0.05 + rng() * 0.12) * (rng() < 0.5 ? 1 : -1),
        y: 0.8 + rng() * 4.5,
        phase: rng() * Math.PI * 2,
      });
    return list;
  }, [count]);
  useFrame(({ clock }) => {
    if (!points.current) return;
    const p = points.current.geometry.attributes.position!;
    orbits.forEach((o, i) => {
      o.a += o.speed * 0.016;
      p.setXYZ(
        i,
        Math.cos(o.a) * o.r,
        o.y + Math.sin(clock.elapsedTime * 0.7 + o.phase) * 0.8,
        Math.sin(o.a) * o.r * 0.86,
      );
    });
    p.needsUpdate = true;
  });
  const positions = useMemo(
    () => new Float32Array(count * 3),
    [count],
  );
  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#bfe9d8"
        size={0.34}
        transparent
        opacity={0.9}
        blending={T.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}
/** A shooting star that crosses the sky every few breaths. */
function ShootingStar() {
  const streak = useRef<T.Mesh>(null);
  useFrame(({ clock }) => {
    if (!streak.current) return;
    const cycle = 9,
      t = clock.elapsedTime % cycle;
    if (t < 1.1) {
      const k = t / 1.1;
      streak.current.visible = true;
      streak.current.position.set(
        -70 + k * 120,
        66 - k * 38,
        -95 + k * 30,
      );
      streak.current.rotation.z = -0.32;
      (streak.current.material as T.MeshBasicMaterial).opacity =
        Math.sin(k * Math.PI) * 0.85;
    } else streak.current.visible = false;
  });
  return (
    <mesh ref={streak}>
      <boxGeometry args={[9, 0.12, 0.12]} />
      <meshBasicMaterial color="#eafcf2" transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}
/** Glowing mushrooms and moss patches that keep the floor lit. */
function GlowFlora() {
  const flora = useMemo(() => {
    const rng = random(97),
      mushrooms: { x: number; z: number; s: number; tone: number }[] = [],
      moss: { x: number; z: number; r: number; tone: number }[] = [];
    for (const stone of starlightFeatures.stones) {
      for (let i = 0; i < 2; i++) {
        const a = rng() * Math.PI * 2,
          d = 2 + rng() * 3.4;
        mushrooms.push({
          x: stone.x + Math.cos(a) * d,
          z: stone.z + Math.sin(a) * d,
          s: 0.5 + rng() * 0.7,
          tone: rng() < 0.5 ? 0 : 1,
        });
      }
    }
    for (let i = 0; i < 14; i++) {
      const a = rng() * Math.PI * 2,
        d = 4 + rng() * 20;
      moss.push({
        x: Math.cos(a) * d,
        z: Math.sin(a) * d * 0.88,
        r: 0.5 + rng() * 1.3,
        tone: rng() < 0.5 ? 0 : 1,
      });
    }
    return { mushrooms, moss };
  }, []);
  return (
    <>
      {flora.moss.map((m, i) => (
        <mesh key={`m${i}`} position={[m.x, 0.04, m.z]} rotation={[-Math.PI / 2, 0, i]}>
          <circleGeometry args={[m.r, 12, 0.3, 5.4]} />
          <meshStandardMaterial
            color={m.tone ? "#6f9d8c" : "#5c7f93"}
            emissive={m.tone ? "#3f8f75" : "#3d6f8a"}
            emissiveIntensity={0.5}
            roughness={1}
          />
        </mesh>
      ))}
      {flora.mushrooms.map((m, i) => (
        <group key={i} position={[m.x, 0, m.z]} scale={m.s}>
          <mesh position={[0, 0.28, 0]}>
            <cylinderGeometry args={[0.12, 0.17, 0.56, 6]} />
            <meshStandardMaterial color="#cdd8e0" roughness={1} />
          </mesh>
          <mesh position={[0, 0.58, 0]}>
            <sphereGeometry args={[0.4, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial
              color={m.tone ? "#8f7fc0" : "#6fc4b4"}
              emissive={m.tone ? "#7b64c4" : "#3fb8a4"}
              emissiveIntensity={1.1}
              roughness={0.85}
            />
          </mesh>
        </group>
      ))}
    </>
  );
}
/** The ring of standing stones and the star basin at the clearing's heart. */
function Stones() {
  const orb = useRef<T.Group>(null);
  useFrame(({ clock }) => {
    if (orb.current) {
      orb.current.position.y = 2.5 + Math.sin(clock.elapsedTime * 0.8) * 0.3;
      orb.current.rotation.y = clock.elapsedTime * 0.4;
    }
  });
  return (
    <>
      {starlightFeatures.stones.map((s, i) => (
        <group key={i} position={[s.x, 0, s.z]} rotation={[0, i * 0.7, (i % 3) * 0.06]}>
          <mesh position={[0, 3.2, 0]} scale={[1.25, 3.2, 0.9]} castShadow>
            <dodecahedronGeometry args={[1, 0]} />
            <meshStandardMaterial color="#5a6a7d" flatShading roughness={1} />
          </mesh>
          <Box
            position={[0, 4.4, 0.72]}
            scale={[0.55, 0.55, 0.06]}
            color="#9fe8d8"
            emissive={true}
          />
        </group>
      ))}
      <group>
        <mesh position={[0, 0.5, 0]} castShadow>
          <cylinderGeometry args={[1.9, 2.3, 1, 12]} />
          <meshStandardMaterial color="#4d5a6b" flatShading roughness={1} />
        </mesh>
        <mesh position={[0, 1.02, 0]}>
          <cylinderGeometry args={[1.6, 1.6, 0.1, 12]} />
          <meshStandardMaterial color="#2c3644" roughness={0.9} />
        </mesh>
        <group ref={orb} position={[0, 2.5, 0]}>
          <mesh>
            <sphereGeometry args={[0.55, 14, 12]} />
            <meshStandardMaterial
              color="#d8f6e8"
              emissive="#9fe8d8"
              emissiveIntensity={2.2}
            />
          </mesh>
          {[0.9, 1.2].map((r, i) => (
            <mesh key={r} rotation={[i * 0.9, i * 0.6, 0.4]}>
              <torusGeometry args={[r, 0.035, 6, 40]} />
              <meshStandardMaterial
                color="#bfe9d8"
                emissive="#7fd8c0"
                emissiveIntensity={0.9}
              />
            </mesh>
          ))}
        </group>
      </group>
    </>
  );
}
/** The wish lantern, a star-shop decoration that bobs above the clearing. */
function WishLantern() {
  const { state } = useGrowth();
  const lantern = useRef<T.Group>(null);
  useFrame(({ clock }) => {
    if (lantern.current) {
      lantern.current.position.y = 5.6 + Math.sin(clock.elapsedTime * 0.8) * 0.4;
      lantern.current.rotation.y = Math.sin(clock.elapsedTime * 0.5) * 0.2;
      lantern.current.rotation.z = Math.sin(clock.elapsedTime * 0.7) * 0.06;
    }
  });
  if (!state.owned["decor-lantern"]) return null;
  return (
    <group ref={lantern} position={[11, 5.6, -7]}>
      <mesh castShadow>
        <boxGeometry args={[0.72, 0.92, 0.72]} />
        <meshStandardMaterial
          color="#e8d9b0"
          emissive="#e8c264"
          emissiveIntensity={0.45}
          roughness={0.9}
        />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.36, 0, 0]}>
          <boxGeometry args={[0.02, 0.92, 0.72]} />
          <meshStandardMaterial color="#8a6a3a" roughness={1} />
        </mesh>
      ))}
      <mesh position={[0, 0.62, 0]}>
        <coneGeometry args={[0.34, 0.3, 4]} />
        <meshStandardMaterial color="#6b4f2a" roughness={1} />
      </mesh>
      <pointLight color="#f0c674" intensity={2.6} distance={17} />
    </group>
  );
}

/** The cave mouth that leads home, lit by a rim of quiet light. */
function CaveExit({
  tool,
  onExit,
}: {
  tool: SceneProps["tool"];
  onExit: () => void;
}) {
  const { x, z } = starlightFeatures.cave;
  return (
    <group position={[x, 0, z]} onClick={exitClick(tool, onExit)}>
      <mesh position={[0, 3.4, 0]}>
        <circleGeometry args={[3.6, 26]} />
        <meshBasicMaterial color="#0c1219" side={T.DoubleSide} />
      </mesh>
      {Array.from({ length: 7 }, (_, i) => {
        const a = (i / 6) * Math.PI;
        return (
          <mesh
            key={i}
            position={[Math.cos(a) * 4.1, 1 + Math.sin(a) * 6.2, 0.3]}
            scale={[1.6, 1.9, 1.5]}
            castShadow
          >
            <dodecahedronGeometry args={[1, 0]} />
            <meshStandardMaterial color="#525f70" flatShading roughness={1} />
          </mesh>
        );
      })}
      <mesh position={[0, 3.5, 0.55]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[3.7, 0.09, 6, 44, Math.PI]} />
        <meshStandardMaterial
          color="#a9e6d2"
          emissive="#6fd0b8"
          emissiveIntensity={1.4}
        />
      </mesh>
    </group>
  );
}
import { ContentAnimals } from "../animals";
import Collectibles from "../collect/Collectibles";

function Starlight(props: SceneProps) {
  const { world, tool, onPlace, onExit, low } = props,
    weather = world.environment.weather ?? "sun";
  const place = usePlacer(tool, onPlace);
  return (
    <>
      {/* The clearing sleeps in its own night, whatever the island's clock says. */}
      <SkyRig
        hour={2}
        low={low}
        sky={{ day: "#241a3d", night: "#1b1430" }}
        fog={[130, 430]}
        hemi="#2f3f56"
        ambient={[0.75, 0.75]}
        sun={[0.9, 0.9]}
        shadowHalf={40}
        stars={2600}
        forceNight
        weather={weather}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow onClick={place}>
        <circleGeometry args={[36.5, 64]} />
        <meshStandardMaterial color="#2f4041" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.3, 0]}>
        <circleGeometry args={[500, 48]} />
        <meshStandardMaterial color="#232c36" />
      </mesh>
      <group position={[-90, 55, -160]}>
        <mesh>
          <sphereGeometry args={[7, 18, 14]} />
          <meshStandardMaterial
            color="#f2faf3"
            emissive="#dcefe6"
            emissiveIntensity={1.8}
            fog={false}
          />
        </mesh>
        <mesh>
          <sphereGeometry args={[11, 18, 14]} />
          <meshBasicMaterial
            color="#cfe8dc"
            transparent
            opacity={0.16}
            blending={T.AdditiveBlending}
            depthWrite={false}
            fog={false}
          />
        </mesh>
      </group>
      <GlowFlora />
      <Stones />
      <WishLantern />
      <Fireflies low={low} />
      <ShootingStar />
      <CaveExit tool={tool} onExit={onExit} />
      <Plants
        entities={world.entities}
        season={world.environment.season}
        low={low}
        height={() => 0}
        wind={Math.min(1, weatherWind[weather] + 0.15)}
      />
      <ContentAnimals scene="starlight" entities={world.entities} />
      <Collectibles scene="starlight" seed={world.seed} />
      {/* A low, level camera keeps the horizon in frame so the stars show. */}
      {props.walk && props.avatar && props.onGate && (
        <PlayerRig scene="starlight" avatar={props.avatar} entities={world.entities} onGate={props.onGate} />
      )}
      <SceneFrame reset={props.reset} position={[40, 18, 74]} max={300} />
    </>
  );
}
export default function StarlightScene(props: SceneProps) {
  return (
    <SceneCanvas low={props.low} scene="starlight" position={[40, 18, 74]}>
      <Starlight {...props} />
    </SceneCanvas>
  );
}
