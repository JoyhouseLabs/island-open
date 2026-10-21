import { useMemo, useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as T from "three";
import type { Season, IslandEntity } from "@island/contracts";
import { groundHeight, random, generateTree } from "@island/world-core";
export const palettes: Record<Season, { ground: string; leaf: string[] }> = {
  spring: { ground: "#9dbb84", leaf: ["#91b770", "#b3c983", "#769d60"] },
  summer: { ground: "#9fbc83", leaf: ["#4d784b", "#729351", "#9bad6b"] },
  autumn: { ground: "#b3ad74", leaf: ["#ca8b55", "#deae68", "#9a9a67"] },
  winter: { ground: "#d6ded5", leaf: ["#ac997a", "#c1b8a1", "#8f8067"] },
};
// Wind state is shared by every swaying material; Plants feeds it each frame.
const windTime = { value: 0 },
  windStrength = { value: 0.22 };
function swayChunk(amp: number, lift: number) {
  return `
    #ifdef USE_INSTANCING
      float swayPhase = instanceMatrix[3].x * 0.41 + instanceMatrix[3].z * 0.53;
    #else
      float swayPhase = 0.0;
    #endif
    float sway = sin(uWindTime * 1.7 + swayPhase) * 0.6
      + sin(uWindTime * 3.9 + swayPhase * 1.7) * 0.4;
    float swayRaise = clamp(transformed.y + ${lift.toFixed(3)}, 0.05, 1.4);
    transformed.x += sway * uWind * ${amp.toFixed(3)} * swayRaise;
    transformed.z += cos(uWindTime * 2.3 + swayPhase) * uWind * ${amp.toFixed(3)} * swayRaise * 0.7;
    transformed.y += sin(uWindTime * 1.3 + swayPhase) * uWind * ${amp.toFixed(3)} * swayRaise * 0.35;
  `;
}
export function swayingMaterial(
  options: T.MeshStandardMaterialParameters,
  amp: number,
  lift: number,
) {
  const material = new T.MeshStandardMaterial(options);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = windTime;
    shader.uniforms.uWind = windStrength;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform float uWindTime;\nuniform float uWind;",
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>\n${swayChunk(amp, lift)}`,
      );
  };
  return material;
}
function createLeafGeometry() {
  const geometry = new T.BufferGeometry();
  geometry.setAttribute(
    "position",
    new T.Float32BufferAttribute(
      [
        0, 0, -0.6, -0.23, 0, -0.18, -0.25, 0.015, 0.18, 0, 0, 0.65, 0.25,
        0.015, 0.18, 0.23, 0, -0.18, 0, 0.11, 0.05,
      ],
      3,
    ),
  );
  geometry.setIndex([0, 6, 1, 1, 6, 2, 2, 6, 3, 3, 6, 4, 4, 6, 5, 5, 6, 0]);
  geometry.setAttribute(
    "color",
    new T.Float32BufferAttribute(
      [
        0.65, 0.65, 0.65, 0.88, 0.88, 0.88, 1, 1, 1, 1, 1, 1, 0.9, 0.9, 0.9,
        0.78, 0.78, 0.78, 1, 1, 1,
      ],
      3,
    ),
  );
  geometry.computeVertexNormals();
  return geometry;
}

function createFlowerGeometry() {
  const geometry = new T.BufferGeometry(),
    positions: number[] = [],
    indices: number[] = [];
  for (let petal = 0; petal < 5; petal++) {
    const a = (petal / 5) * Math.PI * 2,
      start = positions.length / 3;
    positions.push(Math.sin(a) * 0.35, 0.16, Math.cos(a) * 0.35);
    for (let i = 0; i <= 8; i++) {
      const t = (i / 8) * Math.PI * 2,
        rad = 0.36 + Math.cos(t) * 0.43,
        side = Math.sin(t) * 0.28;
      positions.push(
        Math.sin(a) * rad + Math.cos(a) * side,
        0.05,
        Math.cos(a) * rad - Math.sin(a) * side,
      );
      if (i) indices.push(start, start + i, start + i + 1);
    }
  }
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function Bird({
  x,
  y,
  z,
  tone,
}: {
  x: number;
  y: number;
  z: number;
  tone: number;
}) {
  const group = useRef<T.Group>(null);
  useFrame(({ clock }) => {
    if (group.current)
      group.current.position.y = y + Math.sin(clock.elapsedTime * 2.2 + x) * 0.03;
  });
  const color = ["#8a5a3b", "#b07a4a", "#a34f3f"][tone]!;
  return (
    <group ref={group} position={[x, y + 0.16, z]}>
      <mesh scale={[0.34, 0.3, 0.42]} castShadow>
        <sphereGeometry args={[1, 7, 5]} />
        <meshStandardMaterial color={color} roughness={1} />
      </mesh>
      <mesh position={[0, 0.24, 0.1]} scale={0.19}>
        <sphereGeometry args={[1, 7, 5]} />
        <meshStandardMaterial color={color} roughness={1} />
      </mesh>
      <mesh position={[0, 0.24, 0.3]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.06, 0.22, 5]} />
        <meshStandardMaterial color="#d99a3f" roughness={1} />
      </mesh>
    </group>
  );
}

export function Plants({
  entities,
  season,
  low,
  height = groundHeight,
  wind = 0.22,
}: {
  entities: IslandEntity[];
  season: Season;
  low: boolean;
  height?: (x: number, z: number) => number;
  /** 0 calm … 1 storm; drives leaf and petal sway. */
  wind?: number;
}) {
  const trunks = useRef<T.InstancedMesh>(null),
    crowns = useRef<T.InstancedMesh>(null),
    flowers = useRef<T.InstancedMesh>(null),
    nests = useRef<T.InstancedMesh>(null);
  const leafGeometry = useMemo(createLeafGeometry, []);
  const flowerGeometry = useMemo(createFlowerGeometry, []);
  const leafMaterial = useMemo(
    () =>
      swayingMaterial(
        {
          roughness: 0.88,
          side: T.DoubleSide,
          vertexColors: true,
        },
        0.28,
        0.45,
      ),
    [],
  );
  const flowerMaterial = useMemo(
    () => swayingMaterial({ roughness: 1, side: T.DoubleSide }, 0.16, 0.4),
    [],
  );
  const nestMaterial = useMemo(
    () => new T.MeshStandardMaterial({ color: "#86663f", roughness: 1 }),
    [],
  );
  useEffect(
    () => () => {
      leafGeometry.dispose();
      flowerGeometry.dispose();
      leafMaterial.dispose();
      flowerMaterial.dispose();
      nestMaterial.dispose();
    },
    [leafGeometry, leafMaterial, flowerGeometry, flowerMaterial, nestMaterial],
  );
  useEffect(() => {
    windStrength.value = wind;
  }, [wind]);
  useFrame((_, dt) => {
    windTime.value += Math.min(dt, 0.05) * (1 + windStrength.value);
  });
  const data = useMemo(() => {
    const stems: number[] = [];
    const wood: T.Matrix4[] = [],
      leaves: { matrix: T.Matrix4; color: T.Color }[] = [],
      blooms: { matrix: T.Matrix4; color: T.Color }[] = [],
      nestSpots: { x: number; y: number; z: number; bird: boolean; tone: number }[] =
        [];
    const dummy = new T.Object3D();
    for (const e of entities) {
      const rng = random(e.seed),
        y = height(e.x, e.z),
        scale = 0.45 + e.growth * 0.8;
      if (e.kind === "tree") {
        const tree = generateTree(e.seed);
        for (const branch of tree.branches) {
          const start = new T.Vector3(...branch.start)
              .multiplyScalar(scale)
              .add(new T.Vector3(e.x, y, e.z)),
            end = new T.Vector3(...branch.end)
              .multiplyScalar(scale)
              .add(new T.Vector3(e.x, y, e.z));
          const direction = end.clone().sub(start);
          dummy.position.copy(start).add(end).multiplyScalar(0.5);
          dummy.quaternion.setFromUnitVectors(
            new T.Vector3(0, 1, 0),
            direction.clone().normalize(),
          );
          dummy.scale.set(
            branch.radius * scale,
            direction.length(),
            branch.radius * scale,
          );
          dummy.updateMatrix();
          wood.push(dummy.matrix.clone());
        }
        // A few settled trees earn a nest; some of those get a resident bird.
        if (e.seed % 7 === 0 && e.growth > 0.55) {
          const top = tree.branches.reduce((a, b) => (b.end[1] > a.end[1] ? b : a));
          nestSpots.push({
            x: e.x + top.end[0] * scale * 0.55,
            y: y + top.end[1] * scale * 0.94,
            z: e.z + top.end[2] * scale * 0.55,
            bird: e.seed % 21 === 0,
            tone: e.seed % 3,
          });
        }
        const treeTone = rng();
        for (let i = 0; i < tree.leaves.length; i++) {
          const leaf = tree.leaves[i]!;
          if (low && i % 2) continue;
          // Deciduous winter foliage reveals the actual branch skeleton.
          if (season === "winter" && leaf.retention > 0.055) continue;
          dummy.position.set(
            e.x + leaf.position[0] * scale,
            y + leaf.position[1] * scale,
            e.z + leaf.position[2] * scale,
          );
          dummy.rotation.set(...leaf.rotation);
          const size = leaf.size * scale * (low ? 1.18 : 1);
          dummy.scale.set(size, size, size);
          dummy.updateMatrix();
          const leafBase = new T.Vector3(0, 0, -0.6).applyMatrix4(dummy.matrix);
          stems.push(
            e.x + leaf.stem[0] * scale,
            y + leaf.stem[1] * scale,
            e.z + leaf.stem[2] * scale,
            leafBase.x,
            leafBase.y,
            leafBase.z,
          );
          const tint =
            season === "autumn"
              ? treeTone * 0.65 + leaf.tone * 0.35
              : leaf.tone;
          const color = new T.Color(
            palettes[season].leaf[Math.min(2, Math.floor(tint * 3))]!,
          );
          color.multiplyScalar(0.8 + leaf.tone * 0.35);
          leaves.push({ matrix: dummy.matrix.clone(), color });
        }
      } else if (e.kind === "flower") {
        for (let n = 0; n < 5; n++) {
          dummy.position.set(
            e.x + (rng() - 0.5) * 2,
            y + 0.4 + rng() * 0.5,
            e.z + (rng() - 0.5) * 2,
          );
          stems.push(
            dummy.position.x,
            y,
            dummy.position.z,
            dummy.position.x,
            dummy.position.y,
            dummy.position.z,
          );
          dummy.quaternion.identity();
          dummy.scale.set(0.5, 0.5, 0.5);
          dummy.updateMatrix();
          blooms.push({
            matrix: dummy.matrix.clone(),
            color: new T.Color(
              season === "winter"
                ? "#f2ede0"
                : ["#d88b83", "#e9bf61", "#ad94bf"][Math.floor(rng() * 3)]!,
            ),
          });
        }
      }
    }
    return { wood, leaves, blooms, stems, nestSpots };
  }, [entities, season, low, height]);
  const stemGeometry = useMemo(() => {
    const geometry = new T.BufferGeometry();
    geometry.setAttribute(
      "position",
      new T.Float32BufferAttribute(data.stems, 3),
    );
    geometry.computeBoundingSphere();
    return geometry;
  }, [data]);
  useEffect(() => () => stemGeometry.dispose(), [stemGeometry]);
  useEffect(() => {
    if (trunks.current) {
      data.wood.forEach((m, i) => trunks.current!.setMatrixAt(i, m));
      trunks.current.instanceMatrix.needsUpdate = true;
      trunks.current.computeBoundingSphere();
    }
    for (const [ref, items] of [
      [crowns, data.leaves],
      [flowers, data.blooms],
    ] as const) {
      if (ref.current) {
        items.forEach((d, i) => {
          ref.current!.setMatrixAt(i, d.matrix);
          ref.current!.setColorAt(i, d.color);
        });
        ref.current.instanceMatrix.needsUpdate = true;
        if (ref.current.instanceColor)
          ref.current.instanceColor.needsUpdate = true;
        ref.current.computeBoundingSphere();
      }
    }
    const dummy = new T.Object3D();
    if (nests.current) {
      data.nestSpots.forEach((n, i) => {
        dummy.position.set(n.x, n.y, n.z);
        dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        nests.current!.setMatrixAt(i, dummy.matrix);
      });
      nests.current.instanceMatrix.needsUpdate = true;
      nests.current.computeBoundingSphere();
    }
  }, [data]);
  return (
    <>
      <lineSegments geometry={stemGeometry}>
        <lineBasicMaterial color="#85745a" transparent opacity={0.55} />
      </lineSegments>
      <instancedMesh
        ref={trunks}
        args={[undefined, undefined, data.wood.length]}
        castShadow
      >
        <cylinderGeometry args={[0.72, 1, 1, 6, 1, true]} />
        <meshStandardMaterial color="#79654f" roughness={1} />
      </instancedMesh>
      <instancedMesh
        ref={crowns}
        args={[undefined, undefined, data.leaves.length]}
        castShadow
        receiveShadow
      >
        <primitive object={leafGeometry} attach="geometry" />
        <primitive object={leafMaterial} attach="material" />
      </instancedMesh>
      <instancedMesh
        ref={flowers}
        args={[undefined, undefined, data.blooms.length]}
      >
        <primitive object={flowerGeometry} attach="geometry" />
        <primitive object={flowerMaterial} attach="material" />
      </instancedMesh>
      <instancedMesh
        ref={nests}
        args={[undefined, undefined, data.nestSpots.length]}
        castShadow
      >
        <torusGeometry args={[0.42, 0.17, 5, 9]} />
        <primitive object={nestMaterial} attach="material" />
      </instancedMesh>
      {data.nestSpots
        .filter((n) => n.bird)
        .map((n, i) => (
          <Bird key={i} x={n.x} y={n.y} z={n.z} tone={n.tone} />
        ))}
      {entities
        .filter((e) => e.kind === "bench")
        .map((e) => (
          <Bench key={e.id} x={e.x} z={e.z} height={height} />
        ))}
    </>
  );
}
export function Box({
  position,
  scale,
  color,
  emissive = false,
}: {
  position: [number, number, number];
  scale: [number, number, number];
  color: string;
  emissive?: boolean;
}) {
  return (
    <mesh position={position} scale={scale} castShadow receiveShadow>
      <boxGeometry />
      <meshStandardMaterial
        color={color}
        roughness={0.8}
        emissive={emissive ? color : "#000000"}
        emissiveIntensity={emissive ? 0.7 : 0}
      />
    </mesh>
  );
}
function Bench({
  x,
  z,
  height,
}: {
  x: number;
  z: number;
  height: (x: number, z: number) => number;
}) {
  return (
    <group position={[x, height(x, z), z]}>
      <Box position={[0, 1.4, 0]} scale={[4, 0.35, 1.4]} color="#9e7654" />
      <Box position={[0, 2.4, -0.65]} scale={[4, 1, 0.25]} color="#b48c63" />
      {[-1.4, 1.4].map((a) => (
        <Box
          key={a}
          position={[a, 0.7, 0]}
          scale={[0.3, 1.4, 1]}
          color="#59675b"
        />
      ))}
    </group>
  );
}
