import { useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as T from "three";
import {
  tableTops,
  gardenBeds,
  gardenPond,
  gardenGreenhouse,
  gardenTeaNook,
} from "@island/world-core";
import { Plants, Box, palettes } from "../Plants";
import { PlayerRig } from "../player/Player";
import {
  Butterflies,
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

function Bed({ x, z, w, d }: { x: number; z: number; w: number; d: number }) {
  return (
    <group position={[x, 0, z]}>
      <Box position={[0, 0.12, 0]} scale={[w, 0.24, d]} color="#89735b" />
      {[-1, 1].map((side) => (
        <group key={side}>
          <Box
            position={[0, 0.32, (side * d) / 2]}
            scale={[w + 0.4, 0.5, 0.35]}
            color="#baa27c"
          />
          <Box
            position={[(side * w) / 2, 0.32, 0]}
            scale={[0.35, 0.5, d]}
            color="#baa27c"
          />
        </group>
      ))}
    </group>
  );
}
function Greenhouse() {
  const { x, z, w, d } = gardenGreenhouse;
  return (
    <group position={[x, 0, z]}>
      <Box
        position={[0, 0.15, 0]}
        scale={[w + 0.8, 0.3, d + 0.8]}
        color="#c3c3a7"
      />
      {[-w / 2, w / 2].map((dx) => (
        <group key={dx}>
          <mesh position={[dx, 3.2, 0]} rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[d, 6.4]} />
            <meshStandardMaterial
              color="#b7ddd2"
              transparent
              opacity={0.25}
              side={T.DoubleSide}
              depthWrite={false}
            />
          </mesh>
          {[-d / 2, 0, d / 2].map((dz) => (
            <Box
              key={dz}
              position={[dx, 3.3, dz]}
              scale={[0.22, 6.6, 0.22]}
              color="#e8e1cb"
            />
          ))}
        </group>
      ))}
      {[-d / 2, d / 2].map((dz) => (
        <group key={dz}>
          <Box
            position={[0, 6.5, dz]}
            scale={[w, 0.22, 0.22]}
            color="#e8e1cb"
          />
          {[-6, -3, 3, 6].map((dx) => (
            <Box
              key={dx}
              position={[dx, 3.3, dz]}
              scale={[0.16, 6.6, 0.16]}
              color="#e8e1cb"
            />
          ))}
        </group>
      ))}
      {[-1, 1].map((side) => (
        <group
          key={side}
          position={[(side * w) / 4, 7.8, 0]}
          rotation={[0, 0, -side * 0.28]}
        >
          <mesh>
            <boxGeometry args={[w / 2 + 0.4, 0.12, d]} />
            <meshStandardMaterial
              color="#bed7ca"
              transparent
              opacity={0.42}
              depthWrite={false}
            />
          </mesh>
          {[-d / 2, 0, d / 2].map((dz) => (
            <Box
              key={dz}
              position={[0, 0, dz]}
              scale={[w / 2 + 0.5, 0.18, 0.18]}
              color="#e8e1cb"
            />
          ))}
        </group>
      ))}
      <Box
        position={[0, 9.1, 0]}
        scale={[0.25, 0.25, d + 0.4]}
        color="#e8e1cb"
      />
      {[-5, 5].map((dx) => (
        <group key={dx}>
          <Box position={[dx, 1.6, 0]} scale={[3, 0.35, 8]} color="#9d8061" />
          {[-3, 0, 3].map((dz) => (
            <group key={dz} position={[dx, 1.9, dz]}>
              <mesh>
                <cylinderGeometry args={[0.65, 0.45, 1, 8]} />
                <meshStandardMaterial color="#ba8569" />
              </mesh>
              <mesh position={[0, 0.8, 0]}>
                <sphereGeometry args={[0.9, 8, 6]} />
                <meshStandardMaterial color="#79966b" />
              </mesh>
            </group>
          ))}
        </group>
      ))}
    </group>
  );
}
function Pool({ night }: { night: boolean }) {
  const [ripple, setRipple] = useState<{
      x: number;
      z: number;
      t: number;
    } | null>(null),
    ring = useRef<T.Mesh>(null);
  const clock = useThree((s) => s.clock);
  useFrame(() => {
    if (!ring.current || !ripple) return;
    const age = clock.elapsedTime - ripple.t;
    ring.current.visible = age < 2.8;
    ring.current.scale.setScalar(1 + age * 1.8);
    (ring.current.material as T.MeshBasicMaterial).opacity = Math.max(
      0,
      0.55 - age * 0.2,
    );
  });
  return (
    <group position={[gardenPond.x, 0, gardenPond.z]}>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[gardenPond.rx + 1.4, gardenPond.rz + 1.4, 1]}
        position={[0, 0.08, 0]}
      >
        <circleGeometry args={[1, 48]} />
        <meshStandardMaterial color="#bdbea4" />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[gardenPond.rx, gardenPond.rz, 1]}
        position={[0, 0.14, 0]}
        onClick={(e) => {
          e.stopPropagation();
          setRipple({
            x: e.point.x - gardenPond.x,
            z: e.point.z - gardenPond.z,
            t: clock.elapsedTime,
          });
        }}
      >
        <circleGeometry args={[1, 64]} />
        <meshStandardMaterial
          color={night ? "#345e65" : "#73aaa5"}
          metalness={0.35}
          roughness={0.23}
        />
      </mesh>
      {ripple && (
        <mesh
          ref={ring}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[ripple.x, 0.19, ripple.z]}
        >
          <ringGeometry args={[0.48, 0.53, 40]} />
          <meshBasicMaterial
            color="#e4f4df"
            transparent
            opacity={0.5}
            depthWrite={false}
          />
        </mesh>
      )}
      {Array.from({ length: 9 }, (_, i) => (
        <mesh
          key={i}
          rotation={[-Math.PI / 2, 0, i]}
          position={[Math.cos(i * 2.4) * 5, 0.2, Math.sin(i * 2.4) * 3]}
        >
          <circleGeometry args={[0.7, 12, 0, 5.8]} />
          <meshStandardMaterial color="#718d60" side={T.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}
import { ContentAnimals } from "../animals";
import Collectibles from "../collect/Collectibles";

function Garden(props: SceneProps) {
  const { world, tool, onPlace, onExit, low } = props,
    season = world.environment.season,
    weather = world.environment.weather ?? "sun";
  const hour = world.environment.hour,
    night = isNight(hour);
  const place = usePlacer(tool, onPlace);
  return (
    <>
      <SkyRig
        hour={hour}
        low={low}
        sky={{ day: "#c5d5bb", night: "#172d39" }}
        fog={[220, 620]}
        stars={1800}
        weather={weather}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow onClick={place}>
        <planeGeometry args={[88, 78]} />
        <meshStandardMaterial color={palettes[season].ground} />
      </mesh>
      <Box position={[0, -0.65, 0]} scale={[88, 1.2, 78]} color="#a3aa85" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.3, 0]}>
        <planeGeometry args={[1800, 1800]} />
        <meshStandardMaterial color={night ? "#293e3a" : "#bbc9aa"} />
      </mesh>
      <Box position={[0, 0.04, 0]} scale={[6, 0.08, 75]} color="#dbd5b7" />
      <Box position={[0, 0.05, -1]} scale={[68, 0.1, 4]} color="#dbd5b7" />
      <Box position={[-22, 0.04, -11]} scale={[4, 0.08, 18]} color="#dbd5b7" />
      {gardenBeds.map((b, i) => (
        <group key={i} onClick={place}>
          <Bed {...b} />
        </group>
      ))}
      <GrassField
        low={low}
        tint={grassTint("#79966b")}
        count={80}
        spread={[80, 70]}
        seed={412}
        scale={0.9}
      />
      <Plants
        entities={world.entities}
        season={season}
        low={low}
        height={() => 0}
        wind={weatherWind[weather]}
      />
      <ContentAnimals scene="garden" entities={world.entities} />
      <Collectibles scene="garden" seed={world.seed} />
      <Greenhouse />
      <Pool night={night} />
      {/* Low clipped hedges give the garden its own enclosed, human-scale edge. */}
      {[-1, 1].map((side) => (
        <group key={side}>
          <Box
            position={[side * 42, 1.5, 0]}
            scale={[2.5, 3, 76]}
            color={season === "winter" ? "#aebaa1" : "#6f8d63"}
          />
          <Box
            position={[side * 23, 1.5, 37]}
            scale={[38, 3, 2.5]}
            color={season === "winter" ? "#aebaa1" : "#7e986c"}
          />
        </group>
      ))}
      <Box
        position={[0, 1.5, -37]}
        scale={[86, 3, 2.5]}
        color={season === "winter" ? "#aebaa1" : "#6f8d63"}
      />
      <group position={[0, 0, 35]} onClick={exitClick(tool, onExit)}>
        {[-4, 4].map((x) => (
          <Box
            key={x}
            position={[x, 3.7, 0]}
            scale={[0.5, 7.4, 0.5]}
            color="#eee2c5"
          />
        ))}
        <Box position={[0, 7.1, 0]} scale={[10, 0.5, 2]} color="#eee2c5" />
        {[-4, -2, 0, 2, 4].map((x) => (
          <Box
            key={x}
            position={[x, 7.6, 0]}
            scale={[0.25, 0.3, 3.5]}
            color="#a5b38a"
          />
        ))}
      </group>
      <group
        position={[gardenTeaNook.table.x, 0, gardenTeaNook.table.z]}
      >
        <mesh
          position={[
            0,
            tableTops.garden.standY - tableTops.garden.thickness / 2,
            0,
          ]}
          castShadow
        >
          <cylinderGeometry
            args={[
              tableTops.garden.r,
              tableTops.garden.r,
              tableTops.garden.thickness,
              24,
            ]}
          />
          <meshStandardMaterial color="#c6aa7c" />
        </mesh>
        <Box position={[0, 0.8, 0]} scale={[0.6, 1.6, 0.6]} color="#8c7254" />
        {[-gardenTeaNook.crateOffset, gardenTeaNook.crateOffset].map((x) => (
          <Box
            key={x}
            position={[x, 0.8, 0]}
            scale={[1.8, 1.6, 1.8]}
            color="#a68c67"
          />
        ))}
        <mesh position={[0, 2.1, 0]}>
          <cylinderGeometry args={[0.4, 0.3, 0.6, 10]} />
          <meshStandardMaterial color="#efdec0" />
        </mesh>
      </group>
      {season !== "winter" && (
        <Butterflies low={low} count={12} center={[0, 12]} spread={[27, 15]} />
      )}
      {props.walk && props.avatar && props.onGate && (
        <PlayerRig scene="garden" avatar={props.avatar} entities={world.entities} onGate={props.onGate} />
      )}
      <SceneFrame reset={props.reset} position={[84, 96, 115]} />
    </>
  );
}
export default function GardenScene(props: SceneProps) {
  return (
    <SceneCanvas low={props.low} scene="garden" position={[84, 96, 115]}>
      <Garden {...props} />
    </SceneCanvas>
  );
}
