import { useEffect, useMemo, useRef } from "react";
import * as T from "three";
import { useFrame } from "@react-three/fiber";
import { meadowFeatures, random } from "@island/world-core";
import { Plants, Box, palettes } from "../Plants";
import { PlayerRig } from "../player/Player";
import { Residents } from "../animals";
import Collectibles from "../collect/Collectibles";
import {
  Butterflies,
  GrassField,
  SceneCanvas,
  SceneFrame,
  SkyRig,
  exitClick,
  usePlacer,
  weatherWind,
  type SceneProps,
} from "./shared";

/**
 * The meadow's own field of wind-bent grass tufts, clustered loosely
 * around the picnic blanket and the hammock trees.
 */
function WindGrass({ low, tint }: { low: boolean; tint: string }) {
  const anchors = useMemo(
    () => [
      { x: meadowFeatures.blanket.x, z: meadowFeatures.blanket.z, r: 12 },
      {
        x: (meadowFeatures.hammock.x1 + meadowFeatures.hammock.x2) / 2,
        z: meadowFeatures.hammock.z,
        r: 12,
      },
    ],
    [],
  );
  return (
    <GrassField
      low={low}
      tint={tint}
      count={260}
      spread={[76, 62]}
      seed={239}
      anchors={anchors}
    />
  );
}
function Picnic() {
  const { blanket } = meadowFeatures;
  return (
    <group position={[blanket.x, 0.06, blanket.z]} rotation={[0, 0.4, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[6, 5]} />
        <meshStandardMaterial color="#d98a76" roughness={1} side={T.DoubleSide} />
      </mesh>
      {[-1.5, 0, 1.5].map((x) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.01, 0]}>
          <planeGeometry args={[0.7, 5]} />
          <meshStandardMaterial color="#f0e6d2" roughness={1} />
        </mesh>
      ))}
      <group position={[1.7, 0, 1.2]}>
        <mesh position={[0, 0.5, 0]} castShadow>
          <cylinderGeometry args={[0.85, 0.7, 1, 10]} />
          <meshStandardMaterial color="#c9a06a" roughness={1} />
        </mesh>
        <mesh position={[0, 1.1, 0]} castShadow>
          <cylinderGeometry args={[0.88, 0.88, 0.18, 10]} />
          <meshStandardMaterial color="#a8814f" roughness={1} />
        </mesh>
        <mesh position={[0, 1.35, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.42, 0.07, 6, 14, Math.PI]} />
          <meshStandardMaterial color="#8c6f45" roughness={1} />
        </mesh>
      </group>
    </group>
  );
}
/** A hammock strung between the two anchor trees baked into the meadow. */
function Hammock() {
  const { x1, x2, z } = meadowFeatures.hammock,
    mid = (x1 + x2) / 2;
  const cloth = useRef<T.Group>(null);
  useFrame(({ clock }) => {
    if (cloth.current)
      cloth.current.rotation.z = Math.sin(clock.elapsedTime * 0.7) * 0.06;
  });
  return (
    <group position={[mid, 0, z]}>
      <group ref={cloth} position={[0, 2.9, 0]}>
        <mesh castShadow>
          <boxGeometry args={[x2 - x1 - 1.4, 0.34, 2.4]} />
          <meshStandardMaterial color="#ecd9ad" roughness={1} />
        </mesh>
        {[-1, 1].map((s) => (
          <Box
            key={s}
            position={[(s * (x2 - x1)) / 2 - s * 0.5, 0.12, 0]}
            scale={[1.2, 0.12, 0.16]}
            color="#c8b187"
          />
        ))}
        <Box
          position={[-1.1, 0.32, 0]}
          scale={[1.3, 0.32, 1.5]}
          color="#d98a76"
        />
      </group>
      {[-1, 1].map((s) => (
        <Box
          key={s}
          position={[s * ((x2 - x1) / 2 - 0.3), 3, 0]}
          scale={[0.9, 0.08, 0.08]}
          color="#efe7d0"
        />
      ))}
    </group>
  );
}
function Meadow(props: SceneProps) {
  const { world, tool, onPlace, onExit, low } = props,
    season = world.environment.season,
    weather = world.environment.weather ?? "sun";
  const place = usePlacer(tool, onPlace);
  const grassTint =
    season === "autumn"
      ? "#c2ad72"
      : season === "winter"
        ? "#c5cfc2"
        : season === "spring"
          ? "#8fb96e"
          : "#7fa662";
  return (
    <>
      <SkyRig
        hour={world.environment.hour}
        low={low}
        sky={{ day: "#cfdcc0", night: "#1a2f38" }}
        fog={[190, 560]}
        stars={1700}
        shadowHalf={48}
        weather={weather}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow onClick={place}>
        <planeGeometry args={[86, 74]} />
        <meshStandardMaterial color={palettes[season].ground} />
      </mesh>
      <Box position={[0, -0.65, 0]} scale={[86, 1.2, 74]} color="#a3aa85" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.3, 0]}>
        <planeGeometry args={[1800, 1800]} />
        <meshStandardMaterial color="#b7c6a4" />
      </mesh>
      <WindGrass low={low} tint={grassTint} />
      {Array.from({ length: 5 }, (_, i) => (
        <mesh key={i} position={[0, 0.06, meadowFeatures.gate - i * 2.3]} receiveShadow>
          <boxGeometry args={[1.8, 0.1, 1.2]} />
          <meshStandardMaterial color="#cfc7ab" roughness={1} />
        </mesh>
      ))}
      <Picnic />
      <Hammock />
      <Plants
        entities={world.entities}
        season={season}
        low={low}
        height={() => 0}
        wind={weatherWind[weather]}
      />
      {season !== "winter" && (
        <Butterflies
          low={low}
          count={14}
          center={[-4, 6]}
          spread={[30, 18]}
          colors={["#e7bb7d", "#9fc4e0"]}
          height={2.2}
        />
      )}
      <group
        position={[0, 0, meadowFeatures.gate]}
        onClick={exitClick(tool, onExit)}
      >
        {[-2.4, 2.4].map((x) => (
          <Box
            key={x}
            position={[x, 1.5, 0]}
            scale={[0.32, 3, 0.32]}
            color="#9b8a6d"
          />
        ))}
        <Box position={[0, 2.5, 0]} scale={[5.4, 0.9, 0.16]} color="#b89d78" />
        <Box position={[0, 3.1, 0]} scale={[6, 0.2, 0.5]} color="#8f7a58" />
      </group>
      <Residents scene="meadow" entities={world.entities} />
      <Collectibles scene="meadow" seed={world.seed} />
      {props.walk && props.avatar && props.onGate && (
        <PlayerRig scene="meadow" avatar={props.avatar} entities={world.entities} onGate={props.onGate} />
      )}
      <SceneFrame reset={props.reset} position={[86, 74, 108]} max={360} />
    </>
  );
}
export default function MeadowScene(props: SceneProps) {
  return (
    <SceneCanvas low={props.low} scene="meadow" position={[86, 74, 108]}>
      <Meadow {...props} />
    </SceneCanvas>
  );
}
