import {
  dinosaurPark,
  dinosaurSigns,
  type DinosaurHabitatId,
} from "@island/world-core";
import { Pterosaur, Raptor, Peacock } from "../scenes/DinosaurAnimals";
import PresenceLabel from "../presence/PresenceLabel";

/** Observation animations only; all terrain, cliffs, nests and signs render through PhysicsPart. */
export default function DinosaurAmbience({
  inspect,
  interactive,
  night,
}: {
  inspect(id: DinosaurHabitatId): void;
  interactive: boolean;
  night: boolean;
}) {
  const pond = dinosaurPark.pond;
  return (
    <>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[pond.x, 0.04, pond.z]}
        scale={[pond.rx, pond.rz, 1]}
      >
        <circleGeometry args={[1, 48]} />
        <meshStandardMaterial
          color={night ? "#315557" : "#65a5a3"}
          transparent
          opacity={0.8}
          roughness={0.3}
          depthWrite={false}
        />
      </mesh>
      {[0, 1].map((i) => (
        <Pterosaur
          key={`p-${i}`}
          index={i}
          interactive={interactive}
          onInspect={inspect}
        />
      ))}
      {[0, 1, 2].map((i) => (
        <Raptor
          key={`r-${i}`}
          index={i}
          interactive={interactive}
          onInspect={inspect}
        />
      ))}
      {[0, 1].map((i) => (
        <Peacock
          key={`b-${i}`}
          index={i}
          interactive={interactive}
          onInspect={inspect}
        />
      ))}
      {dinosaurSigns.map((s) => (
        <PresenceLabel
          key={s.id}
          name={s.title}
          position={[s.x, 4.8, s.z]}
          maxDistance={90}
        />
      ))}
    </>
  );
}
