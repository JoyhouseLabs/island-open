import { useEffect, useMemo } from "react";
import { Vector3 } from "three";
import { ConvexGeometry } from "three/examples/jsm/geometries/ConvexGeometry.js";
import type { ObjectPart } from "@island/contracts";

export function PhysicsPart({
  part,
  selected,
  ghost,
  glow,
}: {
  part: ObjectPart;
  selected: boolean;
  ghost?: string;
  glow?: string;
}) {
  const geometry = useMemo(
    () =>
      part.shape.kind === "convex"
        ? new ConvexGeometry(
            part.shape.vertices.map((v) => new Vector3(v.x, v.y, v.z)),
          )
        : null,
    [part.shape],
  );
  useEffect(() => () => geometry?.dispose(), [geometry]);
  const shape = part.shape;
  return (
    <mesh
      position={[part.position.x, part.position.y, part.position.z]}
      quaternion={[
        part.rotation.x,
        part.rotation.y,
        part.rotation.z,
        part.rotation.w,
      ]}
      raycast={ghost ? () => {} : undefined}
      castShadow={!ghost}
      receiveShadow={!ghost}
    >
      {shape.kind === "box" && (
        <boxGeometry
          args={[
            shape.halfExtents.x * 2,
            shape.halfExtents.y * 2,
            shape.halfExtents.z * 2,
          ]}
        />
      )}
      {shape.kind === "ball" && (
        <sphereGeometry args={[shape.radius, 24, 16]} />
      )}
      {shape.kind === "cylinder" && (
        <cylinderGeometry
          args={[shape.radius, shape.radius, shape.halfHeight * 2, 24]}
        />
      )}
      {shape.kind === "capsule" && (
        <capsuleGeometry args={[shape.radius, shape.halfHeight * 2, 8, 16]} />
      )}
      {geometry && <primitive object={geometry} attach="geometry" />}
      <meshStandardMaterial
        color={ghost ?? part.color}
        roughness={0.75}
        emissive={glow ?? (selected ? "#9a5a13" : "#000000")}
        emissiveIntensity={glow ? 0.8 : 0.3}
        transparent={
          part.sensor ||
          !!ghost ||
          (part.opacity !== undefined && part.opacity < 1)
        }
        opacity={ghost ? 0.25 : (part.opacity ?? (part.sensor ? 0.25 : 1))}
        depthWrite={
          !ghost && (part.opacity === undefined || part.opacity === 1)
        }
      />
    </mesh>
  );
}
