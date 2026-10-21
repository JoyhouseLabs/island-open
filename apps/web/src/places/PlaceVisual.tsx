import { useMemo } from "react";
import * as T from "three";
import type {
  IslandEntity,
  PlaceConfig,
  Season,
  SubSceneId,
  Weather,
} from "@island/contracts";
import { random } from "@island/world-core";
import { Plants } from "../Plants";
import { ContentAnimals } from "../animals";
import Collectibles from "../collect/Collectibles";
import { PlayerRig } from "../player/Player";
import type { AvatarConfig } from "../player/avatar";
import {
  Butterflies,
  SceneCanvas,
  SceneFrame,
  SkyRig,
  weatherWind,
} from "../scenes/shared";
import { placeSceneId } from "./specs";

/** Stable numeric seed from a place id, so its forage layout never shifts. */
function stableSeed(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** One placed stone, in the mountain's rounded-rock style. */
function Rock({
  x,
  z,
  scale,
  seed,
}: {
  x: number;
  z: number;
  scale: number;
  seed: number;
}) {
  const rng = useMemo(() => random(seed), [seed]);
  return (
    <mesh
      position={[x, scale * 0.45, z]}
      rotation={[rng(), rng(), rng()]}
      scale={[scale, scale * 0.8, scale * 0.9]}
      castShadow
      receiveShadow
    >
      <dodecahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color="#a8a89a" roughness={1} flatShading />
    </mesh>
  );
}

/** A little warm lamp on a wooden post for evening places. */
function Lamp({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 1.1, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.09, 2.2, 8]} />
        <meshStandardMaterial color="#7a6a4f" roughness={0.9} />
      </mesh>
      <mesh position={[0, 2.35, 0]}>
        <sphereGeometry args={[0.24, 14, 12]} />
        <meshStandardMaterial
          color="#ffe9b0"
          emissive="#ffce6b"
          emissiveIntensity={0.9}
        />
      </mesh>
      <pointLight position={[0, 2.4, 0]} color="#ffd98a" intensity={2.4} distance={11} decay={2} />
    </group>
  );
}

/** A quiet pond: a water disc with reeds around the rim. */
function Pond({
  x,
  z,
  scale,
  seed,
}: {
  x: number;
  z: number;
  scale: number;
  seed: number;
}) {
  const reeds = useMemo(() => {
    const rng = random(seed);
    return Array.from({ length: 10 }, () => {
      const a = rng() * Math.PI * 2;
      return {
        x: Math.cos(a) * (2.6 * scale),
        z: Math.sin(a) * (2.6 * scale),
        h: 0.8 + rng() * 1.1,
      };
    });
  }, [scale, seed]);
  return (
    <group position={[x, 0, z]} scale={scale}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]}>
        <circleGeometry args={[2.5, 28]} />
        <meshStandardMaterial
          color="#5f8f96"
          roughness={0.15}
          metalness={0.15}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[2.5, 3, 28]} />
        <meshStandardMaterial color="#8d7f60" roughness={1} />
      </mesh>
      {reeds.map((r, i) => (
        <mesh
          key={i}
          position={[r.x, r.h / 2, r.z]}
          rotation={[0.06, 0, 0.05]}
        >
          <cylinderGeometry args={[0.035, 0.05, r.h, 4]} />
          <meshStandardMaterial color="#7f9a5e" />
        </mesh>
      ))}
    </group>
  );
}

/** The doorway home: two posts, a beam and a soft shimmer to step through. */
function Doorway({
  z,
  accent,
  onExit,
}: {
  z: number;
  accent: string;
  onExit: () => void;
}) {
  return (
    <group position={[0, 0, z]} onClick={onExit}>
      {[-1.7, 1.7].map((x) => (
        <mesh key={x} position={[x, 1.5, 0]} castShadow>
          <cylinderGeometry args={[0.14, 0.18, 3, 8]} />
          <meshStandardMaterial color="#a08a63" roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[0, 3.05, 0]} castShadow>
        <boxGeometry args={[4, 0.28, 0.5]} />
        <meshStandardMaterial color="#8f7a55" roughness={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <ringGeometry args={[1.1, 1.5, 26]} />
        <meshBasicMaterial
          color={accent}
          transparent
          opacity={0.5}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

/**
 * One admin-configured place: ground, sky, plants and props, its animals,
 * the walking player, and the doorway back to the island.
 */
export default function PlaceVisual({
  config,
  hour,
  season,
  weather,
  low,
  reset,
  walking,
  avatar,
  onGate,
  onExit,
}: {
  config: PlaceConfig;
  hour: number;
  season: Season;
  weather: Weather;
  low: boolean;
  reset: number;
  walking: boolean;
  avatar: AvatarConfig | null;
  onGate: (dest: "island" | SubSceneId) => void;
  onExit: () => void;
}) {
  const size = config.ground.size,
    key = placeSceneId(config.id);
  // Trees, flowers and benches ride the shared Plants renderer.
  const entities = useMemo<IslandEntity[]>(
    () =>
      config.props.flatMap((p, i) =>
        p.kind === "tree" || p.kind === "flower" || p.kind === "bench"
          ? [
              {
                id: `${config.id}-p${i}`,
                kind: p.kind,
                x: p.x,
                z: p.z,
                seed: p.seed ?? 1 + i * 7919,
                growth: 1,
              },
            ]
          : [],
      ),
    [config],
  );
  return (
    <SceneCanvas low={low} position={[size * 0.8, size * 1.02, size * 1.24]}>
      <SceneFrame reset={reset} position={[size * 0.8, size * 1.02, size * 1.24]} min={12} max={size * 6} />
      <SkyRig
        hour={hour}
        low={low}
        sky={{ day: config.sky.day, night: config.sky.night }}
        fog={[size * 3, size * 9]}
        stars={config.sky.stars}
        weather={weather}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        {config.ground.shape === "disc" ? (
          <circleGeometry args={[size / 2, 48]} />
        ) : (
          <planeGeometry args={[size, size]} />
        )}
        <meshStandardMaterial color={config.ground.color} roughness={1} />
      </mesh>
      {/* A thick skirt keeps the floating-ground illusion from below. */}
      <mesh position={[0, -size * 0.1, 0]}>
        <cylinderGeometry
          args={
            config.ground.shape === "disc"
              ? [size / 2, size / 2 * 0.86, size * 0.2, 48]
              : [size * 0.72, size * 0.62, size * 0.2, 4]
          }
        />
        <meshStandardMaterial color="#8f9478" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -size * 0.2 - 0.02, 0]}>
        <planeGeometry args={[size * 30, size * 30]} />
        <meshStandardMaterial
          color={hour < 6 || hour > 19 ? "#293e3a" : "#b9c8a8"}
        />
      </mesh>
      <Plants
        entities={entities}
        season={season}
        low={low}
        height={() => 0}
        wind={weatherWind[weather]}
      />
      {config.props.map(
        (p, i) =>
          (p.kind === "rock" && (
            <Rock key={i} x={p.x} z={p.z} scale={1.2 * p.scale} seed={p.seed ?? i + 31} />
          )) ||
          (p.kind === "lamp" && <Lamp key={i} x={p.x} z={p.z} />) ||
          (p.kind === "pond" && (
            <Pond key={i} x={p.x} z={p.z} scale={p.scale} seed={p.seed ?? 97} />
          )),
      )}
      <Butterflies low={low} count={low ? 6 : 12} center={[0, 0]} spread={[size * 0.36, size * 0.3]} />
      <ContentAnimals scene={key} entities={entities} />
      <Collectibles scene={key} seed={stableSeed(config.id)} size={size} />
      {walking && avatar && (
        <PlayerRig
          scene={key}
          avatar={avatar}
          entities={entities}
          place={config}
          onGate={onGate}
        />
      )}
      <Doorway z={size / 2 - 2} accent={config.accent} onExit={onExit} />
    </SceneCanvas>
  );
}
