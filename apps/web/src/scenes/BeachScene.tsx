import { useMemo, useRef } from "react";
import * as T from "three";
import { useFrame } from "@react-three/fiber";
import {
  beachFeatures,
  beachLagoon,
  beachShore,
  random,
} from "@island/world-core";
import { Plants, Box } from "../Plants";
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
} from "./shared";

/** Crescent sand: outer arc plus the lagoon's south arc, joined at two tips,
 *  so the bay opens to the sea and the sand reads as a moon. */
function useSandGeometry() {
  return useMemo(() => {
    const R = beachShore.r,
      r = beachLagoon.r,
      d = -beachLagoon.z; // shape-space y maps to world -z (north)
    // The two circles cross: chord height h and half-width s from the origin.
    const h = (R * R - r * r + d * d) / (2 * d),
      s = Math.sqrt(Math.max(0, R * R - h * h)),
      tip = Math.atan2(h, s),
      gap = Math.PI - 2 * tip;
    const points: T.Vector2[] = [];
    // Outer rim the long way around the south, from east tip to west tip.
    for (let i = 0; i <= 120; i++) {
      const a = tip - (i / 120) * (Math.PI * 2 - gap);
      points.push(new T.Vector2(Math.cos(a) * R, Math.sin(a) * R));
    }
    // Lagoon rim from west tip back to east tip, passing its southmost point.
    const west = Math.atan2(h - d, -s),
      east = Math.atan2(h - d, s);
    for (let i = 0; i <= 90; i++) {
      const phi = west + (i / 90) * (east + Math.PI * 2 - west);
      points.push(new T.Vector2(Math.cos(phi) * r, d + Math.sin(phi) * r));
    }
    const g = new T.ExtrudeGeometry(new T.Shape(points), {
      depth: 1.6,
      bevelEnabled: false,
    });
    g.rotateX(-Math.PI / 2);
    g.translate(0, -1.6, 0);
    g.computeVertexNormals();
    return g;
  }, []);
}
/** Sea and lagoon water with soft foam lapping at the inner rim. */
function Water({ night }: { night: boolean }) {
  const foams = useRef<T.Group>(null);
  useFrame(({ clock }) => {
    foams.current?.children.forEach((ring, i) => {
      const t = (clock.elapsedTime * 0.5 + i * 0.4) % 2;
      const s = 1 + Math.sin(t * Math.PI) * 0.045;
      ring.scale.set(s, 1, s * 0.94);
      const material = (ring as T.Mesh).material as T.MeshBasicMaterial;
      material.opacity = (1 - Math.abs(t - 1)) * 0.42;
    });
  });
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.9, 0]}>
        <planeGeometry args={[1600, 1600]} />
        <meshStandardMaterial
          color={night ? "#25444e" : "#7aa7b3"}
          metalness={0.25}
          roughness={0.35}
        />
      </mesh>
      <group ref={foams} position={[beachLagoon.x, -0.72, beachLagoon.z]}>
        {[0, 1].map((i) => (
          <mesh key={i} rotation={[-Math.PI / 2, 0, i * 1.7]}>
            <ringGeometry args={[17.3, 18.6, 60]} />
            <meshBasicMaterial
              color="#e9f4ee"
              transparent
              opacity={0.35}
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>
    </>
  );
}
/** Palm tree: stacked leaning trunk with a fan of fronds. */
function Palm({ x, z, flip }: { x: number; z: number; flip: number }) {
  const crown = useRef<T.Group>(null);
  useFrame(({ clock }) => {
    if (crown.current)
      crown.current.rotation.z = Math.sin(clock.elapsedTime * 0.9 + x) * 0.05;
  });
  const lean = flip * 0.1;
  return (
    <group position={[x, 0, z]}>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh
          key={i}
          position={[Math.sin(lean * i) * i * 1.15, 1.1 + i * 2.1, 0]}
          rotation={[0, 0, -lean * (i + 1)]}
          castShadow
        >
          <cylinderGeometry args={[0.34 - i * 0.04, 0.4 - i * 0.04, 2.4, 8]} />
          <meshStandardMaterial color="#9b7e58" roughness={1} />
        </mesh>
      ))}
      <group
        ref={crown}
        position={[Math.sin(lean * 4) * 4.6, 11.4, 0]}
        rotation={[0, flip * 0.5, 0]}
      >
        {Array.from({ length: 7 }, (_, i) => (
          <mesh
            key={i}
            rotation={[0.5, (i / 7) * Math.PI * 2, -0.55]}
            castShadow
          >
            <planeGeometry args={[6.5, 1.5]} />
            <meshStandardMaterial
              color={i % 2 ? "#6c9a5c" : "#7fae6a"}
              roughness={1}
              side={T.DoubleSide}
            />
          </mesh>
        ))}
        {[-0.5, 0.5].map((dx) => (
          <mesh key={dx} position={[dx, -0.3, 0.3]}>
            <sphereGeometry args={[0.4, 8, 6]} />
            <meshStandardMaterial color="#8a6a42" roughness={1} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
/** Wooden dock running from the south bank into the lagoon. */
function Dock() {
  const { x, z1, z2 } = beachFeatures.dock;
  return (
    <group>
      {Array.from({ length: 11 }, (_, i) => {
        const t = i / 10,
          z = z1 + (z2 - z1) * t;
        return (
          <mesh key={i} position={[x, 0.85, z]} castShadow receiveShadow>
            <boxGeometry args={[2.3, 0.16, 2.6]} />
            <meshStandardMaterial color={i % 2 ? "#b08a5d" : "#a8814f"} roughness={1} />
          </mesh>
        );
      })}
      {[0, 1, 2, 3, 4].map((i) => {
        const z = z1 + (z2 - z1) * (i / 4);
        return (
          <mesh key={i} position={[x, 0.1, z]}>
            <cylinderGeometry args={[0.16, 0.18, 2.2, 7]} />
            <meshStandardMaterial color="#8c7254" roughness={1} />
          </mesh>
        );
      })}
      <mesh position={[x + 0.9, 1.5, z2 + 0.6]} castShadow>
        <cylinderGeometry args={[0.1, 0.13, 1.4, 7]} />
        <meshStandardMaterial color="#8c7254" roughness={1} />
      </mesh>
      <mesh position={[x + 0.9, 2.3, z2 + 0.6]}>
        <sphereGeometry args={[0.2, 8, 8]} />
        <meshStandardMaterial
          color="#f5cc7c"
          emissive="#f0c264"
          emissiveIntensity={0.9}
        />
      </mesh>
    </group>
  );
}
/** Umbrella, driftwood and scattered shells dress the sand. */
function BeachProps() {
  const { umbrella, driftwood } = beachFeatures;
  const shells = useMemo(() => {
    const rng = random(371),
      list: { x: number; z: number; s: number; tone: number }[] = [];
    for (let i = 0; i < 16; i++) {
      const a = 0.08 + rng() * (Math.PI - 0.16),
        d = 10 + rng() * 26;
      list.push({
        x: Math.cos(a) * d,
        z: Math.sin(a) * d,
        s: 0.2 + rng() * 0.25,
        tone: rng() < 0.5 ? 0 : 1,
      });
    }
    return list;
  }, []);
  return (
    <>
      <group position={[umbrella.x, 0, umbrella.z]} rotation={[0.1, 0.4, 0.12]}>
        <mesh position={[0, 1.7, 0]} castShadow>
          <cylinderGeometry args={[0.09, 0.12, 3.4, 8]} />
          <meshStandardMaterial color="#b59a6f" roughness={1} />
        </mesh>
        <mesh position={[0, 3.6, 0]} castShadow>
          <coneGeometry args={[2.9, 1.3, 9]} />
          <meshStandardMaterial color="#d97f6f" roughness={0.95} side={T.DoubleSide} />
        </mesh>
        <mesh position={[0, 4.28, 0]}>
          <sphereGeometry args={[0.18, 8, 8]} />
          <meshStandardMaterial color="#f0e6d2" />
        </mesh>
        <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[2.4, 20]} />
          <meshStandardMaterial color="#e6dcc2" roughness={1} />
        </mesh>
      </group>
      <group position={[driftwood.x, 0, driftwood.z]} rotation={[0, 0.6, 0]}>
        {(
          [
            [0, 0, 0],
            [2.1, 0.14, 0.3],
            [4, 0.1, -0.4],
          ] as [number, number, number][]
        ).map(([dx, dy, dz], i) => (
          <mesh
            key={i}
            position={[dx - 2, dy + 0.5, dz]}
            rotation={[0, i * 0.3, i * 0.08]}
            castShadow
          >
            <boxGeometry args={[2.6, 0.8, 0.7]} />
            <meshStandardMaterial color="#8a7457" roughness={1} />
          </mesh>
        ))}
      </group>
      {shells.map((s, i) => (
        <mesh
          key={i}
          position={[s.x, 0.08, s.z]}
          rotation={[0, i, 0]}
          scale={s.s}
          castShadow
        >
          {s.tone ? (
            <coneGeometry args={[1, 1.3, 7]} />
          ) : (
            <sphereGeometry args={[1, 8, 5, 0, Math.PI]} />
          )}
          <meshStandardMaterial
            color={s.tone ? "#d9b8a0" : "#e8d8c8"}
            roughness={0.85}
          />
        </mesh>
      ))}
    </>
  );
}
import { ContentAnimals } from "../animals";
import Collectibles from "../collect/Collectibles";

function Beach(props: SceneProps) {
  const { world, tool, onPlace, onExit, low } = props,
    season = world.environment.season,
    weather = world.environment.weather ?? "sun",
    night = isNight(world.environment.hour);
  const place = usePlacer(tool, onPlace);
  const sand = useSandGeometry();
  return (
    <>
      <SkyRig
        hour={world.environment.hour}
        low={low}
        sky={{ day: "#c9d9d4", night: "#152b38" }}
        fog={[260, 800]}
        hemi="#6f8a91"
        stars={1900}
        shadowHalf={50}
        weather={weather}
      />
      <Water night={night} />
      <mesh geometry={sand} receiveShadow onClick={place}>
        <meshStandardMaterial
          color={season === "winter" ? "#ded6c0" : "#e6d6ac"}
          roughness={1}
        />
      </mesh>
      {beachFeatures.palms.map((p, i) => (
        <Palm key={i} x={p.x} z={p.z} flip={i ? -1 : 1} />
      ))}
      <Dock />
      <BeachProps />
      <Plants
        entities={world.entities}
        season={season}
        low={low}
        height={() => 0}
        wind={Math.min(1, weatherWind[weather] + 0.1)}
      />
      <ContentAnimals scene="beach" entities={world.entities} />
      <Collectibles scene="beach" seed={world.seed} />
      <group position={[0, 0, beachFeatures.gate]} onClick={exitClick(tool, onExit)}>
        {[-2.6, 2.6].map((x) => (
          <Box
            key={x}
            position={[x, 1.7, 0]}
            scale={[0.3, 3.4, 0.3]}
            color="#9b8a6d"
          />
        ))}
        <mesh position={[0, 3.3, 0]}>
          <boxGeometry args={[6.2, 0.12, 0.12]} />
          <meshStandardMaterial color="#e6dfc8" />
        </mesh>
        <mesh position={[0, 3.55, 0]}>
          <boxGeometry args={[6.2, 0.12, 0.12]} />
          <meshStandardMaterial color="#d9c8a0" />
        </mesh>
      </group>
      {props.walk && props.avatar && props.onGate && (
        <PlayerRig scene="beach" avatar={props.avatar} entities={world.entities} onGate={props.onGate} />
      )}
      <SceneFrame reset={props.reset} position={[92, 96, 128]} max={380} />
    </>
  );
}
export default function BeachScene(props: SceneProps) {
  return (
    <SceneCanvas low={props.low} scene="beach" position={[92, 96, 128]}>
      <Beach {...props} />
    </SceneCanvas>
  );
}
