import { useEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry, Color } from "three";
import {
  terrainGeometry,
  type PhysicsTerrainTile,
  type Vector3,
} from "@island/contracts";

/** Exactly the same samples and diagonals as the authority's fixed terrain collider. */
export function PhysicsTerrain({
  tile,
  placeAt,
  vertexColor,
}: {
  tile: PhysicsTerrainTile;
  placeAt?: (position: Vector3, normal?: Vector3) => void;
  vertexColor?: (x: number, z: number, height: number) => string;
}) {
  const geometry = useMemo(() => {
    const data = terrainGeometry(tile),
      result = new BufferGeometry();
    result.setAttribute("position", new BufferAttribute(data.positions, 3));
    result.setIndex(new BufferAttribute(data.indices, 1));
    if (vertexColor) {
      const colors = new Float32Array(data.positions.length),
        color = new Color();
      for (let i = 0; i < data.positions.length; i += 3) {
        color.set(
          vertexColor(
            tile.origin.x + data.positions[i]!,
            tile.origin.z + data.positions[i + 2]!,
            tile.origin.y + data.positions[i + 1]!,
          ),
        );
        colors.set([color.r, color.g, color.b], i);
      }
      result.setAttribute("color", new BufferAttribute(colors, 3));
    }
    result.computeVertexNormals();
    return result;
  }, [tile, vertexColor]);
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
      <meshStandardMaterial
        color={vertexColor ? "#ffffff" : tile.color}
        vertexColors={!!vertexColor}
        roughness={1}
      />
    </mesh>
  );
}
