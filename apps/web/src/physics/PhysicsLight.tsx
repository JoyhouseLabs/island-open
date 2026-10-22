import type {
  ObjectPart,
  PhysicsLight as LightConfig,
} from "@island/contracts";

/** Sits inside the object's transform so saved rotation, movement and interpolation also move its light. */
export function PhysicsLight({
  parts,
  light,
}: {
  parts: ObjectPart[];
  light?: LightConfig;
}) {
  const emitter =
    light && parts.find((part) => part.id === light.partId && !part.sensor);
  if (!light || !emitter) return null;
  return (
    <pointLight
      name="island-object-light"
      position={[emitter.position.x, emitter.position.y, emitter.position.z]}
      color={light.color}
      intensity={light.intensity}
      distance={light.distance}
      decay={2}
      castShadow={false}
    />
  );
}
