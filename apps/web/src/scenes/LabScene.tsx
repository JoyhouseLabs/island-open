import { useMemo, useRef } from "react";
import * as T from "three";
import { useFrame } from "@react-three/fiber";
import { labFeatures, tableTops, random } from "@island/world-core";
import { Plants, Box, palettes } from "../Plants";
import { PlayerRig } from "../player/Player";
import {
  SceneCanvas,
  SceneFrame,
  SkyRig,
  exitClick,
  isNight,
  usePlacer,
  weatherWind,
  type SceneProps,
  GrassField,
  grassTint,
} from "./shared";

const liquidColors = ["#69b7a8", "#b786c0", "#d8a15e", "#8fa8c9"];
/** Workbench with glass vials whose bubbles keep rising. */
function Bench({ x, z, seed }: { x: number; z: number; seed: number }) {
  const bubbles = useRef<T.Group>(null);
  const vials = useMemo(() => {
    const rng = random(seed),
      list: { dx: number; h: number; color: string; dye: string }[] = [];
    for (let i = 0; i < 4; i++)
      list.push({
        dx: -3 + i * 2 + rng() * 0.4,
        h: 1.7 + rng() * 1.2,
        color: liquidColors[Math.floor(rng() * liquidColors.length)]!,
        dye: liquidColors[Math.floor(rng() * liquidColors.length)]!,
      });
    return list;
  }, [seed]);
  useFrame(({ clock }) => {
    if (!bubbles.current) return;
    bubbles.current.children.forEach((bubble, i) => {
      const vial = vials[i % vials.length]!;
      const t = (clock.elapsedTime * (0.35 + (i % 3) * 0.12) + i * 1.7) % 1;
      bubble.position.set(
        vial.dx,
        1.68 - vial.h / 2 + 0.15 + t * (vial.h - 0.3),
        -0.5 + (i % 2) * 1,
      );
      bubble.scale.setScalar(0.06 + t * 0.05);
    });
  });
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.12, 0]} receiveShadow>
        <boxGeometry args={[9.4, 0.24, 4.6]} />
        <meshStandardMaterial color="#b9b3a0" roughness={1} />
      </mesh>
      <Box
        position={[0, tableTops.lab.standY - tableTops.lab.thickness / 2, 0]}
        scale={[
          tableTops.lab.halfSize.x * 2,
          tableTops.lab.thickness,
          tableTops.lab.halfSize.z * 2,
        ]}
        color="#c8b48c"
      />
      {(
        [
          [-3.6, -1.3],
          [3.6, -1.3],
          [-3.6, 1.3],
          [3.6, 1.3],
        ] as [number, number][]
      ).map(([dx, dz]) => (
        <mesh key={`${dx}${dz}`} position={[dx, 0.75, dz]}>
          <cylinderGeometry args={[0.16, 0.2, 1.5, 8]} />
          <meshStandardMaterial color="#8c7254" roughness={1} />
        </mesh>
      ))}
      {vials.map((v, i) => (
        <group key={i} position={[v.dx, 1.68, -0.5 + (i % 2) * 1]}>
          <mesh>
            <cylinderGeometry args={[0.55, 0.55, v.h, 12]} />
            <meshStandardMaterial
              color="#d8ece6"
              transparent
              opacity={0.42}
              roughness={0.1}
              depthWrite={false}
            />
          </mesh>
          <mesh position={[0, -v.h / 2 + v.h * 0.32, 0]}>
            <cylinderGeometry args={[0.48, 0.48, v.h * 0.64, 12]} />
            <meshStandardMaterial
              color={v.color}
              transparent
              opacity={0.85}
              emissive={v.color}
              emissiveIntensity={0.45}
            />
          </mesh>
        </group>
      ))}
      <group ref={bubbles}>
        {vials.map((_, i) => (
          <mesh key={i}>
            <sphereGeometry args={[1, 7, 6]} />
            <meshBasicMaterial color="#eefaf5" transparent opacity={0.75} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
/** Slowly turning armillary sphere on a stone base. */
function Armillary({ night }: { night: boolean }) {
  const rings = useRef<T.Group>(null);
  useFrame((_, dt) => {
    if (rings.current) {
      rings.current.rotation.y += dt * 0.35;
      rings.current.rotation.x = Math.sin(
        rings.current.rotation.y * 0.4,
      ) * 0.18;
    }
  });
  const { x, z } = labFeatures.armillary;
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.5, 0]} castShadow>
        <cylinderGeometry args={[1.1, 1.4, 1, 10]} />
        <meshStandardMaterial color="#a8a391" roughness={1} />
      </mesh>
      <mesh position={[0, 2.6, 0]}>
        <cylinderGeometry args={[0.14, 0.18, 3.4, 8]} />
        <meshStandardMaterial color="#8c7254" roughness={1} />
      </mesh>
      <group ref={rings} position={[0, 4.5, 0]}>
        {[
          [2.1, "#b08a5d"],
          [1.7, "#7d8ea6"],
          [1.35, "#a8814f"],
        ].map(([r, color], i) => (
          <mesh
            key={i}
            rotation={[i * 0.9, i * 0.5, i * 0.3]}
            castShadow
          >
            <torusGeometry args={[r as number, 0.09, 8, 42]} />
            <meshStandardMaterial
              color={color as string}
              metalness={0.55}
              roughness={0.35}
            />
          </mesh>
        ))}
        <mesh>
          <sphereGeometry args={[0.5, 12, 10]} />
          <meshStandardMaterial
            color="#e8c86a"
            emissive="#d8a840"
            emissiveIntensity={night ? 0.8 : 0.3}
            metalness={0.6}
            roughness={0.3}
          />
        </mesh>
      </group>
    </group>
  );
}
/** A small observatory dome with a peeking telescope. */
function Dome({ night }: { night: boolean }) {
  const { x, z } = labFeatures.dome;
  return (
    <group position={[x, 0, z]}>
      <Box position={[0, 0.3, 0]} scale={[10, 0.6, 8]} color="#c3c3a7" />
      <mesh position={[0, 0.6, 0]}>
        <sphereGeometry args={[4.2, 22, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#b8c4b5" roughness={0.85} />
      </mesh>
      <mesh position={[0, 5.4, 0]}>
        <cylinderGeometry args={[0.16, 0.2, 1.6, 8]} />
        <meshStandardMaterial color="#9aa798" roughness={0.9} />
      </mesh>
      <group position={[1.6, 2.4, 2.6]} rotation={[0, -0.6, 0.7]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.28, 0.38, 4.4, 10]} />
          <meshStandardMaterial color="#8b9a95" metalness={0.4} roughness={0.4} />
        </mesh>
      </group>
      <mesh position={[0, 2.4, 4.05]}>
        <circleGeometry args={[1.3, 20]} />
        <meshStandardMaterial color={night ? "#f5cc7c" : "#5c6f6a"} side={T.DoubleSide} />
      </mesh>
    </group>
  );
}
/** Fenced experiment plots; flowers planted here are world entities. */
function Plot({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <Box position={[0, 0.12, 0]} scale={[8, 0.24, 4]} color="#8a7458" />
      {[-1, 1].map((s) => (
        <Box
          key={s}
          position={[0, 0.35, (s * 4) / 2]}
          scale={[8.4, 0.4, 0.3]}
          color="#baa27c"
        />
      ))}
    </group>
  );
}
import { ContentAnimals } from "../animals";
import Collectibles from "../collect/Collectibles";

function Lab(props: SceneProps) {
  const { world, tool, onPlace, onExit, low } = props,
    season = world.environment.season,
    weather = world.environment.weather ?? "sun",
    night = isNight(world.environment.hour);
  const place = usePlacer(tool, onPlace);
  return (
    <>
      <SkyRig
        hour={world.environment.hour}
        low={low}
        sky={{ day: "#cdd8c3", night: "#1a2b30" }}
        fog={[170, 520]}
        stars={1700}
        shadowHalf={44}
        weather={weather}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow onClick={place}>
        <planeGeometry args={[82, 70]} />
        <meshStandardMaterial color={palettes[season].ground} />
      </mesh>
      <Box position={[0, -0.65, 0]} scale={[82, 1.2, 70]} color="#a3aa85" />
      {Array.from({ length: 6 }, (_, i) => (
        <mesh key={i} position={[0, 0.05, 26 - i * 3.4]} receiveShadow>
          <boxGeometry args={[2, 0.1, 1.4]} />
          <meshStandardMaterial color="#c9c2a8" roughness={1} />
        </mesh>
      ))}
      {labFeatures.benches.map((b, i) => (
        <Bench key={i} x={b.x} z={b.z} seed={401 + i} />
      ))}
      <Armillary night={night} />
      <Dome night={night} />
      {labFeatures.beds.map((b, i) => (
        <group key={i} onClick={place}>
          <Plot x={b.x} z={b.z} />
        </group>
      ))}
      <GrassField
        low={low}
        tint={grassTint("#8fa07a")}
        count={45}
        spread={[74, 62]}
        seed={268}
        scale={0.7}
      />
      <Plants
        entities={world.entities}
        season={season}
        low={low}
        height={() => 0}
        wind={weatherWind[weather]}
      />
      <ContentAnimals scene="lab" entities={world.entities} />
      <Collectibles scene="lab" seed={world.seed} />
      <group position={[0, 0, labFeatures.gate]} onClick={exitClick(tool, onExit)}>
        {[-2.8, 2.8].map((x) => (
          <Box key={x} position={[x, 2, 0]} scale={[0.34, 4, 0.34]} color="#9b8a6d" />
        ))}
        <Box position={[0, 4.1, 0]} scale={[6.4, 0.35, 0.35]} color="#b09468" />
        <mesh position={[0, 3.2, 0.2]}>
          <coneGeometry args={[0.5, 0.9, 10]} />
          <meshStandardMaterial
            color="#8fd4c6"
            transparent
            opacity={0.7}
            emissive="#69b7a8"
            emissiveIntensity={night ? 0.6 : 0.25}
          />
        </mesh>
      </group>
      {props.walk && props.avatar && props.onGate && (
        <PlayerRig scene="lab" avatar={props.avatar} entities={world.entities} onGate={props.onGate} />
      )}
      <SceneFrame reset={props.reset} position={[62, 58, 78]} max={300} />
    </>
  );
}
export default function LabScene(props: SceneProps) {
  return (
    <SceneCanvas low={props.low} scene="lab" position={[62, 58, 78]}>
      <Lab {...props} />
    </SceneCanvas>
  );
}
