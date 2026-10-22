import { useEffect, useCallback, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  CAMP,
  CHUNK_SIZE,
  chunkAt,
  chunkKey,
  wildHeight,
  wildBiome,
  WildStream,
  wildCampParts,
  wildEncounters,
  wildIdentity,
  wildRing,
  type WildEncounter,
  type ChunkCoord,
} from "@island/world-core";
import PhysicsWalker, {
  type ExplorePosition,
  type ExploreInput,
} from "./PhysicsWalker";
import { PhysicsPart } from "../physics/PhysicsPart";
import { loadAvatar, type AvatarConfig } from "../player/avatar";
import RendererCleanup from "../RendererCleanup";
import Terrain from "./Terrain";
import { Wildlife, wildlifeNames } from "./Wildlife";
import ObservationCard from "./ObservationCard";
import {
  packPosition,
  unpackPosition,
  type ExplorationJournal,
} from "./journal";
import "./wilderness.css";
type Position = ExplorePosition;
type Input = ExploreInput;
const spawn = () => ({ ...CAMP, z: CAMP.z - 8 });
const names = { forest: "松林", meadow: "开阔草地", rock: "岩石丘陵" };
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
  const parts = useMemo(() => wildCampParts(), []);
  return (
    <group position={[-center.x * CHUNK_SIZE, 0, -center.z * CHUNK_SIZE]}>
      {parts.map((part) => (
        <PhysicsPart key={part.id} part={part} selected={false} />
      ))}
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
  const position = useRef<Position>(unpackPosition(journal.state)),
    input = useRef<Input>({
      keys: new Set(),
      touch: "",
      sprint: false,
      jump: false,
    });
  const [p, setP] = useState<Position>(() => unpackPosition(journal.state)),
    [epoch, setEpoch] = useState(0),
    [revision, setRevision] = useState(0),
    [running, setRunning] = useState(false);
  const [physicsStatus, setPhysicsStatus] = useState({
    ready: false,
    error: "",
  });
  const onPhysicsStatus = useCallback((ready: boolean, error = "") => {
    setPhysicsStatus((old) =>
      old.ready === ready && old.error === error ? old : { ready, error },
    );
  }, []);
  const center = useMemo(
    () => chunkAt(p.x, p.z),
    [Math.floor(p.x / CHUNK_SIZE), Math.floor(p.z / CHUNK_SIZE)],
  );
  const stream = useMemo(() => new WildStream(), [seed, epoch]);
  const explored = useRef(
    new Map(journal.state.explored.map((c) => [chunkKey(c), c])),
  );
  const [selected, setSelected] = useState<Pick<
      WildEncounter,
      "id" | "kind" | "chunk"
    > | null>(null),
    [showJournal, setShowJournal] = useState(false);
  const [showMap, setShowMap] = useState(() => window.innerWidth >= 700);
  const [journalPage, setJournalPage] = useState(0);
  const pageCount = Math.max(
      1,
      Math.ceil(journal.state.discoveries.length / 12),
    ),
    currentPage = Math.min(journalPage, pageCount - 1);
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
      setSelected(e);
      if (Math.hypot(e.x - position.current.x, e.z - position.current.z) > 26)
        return;
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
      input.current.jump = false;
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
      "Space",
    ]);
    const down = (e: KeyboardEvent) => {
      if (
        !codes.has(e.code) ||
        (e.code === "Space" &&
          (e.target as HTMLElement)?.closest("button,a")) ||
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
      input.current.jump = false;
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
    input.current.jump = false;
    setPhysicsStatus({ ready: false, error: "" });
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
      data-physics-ready={physicsStatus.ready}
      data-y={(p.y ?? wildHeight(seed, p.x, p.z)).toFixed(3)}
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
        <PhysicsWalker
          seed={seed}
          stream={stream}
          center={center}
          revision={revision}
          position={position}
          input={input}
          avatar={avatar ?? loadAvatar()}
          report={report}
          onStatus={onPhysicsStatus}
        />
      </Canvas>
      <header className="wild-header">
        <div>
          <span className="wild-eyebrow">恐龙公园 · 北部探索区</span>
          <h1>往森林深处走</h1>
          <p>{names[wildBiome(seed, p.x, p.z)]} · 沿小径出发，沿途自由探索</p>
        </div>
        <button onClick={onExit}>返回恐龙公园</button>
      </header>
      {showMap && (
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
        </aside>
      )}
      <footer className="wild-hint">
        WASD / 方向键行走 · Shift 奔跑 · 空格跳跃 · 拖动画面转向
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
      <nav
        className="toolbar activity-toolbar wild-activities"
        aria-label="探索活动"
      >
        <button
          aria-expanded={showMap}
          onClick={() => {
            setShowMap((v) => !v);
            if (window.innerWidth < 700) setShowJournal(false);
          }}
        >
          地图
        </button>
        <button
          onClick={() => {
            setShowJournal((v) => !v);
            setSelected(null);
            if (window.innerWidth < 700) setShowMap(false);
          }}
          aria-expanded={showJournal}
        >
          探索手记 · {journal.state.discoveries.length} 处发现
        </button>
        <button onClick={returnCamp}>回到营地</button>
      </nav>
      <section className="wild-discovery" aria-label="探索发现">
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
          <ObservationCard
            id={selected.id}
            recorded={journal.state.discoveries.includes(selected.id)}
            onClose={() => setSelected(null)}
          />
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
                .slice()
                .reverse()
                .slice(currentPage * 12, (currentPage + 1) * 12)
                .map((id) => {
                  const identity = wildIdentity(id);
                  if (!identity) return null;
                  return (
                    <li key={id}>
                      <button
                        className="wild-journal-entry"
                        onClick={() => {
                          setSelected(identity);
                          setShowJournal(false);
                        }}
                      >
                        <strong>{wildlifeNames[identity.kind]}</strong>
                        <span>{identity.number}</span>
                        <small>
                          区域 {identity.chunk.x}, {identity.chunk.z} · 查看介绍
                        </small>
                      </button>
                    </li>
                  );
                })}
            </ul>
            {pageCount > 1 && (
              <nav className="wild-journal-pages" aria-label="手记分页">
                <button
                  disabled={currentPage === 0}
                  onClick={() => setJournalPage(currentPage - 1)}
                >
                  上一页
                </button>
                <span>
                  {currentPage + 1} / {pageCount}
                </span>
                <button
                  disabled={currentPage + 1 >= pageCount}
                  onClick={() => setJournalPage(currentPage + 1)}
                >
                  下一页
                </button>
              </nav>
            )}
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
          className="wild-jump"
          aria-label="跳跃"
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            input.current.jump = true;
          }}
          onPointerUp={() => {
            input.current.jump = false;
          }}
          onPointerCancel={() => {
            input.current.jump = false;
          }}
          onLostPointerCapture={() => {
            input.current.jump = false;
          }}
        >
          跳跃
        </button>
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
      {(!ready || !physicsStatus.ready) && (
        <div className="wild-loading" role="status">
          <div>
            {physicsStatus.error || "正在铺开前方的小径…"}
            {physicsStatus.error && (
              <button onClick={returnCamp}>重新从营地出发</button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
