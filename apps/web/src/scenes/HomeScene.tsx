import { homeFeatures } from "@island/world-core";
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
} from "./shared";

const cabinColors: Record<string, string> = {
  main: "#b87856",
  guest: "#5c7f7b",
  atelier: "#738b72",
};
function Cabin({
  x,
  z,
  w,
  d,
  id,
  night,
}: {
  x: number;
  z: number;
  w: number;
  d: number;
  id: string;
  night: boolean;
}) {
  return (
    <group position={[x, 0, z]}>
      <Box position={[0, 0.35, 0]} scale={[w + 1.4, 0.7, d + 1.4]} color="#cbbf9d" />
      <Box position={[0, 3.4, 0]} scale={[w, 5.5, d]} color="#f0e4c8" />
      <mesh position={[0, 6.9, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[Math.max(w, d) * 0.72, 3.4, 4]} />
        <meshStandardMaterial color={cabinColors[id] ?? "#b87856"} roughness={0.9} />
      </mesh>
      <Box position={[0, 2.2, d / 2 + 0.06]} scale={[2, 4, 0.18]} color="#6b7566" />
      {[-w / 2 + 2.2, w / 2 - 2.2].map((px) => (
        <group key={px}>
          <Box
            position={[px, 4.1, d / 2 + 0.08]}
            scale={[1.7, 2, 0.16]}
            color={night ? "#f5cc7c" : "#7daba7"}
            emissive={night}
          />
          <Box
            position={[px, 4.1, d / 2 + 0.2]}
            scale={[0.1, 2, 0.1]}
            color="#f0e4c8"
          />
        </group>
      ))}
      <Box position={[w / 2 - 1.2, 8.4, -d / 2 + 1.4]} scale={[0.9, 2.4, 0.9]} color="#a78b74" />
    </group>
  );
}
function Well() {
  const { x, z } = homeFeatures.well;
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.9, 0]} castShadow>
        <cylinderGeometry args={[1.7, 1.9, 1.7, 12]} />
        <meshStandardMaterial color="#a8a391" roughness={1} />
      </mesh>
      <mesh position={[0, 1.75, 0]}>
        <cylinderGeometry args={[1.45, 1.45, 0.1, 12]} />
        <meshStandardMaterial color="#3f5a68" metalness={0.4} roughness={0.3} />
      </mesh>
      {[-1.6, 1.6].map((dx) => (
        <Box key={dx} position={[dx, 2.9, 0]} scale={[0.28, 2.4, 0.28]} color="#8c7254" />
      ))}
      <mesh position={[0, 4.3, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[2.5, 1.5, 4]} />
        <meshStandardMaterial color="#738b72" roughness={0.9} />
      </mesh>
      <Box position={[0, 3.4, 0]} scale={[3.5, 0.14, 0.14]} color="#8c7254" />
      <Box position={[0, 2.9, 0]} scale={[0.1, 1, 0.1]} color="#5a4a36" />
      <Box position={[0, 2.5, 0]} scale={[0.5, 0.6, 0.5]} color="#7d6a4e" />
    </group>
  );
}
function Lantern({ x, z, night }: { x: number; z: number; night: boolean }) {
  return (
    <group position={[x, 0, z]}>
      <Box position={[0, 1.9, 0]} scale={[0.18, 3.8, 0.18]} color="#6b6350" />
      <mesh position={[0, 4.15, 0]}>
        <sphereGeometry args={[0.42, 10, 8]} />
        <meshStandardMaterial
          color="#f8dfa0"
          emissive="#f5cc7c"
          emissiveIntensity={night ? 1.6 : 0.25}
        />
      </mesh>
    </group>
  );
}
function Laundry() {
  const { x1, x2, z } = homeFeatures.laundry;
  return (
    <group position={[(x1 + x2) / 2, 0, z]}>
      {[x1, x2].map((x) => (
        <Box
          key={x}
          position={[x - (x1 + x2) / 2, 1.5, 0]}
          scale={[0.16, 3, 0.16]}
          color="#9b8a6d"
        />
      ))}
      <Box position={[0, 2.95, 0]} scale={[x2 - x1, 0.06, 0.06]} color="#e6dfc8" />
      {[-2.6, -0.6, 1.6].map((dx, i) => (
        <Box
          key={dx}
          position={[dx, 2.45, 0]}
          scale={[1.5, 1 + (i % 2) * 0.5, 0.06]}
          color={["#c78f84", "#8fb3c7", "#d9c48a"][i]!}
        />
      ))}
    </group>
  );
}
function Home(props: SceneProps) {
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
        sky={{ day: "#cbd8b9", night: "#182f36" }}
        fog={[160, 520]}
        stars={1600}
        shadowHalf={42}
        weather={weather}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow onClick={place}>
        <planeGeometry args={[74, 62]} />
        <meshStandardMaterial color={palettes[season].ground} />
      </mesh>
      <Box position={[0, -0.65, 0]} scale={[74, 1.2, 62]} color="#a3aa85" />
      <mesh position={[0, 0.05, 0]} receiveShadow>
        <cylinderGeometry args={[7, 7, 0.1, 40]} />
        <meshStandardMaterial color="#d3c9aa" roughness={1} />
      </mesh>
      {/* Stone slabs from the gate to the plaza. */}
      {Array.from({ length: 9 }, (_, i) => (
        <mesh key={i} position={[0, 0.11, 27 - i * 2.4]} receiveShadow>
          <boxGeometry args={[2.6, 0.12, 1.7]} />
          <meshStandardMaterial color="#c9c2a8" roughness={1} />
        </mesh>
      ))}
      {homeFeatures.cabins.map((c) => (
        <Cabin key={c.id} {...c} night={night} />
      ))}
      <Well />
      {(
        [
          [-2.6, 12],
          [2.6, 12],
          [-2.6, 20],
          [2.6, 20],
        ] as [number, number][]
      ).map(([x, z]) => (
        <Lantern key={`${x}-${z}`} x={x} z={z} night={night} />
      ))}
      <Laundry />
      <Plants
        entities={world.entities}
        season={season}
        low={low}
        height={() => 0}
        wind={weatherWind[weather]}
      />
      <group position={[0, 0, homeFeatures.gate]} onClick={exitClick(tool, onExit)}>
        {[-3.4, 3.4].map((x) => (
          <Box
            key={x}
            position={[x, 2.1, 0]}
            scale={[0.5, 4.2, 0.5]}
            color="#d9cba3"
          />
        ))}
        <Box position={[0, 4.3, 0]} scale={[8, 0.5, 1.6]} color="#d9cba3" />
        <Box position={[0, 4.9, 0]} scale={[8.6, 0.25, 2.2]} color="#b09468" />
        {[-1.7, 1.7].map((x) => (
          <mesh key={x} position={[x, 3.4, 0.6]}>
            <sphereGeometry args={[0.3, 8, 8]} />
            <meshStandardMaterial
              color="#f5cc7c"
              emissive="#f5cc7c"
              emissiveIntensity={night ? 1.4 : 0.2}
            />
          </mesh>
        ))}
      </group>
      <Residents scene="home" entities={world.entities} />
      <Collectibles scene="home" seed={world.seed} />
      {props.walk && props.avatar && props.onGate && (
        <PlayerRig scene="home" avatar={props.avatar} entities={world.entities} onGate={props.onGate} />
      )}
      <SceneFrame reset={props.reset} position={[62, 58, 84]} max={300} />
    </>
  );
}
export default function HomeScene(props: SceneProps) {
  return (
    <SceneCanvas low={props.low} scene="home" position={[62, 58, 84]}>
      <Home {...props} />
    </SceneCanvas>
  );
}
