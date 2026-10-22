import { useLayoutEffect, useMemo, useRef } from "react";
import PresenceLabel from "../presence/PresenceLabel";
import { InstancedMesh, Object3D } from "three";
import type { PhysicsScene } from "@island/contracts";
import {
  islandSurface,
  islandTrees,
  landmarks,
  pond,
} from "@island/world-core";

/** Only non-solid scenery. Trunks, terrain and structures are rendered from physical definitions. */
export default function IslandAmbience({
  scene,
  night,
}: {
  scene: PhysicsScene;
  night: boolean;
}) {
  const trees = useMemo(islandTrees, []),
    crowns = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!crowns.current) return;
    const matrix = new Object3D();
    trees.forEach((tree, i) => {
      const base = islandSurface(scene.terrain, tree.x, tree.z);
      matrix.position.set(tree.x, base + tree.height + 1.2, tree.z);
      matrix.scale.set(2.6, 3.5, 2.6);
      matrix.updateMatrix();
      crowns.current!.setMatrixAt(i, matrix.matrix);
    });
    crowns.current.instanceMatrix.needsUpdate = true;
    crowns.current.computeBoundingSphere();
  }, [scene.terrain, trees]);
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}>
        <planeGeometry args={[1600, 1600]} />
        <meshStandardMaterial
          color={night ? "#1e4354" : "#7faeae"}
          roughness={0.4}
        />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[pond.x, pond.level, pond.z]}
        scale={[pond.rx, pond.rz, 1]}
      >
        <circleGeometry args={[1, 64]} />
        <meshStandardMaterial
          color={night ? "#315962" : "#82b2a8"}
          transparent
          opacity={0.72}
          roughness={0.25}
        />
      </mesh>
      <instancedMesh
        ref={crowns}
        args={[undefined, undefined, trees.length]}
        castShadow
      >
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial color="#527e51" roughness={1} />
      </instancedMesh>
      {landmarks.map((mark) => (
        <PresenceLabel
          key={mark.id}
          position={[
            mark.x,
            islandSurface(scene.terrain, mark.x, mark.z) + 14,
            mark.z,
          ]}
          name={mark.name}
          maxDistance={100}
        />
      ))}
    </>
  );
}
