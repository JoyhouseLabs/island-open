import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Group } from "three";
import type { PhysicsForageSpot } from "@island/contracts";
import ForageMesh from "../collect/ForageMesh";
function Find({ spot, inspect }: { spot: PhysicsForageSpot; inspect(): void }) {
  const group = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (group.current) {
      group.current.rotation.y = clock.elapsedTime * 0.8;
      group.current.position.y =
        spot.position.y + Math.sin(clock.elapsedTime * 2) * 0.04;
    }
  });
  return (
    <group
      ref={group}
      position={[spot.position.x, spot.position.y, spot.position.z]}
      onClick={(e) => {
        e.stopPropagation();
        if (e.delta < 5) inspect();
      }}
    >
      <ForageMesh kind={spot.kind} />
    </group>
  );
}
export default function PhysicsForage({
  spots,
  inspect,
}: {
  spots: PhysicsForageSpot[];
  inspect(kind: string): void;
}) {
  return (
    <>
      {spots.map((spot) => (
        <Find key={spot.id} spot={spot} inspect={() => inspect(spot.kind)} />
      ))}
    </>
  );
}
