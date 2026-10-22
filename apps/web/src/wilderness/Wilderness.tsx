import {
  useEffect,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ElementRef,
  type MutableRefObject,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as T from "three";
import {
  CAMP,
  CHUNK_SIZE,
  chunkAt,
  chunkKey,
  wildBlocked,
  wildHeight,
  wildBiome,
  WildStream,
  wildEncounters,
  wildRing,
  type WildEncounter,
  type ChunkCoord,
} from "@island/world-core";
import { AvatarMesh, type AvatarAnim } from "../player/AvatarModel";
import { loadAvatar, type AvatarConfig } from "../player/avatar";
import RendererCleanup from "../RendererCleanup";
import Terrain from "./Terrain";
import { Wildlife, wildlifeNames, wildlifeNotes } from "./Wildlife";
import {
  packPosition,
  unpackPosition,
  type ExplorationJournal,
} from "./journal";
import "./wilderness.css";
type Position = { x: number; z: number };
type Input = { keys: Set<string>; touch: string; sprint: boolean };
const spawn = () => ({ ...CAMP, z: CAMP.z - 8 });
const names = { forest: "松林", meadow: "开阔草地", rock: "岩石丘陵" };
function Walker({
  seed,
  stream,
  center,
  position,
  input,
  avatar,
  report,
}: {
  seed: number;
  stream: WildStream;
  center: ChunkCoord;
  position: MutableRefObject<Position>;
  input: MutableRefObject<Input>;
  avatar: AvatarConfig;
  report(p: Position): void;
}) {
  const body = useRef<T.Group>(null),
    controls = useRef<ElementRef<typeof OrbitControls>>(null),
    lastOrigin = useRef(center);
  const { camera } = useThree();
  const anim = useMemo<AvatarAnim>(() => ({ phase: 0, moving: false }), []),
    timer = useRef(0);
  useLayoutEffect(() => {
    const dx = (center.x - lastOrigin.current.x) * CHUNK_SIZE,
      dz = (center.z - lastOrigin.current.z) * CHUNK_SIZE;
    camera.position.x -= dx;
    camera.position.z -= dz;
    if (controls.current) {
      controls.current.target.x -= dx;
      controls.current.target.z -= dz;
    }
    const p = position.current;
    controls.current?.target.set(
      p.x - center.x * CHUNK_SIZE,
      wildHeight(seed, p.x, p.z) + 1.4,
      p.z - center.z * CHUNK_SIZE,
    );
    lastOrigin.current = center;
  }, [center, camera, position, seed]);
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05),
      p = position.current,
      oldX = p.x,
      oldZ = p.z,
      oldY = wildHeight(seed, p.x, p.z);
    const held = (key: string) =>
      input.current.keys.has(key) || input.current.touch === key;
    let dx =
      Number(held("KeyD") || held("ArrowRight")) -
      Number(held("KeyA") || held("ArrowLeft"));
    let dz =
      Number(held("KeyS") || held("ArrowDown")) -
      Number(held("KeyW") || held("ArrowUp"));
    const length = Math.hypot(dx, dz);
    if (length) {
      const target = controls.current?.target;
      const angle = target
        ? Math.atan2(camera.position.x - target.x, camera.position.z - target.z)
        : 0;
      const speed =
        (input.current.sprint || held("ShiftLeft") || held("ShiftRight")
          ? 15
          : 8) * dt;
      const vx =
          ((dx * Math.cos(angle) + dz * Math.sin(angle)) / length) * speed,
        vz = ((dz * Math.cos(angle) - dx * Math.sin(angle)) / length) * speed;
      const allowed = (x: number, z: number) => {
        // Numeric safety boundary is millions of chunks away from any normal journey.
        if (Math.hypot(x - CAMP.x, z - CAMP.z - 3) < 3.5) return false;
        if (Math.abs(x) > 96_000_000 || Math.abs(z) > 96_000_000) return false;
        const chunk = stream.chunks.get(chunkKey(chunkAt(x, z)));
        if (!chunk) return false;
        // Check neighbours too: colliders can extend across a chunk boundary.
        const c = chunkAt(x, z);
        for (let a = -1; a <= 1; a++)
          for (let b = -1; b <= 1; b++) {
            const n = stream.chunks.get(chunkKey({ x: c.x + a, z: c.z + b }));
            if (n && wildBlocked(n, x, z)) return false;
          }
        return true;
      };
      if (allowed(p.x + vx, p.z)) p.x += vx;
      if (allowed(p.x, p.z + vz)) p.z += vz;
      if (body.current) body.current.rotation.y = Math.atan2(vx, vz);
    }
    const y = wildHeight(seed, p.x, p.z),
      x = p.x - center.x * CHUNK_SIZE,
      z = p.z - center.z * CHUNK_SIZE;
    body.current?.position.set(x, y + 0.04, z);
    anim.moving = p.x !== oldX || p.z !== oldZ;
    anim.phase += dt;
    camera.position.x += p.x - oldX;
    camera.position.z += p.z - oldZ;
    camera.position.y += y - oldY;
    controls.current?.target.set(x, y + 1.4, z);
    controls.current?.update();
    timer.current += dt;
    const c = chunkAt(p.x, p.z);
    if (timer.current > 0.2 || c.x !== center.x || c.z !== center.z) {
      report({ ...p });
      timer.current = 0;
    }
  });
  return (
    <>
      <group ref={body}>
        <AvatarMesh config={avatar} anim={anim} />
      </group>
      <OrbitControls
        ref={controls}
        makeDefault
        enablePan={false}
        minDistance={8}
        maxDistance={70}
        maxPolarAngle={Math.PI * 0.47}
      />
    </>
  );
}
function Diagnostics() {
  const { gl } = useThree();
  const timer = useRef(0);
  useFrame((_, dt) => {
    timer.current += dt;
    if (timer.current < 1) return;
    timer.current = 0;
    gl.domElement.dataset.geometries = String(gl.info.memory.geometries);
    gl.domElement.dataset.drawCalls = String(gl.info.render.calls);
  });
  return null;
}
function Camp({ center }: { center: ChunkCoord }) {
  return (
    <group
      position={[
        CAMP.x - center.x * CHUNK_SIZE,
        0,
        CAMP.z - center.z * CHUNK_SIZE,
      ]}
    >
      <mesh position={[0, 2.5, 3]}>
        <coneGeometry args={[4.5, 5, 4]} />
        <meshStandardMaterial color="#c88455" />
      </mesh>
      <mesh position={[5, 3, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 6, 6]} />
        <meshStandardMaterial color="#695647" />
      </mesh>
      <mesh position={[6, 5.1, 0]}>
        <boxGeometry args={[2, 1.2, 0.08]} />
        <meshStandardMaterial color="#f4d393" />
      </mesh>
    </group>
  );
}
export default function Wilderness({
  seed,
  low,
  avatar,
  onExit,
  journal,
}: {
  seed: number;
  low: boolean;
  avatar: AvatarConfig | null;
  onExit(): void;
  journal: ExplorationJournal;
}) {
  const position = useRef(unpackPosition(journal.state)),
    input = useRef<Input>({ keys: new Set(), touch: "", sprint: false });
  const [p, setP] = useState(() => unpackPosition(journal.state)),
    [epoch, setEpoch] = useState(0),
    [revision, setRevision] = useState(0),
    [running, setRunning] = useState(false);
  const center = useMemo(
    () => chunkAt(p.x, p.z),
    [Math.floor(p.x / CHUNK_SIZE), Math.floor(p.z / CHUNK_SIZE)],
  );
  const stream = useMemo(() => new WildStream(), [seed, epoch]);
  const explored = useRef(
    new Map(journal.state.explored.map((c) => [chunkKey(c), c])),
  );
  const [selected, setSelected] = useState<WildEncounter | null>(null),
    [showJournal, setShowJournal] = useState(false);
  const report = useCallback(
    (next: Position) => {
      setP(next);
      journal.update({
        ...journal.state,
        position: packPosition(next.x, next.z),
        explored: [...explored.current.values()],
      });
    },
    [journal],
  );
  const encounters = useMemo(
    () => wildRing(center, 1).flatMap((c) => wildEncounters(seed, c)),
    [seed, center],
  );
  const nearby = encounters
    .filter((e) => Math.hypot(e.x - p.x, e.z - p.z) < 80)
    .sort(
      (a, b) =>
        Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z),
    )
    .slice(0, low ? 4 : 8);
  const inspect = useCallback(
    (e: WildEncounter) => {
      if (Math.hypot(e.x - position.current.x, e.z - position.current.z) > 26)
        return;
      setSelected(e);
      if (!journal.state.discoveries.includes(e.id))
        journal.update({
          ...journal.state,
          discoveries: [...journal.state.discoveries, e.id].slice(-256),
        });
      void journal.flush();
    },
    [journal],
  );
  const initialView = useMemo(() => {
    const pos = position.current,
      c = chunkAt(pos.x, pos.z);
    return [
      pos.x - c.x * CHUNK_SIZE,
      wildHeight(seed, pos.x, pos.z) + 12,
      pos.z - c.z * CHUNK_SIZE + 20,
    ] as [number, number, number];
  }, [epoch, seed]);
  const resolve = async (choice: "local" | "cloud") => {
    await journal.resolve(choice);
    if (choice === "cloud" && journal.status === "synced") {
      input.current.keys.clear();
      input.current.touch = "";
      position.current = unpackPosition(journal.state);
      setP(position.current);
      explored.current = new Map(
        journal.state.explored.map((c) => [chunkKey(c), c]),
      );
      setSelected(null);
      setEpoch((e) => e + 1);
    }
  };
  useEffect(() => {
    stream.focus(center);
    setRevision((r) => r + 1);
    const key = chunkKey(center);
    explored.current.delete(key);
    explored.current.set(key, center);
    if (explored.current.size > 256)
      explored.current.delete(explored.current.keys().next().value!);
    const id = window.setInterval(() => {
      if (stream.tick(seed)) setRevision((r) => r + 1);
    }, 24);
    return () => clearInterval(id);
  }, [stream, seed, center]);
  useEffect(() => {
    const codes = new Set([
      "KeyW",
      "KeyA",
      "KeyS",
      "KeyD",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "ShiftLeft",
      "ShiftRight",
    ]);
    const down = (e: KeyboardEvent) => {
      if (
        !codes.has(e.code) ||
        e.ctrlKey ||
        e.metaKey ||
        (e.target as HTMLElement)?.matches(
          "input, textarea, select, [contenteditable]",
        )
      )
        return;
      e.preventDefault();
      input.current.keys.add(e.code);
    };
    const up = (e: KeyboardEvent) => {
      input.current.keys.delete(e.code);
    };
    const clear = () => {
      input.current.keys.clear();
      input.current.touch = "";
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", clear);
    return () => {
      clear();
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", clear);
    };
  }, []);
  const ready = wildRing(center, 1).every((c) =>
    stream.chunks.has(chunkKey(c)),
  );
  const distance = Math.round(Math.hypot(p.x - CAMP.x, p.z - CAMP.z)),
    bearing = (Math.atan2(CAMP.x - p.x, p.z - CAMP.z) * 180) / Math.PI;
  const returnCamp = () => {
    input.current.keys.clear();
    input.current.touch = "";
    position.current = spawn();
    report(spawn());
    void journal.flush();
    setEpoch((e) => e + 1);
  };
  const cells = Array.from({ length: 49 }, (_, i) => ({
    x: center.x + (i % 7) - 3,
    z: center.z + Math.floor(i / 7) - 3,
  }));
  return (
    <main
      className="wild-page"
      data-testid="wilderness"
      data-chunk={chunkKey(center)}
      data-loaded={stream.chunks.size}
      data-pending={stream.waiting}
      data-x={p.x.toFixed(1)}
      data-z={p.z.toFixed(1)}
      data-revision={revision}
      data-discovered={journal.state.discoveries.length}
      data-wildlife={nearby.length}
      data-save-status={journal.status}
    >
      <Canvas
        key={epoch}
        dpr={low ? 1 : [1, 1.5]}
        camera={{
          position: initialView,
          fov: 52,
          near: 0.2,
          far: 450,
        }}
      >
        <RendererCleanup />
        <Diagnostics />
        <color attach="background" args={["#c6d7cd"]} />
        <fog attach="fog" args={["#c6d7cd", 95, 184]} />
        <hemisphereLight args={["#fff4d6", "#778c71", 2]} />
        <directionalLight position={[60, 100, 40]} intensity={2} />
        {[...stream.chunks.values()].map((c) => (
          <Terrain
            key={c.key}
            seed={seed}
            chunk={c}
            originX={center.x}
            originZ={center.z}
            detail={
              Math.abs(c.x - center.x) <= 1 && Math.abs(c.z - center.z) <= 1
            }
          />
        ))}
        {Math.abs(center.x) <= 2 && Math.abs(center.z) <= 2 && (
          <Camp center={center} />
        )}
        {ready &&
          nearby.map((e) => (
            <Wildlife
              key={e.id}
              encounter={e}
              seed={seed}
              origin={center}
              inspect={inspect}
            />
          ))}
        {ready && (
          <Walker
            seed={seed}
            stream={stream}
            center={center}
            position={position}
            input={input}
            avatar={avatar ?? loadAvatar()}
            report={report}
          />
        )}
      </Canvas>
      <header className="wild-header">
        <div>
          <span className="wild-eyebrow">恐龙公园 · 北部探索区</span>
          <h1>往森林深处走</h1>
          <p>{names[wildBiome(seed, p.x, p.z)]} · 沿小径出发，沿途自由探索</p>
        </div>
        <button onClick={onExit}>返回恐龙公园</button>
      </header>
      <aside className="wild-map" aria-label="探索地图">
        <div className="wild-map-grid">
          {cells.map((c) => (
            <span
              key={chunkKey(c)}
              className={explored.current.has(chunkKey(c)) ? "seen" : ""}
              title={`区域 ${c.x}, ${c.z}`}
            >
              {c.x === center.x && c.z === center.z
                ? "●"
                : c.x === 0 && c.z === 0
                  ? "⌂"
                  : ""}
            </span>
          ))}
        </div>
        <p>
          <span
            style={{
              display: "inline-block",
              transform: `rotate(${bearing}deg)`,
            }}
          >
            ↑
          </span>{" "}
          营地 {distance} 米
        </p>
        <small>北 ↑ · ● 你的位置 · ⌂ 营地</small>
        <button onClick={returnCamp}>回到营地</button>
      </aside>
      <footer className="wild-hint">
        WASD / 方向键行走 · Shift 奔跑 · 拖动画面转向
        <br />
        <span role="status">
          {journal.storageFailed
            ? "本机保存失败，请保持页面打开并重试"
            : {
                loading: "正在读取手记…",
                local: "探索已保存在本机",
                dirty: "本机已保存，等待同步",
                synced: "探索已同步到家园",
                offline: "云端暂不可用，本机进度已保留",
                conflict: "另一台设备更新了进度，本机记录已保留",
              }[journal.status]}
        </span>
        <button className="wild-retry" onClick={() => void journal.flush()}>
          保存进度
        </button>
      </footer>
      <section className="wild-discovery" aria-label="探索发现">
        <button
          onClick={() => setShowJournal((v) => !v)}
          aria-expanded={showJournal}
        >
          探索手记 · {journal.state.discoveries.length} 处发现
        </button>
        {nearby
          .filter((e) => Math.hypot(e.x - p.x, e.z - p.z) <= 26)
          .slice(0, 2)
          .map((e) => (
            <button key={e.id} onClick={() => inspect(e)}>
              观察{wildlifeNames[e.kind]}
              {journal.state.discoveries.includes(e.id)
                ? " · 已记录"
                : " · 新发现"}
            </button>
          ))}
        {selected && (
          <div className="wild-observation">
            <button
              className="wild-close"
              aria-label="关闭观察"
              onClick={() => setSelected(null)}
            >
              ×
            </button>
            <h2>{wildlifeNames[selected.kind]}</h2>
            <p>{wildlifeNotes[selected.kind]}</p>
            <small>
              区域 {selected.chunk.x}, {selected.chunk.z} · 已记入手记
            </small>
          </div>
        )}
        {showJournal && (
          <div className="wild-journal">
            <h2>探索手记</h2>
            <p>
              记住最近 {journal.state.explored.length} 个区域与{" "}
              {journal.state.discoveries.length} 处发现（各最多 256）。
            </p>
            {!journal.state.discoveries.length && (
              <p>走近动物或蛋巢，点击「观察」记录第一次发现。</p>
            )}
            <ul>
              {journal.state.discoveries
                .slice(-12)
                .reverse()
                .map((id) => {
                  const [, x, z, , kind] = id.split(":");
                  return (
                    <li key={id}>
                      {wildlifeNames[kind as keyof typeof wildlifeNames]} · 区域{" "}
                      {x}, {z}
                    </li>
                  );
                })}
            </ul>
          </div>
        )}
      </section>
      {journal.status === "conflict" && (
        <aside className="wild-conflict" role="alert">
          <p>另一台设备更新了探索进度。选择后会保留本机备份。</p>
          <button onClick={() => void resolve("cloud")}>载入云端进度</button>
          <button onClick={() => void resolve("local")}>用本机进度继续</button>
        </aside>
      )}
      <div className="wild-pad" aria-label="探索行走控制">
        {[
          ["KeyW", "向前", "↑"],
          ["KeyA", "向左", "←"],
          ["KeyS", "向后", "↓"],
          ["KeyD", "向右", "→"],
        ].map(([key, label, symbol]) => (
          <button
            key={key}
            aria-label={label}
            className={key}
            onPointerDown={(e) => {
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              input.current.touch = key!;
            }}
            onPointerUp={() => {
              input.current.touch = "";
            }}
            onPointerCancel={() => {
              input.current.touch = "";
            }}
            onLostPointerCapture={() => {
              input.current.touch = "";
            }}
          >
            {symbol}
          </button>
        ))}
        <button
          className="wild-run"
          aria-pressed={running}
          onClick={() => {
            input.current.sprint = !running;
            setRunning(!running);
          }}
        >
          奔跑
        </button>
      </div>
      {!ready && (
        <div className="wild-loading" role="status">
          正在铺开前方的小径…
        </div>
      )}
    </main>
  );
}
