import {
  constructionSchema,
  deviceSchema,
  type WorldSnapshot,
} from "@island/contracts";
/** Unknown records remain in the original snapshot; these meshes are read-only markers. */
export default function UnknownBuilding({ raw }: { raw?: WorldSnapshot }) {
  if (!raw) return null;
  return (
    <group>
      {raw.construction &&
        !constructionSchema.safeParse(raw.construction).success && (
          <mesh position={[21, 8, -13]}>
            <boxGeometry args={[18, 16, 18]} />
            <meshBasicMaterial
              color="#9279a8"
              wireframe
              transparent
              opacity={0.4}
            />
          </mesh>
        )}
      {(raw.devices ?? [])
        .filter((d) => !deviceSchema.safeParse(d).success)
        .slice(0, 64)
        .map((d, i) => {
          const p = d.placement;
          if (p?.state !== "placed" || ![p.x, p.y, p.z].every(Number.isFinite))
            return null;
          return (
            <mesh key={i} position={[p.x, p.y + 1, p.z]}>
              <boxGeometry args={[1, 2, 1]} />
              <meshBasicMaterial color="#9279a8" wireframe />
            </mesh>
          );
        })}
    </group>
  );
}
