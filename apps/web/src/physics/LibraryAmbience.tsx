import { useLayoutEffect, useRef } from "react";
import { InstancedMesh, Object3D } from "three";
import { libraryTrees } from "@island/world-core";
import PresenceLabel from "../presence/PresenceLabel";

/** Visual leaves only; all solid structures, lamps and tree trunks use the scene's physical parts. */
export default function LibraryAmbience() {
  const crowns = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!crowns.current) return;
    const object = new Object3D();
    libraryTrees.forEach((tree, i) => {
      object.position.set(tree.x, tree.height + 1, tree.z);
      object.scale.set(2.5, 3, 2.5);
      object.updateMatrix();
      crowns.current!.setMatrixAt(i, object.matrix);
    });
    crowns.current.instanceMatrix.needsUpdate = true;
    crowns.current.computeBoundingSphere();
  }, []);
  return (
    <>
      <instancedMesh
        ref={crowns}
        args={[undefined, undefined, libraryTrees.length]}
        castShadow
      >
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial color="#64845e" roughness={1} />
      </instancedMesh>
      <PresenceLabel
        position={[-19, 10, -10]}
        name="林间书亭 · 点击书架读书"
        maxDistance={80}
      />
    </>
  );
}
