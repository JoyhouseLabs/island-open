import { useEffect, useMemo } from "react";
import * as T from "three";
import {
  flowerBeds,
  nurseryBeds,
  groundHeight,
  landmarks,
  pond,
  random,
} from "@island/world-core";

function Block({
  x,
  y,
  z,
  w,
  h,
  d,
  color,
}: {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  color: string;
}) {
  return (
    <mesh position={[x, y, z]} castShadow receiveShadow>
      <boxGeometry args={[w, h, d]} />
      <meshStandardMaterial color={color} roughness={0.9} />
    </mesh>
  );
}
function surface(cx: number, cz: number, rx: number, rz: number) {
  const g = new T.BufferGeometry(),
    positions: number[] = [],
    indices: number[] = [];
  positions.push(cx, groundHeight(cx, cz) + 0.12, cz);
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2,
      x = cx + Math.cos(a) * rx,
      z = cz + Math.sin(a) * rz;
    positions.push(x, groundHeight(x, z) + 0.12, z);
    if (i) indices.push(0, i + 1, i);
  }
  g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}
function Bed({
  x,
  z,
  w,
  d,
  nursery = false,
}: {
  x: number;
  z: number;
  w: number;
  d: number;
  nursery?: boolean;
}) {
  const y = groundHeight(x, z) + 0.1;
  return (
    <group>
      <Block
        x={x}
        y={y}
        z={z}
        w={w}
        h={0.25}
        d={d}
        color={nursery ? "#8e7961" : "#9b856b"}
      />
      {[-1, 1].map((s) => (
        <group key={s}>
          <Block
            x={x + s * (w / 2 + 0.1)}
            y={y + 0.25}
            z={z}
            w={0.24}
            h={0.55}
            d={d + 0.5}
            color="#c0ad88"
          />
          <Block
            x={x}
            y={y + 0.25}
            z={z + s * (d / 2 + 0.1)}
            w={w + 0.5}
            h={0.55}
            d={0.24}
            color="#c0ad88"
          />
        </group>
      ))}
      {nursery &&
        [-2, 0, 2].map((offset) => (
          <Block
            key={offset}
            x={x + offset}
            y={y + 0.2}
            z={z}
            w={0.45}
            h={0.15}
            d={d - 0.7}
            color="#677d4c"
          />
        ))}
    </group>
  );
}
function Fence({
  x,
  z,
  length,
  rotation = 0,
}: {
  x: number;
  z: number;
  length: number;
  rotation?: number;
}) {
  return (
    <group position={[x, groundHeight(x, z), z]} rotation={[0, rotation, 0]}>
      {Array.from({ length: Math.ceil(length / 2) + 1 }, (_, i) => (
        <Block
          key={i}
          x={i * 2 - length / 2}
          y={1}
          z={0}
          w={0.22}
          h={2}
          d={0.25}
          color="#e0dcc2"
        />
      ))}
      {[0.7, 1.5].map((y) => (
        <Block
          key={y}
          x={0}
          y={y}
          z={0}
          w={length}
          h={0.16}
          d={0.18}
          color="#e8e2c7"
        />
      ))}
    </group>
  );
}
function Arbor() {
  const x = -28,
    z = 38,
    y = groundHeight(x, z);
  return (
    <group position={[x, y, z]}>
      {[-2.8, 2.8].map((a) => (
        <Block
          key={a}
          x={a}
          y={2.6}
          z={0}
          w={0.38}
          h={5.2}
          d={0.38}
          color="#ded7b7"
        />
      ))}
      <Block x={0} y={5.3} z={0} w={7} h={0.35} d={2} color="#b9b58e" />
      {[-2.5, -1.25, 0, 1.25, 2.5].map((a) => (
        <Block
          key={a}
          x={a}
          y={5.5}
          z={0}
          w={0.25}
          h={0.18}
          d={3}
          color="#d6d0ad"
        />
      ))}
    </group>
  );
}
function CabinPlot({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, groundHeight(x, z) + 0.15, z]}>
      {[-1, 1].map((s) => (
        <group key={s}>
          <Block
            x={s * 5.5}
            y={0.12}
            z={0}
            w={0.3}
            h={0.24}
            d={9}
            color="#a9ac92"
          />
          <Block
            x={0}
            y={0.12}
            z={s * 4.5}
            w={11}
            h={0.24}
            d={0.3}
            color="#a9ac92"
          />
        </group>
      ))}
    </group>
  );
}
function Mountain() {
  const peak = landmarks.find((p) => p.id === "mountain")!,
    cave = landmarks.find((p) => p.id === "cave")!;
  const rock = useMemo(() => {
    const rng = random(562);
    return Array.from({ length: 16 }, () => {
      const x = -40 + rng() * 90,
        z = -72 - rng() * 19;
      return { x, z, size: 1.8 + rng() * 3 };
    });
  }, []);
  return (
    <>
      {rock.map((r, i) => (
        <mesh
          key={i}
          position={[r.x, groundHeight(r.x, r.z) + r.size * 0.25, r.z]}
          scale={[r.size, r.size * 0.8, r.size * 0.75]}
          castShadow
        >
          <dodecahedronGeometry args={[1, 0]} />
          <meshStandardMaterial
            color={i % 2 ? "#a3a598" : "#b8b8a5"}
            roughness={1}
            flatShading
          />
        </mesh>
      ))}
      <group position={[peak.x, groundHeight(peak.x, peak.z) + 0.4, peak.z]}>
        <mesh receiveShadow>
          <cylinderGeometry args={[5, 5, 1, 8]} />
          <meshStandardMaterial color="#ad9270" roughness={0.9} />
        </mesh>
        {Array.from({ length: 7 }, (_, i) => {
          const a = (i / 8) * Math.PI * 2;
          return (
            <Block
              key={i}
              x={Math.cos(a) * 4.5}
              y={1.2}
              z={Math.sin(a) * 4.5}
              w={0.25}
              h={2.6}
              d={0.25}
              color="#927e62"
            />
          );
        })}
        <Block x={0} y={1.5} z={0} w={0.3} h={3} d={0.3} color="#727f70" />
        <mesh position={[0, 3, 0]} rotation={[0, 0, 0.3]}>
          <cylinderGeometry args={[0.4, 0.65, 2.5, 8]} />
          <meshStandardMaterial
            color="#6e827b"
            metalness={0.3}
            roughness={0.5}
          />
        </mesh>
      </group>
      <group position={[cave.x, groundHeight(cave.x, cave.z), cave.z]}>
        <mesh position={[0, 3.7, 0.3]}>
          <circleGeometry args={[3.1, 24]} />
          <meshBasicMaterial color="#35413b" side={T.DoubleSide} />
        </mesh>
        {Array.from({ length: 7 }, (_, i) => {
          const a = (i / 6) * Math.PI;
          return (
            <mesh
              key={i}
              position={[Math.cos(a) * 3.6, 1 + Math.sin(a) * 6, 0.3]}
              scale={[1.7, 1.9, 1.6]}
              castShadow
            >
              <dodecahedronGeometry args={[1, 0]} />
              <meshStandardMaterial color="#92998c" roughness={1} />
            </mesh>
          );
        })}
        <Block x={0} y={1.3} z={2.8} w={7.5} h={0.25} d={0.3} color="#b7a987" />
        {[-3, 3].map((x) => (
          <Block
            key={x}
            x={x}
            y={1}
            z={2.8}
            w={0.3}
            h={2}
            d={0.3}
            color="#b7a987"
          />
        ))}
      </group>
    </>
  );
}
export function Districts() {
  const plaza = useMemo(() => surface(-28, 27, 7, 7), []);
  useEffect(() => () => plaza.dispose(), [plaza]);
  const reeds = useMemo(() => {
    const rng = random(281);
    return Array.from({ length: 36 }, () => {
      const a = rng() * Math.PI * 2;
      return {
        x: pond.x + Math.cos(a) * (pond.rx + 1.8),
        z: pond.z + Math.sin(a) * (pond.rz + 1.8),
        height: 1 + rng() * 1.7,
      };
    });
  }, []);
  return (
    <>
      <mesh geometry={plaza} receiveShadow>
        <meshStandardMaterial
          color="#d3c9aa"
          roughness={1}
          side={T.DoubleSide}
        />
      </mesh>
      <mesh position={[-28, 6.6, 27]}>
        <cylinderGeometry args={[1.9, 2.3, 0.8, 16]} />
        <meshStandardMaterial color="#b1b8a1" roughness={0.9} />
      </mesh>
      <mesh position={[-28, 7.1, 27]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.65, 24]} />
        <meshStandardMaterial color="#7caaa0" roughness={0.25} />
      </mesh>
      <CabinPlot x={-48} z={7} />
      <CabinPlot x={-8} z={7} />
      {flowerBeds.map((b, i) => (
        <Bed key={`garden-${i}`} {...b} />
      ))}
      {nurseryBeds.map((b, i) => (
        <Bed key={`nursery-${i}`} {...b} nursery />
      ))}
      <Arbor />
      <Fence x={-53} z={50} length={22} rotation={Math.PI / 2} />
      <Fence x={-3} z={51} length={20} rotation={Math.PI / 2} />
      <Fence x={-42} z={63} length={19} />
      <Fence x={-14} z={63} length={19} />
      <group position={[74, groundHeight(74, 45), 45]}>
        <Block x={0} y={1.1} z={0} w={3} h={2.2} d={1.6} color="#99a58a" />
        <Block x={0} y={2.3} z={0} w={3.4} h={0.25} d={2} color="#d1c6a4" />
      </group>
      <group
        position={[18, groundHeight(18, 72) + 0.15, 72]}
        rotation={[0, -0.22, 0]}
      >
        <Block x={0} y={0} z={0} w={7} h={0.08} d={5} color="#d6b28b" />
        {[-2, 0, 2].map((x) => (
          <Block
            key={x}
            x={x}
            y={0.05}
            z={0}
            w={0.8}
            h={0.03}
            d={5}
            color="#e4d5b3"
          />
        ))}
        <Block x={2} y={0.6} z={1} w={1.3} h={1.2} d={1} color="#a68c60" />
      </group>
      {reeds.map((r, i) => (
        <mesh
          key={i}
          position={[r.x, groundHeight(r.x, r.z) + r.height / 2, r.z]}
          rotation={[0.12, 0, 0.1]}
        >
          <cylinderGeometry args={[0.04, 0.07, r.height, 4]} />
          <meshStandardMaterial color="#809461" />
        </mesh>
      ))}
      <Mountain />
      <group position={[86, groundHeight(86, 56), 56]} rotation={[0, -0.3, 0]}>
        {[-3.5, 3.5].map((x) => (
          <Block
            key={x}
            x={x}
            y={3}
            z={0}
            w={0.8}
            h={6}
            d={0.8}
            color="#8a795b"
          />
        ))}
        <Block x={0} y={5.6} z={0} w={8.5} h={1.5} d={0.7} color="#55775c" />
        {[-1.4, 0, 1.4].map((x) => (
          <mesh
            key={x}
            position={[x, 7, 0]}
            scale={[0.55, 0.8, 0.55]}
            castShadow
          >
            <sphereGeometry args={[1, 10, 8]} />
            <meshStandardMaterial color="#e6d4a9" />
          </mesh>
        ))}
      </group>
    </>
  );
}
