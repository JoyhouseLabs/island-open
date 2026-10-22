import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Group, Quaternion, Vector3 } from "three";
import type {
  ObjectDefinition,
  ObjectInstance,
  PhysicsFrame,
  BodyState,
  Vector3 as Position,
} from "@island/contracts";
import { previewError, type PhysicsDraft } from "./PhysicsEditor";
import { PhysicsLight } from "./PhysicsLight";
import { PhysicsPart } from "./PhysicsPart";
import type { PhysicsConnection } from "./PhysicsConnection";

const indices = new WeakMap<PhysicsFrame, Map<string, BodyState>>();
function bodyIndex(frame: PhysicsFrame) {
  let index = indices.get(frame);
  if (!index) {
    index = new Map(frame.bodies.map((body) => [body.id, body]));
    indices.set(frame, index);
  }
  return index;
}
function Body({
  conn,
  object,
  definition,
  selected,
  select,
  placeAt,
}: {
  conn: PhysicsConnection;
  object: ObjectInstance;
  definition: ObjectDefinition;
  selected: boolean;
  select: (id: string) => void;
  placeAt?: (position: Position, normal?: Position) => void;
}) {
  const mesh = useRef<Group>(null),
    q = useMemo(() => new Quaternion(), []),
    position = useMemo(() => new Vector3(), []);
  useFrame(() => {
    if (!mesh.current) return;
    const sample = conn.buffer.sample(performance.now());
    if (!sample) return;
    const end = bodyIndex(sample.after).get(object.id);
    if (!end) return;
    const start = bodyIndex(sample.before).get(object.id) ?? end;
    mesh.current.position
      .copy(start.position)
      .lerp(
        position.set(end.position.x, end.position.y, end.position.z),
        sample.alpha,
      );
    mesh.current.quaternion
      .set(
        start.rotation.x,
        start.rotation.y,
        start.rotation.z,
        start.rotation.w,
      )
      .slerp(
        q.set(end.rotation.x, end.rotation.y, end.rotation.z, end.rotation.w),
        sample.alpha,
      );
  });
  return (
    <group
      ref={mesh}
      onClick={(event) => {
        event.stopPropagation();
        if (placeAt)
          placeAt(
            event.point,
            event.face?.normal
              .clone()
              .transformDirection(event.object.matrixWorld),
          );
        else select(object.id);
      }}
    >
      <PhysicsLight parts={definition.parts} light={definition.light} />
      {definition.parts.map((part) => (
        <PhysicsPart
          key={part.id}
          part={part}
          selected={selected}
          glow={
            definition.light?.partId === part.id
              ? definition.light.color
              : undefined
          }
        />
      ))}
    </group>
  );
}
function Actor({ conn, id }: { conn: PhysicsConnection; id: string }) {
  const mesh = useRef<Group>(null),
    standing = useRef<Group>(null),
    seated = useRef<Group>(null),
    position = useMemo(() => new Vector3(), []);
  useFrame(() => {
    if (!mesh.current) return;
    const sample = conn.buffer.sample(performance.now());
    const state =
      id === conn.you
        ? conn.me
        : sample?.after.players.find((p) => p.id === id);
    if (!state) return;
    mesh.current.rotation.y = state.yaw;
    if (standing.current) standing.current.visible = !state.seatId;
    if (seated.current) seated.current.visible = !!state.seatId;
    if (id === conn.you && conn.prediction)
      mesh.current.position.copy(conn.prediction.visualPosition);
    else if (sample) {
      const start = sample.before.players.find((p) => p.id === id) ?? state;
      mesh.current.position
        .copy(start.position)
        .lerp(
          position.set(state.position.x, state.position.y, state.position.z),
          sample.alpha,
        );
    }
  });
  const color = id === conn.you ? "#e5a64b" : "#659ac2";
  return (
    <group ref={mesh}>
      <group ref={standing}>
        <mesh castShadow>
          <capsuleGeometry args={[0.3, 1.1, 6, 12]} />
          <meshStandardMaterial color={color} />
        </mesh>
        <mesh position={[0, 0.54, 0]}>
          <sphereGeometry args={[0.31, 16, 12]} />
          <meshStandardMaterial color="#f7dfb1" />
        </mesh>
      </group>
      <group ref={seated} visible={false}>
        <mesh castShadow>
          <capsuleGeometry args={[0.27, 0.5, 6, 12]} />
          <meshStandardMaterial color={color} />
        </mesh>
        <mesh position={[0, 0.35, 0]}>
          <sphereGeometry args={[0.26, 16, 12]} />
          <meshStandardMaterial color="#f7dfb1" />
        </mesh>
        {[-0.16, 0.16].map((x) => (
          <group key={x}>
            <mesh castShadow position={[x, -0.37, 0.2]}>
              <boxGeometry args={[0.2, 0.2, 0.5]} />
              <meshStandardMaterial color={color} />
            </mesh>
            <mesh castShadow position={[x, -0.62, 0.4]}>
              <boxGeometry args={[0.18, 0.45, 0.2]} />
              <meshStandardMaterial color="#70563d" />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}
function Contents({
  conn,
  keys,
  selected,
  select,
  draft,
  placeAt,
  night,
}: {
  night: boolean;
  conn: PhysicsConnection;
  keys: Set<string>;
  selected: string | null;
  select: (id: string) => void;
  draft: PhysicsDraft | null;
  placeAt: (position: Position, normal?: Position) => void;
}) {
  const { camera, controls } = useThree();
  const forward = useMemo(() => new Vector3(), []),
    right = useMemo(() => new Vector3(), []),
    direction = useMemo(() => new Vector3(), []);
  const facing = useRef(0),
    previous = useRef<Vector3 | null>(null);
  const scene = conn.scene!;
  const target = useMemo(
    () => new Vector3(scene.spawn.x, scene.spawn.y, scene.spawn.z - 2.5),
    [scene],
  );
  const definitions = useMemo(
    () => new Map(scene.definitions.map((d) => [`${d.id}@${d.version}`, d])),
    [scene],
  );
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const target = event.target as HTMLElement;
      if (
        target?.closest(
          "input,textarea,select,dialog,[contenteditable=true]",
        ) ||
        (key === " " && target?.closest("button,a")) ||
        conn.status !== "connected" ||
        conn.editing
      )
        return;
      if (
        [
          "w",
          "a",
          "s",
          "d",
          "arrowup",
          "arrowdown",
          "arrowleft",
          "arrowright",
          " ",
          "e",
          "q",
          "f",
        ].includes(key)
      )
        event.preventDefault();
      if (key === "f" && !event.repeat)
        conn.action(conn.me?.seatId ? "stand" : "sit", selected);
      else if (key === "e" && !event.repeat) {
        const object = conn.scene?.objects.find((o) => o.id === selected);
        const definition =
          object &&
          conn.scene?.definitions.find(
            (d) =>
              d.id === object.definitionId &&
              d.version === object.definitionVersion,
          );
        conn.action(
          conn.me?.held
            ? "drop"
            : conn.me?.seatId
              ? "stand"
              : definition?.seat
                ? "sit"
                : "grab",
          selected,
        );
      } else if (key === "q" && !event.repeat) conn.action("toss", null);
      else {
        if (
          [
            "w",
            "a",
            "s",
            "d",
            "arrowup",
            "arrowdown",
            "arrowleft",
            "arrowright",
          ].includes(key) &&
          !keys.has(key)
        )
          conn.markMovement();
        keys.add(key);
      }
    };
    const up = (event: KeyboardEvent) => keys.delete(event.key.toLowerCase());
    const clear = () => {
      keys.clear();
      conn.prediction?.pause();
    };
    const visibility = () => {
      clear();
      if (!document.hidden) conn.sync();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clear();
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [conn, keys, selected]);
  useFrame((_, delta) => {
    if (!conn.prediction || conn.status !== "connected" || document.hidden)
      return;
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    right.set(-forward.z, 0, forward.x);
    const x =
      Number(keys.has("d") || keys.has("arrowright")) -
      Number(keys.has("a") || keys.has("arrowleft"));
    const z =
      Number(keys.has("w") || keys.has("arrowup")) -
      Number(keys.has("s") || keys.has("arrowdown"));
    direction.copy(forward).multiplyScalar(z).addScaledVector(right, x);
    if (direction.lengthSq() > 1) direction.normalize();
    if (direction.lengthSq() > 0.01)
      facing.current = Math.atan2(direction.x, direction.z);
    const before = conn.prediction.player.position();
    conn.prediction.advance(
      delta,
      {
        x: conn.editing ? 0 : direction.x,
        z: conn.editing ? 0 : direction.z,
        jump: !conn.editing && keys.has(" "),
        yaw: facing.current,
        layoutRevision: conn.buffer.latest!.layoutRevision,
      },
      (command) => conn.input(command),
    );
    const physical = conn.prediction.player.position();
    conn.prediction.updateVisual(delta);
    const position = conn.prediction.visualPosition;
    if (Math.hypot(physical.x - before.x, physical.z - before.z) > 0.001)
      conn.moved();
    if (previous.current && controls) {
      const orbit = controls as unknown as {
        target: Vector3;
        update: () => void;
      };
      direction.set(position.x, position.y, position.z).sub(previous.current);
      camera.position.add(direction);
      orbit.target.add(direction);
      orbit.update();
    }
    (previous.current ??= new Vector3()).copy(position);
  }, -100);
  const held = scene.objects.find((object) => object.id === conn.me?.held),
    preview = conn.me?.dropPreview;
  const heldDefinition = held
    ? definitions.get(`${held.definitionId}@${held.definitionVersion}`)
    : null;
  const invalidDraft = previewError(conn, draft);
  return (
    <>
      <color attach="background" args={[night ? "#101c31" : "#e5eee5"]} />
      <ambientLight intensity={night ? 0.15 : 1.4} />
      <directionalLight
        position={[6, 12, 6]}
        intensity={night ? 0.15 : 2}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
      />
      {scene.objects.map((object) => (
        <Body
          key={object.id}
          conn={conn}
          object={object}
          definition={definitions.get(
            `${object.definitionId}@${object.definitionVersion}`,
          )!}
          selected={object.id === selected}
          select={select}
          placeAt={draft ? placeAt : undefined}
        />
      ))}
      {conn.buffer.latest?.players.map((player) => (
        <Actor key={player.id} conn={conn} id={player.id} />
      ))}
      {heldDefinition && preview && (
        <group
          position={[
            preview.position.x,
            preview.position.y,
            preview.position.z,
          ]}
          quaternion={[
            preview.rotation.x,
            preview.rotation.y,
            preview.rotation.z,
            preview.rotation.w,
          ]}
        >
          {heldDefinition.parts.map((part) => (
            <PhysicsPart
              key={part.id}
              part={part}
              selected={false}
              ghost={preview.valid ? "#42bb78" : "#e16e63"}
            />
          ))}
        </group>
      )}
      {draft && (
        <group
          position={[
            draft.object.position.x,
            draft.object.position.y,
            draft.object.position.z,
          ]}
          quaternion={[
            draft.object.rotation.x,
            draft.object.rotation.y,
            draft.object.rotation.z,
            draft.object.rotation.w,
          ]}
        >
          {draft.definition.parts.map((part) => (
            <PhysicsPart
              key={part.id}
              part={part}
              selected={false}
              ghost={invalidDraft ? "#e16e63" : "#42bb78"}
            />
          ))}
        </group>
      )}
      <OrbitControls
        makeDefault
        target={target}
        minDistance={5}
        maxDistance={35}
        maxPolarAngle={Math.PI * 0.48}
      />
    </>
  );
}
export default function OnlineScene(props: {
  night: boolean;
  conn: PhysicsConnection;
  keys: Set<string>;
  selected: string | null;
  select: (id: string) => void;
  draft: PhysicsDraft | null;
  placeAt: (position: Position, normal?: Position) => void;
}) {
  const scene = props.conn.scene!;
  return (
    <Canvas
      key={props.conn.you}
      shadows
      dpr={[1, 1.5]}
      camera={{
        position: [
          scene.spawn.x + 14,
          scene.spawn.y + 11,
          scene.spawn.z + 14.5,
        ],
        fov: 45,
      }}
    >
      <Contents {...props} />
    </Canvas>
  );
}
