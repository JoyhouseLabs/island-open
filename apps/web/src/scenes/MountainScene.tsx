import { useEffect, useMemo } from "react";
import * as T from "three";
import type { Season } from "@island/contracts";
import {
  mountainHeight,
  mountainTrail,
  mountainFeatures,
  random,
  walkSpecs,
} from "@island/world-core";
import { Plants, Box, palettes } from "../Plants";
import { PlayerRig } from "../player/Player";
import {
  SceneCanvas,
  SceneFrame,
  SkyRig,
  WindStreaks,
  exitClick,
  usePlacer,
  weatherWind,
  type SceneProps,
  GrassField,
  grassTint,
} from "./shared";

/** Terrace mesh sampled from the same height rule the placement uses. */
function Terraces({ season }: { season: Season }) {
  const geometry = useMemo(() => {
    const g = new T.BufferGeometry(),
      size = 88,
      steps = 110,
      positions: number[] = [],
      colors: number[] = [],
      indices: number[] = [];
    const grass = new T.Color(palettes[season].ground),
      rock = new T.Color("#9d9f90"),
      dry = new T.Color("#b3ad8b");
    for (let i = 0; i <= steps; i++)
      for (let j = 0; j <= steps; j++) {
        const x = (i / steps - 0.5) * size,
          z = (j / steps - 0.5) * size * 0.87,
          h = mountainHeight(x, z);
        positions.push(x, h, z);
        const c = grass
          .clone()
          .lerp(dry, Math.min(1, h / 18))
          .lerp(rock, Math.min(1, Math.max(0, (h - 7) / 9)));
        colors.push(c.r, c.g, c.b);
      }
    for (let i = 0; i < steps; i++)
      for (let j = 0; j < steps; j++) {
        const k = i * (steps + 1) + j;
        indices.push(k, k + steps + 1, k + 1, k + 1, k + steps + 1, k + steps + 2);
      }
    g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
    g.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  }, [season]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial vertexColors flatShading roughness={1} />
    </mesh>
  );
}
/** Stone steps climbing the spiral path to the summit platform. */
function TrailStones() {
  const stones = useMemo(() => {
    const rng = random(29),
      list: { x: number; z: number; y: number; r: number }[] = [];
    for (let i = 0; i < mountainTrail.length - 1; i++) {
      const a = mountainTrail[i]!,
        b = mountainTrail[i + 1]!,
        len = Math.hypot(b.x - a.x, b.z - a.z);
      for (let d = rng() * 1.6; d < len; d += 1.9 + rng() * 0.6) {
        const t = d / len,
          x = a.x + (b.x - a.x) * t,
          z = a.z + (b.z - a.z) * t;
        list.push({ x, z, y: mountainHeight(x, z), r: 0.62 + rng() * 0.34 });
      }
    }
    return list;
  }, []);
  return (
    <>
      {stones.map((s, i) => (
        <mesh key={i} position={[s.x, s.y + 0.09, s.z]} receiveShadow castShadow>
          <cylinderGeometry args={[s.r, s.r * 1.1, 0.16, 7]} />
          <meshStandardMaterial color={i % 2 ? "#b8b5a1" : "#a9a791"} roughness={1} />
        </mesh>
      ))}
    </>
  );
}
/** Summit deck with a cairn where the wind is easiest to hear. */
function Summit() {
  const { platform } = mountainFeatures;
  return (
    <group position={[platform.x, 16, platform.z]}>
      {(
        [
          [-3.4, -2.4],
          [3.4, -2.4],
          [-3.4, 2.4],
          [3.4, 2.4],
        ] as [number, number][]
      ).map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, 0.5, z]} castShadow>
          <cylinderGeometry args={[0.18, 0.22, 1, 7]} />
          <meshStandardMaterial color="#8c7254" roughness={1} />
        </mesh>
      ))}
      <mesh position={[0, 1.1, 0]} castShadow receiveShadow>
        <boxGeometry args={[8, 0.24, 6]} />
        <meshStandardMaterial color="#c8b48c" roughness={1} />
      </mesh>
      {[-1, 1].map((s) => (
        <Box
          key={s}
          position={[s * 3.9, 1.8, 0]}
          scale={[0.14, 1.1, 6]}
          color="#a8814f"
        />
      ))}
      <group position={[0, 1.22, -1.6]}>
        <mesh position={[0, 0.35, 0]} castShadow>
          <dodecahedronGeometry args={[0.62, 0]} />
          <meshStandardMaterial color="#a3a598" flatShading roughness={1} />
        </mesh>
        <mesh position={[0.08, 1.05, 0.06]} castShadow>
          <dodecahedronGeometry args={[0.42, 0]} />
          <meshStandardMaterial color="#b0b2a4" flatShading roughness={1} />
        </mesh>
        <mesh position={[-0.04, 1.52, -0.03]} castShadow>
          <dodecahedronGeometry args={[0.26, 0]} />
          <meshStandardMaterial color="#bcbfae" flatShading roughness={1} />
        </mesh>
      </group>
      <mesh position={[0, 1.9, 2.9]} castShadow>
        <cylinderGeometry args={[0.07, 0.09, 1.5, 6]} />
        <meshStandardMaterial color="#7d6a4e" roughness={1} />
      </mesh>
      <mesh position={[0, 2.75, 2.9]}>
        <sphereGeometry args={[0.16, 8, 8]} />
        <meshStandardMaterial color="#e4d5b3" roughness={0.8} />
      </mesh>
    </group>
  );
}
import { ContentAnimals } from "../animals";
import Collectibles from "../collect/Collectibles";

function Mountain(props: SceneProps) {
  const { world, tool, onPlace, onExit, low } = props,
    season = world.environment.season,
    weather = world.environment.weather ?? "sun";
  const place = usePlacer(tool, onPlace);
  return (
    <>
      <SkyRig
        hour={world.environment.hour}
        low={low}
        sky={{ day: "#cddcc7", night: "#152433" }}
        fog={[240, 720]}
        stars={2000}
        shadowHalf={52}
        weather={weather}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.2, 0]} receiveShadow>
        <planeGeometry args={[1800, 1800]} />
        <meshStandardMaterial color="#b7c6a4" />
      </mesh>
      <Terraces season={season} />
      <TrailStones />
      <Summit />
      {/* The mountain keeps its own breeze even on a calm island day. */}
      <WindStreaks low={low} count={10} strength={0.7} span={44} />
      {/* Click any spot of the terraces to plant; the deck is protected. */}
      <TerraceClicker place={place} />
      <GrassField
        low={low}
        tint={grassTint("#a9b58a")}
        count={90}
        spread={[76, 64]}
        seed={573}
        scale={0.7}
        accept={walkSpecs.mountain.walkable}
        height={mountainHeight}
      />
      <Plants
        entities={world.entities}
        season={season}
        low={low}
        height={mountainHeight}
        wind={weatherWind[weather]}
      />
      <ContentAnimals scene="mountain" entities={world.entities} />
      <Collectibles scene="mountain" seed={world.seed} />
      <group
        position={[0, 0, mountainFeatures.gate]}
        onClick={exitClick(tool, onExit)}
      >
        {[-2.6, 2.6].map((x) => (
          <Box key={x} position={[x, 1.9, 0]} scale={[0.32, 3.8, 0.32]} color="#9b8a6d" />
        ))}
        <Box position={[0, 3.9, 0]} scale={[5.8, 0.28, 0.28]} color="#b09468" />
      </group>
      {props.walk && props.avatar && props.onGate && (
        <PlayerRig scene="mountain" avatar={props.avatar} entities={world.entities} onGate={props.onGate} />
      )}
      <SceneFrame
        reset={props.reset}
        position={[90, 95, 128]}
        target={[0, 9, 0]}
        max={420}
      />
    </>
  );
}
/** Invisible stepped surface over the terraces that catches plant clicks. */
function TerraceClicker({ place }: { place: ReturnType<typeof usePlacer> }) {
  const geometry = useMemo(() => {
    const g = new T.BufferGeometry(),
      steps = 70,
      positions: number[] = [],
      indices: number[] = [];
    for (let i = 0; i <= steps; i++)
      for (let j = 0; j <= steps; j++) {
        const x = (i / steps - 0.5) * 88,
          z = (j / steps - 0.5) * 76;
        positions.push(x, mountainHeight(x, z) + 0.14, z);
      }
    for (let i = 0; i < steps; i++)
      for (let j = 0; j < steps; j++) {
        const k = i * (steps + 1) + j;
        indices.push(k, k + steps + 1, k + 1, k + 1, k + steps + 1, k + steps + 2);
      }
    g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} onClick={place}>
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}
export default function MountainScene(props: SceneProps) {
  return (
    <SceneCanvas low={props.low} scene="mountain" position={[90, 95, 128]}>
      <Mountain {...props} />
    </SceneCanvas>
  );
}
