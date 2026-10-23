import PhysicsForage from "./PhysicsForage";
import PhysicsResidents from "./PhysicsResidents";
import PhysicsFox from "./PhysicsFox";
import { WeatherFx } from "../scenes/weather-fx";
import type { PhysicsForageSpot, Weather } from "@island/contracts";
import type { Resident } from "@island/world-core";
import PhysicsAvatar from "./PhysicsAvatar";
import ThemeAmbience from "./ThemeAmbience";
import GardenAmbience from "./GardenAmbience";
import {
  islandGroundColor,
  gardenGroundColor,
  nurseryGroundColor,
  physicalThemeSpecs,
  themeGroundColor,
} from "@island/world-core";
import LibraryAmbience from "./LibraryAmbience";
import IslandAmbience from "./IslandAmbience";
import { lazy, Suspense, useEffect, useMemo, useRef } from "react";
import type { DinosaurHabitatId } from "@island/world-core";
import type { DinosaurFocus } from "./DinosaurGuide";
import DinosaurCamera from "./DinosaurCamera";
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
import { sceneDefinition } from "@island/physics-core";
import { PhysicsTerrain } from "./PhysicsTerrain";
import { PhysicsLight } from "./PhysicsLight";
import { PhysicsPart } from "./PhysicsPart";
import type { PhysicsConnection } from "./PhysicsConnection";

const indices = new WeakMap<PhysicsFrame, Map<string, BodyState>>();
const DinosaurAmbience = lazy(() => import("./DinosaurAmbience"));
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
    if (!mesh.current || definition.bodyType === "fixed") return;
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
  const behavior = conn.buffer.latest?.behaviors?.find(
    (s) => s.id === object.id,
  );
  return (
    <group
      ref={mesh}
      position={[object.position.x, object.position.y, object.position.z]}
      quaternion={[
        object.rotation.x,
        object.rotation.y,
        object.rotation.z,
        object.rotation.w,
      ]}
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
      <PhysicsLight
        parts={definition.parts}
        light={definition.light}
        enabled={behavior?.active ?? true}
      />
      {definition.parts.map((part) => (
        <PhysicsPart
          key={part.id}
          part={part}
          selected={selected}
          glow={
            definition.light?.partId === part.id && (behavior?.active ?? true)
              ? definition.light.color
              : definition.behavior && behavior?.active
                ? "#58c68e"
                : undefined
          }
        />
      ))}
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
  paused,
  dinosaurFocus,
  inspectDinosaur,
  forageSpots,
  inspectForage,
  talkResident,
  residentNear,
  talkFox,
  talkPlayer,
  weather,
  wolfOwned,
}: {
  forageSpots: PhysicsForageSpot[];
  inspectForage(kind: string): void;
  dinosaurFocus: DinosaurFocus | null;
  inspectDinosaur(id: DinosaurHabitatId): void;
  night: boolean;
  paused: boolean;
  conn: PhysicsConnection;
  keys: Set<string>;
  selected: string | null;
  select: (id: string) => void;
  draft: PhysicsDraft | null;
  placeAt: (position: Position, normal?: Position) => void;
  talkResident(resident: Resident): void;
  residentNear(resident: Resident | null): void;
  talkFox(): void;
  talkPlayer(id: string, name: string): void;
  weather: Weather;
  wolfOwned: boolean;
}) {
  const { camera, controls } = useThree();
  const forward = useMemo(() => new Vector3(), []),
    right = useMemo(() => new Vector3(), []),
    direction = useMemo(() => new Vector3(), []);
  const facing = useRef(0),
    previous = useRef<Vector3 | null>(null);
  const scene = conn.scene!;
  const groundColor = useMemo(() => {
    if (scene.template.id === "core:island") return islandGroundColor;
    if (scene.template.id === "core:garden") return gardenGroundColor;
    if (scene.template.id === "core:nursery") return nurseryGroundColor;
    const theme = physicalThemeSpecs.find(
      (s) => `core:${s.key}` === scene.template.id,
    );
    return theme
      ? (x: number, z: number) => themeGroundColor(theme.key, x, z)
      : undefined;
  }, [scene.template.id]);
  const environment = sceneDefinition(scene.template).environment;
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
        conn.editing ||
        paused
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
              : definition?.behavior?.kind === "switch"
                ? "toggle"
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
  }, [conn, keys, selected, paused]);
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
        x: conn.editing || paused ? 0 : direction.x,
        z: conn.editing || paused ? 0 : direction.z,
        jump: !conn.editing && !paused && keys.has(" "),
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
      <color attach="background" args={[night ? "#101c31" : environment.sky]} />
      <ambientLight intensity={night ? 0.15 : environment.ambient} />
      <directionalLight
        position={[6, 12, 6]}
        intensity={night ? 0.15 : environment.sun}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
      />
      {scene.template.id === "core:island" && (
        <IslandAmbience scene={scene} night={night} />
      )}
      {scene.template.id === "core:library" && <LibraryAmbience />}
      {["core:garden", "core:nursery"].includes(scene.template.id) && (
        <GardenAmbience
          nursery={scene.template.id === "core:nursery"}
          night={night}
        />
      )}
      <ThemeAmbience template={scene.template.id} night={night} />
      {scene.template.id === "core:dinosaur" && (
        <>
          <DinosaurCamera focus={dinosaurFocus} />
          <Suspense fallback={null}>
            <DinosaurAmbience
              inspect={inspectDinosaur}
              interactive={!paused && !conn.editing}
              night={night}
            />
          </Suspense>
        </>
      )}
      {!conn.editing && (
        <PhysicsForage spots={forageSpots} inspect={inspectForage} />
      )}
      <WeatherFx
        weather={weather}
        low={false}
        span={scene.template.id === "core:island" ? 150 : 70}
      />
      {!conn.editing && (
        <PhysicsResidents
          templateId={scene.template.id}
          terrain={scene.terrain}
          paused={paused}
          player={() => conn.me?.position ?? null}
          wolfOwned={wolfOwned}
          onTalk={talkResident}
          onNearChange={residentNear}
        />
      )}
      {!conn.editing &&
        !["core:playground", "core:building-yard"].includes(
          scene.template.id,
        ) && (
          <PhysicsFox
            terrain={scene.terrain}
            paused={paused}
            player={() => conn.me?.position ?? null}
            onTalk={talkFox}
          />
        )}
      {scene.terrain.map((tile) => (
        <PhysicsTerrain
          key={tile.id}
          tile={tile}
          vertexColor={groundColor}
          placeAt={draft ? placeAt : undefined}
        />
      ))}
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
        <PhysicsAvatar
          key={player.id}
          conn={conn}
          id={player.id}
          bubble={conn.bubbles.find((bubble) => bubble.playerId === player.id)}
          onTalkPlayer={talkPlayer}
        />
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
        maxDistance={
          scene.template.id === "core:island"
            ? 400
            : scene.template.id === "core:dinosaur"
              ? 350
              : scene.template.id === "core:mountain"
                ? 140
                : 35
        }
        maxPolarAngle={Math.PI * 0.48}
      />
    </>
  );
}
export default function OnlineScene(props: {
  forageSpots: PhysicsForageSpot[];
  inspectForage(kind: string): void;
  dinosaurFocus: DinosaurFocus | null;
  inspectDinosaur(id: DinosaurHabitatId): void;
  night: boolean;
  paused: boolean;
  conn: PhysicsConnection;
  keys: Set<string>;
  selected: string | null;
  select: (id: string) => void;
  draft: PhysicsDraft | null;
  placeAt: (position: Position, normal?: Position) => void;
  talkResident(resident: Resident): void;
  residentNear(resident: Resident | null): void;
  talkFox(): void;
  talkPlayer(id: string, name: string): void;
  weather: Weather;
  wolfOwned: boolean;
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
