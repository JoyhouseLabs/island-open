import { useEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry } from "three";
import {
  terrainGeometry,
  type PhysicsTerrainTile,
  type Vector3,
} from "@island/contracts";

/** Exactly the same samples and diagonals as the authority's fixed terrain collider. */
export function PhysicsTerrain({
  tile,
  placeAt,
}: {
  tile: PhysicsTerrainTile;
  placeAt?: (position: Vector3, normal?: Vector3) => void;
}) {
  const geometry = useMemo(() => {
    const data = terrainGeometry(tile),
      result = new BufferGeometry();
    result.setAttribute("position", new BufferAttribute(data.positions, 3));
    result.setIndex(new BufferAttribute(data.indices, 1));
    result.computeVertexNormals();
    return result;
  }, [tile]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh
      geometry={geometry}
      position={[tile.origin.x, tile.origin.y, tile.origin.z]}
      receiveShadow
      onClick={(event) => {
        event.stopPropagation();
        placeAt?.(
          event.point,
          event.face?.normal
            .clone()
            .transformDirection(event.object.matrixWorld),
        );
      }}
    >
      <meshStandardMaterial color={tile.color} roughness={1} />
    </mesh>
  );
}
