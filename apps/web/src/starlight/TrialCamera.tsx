import { useLayoutEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as T from "three";
import { trialFraming } from "./trialFraming";

/** A local camera treatment; it never moves an avatar or another visitor. */
export default function TrialCamera({
  focused,
  motion,
  onBusy,
}: {
  focused: boolean;
  motion: boolean;
  onBusy: (busy: boolean) => void;
}) {
  const { camera, size, controls } = useThree();
  const orbit = controls as unknown as {
    target: T.Vector3;
    enabled: boolean;
  } | null;
  const saved = useRef<{
    position: T.Vector3;
    quaternion: T.Quaternion;
    target: T.Vector3 | null;
  } | null>(null);
  const age = useRef(0);
  const from = useRef(new T.Vector3()),
    fromQ = useRef(new T.Quaternion());
  const destination = useRef(new T.Vector3()),
    desiredQ = useRef(new T.Quaternion());
  const transition = useRef(false);
  useLayoutEffect(() => {
    if (focused) {
      if (!saved.current)
        saved.current = {
          position: camera.position.clone(),
          quaternion: camera.quaternion.clone(),
          target: orbit?.target.clone() ?? null,
        };
      const pose = trialFraming(size.width, size.height);
      destination.current.set(...pose.position);
      const helper = camera.clone();
      helper.position.copy(destination.current);
      helper.lookAt(...pose.target);
      desiredQ.current.copy(helper.quaternion);
    } else if (saved.current) {
      destination.current.copy(saved.current.position);
      desiredQ.current.copy(saved.current.quaternion);
    } else return;
    from.current.copy(camera.position);
    fromQ.current.copy(camera.quaternion);
    age.current = 0;
    transition.current = true;
    onBusy(true);
    if (orbit) orbit.enabled = false;
  }, [focused, size.width, size.height, camera, orbit, onBusy]);
  useFrame((_, dt) => {
    if (!transition.current && !focused) return;
    if (orbit) orbit.enabled = false;
    age.current += Math.min(dt, 0.05);
    const t = motion ? Math.min(1, age.current / 0.85) : 1;
    const eased = t * t * (3 - 2 * t);
    camera.position.lerpVectors(from.current, destination.current, eased);
    camera.quaternion.slerpQuaternions(fromQ.current, desiredQ.current, eased);
    if (t === 1 && transition.current) {
      transition.current = false;
      if (!focused) {
        if (orbit && saved.current?.target)
          orbit.target.copy(saved.current.target);
        saved.current = null;
        onBusy(false);
      }
    }
  });
  useLayoutEffect(
    () => () => {
      if (saved.current) {
        camera.position.copy(saved.current.position);
        camera.quaternion.copy(saved.current.quaternion);
        if (orbit && saved.current.target)
          orbit.target.copy(saved.current.target);
      }
    },
    [camera, orbit],
  );
  return null;
}
