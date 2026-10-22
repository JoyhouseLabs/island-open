import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Group, Vector3 } from "three";
import {
  PhysicsRuntime,
  PhysicsCharacter,
  PhysicsGrab,
} from "@island/physics-core";

export interface PlaygroundInput {
  keys: Set<string>;
  selected: string | null;
  grabRequested: boolean;
  held: string | null;
  message: string;
  position: { x: number; y: number; z: number } | null;
}
export function PlaygroundPlayer({
  runtime,
  input,
  beforeStep,
}: {
  runtime: PhysicsRuntime;
  input: PlaygroundInput;
  beforeStep: MutableRefObject<((dt: number) => void) | undefined>;
}) {
  const actor = useRef<PhysicsCharacter | null>(null),
    mesh = useRef<Group>(null);
  const { camera } = useThree();
  const forward = useMemo(() => new Vector3(), []),
    right = useMemo(() => new Vector3(), []),
    direction = useMemo(() => new Vector3(), []);
  const facing = useRef({ x: 0, y: 0, z: -1 });
  useEffect(() => {
    const player = runtime.createCharacter("local-player");
    actor.current = player;
    const grab = new PhysicsGrab(runtime.world, player);
    beforeStep.current = (dt) => {
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      right.set(-forward.z, 0, forward.x);
      const keys = input.keys;
      const x =
        Number(keys.has("d") || keys.has("arrowright")) -
        Number(keys.has("a") || keys.has("arrowleft"));
      const z =
        Number(keys.has("w") || keys.has("arrowup")) -
        Number(keys.has("s") || keys.has("arrowdown"));
      direction.copy(forward).multiplyScalar(z).addScaledVector(right, x);
      if (direction.lengthSq() > 1) direction.normalize();
      if (direction.lengthSq() > 0.01)
        facing.current = { x: direction.x, y: 0, z: direction.z };
      player.step({ x: direction.x, z: direction.z, jump: keys.has(" ") }, dt);
      if (input.grabRequested) {
        input.grabRequested = false;
        input.message = "";
        if (grab.body) {
          grab.release();
          input.held = null;
        } else {
          const object = runtime.scene.objects.find(
            (o) => o.id === input.selected,
          );
          const definition = runtime.scene.definitions.find(
            (d) =>
              d.id === object?.definitionId &&
              d.version === object.definitionVersion,
          );
          try {
            if (!object || !definition?.abilities.includes("grabbable"))
              throw new Error("先点选一个可以搬动的物品");
            grab.take(runtime.bodies.get(object.id)!);
            input.held = object.id;
          } catch (error) {
            input.message =
              error instanceof Error ? error.message : "暂时不能拿起";
          }
        }
      }
      grab.step(facing.current, dt);
      if (!grab.body) input.held = null;
      if (player.position().y < -5) {
        grab.release();
        input.held = null;
        player.teleport(runtime.scene.spawn);
        input.message = "已回到安全的位置";
      }
    };
    const keydown = (event: KeyboardEvent) => {
      if (
        (event.target as HTMLElement)?.closest("input,textarea,select,button,a")
      )
        return;
      const key = event.key.toLowerCase();
      if (
        [
          "w",
          "a",
          "s",
          "d",
          " ",
          "arrowup",
          "arrowdown",
          "arrowleft",
          "arrowright",
          "e",
        ].includes(key)
      )
        event.preventDefault();
      if (key === "e" && !event.repeat) input.grabRequested = true;
      else input.keys.add(key);
    };
    const keyup = (event: KeyboardEvent) =>
      input.keys.delete(event.key.toLowerCase());
    const clear = () => {
      input.keys.clear();
      input.grabRequested = false;
    };
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", clear);
    return () => {
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", clear);
      clear();
      grab.release();
      beforeStep.current = undefined;
      actor.current = null;
      input.position = null;
      input.held = null;
      runtime.removeCharacter("local-player");
    };
  }, [runtime, input, beforeStep, camera, forward, right, direction]);
  useFrame(() => {
    if (!mesh.current || !actor.current) return;
    const position = actor.current.position();
    input.position = position;
    mesh.current.position.copy(position);
    mesh.current.rotation.y = Math.atan2(facing.current.x, facing.current.z);
  });
  return (
    <group ref={mesh}>
      <mesh castShadow>
        <capsuleGeometry args={[0.3, 1.1, 6, 12]} />
        <meshStandardMaterial color="#e5a64b" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.54, 0]} castShadow>
        <sphereGeometry args={[0.31, 16, 12]} />
        <meshStandardMaterial color="#f7dfb1" />
      </mesh>
      {[-0.1, 0.1].map((x) => (
        <mesh key={x} position={[x, 0.57, 0.28]}>
          <sphereGeometry args={[0.035, 8, 8]} />
          <meshStandardMaterial color="#3a342f" />
        </mesh>
      ))}
      <mesh position={[0, 0.24, 0]}>
        <torusGeometry args={[0.29, 0.05, 6, 16]} />
        <meshStandardMaterial color="#73917c" />
      </mesh>
    </group>
  );
}
