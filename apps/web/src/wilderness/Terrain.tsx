import { useLayoutEffect, useMemo, useRef } from "react";
import * as T from "three";
import {
  CAMP,
  CHUNK_SIZE,
  TERRAIN_STEP,
  wildBiome,
  wildHeight,
  wildVertexHeight,
  type WildChunk,
  type WildProp,
} from "@island/world-core";
function Props({
  items,
  seed,
  chunk,
  kind,
}: {
  items: WildProp[];
  seed: number;
  chunk: WildChunk;
  kind: "tree" | "rock";
}) {
  const trunks = useRef<T.InstancedMesh>(null),
    crowns = useRef<T.InstancedMesh>(null);
  useLayoutEffect(() => {
    const matrix = new T.Object3D();
    items.forEach((p, i) => {
      matrix.position.set(
        p.x - chunk.x * CHUNK_SIZE,
        wildHeight(seed, p.x, p.z) + (kind === "tree" ? 1.8 : 0.6) * p.scale,
        p.z - chunk.z * CHUNK_SIZE,
      );
      matrix.scale.setScalar(p.scale);
      matrix.updateMatrix();
      trunks.current?.setMatrixAt(i, matrix.matrix);
      matrix.position.y += 2.5 * p.scale;
      matrix.updateMatrix();
      crowns.current?.setMatrixAt(i, matrix.matrix);
    });
    for (const mesh of [trunks.current, crowns.current])
      if (mesh) {
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
      }
  }, [items, seed, chunk, kind]);
  if (!items.length) return null;
  return (
    <>
      <instancedMesh ref={trunks} args={[undefined, undefined, items.length]}>
        {kind === "tree" ? (
          <cylinderGeometry args={[0.22, 0.4, 3.6, 5]} />
        ) : (
          <dodecahedronGeometry args={[1.3, 0]} />
        )}
        <meshStandardMaterial
          color={kind === "tree" ? "#78604b" : "#929989"}
          roughness={1}
        />
      </instancedMesh>
      {kind === "tree" && (
        <instancedMesh ref={crowns} args={[undefined, undefined, items.length]}>
          <coneGeometry args={[2.3, 6, 7]} />
          <meshStandardMaterial color="#48785a" roughness={1} />
        </instancedMesh>
      )}
    </>
  );
}
export default function Terrain({
  seed,
  chunk,
  originX,
  originZ,
  detail,
}: {
  seed: number;
  chunk: WildChunk;
  originX: number;
  originZ: number;
  detail: boolean;
}) {
  const data = useMemo(() => {
    const positions: number[] = [],
      normals: number[] = [],
      colors: number[] = [],
      indices: number[] = [];
    const count = CHUNK_SIZE / TERRAIN_STEP,
      color = new T.Color(),
      normal = new T.Vector3();
    for (let j = 0; j <= count; j++)
      for (let i = 0; i <= count; i++) {
        const x = chunk.x * CHUNK_SIZE + i * TERRAIN_STEP,
          z = chunk.z * CHUNK_SIZE + j * TERRAIN_STEP;
        positions.push(
          i * TERRAIN_STEP,
          wildVertexHeight(seed, x, z),
          j * TERRAIN_STEP,
        );
        // Global derivatives give matching border lighting as well as matching vertices.
        normal
          .set(
            wildVertexHeight(seed, x - 1, z) - wildVertexHeight(seed, x + 1, z),
            2,
            wildVertexHeight(seed, x, z - 1) - wildVertexHeight(seed, x, z + 1),
          )
          .normalize();
        normals.push(...normal.toArray());
        const biome = wildBiome(seed, x, z);
        color.set(
          Math.abs(x - CAMP.x) < 5 || Math.hypot(x - CAMP.x, z - CAMP.z) < 14
            ? "#bdb68b"
            : biome === "forest"
              ? "#77956b"
              : biome === "rock"
                ? "#9a9e84"
                : "#a4b77b",
        );
        colors.push(color.r, color.g, color.b);
        if (i < count && j < count) {
          const a = j * (count + 1) + i,
            b = a + 1,
            c = a + count + 1,
            d = c + 1;
          indices.push(a, c, b, b, c, d);
        }
      }
    return {
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      colors: new Float32Array(colors),
      indices: new Uint16Array(indices),
    };
  }, [seed, chunk]);
  const trees = useMemo(
      () => chunk.props.filter((p) => p.kind === "tree"),
      [chunk],
    ),
    rocks = useMemo(
      () => chunk.props.filter((p) => p.kind === "rock"),
      [chunk],
    );
  return (
    <group
      position={[
        (chunk.x - originX) * CHUNK_SIZE,
        0,
        (chunk.z - originZ) * CHUNK_SIZE,
      ]}
    >
      <mesh>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[data.positions, 3]}
          />
          <bufferAttribute
            attach="attributes-normal"
            args={[data.normals, 3]}
          />
          <bufferAttribute attach="attributes-color" args={[data.colors, 3]} />
          <bufferAttribute attach="index" args={[data.indices, 1]} />
        </bufferGeometry>
        <meshStandardMaterial vertexColors roughness={1} />
      </mesh>
      {detail && (
        <>
          <Props items={trees} seed={seed} chunk={chunk} kind="tree" />
          <Props items={rocks} seed={seed} chunk={chunk} kind="rock" />
        </>
      )}
    </group>
  );
}
