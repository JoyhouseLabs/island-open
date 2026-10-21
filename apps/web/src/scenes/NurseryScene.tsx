import { useEffect, useMemo, useRef } from "react";
import * as T from "three";
import { useFrame } from "@react-three/fiber";
import { nurseryFeatures } from "@island/world-core";
import { Plants, Box, palettes } from "../Plants";
import { PlayerRig } from "../player/Player";
import {
  SceneCanvas,
  SceneFrame,
  SkyRig,
  exitClick,
  usePlacer,
  weatherWind,
  type SceneProps,
  GrassField,
  grassTint,
} from "./shared";

/** A long glass tunnel greenhouse with seed rows sprouting inside. */
function Greenhouse() {
  const { x, z, w, d } = nurseryFeatures.greenhouse;
  const sprouts = useRef<T.InstancedMesh>(null);
  const data = useMemo(() => {
    const dummy = new T.Object3D(),
      matrices: T.Matrix4[] = [];
    for (let row = 0; row < 4; row++)
      for (let col = 0; col < 13; col++) {
        const sx = -13 + col * 2.16,
          sz = -3.6 + row * 2.4;
        dummy.position.set(sx, 0.9 + ((row * 13 + col) % 5) * 0.16, sz);
        dummy.rotation.set(0, (col % 3) * 0.4, 0);
        dummy.scale.set(0.8, 0.55 + ((row + col) % 4) * 0.22, 0.8);
        dummy.updateMatrix();
        matrices.push(dummy.matrix.clone());
      }
    return matrices;
  }, []);
  useEffect(() => {
    if (!sprouts.current) return;
    data.forEach((m, i) => sprouts.current!.setMatrixAt(i, m));
    sprouts.current.instanceMatrix.needsUpdate = true;
    sprouts.current.computeBoundingSphere();
  }, [data]);
  return (
    <group position={[x, 0, z]}>
      <Box position={[0, 0.15, 0]} scale={[w + 1, 0.3, d + 1]} color="#c3c3a7" />
      <mesh position={[0, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[6, 6, w, 26, 1, true, 0, Math.PI]} />
        <meshStandardMaterial
          color="#bcd8cf"
          transparent
          opacity={0.24}
          side={T.DoubleSide}
          depthWrite={false}
          roughness={0.15}
        />
      </mesh>
      {[-6, 6].map((dz) => (
        <Box
          key={dz}
          position={[0, 0.2, dz]}
          scale={[w + 0.6, 0.36, 0.34]}
          color="#e8e1cb"
        />
      ))}
      {[-11, -5.5, 0, 5.5, 11].map((dx) =>
        [-6, 6].map((dz) => (
          <Box
            key={`${dx}${dz}`}
            position={[dx, 3.1, dz * 0.99]}
            scale={[0.24, 6.2, 0.24]}
            color="#e8e1cb"
          />
        )),
      )}
      {[-w / 2, w / 2].map((endX) => (
        <mesh key={endX} position={[endX, 3.1, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <circleGeometry args={[5.9, 24, 0, Math.PI]} />
          <meshStandardMaterial
            color="#cfe4dc"
            transparent
            opacity={0.3}
            side={T.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ))}
      {[-9, -4.5, 0, 4.5, 9].map((bz) => (
        <group key={bz} position={[0, 0.4, bz]}>
          <Box position={[0, 0.35, 0]} scale={[26, 0.3, 1.8]} color="#9d8061" />
          <Box position={[0, 0.62, 0]} scale={[25.4, 0.2, 1.5]} color="#6b5642" />
        </group>
      ))}
      <instancedMesh
        ref={sprouts}
        args={[undefined, undefined, data.length]}
        castShadow
      >
        <coneGeometry args={[0.34, 1, 6]} />
        <meshStandardMaterial color="#79b06a" roughness={1} />
      </instancedMesh>
    </group>
  );
}
/** Water barrel and watering can by the tunnel's south door. */
function Watering() {
  const { x, z } = nurseryFeatures.barrel;
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 1, 0]} castShadow>
        <cylinderGeometry args={[1.1, 1, 2, 14]} />
        <meshStandardMaterial color="#8c7254" roughness={1} />
      </mesh>
      <mesh position={[0, 2.02, 0]}>
        <cylinderGeometry args={[1.12, 1.12, 0.08, 14]} />
        <meshStandardMaterial color="#5f7d8c" metalness={0.3} roughness={0.4} />
      </mesh>
      <group position={[1.9, 0, 0.9]} rotation={[0, 0.7, 0]}>
        <mesh position={[0, 0.5, 0]} castShadow>
          <cylinderGeometry args={[0.5, 0.42, 1, 10]} />
          <meshStandardMaterial color="#9fb7c4" metalness={0.4} roughness={0.45} />
        </mesh>
        <mesh position={[0, 1.05, 0]} rotation={[0.3, 0, 0]}>
          <cylinderGeometry args={[0.22, 0.3, 1.1, 8]} />
          <meshStandardMaterial color="#8ba7b5" metalness={0.4} roughness={0.45} />
        </mesh>
        <mesh position={[0, 1.15, 0.75]} rotation={[1.4, 0, 0]}>
          <cylinderGeometry args={[0.06, 0.06, 0.7, 6]} />
          <meshStandardMaterial color="#7d99a8" metalness={0.4} roughness={0.5} />
        </mesh>
      </group>
    </group>
  );
}
/** Bees hovering between the outside seed beds. */
function Bees({ low }: { low: boolean }) {
  const swarm = useRef<T.Group>(null);
  useFrame(({ clock }) => {
    swarm.current?.children.forEach((bee, i) => {
      const t = clock.elapsedTime * 0.5 + i * 2.2;
      bee.position.set(
        Math.sin(t * 1.3 + i) * 22,
        1.4 + Math.sin(t * 3 + i) * 0.4,
        10 + Math.cos(t + i * 0.8) * 9,
      );
      bee.rotation.y = t * 1.3;
      bee.children.forEach((wing, n) => {
        if (n > 0) wing.rotation.z = (n % 2 ? 1 : -1) * Math.sin(clock.elapsedTime * 46) * 0.85;
      });
    });
  });
  return (
    <group ref={swarm}>
      {Array.from({ length: low ? 2 : 4 }, (_, i) => (
        <group key={i}>
          <mesh scale={[0.22, 0.2, 0.34]}>
            <sphereGeometry args={[1, 8, 6]} />
            <meshStandardMaterial color="#d9a53f" roughness={0.9} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.24, 0.14, 0]} scale={[0.42, 0.04, 0.24]}>
              <planeGeometry />
              <meshStandardMaterial
                color="#e8f2ec"
                transparent
                opacity={0.5}
                side={T.DoubleSide}
                depthWrite={false}
              />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}
/** Pot cradles for the saplings planted along the south edge. */
function PotRow() {
  return (
    <>
      {[-28, -21, -14, 14, 21, 28].map((x) => (
        <group key={x} position={[x, 0, 26]}>
          <mesh position={[0, 0.55, 0]} castShadow>
            <cylinderGeometry args={[1.5, 1.2, 1.1, 12]} />
            <meshStandardMaterial color="#b08a5d" roughness={1} />
          </mesh>
          <mesh position={[0, 1.11, 0]}>
            <cylinderGeometry args={[1.42, 1.42, 0.1, 12]} />
            <meshStandardMaterial color="#6b5642" roughness={1} />
          </mesh>
        </group>
      ))}
    </>
  );
}
import { ContentAnimals } from "../animals";
import Collectibles from "../collect/Collectibles";

function Nursery(props: SceneProps) {
  const { world, tool, onPlace, onExit, low } = props,
    season = world.environment.season,
    weather = world.environment.weather ?? "sun";
  const place = usePlacer(tool, onPlace);
  return (
    <>
      <SkyRig
        hour={world.environment.hour}
        low={low}
        sky={{ day: "#c9d9c0", night: "#1a2f36" }}
        fog={[170, 520]}
        stars={1600}
        shadowHalf={46}
        weather={weather}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow onClick={place}>
        <planeGeometry args={[86, 70]} />
        <meshStandardMaterial color={palettes[season].ground} />
      </mesh>
      <Box position={[0, -0.65, 0]} scale={[86, 1.2, 70]} color="#a3aa85" />
      {Array.from({ length: 7 }, (_, i) => (
        <mesh key={i} position={[0, 0.06, 28 - i * 3.6]} receiveShadow>
          <boxGeometry args={[2.2, 0.1, 1.5]} />
          <meshStandardMaterial color="#c9c2a8" roughness={1} />
        </mesh>
      ))}
      <Greenhouse />
      <Watering />
      <PotRow />
      {nurseryFeatures.beds.map((b, i) => (
        <group key={i} onClick={place}>
          <group position={[b.x, 0, b.z]}>
            <Box position={[0, 0.12, 0]} scale={[8, 0.24, 3.5]} color="#8a7458" />
            {[-1, 1].map((s) => (
              <Box
                key={s}
                position={[0, 0.35, (s * 3.5) / 2]}
                scale={[8.4, 0.4, 0.28]}
                color="#baa27c"
              />
            ))}
          </group>
        </group>
      ))}
      <Bees low={low} />
      <GrassField
        low={low}
        tint={grassTint("#79b06a")}
        count={65}
        spread={[78, 62]}
        seed={335}
        scale={0.9}
      />
      <Plants
        entities={world.entities}
        season={season}
        low={low}
        height={() => 0}
        wind={weatherWind[weather]}
      />
      <ContentAnimals scene="nursery" entities={world.entities} />
      <Collectibles scene="nursery" seed={world.seed} />
      <group
        position={[0, 0, nurseryFeatures.gate]}
        onClick={exitClick(tool, onExit)}
      >
        {[-2.8, 2.8].map((x) => (
          <Box key={x} position={[x, 2, 0]} scale={[0.34, 4, 0.34]} color="#9b8a6d" />
        ))}
        <Box position={[0, 4.1, 0]} scale={[6.4, 0.35, 0.35]} color="#b09468" />
        {[-1.2, 1.2].map((x) => (
          <mesh key={x} position={[x, 3.2, 0.2]}>
            <sphereGeometry args={[0.24, 8, 8]} />
            <meshStandardMaterial color="#c9e4b0" roughness={0.8} />
          </mesh>
        ))}
      </group>
      {props.walk && props.avatar && props.onGate && (
        <PlayerRig scene="nursery" avatar={props.avatar} entities={world.entities} onGate={props.onGate} />
      )}
      <SceneFrame reset={props.reset} position={[76, 72, 96]} max={320} />
    </>
  );
}
export default function NurseryScene(props: SceneProps) {
  return (
    <SceneCanvas low={props.low} scene="nursery" position={[76, 72, 96]}>
      <Nursery {...props} />
    </SceneCanvas>
  );
}
