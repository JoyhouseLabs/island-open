import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import { dinosaurHabitats } from "@island/world-core";
import type { DinosaurFocus } from "./DinosaurGuide";

/** Observation moves only the camera. Closing restores the exact previous orbit. */
export default function DinosaurCamera({
  focus,
}: {
  focus: DinosaurFocus | null;
}) {
  const { camera, controls } = useThree();
  const saved = useRef<{ position: Vector3; target: Vector3 } | null>(null);
  useEffect(() => {
    const orbit = controls as unknown as {
      target: Vector3;
      update(): void;
    } | null;
    if (!orbit) return;
    if (!focus) {
      if (saved.current) {
        camera.position.copy(saved.current.position);
        orbit.target.copy(saved.current.target);
        orbit.update();
        saved.current = null;
      }
      return;
    }
    saved.current ??= {
      position: camera.position.clone(),
      target: orbit.target.clone(),
    };
    const habitat = dinosaurHabitats.find((h) => h.id === focus);
    const target = new Vector3(
      focus === "peacock" ? 19 : (habitat?.x ?? 0),
      focus === "pterosaur" ? 26 : 2,
      habitat?.z ?? 0,
    );
    camera.position
      .copy(target)
      .add(habitat ? new Vector3(32, 24, 38) : new Vector3(145, 135, 170));
    orbit.target.copy(target);
    orbit.update();
  }, [camera, controls, focus]);
  return null;
}
