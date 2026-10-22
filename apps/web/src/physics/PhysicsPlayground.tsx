import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Link } from "react-router";
import {
  BufferAttribute,
  BufferGeometry,
  Group,
  Quaternion,
  Vector3,
} from "three";
import { PhysicsPart as Part } from "./PhysicsPart";
import {
  PhysicsRuntime,
  createPlayground,
  playgroundIds,
} from "@island/physics-core";
import type {
  BodyState,
  ObjectDefinition,
  ObjectInstance,
} from "@island/contracts";
import "./physics.css";
import { PlaygroundPlayer, type PlaygroundInput } from "./PlaygroundPlayer";
import { PhysicsAudio } from "./PhysicsAudio";

function DropGhost({
  runtime,
  input,
  held,
  valid,
}: {
  runtime: PhysicsRuntime;
  input: PlaygroundInput;
  held: string;
  valid: boolean;
}) {
  const group = useRef<Group>(null);
  const instance = runtime.scene.objects.find((o) => o.id === held);
  const definition = runtime.scene.definitions.find(
    (d) =>
      d.id === instance?.definitionId &&
      d.version === instance.definitionVersion,
  );
  useFrame(() => {
    if (!group.current) return;
    const p = input.preview;
    group.current.visible = !!p;
    if (p) {
      group.current.position.copy(p.position);
      group.current.quaternion.set(
        p.rotation.x,
        p.rotation.y,
        p.rotation.z,
        p.rotation.w,
      );
    }
  });
  return (
    <group ref={group}>
      {definition?.parts.map((part) => (
        <Part
          key={part.id}
          part={part}
          selected={false}
          ghost={valid ? "#42bb78" : "#e16e63"}
        />
      ))}
    </group>
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
  held,
  dropValid,
}: {
  runtime: PhysicsRuntime;
  paused: boolean;
  debug: boolean;
  selected: string | null;
  select: (id: string) => void;
  input: PlaygroundInput;
  held: string | null;
  dropValid: boolean;
}) {
  const beforeStep = useRef<((dt: number) => void) | undefined>(undefined);
  const cameraTarget = useMemo(
    () =>
      new Vector3(
        runtime.scene.spawn.x,
        runtime.scene.spawn.y,
        runtime.scene.spawn.z - 2.5,
      ),
    [runtime],
  );
  useEffect(() => {
    const reset = () => {
      runtime.pauseClock();
      input.keys.clear();
      input.grabRequested = false;
      input.tossRequested = false;
      input.pushRequested = false;
      input.audio?.setPaused(paused || document.hidden);
    };
    input.paused = paused;
    document.addEventListener("visibilitychange", reset);
    reset();
    return () => document.removeEventListener("visibilitychange", reset);
  }, [runtime, paused, input]);
  useFrame((_, dt) => {
    if (!paused && !document.hidden) runtime.advance(dt, beforeStep.current);
    for (const event of runtime.takeImpacts())
      input.audio?.play("contact", event.material, event.strength);
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
      {held && (
        <DropGhost
          runtime={runtime}
          input={input}
          held={held}
          valid={dropValid}
        />
      )}
      <OrbitControls
        makeDefault
        target={cameraTarget}
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
  const [sound, setSound] = useState(false);
  const [follow, setFollow] = useState(true);
  const [selected, setSelected] = useState<string | null>(playgroundIds.ball);
  const input = useMemo<PlaygroundInput>(
    () => ({
      keys: new Set(),
      selected: playgroundIds.ball,
      grabRequested: false,
      tossRequested: false,
      pushRequested: false,
      preview: null,
      paused: false,
      followCamera: true,
      audio: null,
      held: null,
      message: "",
      position: null,
    }),
    [],
  );
  useEffect(() => {
    input.audio = new PhysicsAudio();
    return () => {
      input.audio?.dispose();
      input.audio = null;
    };
  }, [input]);
  input.selected = selected;
  input.followCamera = follow;
  const [status, setStatus] = useState({
    tick: 0,
    states: [] as BodyState[],
    dropped: 0,
    player: null as PlaygroundInput["position"],
    held: null as string | null,
    message: "",
    preview: input.preview,
    audioPlayed: 0,
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
      preview: null,
      audioPlayed: 0,
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
          preview: input.preview,
          audioPlayed: input.audio?.played ?? 0,
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
    input.pushRequested = true;
  };
  return (
    <main className="physics-playground">
      <header className="physics-header">
        <Link to="/island">← 返回家园</Link>
        <div>
          <h1>物理游乐场</h1>
          <p>本地试验 · 不保存</p>
        </div>
        <Link className="physics-local" to="/physics/online">在线世界 →</Link>
      </header>
      <section className="physics-viewport" aria-label="物理游乐场三维场景">
        {runtime ? (
          <Canvas
            shadows
            camera={{
              position: [
                runtime.scene.spawn.x + 14,
                runtime.scene.spawn.y + 11,
                runtime.scene.spawn.z + 14.5,
              ],
              fov: 45,
            }}
            dpr={[1, 1.5]}
          >
            <Scene
              runtime={runtime}
              paused={paused}
              debug={debug}
              selected={selected}
              select={setSelected}
              input={input}
              held={status.held}
              dropValid={!!status.preview?.valid}
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
          <label className="physics-select">
            观察物品{" "}
            <select
              aria-label="观察物品"
              value={selected ?? ""}
              onChange={(event) => setSelected(event.target.value)}
            >
              {runtime?.scene.objects.map((object) => (
                <option key={object.id} value={object.id}>
                  {
                    runtime.scene.definitions.find(
                      (d) =>
                        d.id === object.definitionId &&
                        d.version === object.definitionVersion,
                    )?.name
                  }
                </option>
              ))}
            </select>
          </label>
          <p>
            {definition?.bodyType === "dynamic"
              ? "轻推一下，看看它会怎样运动。"
              : "这是固定物体，可以承载和阻挡其他物品。"}
          </p>
        </div>
        <div className="physics-actions">
          <button
            onClick={push}
            disabled={
              !runtime ||
              paused ||
              !!status.held ||
              definition?.bodyType !== "dynamic"
            }
          >
            轻推一下
          </button>
          <button
            onClick={() => {
              input.grabRequested = true;
            }}
            disabled={
              !runtime || paused || (!!status.held && !status.preview?.valid)
            }
          >
            {status.held ? "放下" : "拿起"}
          </button>
          <button
            disabled={!runtime || paused || !status.held}
            onClick={() => {
              input.tossRequested = true;
            }}
          >
            轻抛
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
        {status.preview && <p role="status">{status.preview.reason}</p>}
        <button
          className="physics-sound"
          aria-pressed={sound}
          onClick={async () => setSound((await input.audio?.toggle()) ?? false)}
        >
          {sound ? "关闭声音" : "开启声音"}
        </button>
        <label className="physics-follow">
          <input
            type="checkbox"
            checked={follow}
            onChange={(event) => setFollow(event.target.checked)}
          />
          跟随角色
        </label>
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
