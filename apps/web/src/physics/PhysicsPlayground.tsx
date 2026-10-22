import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, ContactShadows } from "@react-three/drei";
import { Link } from "react-router";
import {
  BufferAttribute,
  BufferGeometry,
  Group,
  Quaternion,
  Vector3,
} from "three";
import { ConvexGeometry } from "three/examples/jsm/geometries/ConvexGeometry.js";
import {
  PhysicsRuntime,
  createPlayground,
  playgroundIds,
} from "@island/physics-core";
import type {
  BodyState,
  ObjectDefinition,
  ObjectInstance,
  ObjectPart,
} from "@island/contracts";
import "./physics.css";
import { PlaygroundPlayer, type PlaygroundInput } from "./PlaygroundPlayer";

function Part({ part, selected }: { part: ObjectPart; selected: boolean }) {
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
      castShadow
      receiveShadow
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
        color={part.color}
        roughness={0.75}
        emissive={selected ? "#9a5a13" : "#000000"}
        emissiveIntensity={0.3}
        transparent={part.sensor}
        opacity={part.sensor ? 0.25 : 1}
      />
    </mesh>
  );
}
function ObjectMesh({
  runtime,
  instance,
  definition,
  selected,
  select,
}: {
  runtime: PhysicsRuntime;
  instance: ObjectInstance;
  definition: ObjectDefinition;
  selected: boolean;
  select: (id: string) => void;
}) {
  const ref = useRef<Group>(null);
  const q = useMemo(() => new Quaternion(), []);
  useFrame(() => {
    if (!ref.current) return;
    const current = runtime.state(instance.id),
      previous = runtime.previousState(instance.id),
      alpha = runtime.alpha;
    ref.current.position
      .set(previous.position.x, previous.position.y, previous.position.z)
      .lerp(current.position, alpha);
    ref.current.quaternion
      .set(
        previous.rotation.x,
        previous.rotation.y,
        previous.rotation.z,
        previous.rotation.w,
      )
      .slerp(
        q.set(
          current.rotation.x,
          current.rotation.y,
          current.rotation.z,
          current.rotation.w,
        ),
        alpha,
      );
  });
  return (
    <group
      ref={ref}
      onClick={(event) => {
        event.stopPropagation();
        select(instance.id);
      }}
    >
      {definition.parts.map((part) => (
        <Part key={part.id} part={part} selected={selected} />
      ))}
    </group>
  );
}
function DebugColliders({ runtime }: { runtime: PhysicsRuntime }) {
  const geometry = useMemo(() => new BufferGeometry(), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(() => {
    const data = runtime.world.debugRender();
    geometry.setAttribute("position", new BufferAttribute(data.vertices, 3));
    geometry.setAttribute("color", new BufferAttribute(data.colors, 4));
    geometry.computeBoundingSphere();
  });
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial vertexColors depthTest={false} />
    </lineSegments>
  );
}
function Scene({
  runtime,
  paused,
  debug,
  selected,
  select,
  input,
}: {
  runtime: PhysicsRuntime;
  paused: boolean;
  debug: boolean;
  selected: string | null;
  select: (id: string) => void;
  input: PlaygroundInput;
}) {
  const beforeStep = useRef<((dt: number) => void) | undefined>(undefined);
  useEffect(() => {
    const reset = () => runtime.pauseClock();
    document.addEventListener("visibilitychange", reset);
    reset();
    return () => document.removeEventListener("visibilitychange", reset);
  }, [runtime, paused]);
  useFrame((_, dt) => {
    if (!paused && !document.hidden) runtime.advance(dt, beforeStep.current);
  }, -100);
  const definitions = useMemo(
    () =>
      new Map(
        runtime.scene.definitions.map((d) => [`${d.id}@${d.version}`, d]),
      ),
    [runtime],
  );
  return (
    <>
      <color attach="background" args={["#e5eee5"]} />
      <ambientLight intensity={1.4} />
      <directionalLight
        position={[6, 12, 6]}
        intensity={2}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
      />
      {runtime.scene.objects.map((instance) => (
        <ObjectMesh
          key={instance.id}
          runtime={runtime}
          instance={instance}
          definition={definitions.get(
            `${instance.definitionId}@${instance.definitionVersion}`,
          )!}
          selected={instance.id === selected}
          select={select}
        />
      ))}
      <PlaygroundPlayer
        runtime={runtime}
        input={input}
        beforeStep={beforeStep}
      />
      <ContactShadows
        position={[0, 0.005, 0]}
        scale={30}
        opacity={0.25}
        blur={2}
        far={8}
        resolution={256}
        frames={1}
      />
      <OrbitControls
        makeDefault
        target={[-1, 1, 0]}
        minDistance={5}
        maxDistance={35}
        maxPolarAngle={Math.PI * 0.48}
      />
      {debug && <DebugColliders runtime={runtime} />}
    </>
  );
}
export default function PhysicsPlayground() {
  const [runtime, setRuntime] = useState<PhysicsRuntime | null>(null);
  const [generation, setGeneration] = useState(0);
  const [error, setError] = useState("");
  const [paused, setPaused] = useState(false);
  const [debug, setDebug] = useState(false);
  const [selected, setSelected] = useState<string | null>(playgroundIds.ball);
  const input = useMemo<PlaygroundInput>(
    () => ({
      keys: new Set(),
      selected: playgroundIds.ball,
      grabRequested: false,
      held: null,
      message: "",
      position: null,
    }),
    [],
  );
  input.selected = selected;
  const [status, setStatus] = useState({
    tick: 0,
    states: [] as BodyState[],
    dropped: 0,
    player: null as PlaygroundInput["position"],
    held: null as string | null,
    message: "",
  });
  useEffect(() => {
    let cancelled = false,
      owned: PhysicsRuntime | undefined;
    setRuntime(null);
    setError("");
    input.message = "";
    setStatus({
      tick: 0,
      states: [],
      dropped: 0,
      player: null,
      held: null,
      message: "",
    });
    PhysicsRuntime.create(createPlayground())
      .then((value) => {
        owned = value;
        if (cancelled) value.dispose();
        else setRuntime(value);
      })
      .catch((reason) => {
        if (!cancelled)
          setError(
            reason instanceof Error ? reason.message : "暂时无法打开试验场",
          );
      });
    return () => {
      cancelled = true;
      owned?.dispose();
    };
  }, [generation, input]);
  useEffect(() => {
    if (!runtime) return;
    const timer = window.setInterval(
      () =>
        setStatus({
          tick: runtime.tick,
          states: runtime.states(),
          dropped: runtime.droppedSeconds,
          player: input.position,
          held: input.held,
          message: input.message,
        }),
      250,
    );
    return () => window.clearInterval(timer);
  }, [runtime, input]);
  const definition = runtime?.scene.definitions.find(
    (d) =>
      d.id ===
      runtime.scene.objects.find((o) => o.id === selected)?.definitionId,
  );
  const push = () => {
    if (!runtime || !selected || paused) return;
    try {
      runtime.impulse(selected, { x: 0.8, y: 0.45, z: -0.3 });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "暂时不能推动");
    }
  };
  return (
    <main className="physics-playground">
      <header className="physics-header">
        <Link to="/island">← 返回家园</Link>
        <div>
          <h1>物理游乐场</h1>
          <p>试试滚动、碰撞和堆叠</p>
        </div>
        <span className="physics-local">本地试验 · 不保存</span>
      </header>
      <section className="physics-viewport" aria-label="物理游乐场三维场景">
        {runtime ? (
          <Canvas
            shadows
            camera={{ position: [13, 12, 17], fov: 45 }}
            dpr={[1, 1.5]}
          >
            <Scene
              runtime={runtime}
              paused={paused}
              debug={debug}
              selected={selected}
              select={setSelected}
              input={input}
            />
          </Canvas>
        ) : (
          <div className="physics-loading" role="status">
            {error || "正在准备游乐场…"}
          </div>
        )}
        <div className="physics-hint">
          WASD 行走 · 空格跳跃 · E 拿起/放下 · 拖动环顾
        </div>
      </section>
      <aside className="physics-controls">
        <div>
          <strong>{definition?.name ?? "选择一个物品"}</strong>
          <p>
            {definition?.bodyType === "dynamic"
              ? "轻推一下，看看它会怎样运动。"
              : "这是固定物体，可以承载和阻挡其他物品。"}
          </p>
        </div>
        <div className="physics-actions">
          <button
            onClick={push}
            disabled={!runtime || paused || definition?.bodyType !== "dynamic"}
          >
            轻推一下
          </button>
          <button
            onClick={() => {
              input.grabRequested = true;
            }}
            disabled={!runtime || paused}
          >
            {status.held ? "放下" : "拿起"}
          </button>
          <button onClick={() => setPaused((p) => !p)} disabled={!runtime}>
            {paused ? "继续" : "暂停"}
          </button>
          <button
            onClick={() => {
              setPaused(false);
              setGeneration((g) => g + 1);
            }}
          >
            重新开始
          </button>
        </div>
        {error && runtime && <p role="alert">{error}</p>}
        {status.message && <p role="status">{status.message}</p>}
        <div className="physics-movement" aria-label="角色动作">
          {[
            ["a", "向左"],
            ["w", "向前"],
            ["s", "向后"],
            ["d", "向右"],
            [" ", "跳跃"],
          ].map(([key, label]) => (
            <button
              key={key}
              disabled={!runtime || paused}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                input.keys.add(key!);
              }}
              onPointerUp={() => input.keys.delete(key!)}
              onPointerCancel={() => input.keys.delete(key!)}
              onLostPointerCapture={() => input.keys.delete(key!)}
            >
              {label}
            </button>
          ))}
        </div>
        <details>
          <summary>物理观察</summary>
          <label>
            <input
              type="checkbox"
              checked={debug}
              onChange={(e) => setDebug(e.target.checked)}
            />
            显示碰撞轮廓
          </label>
          <p>球沿斜坡滚下，木箱落在桌面，桌腿之间留有真实空隙。</p>
          <output data-testid="physics-state">{JSON.stringify(status)}</output>
        </details>
      </aside>
    </main>
  );
}
