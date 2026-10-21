import { useMemo, useRef, useState } from "react";
import * as T from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { pondShape, pondFeatures, random, walkSpecs } from "@island/world-core";
import { Plants, Box, palettes } from "../Plants";
import { PlayerRig } from "../player/Player";
import { Residents } from "../animals";
import Collectibles from "../collect/Collectibles";
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

type Pad = { angle: number; dist: number; speed: number; size: number; bloom: boolean };
/** Lily pads that drift on the water and respond to taps with ripples. */
function Water({ night }: { night: boolean }) {
  const [ripple, setRipple] = useState<{ x: number; z: number; t: number } | null>(
      null,
    ),
    ring = useRef<T.Mesh>(null),
    pads = useRef<T.Group>(null);
  const clock = useThree((s) => s.clock);
  const lilies = useMemo(() => {
    const rng = random(67),
      list: Pad[] = [];
    for (let i = 0; i < 11; i++)
      list.push({
        angle: rng() * Math.PI * 2,
        dist: 0.25 + rng() * 0.62,
        speed: (0.02 + rng() * 0.035) * (rng() < 0.5 ? 1 : -1),
        size: 0.8 + rng() * 0.7,
        bloom: rng() < 0.4,
      });
    return list;
  }, []);
  const reeds = useMemo(() => {
    const rng = random(83),
      list: { x: number; z: number; h: number; tilt: number }[] = [];
    for (let i = 0; i < 46; i++) {
      const a = rng() * Math.PI * 2;
      list.push({
        x: Math.cos(a) * (pondShape.rx + 0.9 + rng() * 0.9),
        z: Math.sin(a) * (pondShape.rz + 0.9 + rng() * 0.9),
        h: 1.4 + rng() * 1.6,
        tilt: (rng() - 0.5) * 0.2,
      });
    }
    return list;
  }, []);
  useFrame(({ clock }) => {
    if (ring.current && ripple) {
      const age = clock.elapsedTime - ripple.t;
      ring.current.visible = age < 3;
      ring.current.scale.setScalar(1 + age * 3.2);
      (ring.current.material as T.MeshBasicMaterial).opacity = Math.max(
        0,
        0.5 - age * 0.16,
      );
    }
    pads.current?.children.forEach((pad, i) => {
      const lily = lilies[i]!;
      lily.angle += lily.speed * 0.016;
      pad.position.set(
        Math.cos(lily.angle) * lily.dist * pondShape.rx,
        0.3 + Math.sin(clock.elapsedTime + i) * 0.04,
        Math.sin(lily.angle) * lily.dist * pondShape.rz,
      );
    });
  });
  return (
    <group position={[pondShape.x, 0, pondShape.z]}>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[pondShape.rx + 1.6, pondShape.rz + 1.6, 1]}
        position={[0, 0.06, 0]}
      >
        <circleGeometry args={[1, 56]} />
        <meshStandardMaterial color="#b5b6a0" roughness={1} />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[pondShape.rx, pondShape.rz, 1]}
        position={[0, 0.16, 0]}
        onClick={(e) => {
          if (e.delta > 5) return;
          e.stopPropagation();
          setRipple({
            x: e.point.x - pondShape.x,
            z: e.point.z - pondShape.z,
            t: clock.elapsedTime,
          });
        }}
      >
        <circleGeometry args={[1, 72]} />
        <meshStandardMaterial
          color={night ? "#2d5259" : "#6fa39e"}
          metalness={0.4}
          roughness={0.2}
        />
      </mesh>
      {ripple && (
        <mesh
          ref={ring}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[ripple.x, 0.22, ripple.z]}
        >
          <ringGeometry args={[0.7, 0.78, 48]} />
          <meshBasicMaterial
            color="#e4f4df"
            transparent
            opacity={0.5}
            depthWrite={false}
          />
        </mesh>
      )}
      <group ref={pads}>
        {lilies.map((l, i) => (
          <group key={i} scale={l.size}>
            <mesh rotation={[-Math.PI / 2, 0, i]}>
              <circleGeometry args={[1.35, 14, 0.32, 5.6]} />
              <meshStandardMaterial color="#6f8d60" side={T.DoubleSide} roughness={0.9} />
            </mesh>
            {l.bloom && (
              <group position={[0, 0.25, 0]}>
                <mesh>
                  <coneGeometry args={[0.5, 0.7, 8]} />
                  <meshStandardMaterial color="#d9a7c0" roughness={0.85} />
                </mesh>
                <mesh position={[0, 0.38, 0]}>
                  <sphereGeometry args={[0.2, 8, 6]} />
                  <meshStandardMaterial color="#f2d987" roughness={0.8} />
                </mesh>
              </group>
            )}
          </group>
        ))}
      </group>
      {reeds.map((r, i) => (
        <mesh key={i} position={[r.x, r.h / 2, r.z]} rotation={[r.tilt, 0, r.tilt]}>
          <cylinderGeometry args={[0.045, 0.07, r.h, 4]} />
          <meshStandardMaterial color="#7f9461" roughness={1} />
        </mesh>
      ))}
    </group>
  );
}
/** An arched plank bridge over the pond's narrow east side. */
function Bridge() {
  const { x1, x2, z } = pondFeatures.bridge,
    mid = (x1 + x2) / 2;
  return (
    <group position={[mid, 0, z]}>
      {Array.from({ length: 9 }, (_, i) => {
        const t = i / 8,
          x = (x1 - mid) + t * (x2 - x1),
          y = Math.sin(t * Math.PI) * 1.1;
        return (
          <mesh key={i} position={[x, y + 0.12, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.55, 0.16, 2.3]} />
            <meshStandardMaterial color="#b08a5d" roughness={1} />
          </mesh>
        );
      })}
      {[-1, 1].map((s) => (
        <group key={s}>
          {Array.from({ length: 5 }, (_, i) => {
            const t = i / 4,
              x = (x1 - mid) + t * (x2 - x1),
              y = Math.sin(t * Math.PI) * 1.1;
            return (
              <mesh key={i} position={[x, y + 0.7, s * 1.05]}>
                <cylinderGeometry args={[0.09, 0.09, 0.75, 6]} />
                <meshStandardMaterial color="#8c7254" roughness={1} />
              </mesh>
            );
          })}
          <mesh
            position={[0, 1.45, s * 1.05]}
            rotation={[0, 0, Math.PI / 14]}
            castShadow
          >
            <boxGeometry args={[x2 - x1 + 1, 0.14, 0.14]} />
            <meshStandardMaterial color="#a8814f" roughness={1} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
/** Dragonflies hovering over the shore flowers. */
function Dragonflies({ low }: { low: boolean }) {
  const swarm = useRef<T.Group>(null);
  useFrame(({ clock }) => {
    swarm.current?.children.forEach((fly, i) => {
      const t = clock.elapsedTime * 0.8 + i * 3.1;
      fly.position.set(
        Math.sin(t * 0.7) * 24,
        2.6 + Math.sin(t * 1.7) * 0.7,
        Math.cos(t * 0.5) * 18 + 4,
      );
      fly.rotation.y = t * 0.7;
      fly.children.forEach((part, n) => {
        if (n > 0) part.rotation.x = Math.sin(clock.elapsedTime * 42 + n) * 0.7;
      });
    });
  });
  return (
    <group ref={swarm}>
      {Array.from({ length: low ? 2 : 4 }, (_, i) => (
        <group key={i}>
          <mesh scale={[0.09, 0.09, 0.85]}>
            <sphereGeometry args={[1, 6, 4]} />
            <meshStandardMaterial color="#5f8f8a" />
          </mesh>
          <mesh position={[0, 0.05, 0.5]} scale={0.14}>
            <sphereGeometry args={[1, 6, 4]} />
            <meshStandardMaterial color="#7ba7a2" />
          </mesh>
          {[-1, 1].map((sx) =>
            [-1, 1].map((sz) => (
              <mesh
                key={`${sx}${sz}`}
                position={[sx * 0.22, 0.1, sz * 0.22]}
                scale={[0.62, 0.03, 0.2]}
              >
                <planeGeometry />
                <meshStandardMaterial
                  color="#dceef0"
                  transparent
                  opacity={0.55}
                  side={T.DoubleSide}
                  depthWrite={false}
                />
              </mesh>
            )),
          )}
        </group>
      ))}
    </group>
  );
}
function Pond(props: SceneProps) {
  const { world, tool, onPlace, onExit, low } = props,
    season = world.environment.season,
    weather = world.environment.weather ?? "sun";
  const place = usePlacer(tool, onPlace);
  return (
    <>
      <SkyRig
        hour={world.environment.hour}
        low={low}
        sky={{ day: "#c8d9c4", night: "#16303a" }}
        fog={[180, 540]}
        hemi="#647f6c"
        stars={1600}
        shadowHalf={46}
        weather={weather}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow onClick={place}>
        <planeGeometry args={[90, 78]} />
        <meshStandardMaterial color={palettes[season].ground} />
      </mesh>
      <Box position={[0, -0.65, 0]} scale={[90, 1.2, 78]} color="#a3aa85" />
      {/* Stepping stones west of the bridge. */}
      {(
        [
          [-18, 2],
          [-14.5, 5],
          [-11, 8.4],
        ] as [number, number][]
      ).map(([x, z], i) => (
        <mesh key={i} position={[x, 0.12, z]} receiveShadow>
          <cylinderGeometry args={[1, 1.1, 0.22, 8]} />
          <meshStandardMaterial color="#b3b09b" roughness={1} />
        </mesh>
      ))}
      <Water night={isNight(world.environment.hour)} />
      <Bridge />
      <Dragonflies low={low} />
      <GrassField
        low={low}
        tint={grassTint("#6f8d60")}
        count={90}
        spread={[82, 70]}
        seed={957}
        accept={(x, z) =>
          walkSpecs.pond.walkable(x, z) &&
          Math.hypot((x - pondShape.x) / (pondShape.rx + 1), (z - pondShape.z) / (pondShape.rz + 1)) >= 1
        }
      />
      <Plants
        entities={world.entities}
        season={season}
        low={low}
        height={() => 0}
        wind={weatherWind[weather]}
      />
      <group
        position={[0, 0, pondFeatures.gate]}
        onClick={exitClick(tool, onExit)}
      >
        {[-2.4, 2.4].map((x) => (
          <Box
            key={x}
            position={[x, 1.9, 0]}
            scale={[0.3, 3.8, 0.3]}
            color="#9b8a6d"
          />
        ))}
        <Box position={[0, 3.9, 0]} scale={[5.6, 0.3, 0.3]} color="#b09468" />
        <mesh position={[0, 3.1, 0.2]}>
          <sphereGeometry args={[0.26, 8, 8]} />
          <meshStandardMaterial
            color="#f5cc7c"
            emissive="#f0c264"
            emissiveIntensity={isNight(world.environment.hour) ? 1.4 : 0.2}
          />
        </mesh>
      </group>
      <Residents scene="pond" entities={world.entities} />
      <Collectibles scene="pond" seed={world.seed} />
      {props.walk && props.avatar && props.onGate && (
        <PlayerRig scene="pond" avatar={props.avatar} entities={world.entities} onGate={props.onGate} />
      )}
      <SceneFrame reset={props.reset} position={[80, 82, 104]} max={330} />
    </>
  );
}
export default function PondScene(props: SceneProps) {
  return (
    <SceneCanvas low={props.low} scene="pond" position={[80, 82, 104]}>
      <Pond {...props} />
    </SceneCanvas>
  );
}
