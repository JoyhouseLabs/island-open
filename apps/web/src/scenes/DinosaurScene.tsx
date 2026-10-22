import { useEffect, useRef, useState, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as T from "three";
import {
  dinosaurPark,
  dinosaurTrail,
  dinosaurHabitats,
  dinosaurPathDistance,
  dinosaurWalkable,
  type DinosaurHabitatId,
} from "@island/world-core";
import { Plants, Box, palettes } from "../Plants";
import { PlayerRig } from "../player/Player";
import Collectibles from "../collect/Collectibles";
import {
  GrassField,
  SceneCanvas,
  SceneFrame,
  SkyRig,
  usePlacer,
  exitClick,
  weatherWind,
  type SceneProps,
} from "./shared";
import "../wilderness/wilderness.css";
import { Pterosaur, Raptor, Peacock } from "./DinosaurAnimals";

const fieldSpread: [number, number] = [166, 136];
const ground = () => 0;
const grassAccept = (x: number, z: number) =>
  dinosaurWalkable(x, z) && dinosaurPathDistance(x, z) > 5;
const observations: Record<
  DinosaurHabitatId,
  { title: string; text: string; prompt: string; source?: string }
> = {
  pterosaur: {
    title: "翼龙 · 乘风的邻居",
    text: "翼龙是会飞的爬行动物，是恐龙的近亲。这里用风格化模型表现翼膜与滑翔，并不是某一种翼龙的精确复原。",
    prompt: "观察它什么时候扇翅，什么时候滑翔。",
    source: "https://www.nhm.ac.uk/discover/the-truth-about-pterosaurs.html",
  },
  raptor: {
    title: "迅猛龙 · 有羽毛的恐龙",
    text: "迅猛龙有羽毛，尾巴长，用两条后腿行走。公园里的小伙伴会散步、停下张望，点击它就能让它停留一会儿。",
    prompt: "找找前肢和尾巴上的羽毛。",
    source: "https://www.amnh.org/explore/news-blogs/velociraptor",
  },
  nest: {
    title: "蛋巢 · 安静观察",
    text: "这是一组想象的恐龙蛋巢。蛋的颜色、大小和排列是艺术设计，不代表迅猛龙的真实巢穴复原。请站在巢边观察。",
    prompt: "数一数，每个巢里有几枚蛋？",
  },
  peacock: {
    title: "现代孔雀 · 羽屏里的眼睛",
    text: "这是今天仍然生活在地球上的蓝孔雀。雄鸟展开的华丽羽屏主要由延长的尾上覆羽组成。点击它，看看展开的羽屏。",
    prompt: "羽屏上有多少个像眼睛一样的花纹？",
    source: "https://nationalzoo.si.edu/animals/common-peafowl",
  },
};

type Focus = { id: DinosaurHabitatId | "all"; stamp: number };
/** Tour buttons move the orbit camera only; never teleport a walking player. */
function TourCamera({ focus, walking }: { focus: Focus; walking: boolean }) {
  const { camera, controls, size } = useThree();
  useEffect(() => {
    if (!focus.stamp || walking) return;
    const h = dinosaurHabitats.find((h) => h.id === focus.id);
    const target = new T.Vector3(
      h?.x ?? 0,
      h?.id === "pterosaur" ? 13 : 1,
      h?.z ?? 0,
    );
    const scale = size.width < 700 ? 1.45 : 1;
    camera.position
      .copy(target)
      .add(
        new T.Vector3(
          ...((h ? [38, 34, 50] : [145, 155, 190]) as [number, number, number]),
        ).multiplyScalar(scale),
      );
    const orbit = controls as unknown as {
      target: T.Vector3;
      update(): void;
    } | null;
    orbit?.target.copy(target);
    orbit?.update();
  }, [focus, walking, camera, controls, size.width]);
  return null;
}
function Trail() {
  const segments = [...dinosaurTrail, dinosaurTrail[0]!];
  return (
    <group>
      {segments.slice(0, -1).map((a, i) => {
        const b = segments[i + 1]!,
          dx = b.x - a.x,
          dz = b.z - a.z;
        return (
          <mesh
            key={i}
            position={[(a.x + b.x) / 2, 0.035, (a.z + b.z) / 2]}
            rotation={[0, Math.atan2(dx, dz), 0]}
            receiveShadow
          >
            <boxGeometry args={[5.5, 0.07, Math.hypot(dx, dz) + 2]} />
            <meshStandardMaterial color="#cabb95" roughness={1} />
          </mesh>
        );
      })}
      <Box position={[0, 0.035, 60]} scale={[5.5, 0.06, 12]} color="#cabb95" />
    </group>
  );
}
function Nest({
  x,
  z,
  onInspect,
  interactive,
}: {
  x: number;
  z: number;
  onInspect: () => void;
  interactive: boolean;
}) {
  return (
    <group
      position={[x, 0, z]}
      onClick={(e) => {
        if (interactive && e.delta <= 5) {
          e.stopPropagation();
          onInspect();
        }
      }}
    >
      <mesh position={[0, 0.5, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[2.4, 0.65, 6, 16]} />
        <meshStandardMaterial color="#9b784c" flatShading />
      </mesh>
      <mesh position={[0, 0.2, 0]} receiveShadow>
        <cylinderGeometry args={[2.6, 2.8, 0.4, 16]} />
        <meshStandardMaterial color="#a7915e" />
      </mesh>
      {Array.from({ length: 5 }, (_, i) => {
        const a = (i * Math.PI * 2) / 5;
        return (
          <mesh
            key={i}
            position={[Math.sin(a) * 1.2, 0.9, Math.cos(a) * 1.2]}
            rotation={[0.1, a, 0.2]}
            scale={[0.55, 0.8, 0.55]}
            castShadow
          >
            <sphereGeometry args={[1, 12, 10]} />
            <meshStandardMaterial
              color={i % 2 ? "#e2cda6" : "#eeddbd"}
              roughness={0.95}
            />
          </mesh>
        );
      })}
    </group>
  );
}
function Wetland() {
  const water = useRef<T.Mesh>(null),
    p = dinosaurPark.pond;
  useFrame(({ clock }) => {
    if (water.current)
      water.current.position.y =
        0.07 + Math.sin(clock.elapsedTime * 1.2) * 0.025;
  });
  return (
    <group position={[p.x, 0, p.z]}>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[p.rx + 1, p.rz + 1, 1]}
        position={[0, 0.04, 0]}
      >
        <circleGeometry args={[1, 48]} />
        <meshStandardMaterial color="#b8b690" />
      </mesh>
      <mesh
        ref={water}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[p.rx, p.rz, 1]}
        position={[0, 0.08, 0]}
      >
        <circleGeometry args={[1, 48]} />
        <meshStandardMaterial
          color="#65a5a3"
          metalness={0.2}
          roughness={0.22}
        />
      </mesh>
      {Array.from({ length: 18 }, (_, i) => {
        const a = (i * Math.PI * 2) / 18;
        return (
          <mesh
            key={i}
            position={[
              Math.cos(a) * (p.rx + 1.2),
              0.9,
              Math.sin(a) * (p.rz + 1.2),
            ]}
            rotation={[0.1, a, 0.12]}
          >
            <coneGeometry args={[0.4, 1.8, 5]} />
            <meshStandardMaterial color="#6f8e62" />
          </mesh>
        );
      })}
    </group>
  );
}
function Park(
  props: SceneProps & {
    focus: Focus;
    labels: RefObject<(HTMLButtonElement | null)[]>;
    inspect(id: DinosaurHabitatId): void;
  },
) {
  const { world, low, tool, onExit, inspect } = props,
    place = usePlacer(tool, props.onPlace);
  const weather = world.environment.weather ?? "sun",
    interactive = tool === "explore";
  return (
    <>
      <SkyRig
        hour={world.environment.hour}
        low={low}
        sky={{ day: "#c6d9cb", night: "#192d38" }}
        fog={[310, 750]}
        stars={1400}
        shadowHalf={100}
        weather={weather}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow onClick={place}>
        <planeGeometry args={[dinosaurPark.width, dinosaurPark.depth]} />
        <meshStandardMaterial
          color={palettes[world.environment.season].ground}
        />
      </mesh>
      <Box position={[0, -1.1, 0]} scale={[180, 2, 150]} color="#968e6e" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.05, 0]}>
        <planeGeometry args={[1800, 1800]} />
        <meshStandardMaterial color="#94b6ad" roughness={0.4} />
      </mesh>
      <Trail />
      {dinosaurPark.cliffs.map((c, i) => (
        <group key={i} position={[c.x, 0, c.z]}>
          <mesh
            position={[0, c.h / 2, 0]}
            rotation={[0, i * 0.4, 0]}
            castShadow
            receiveShadow
          >
            <cylinderGeometry args={[c.r * 0.6, c.r, c.h, 6]} />
            <meshStandardMaterial
              color={["#9c9e8b", "#afb09a", "#858e7e"][i]}
              flatShading
              roughness={1}
            />
          </mesh>
          <mesh position={[0, c.h + 0.12, 0]}>
            <cylinderGeometry args={[c.r * 0.61, c.r * 0.62, 0.3, 6]} />
            <meshStandardMaterial color="#849766" flatShading />
          </mesh>
        </group>
      ))}
      <Wetland />
      {dinosaurPark.nests.map((n, i) => (
        <Nest
          key={i}
          {...n}
          interactive={interactive}
          onInspect={() => inspect("nest")}
        />
      ))}
      <Plants
        entities={world.entities}
        season={world.environment.season}
        low={low}
        height={ground}
        wind={weatherWind[weather]}
      />
      <GrassField
        low={low}
        tint="#6f975f"
        count={460}
        spread={fieldSpread}
        seed={world.seed}
        accept={grassAccept}
        scale={1.25}
      />
      {Array.from({ length: low ? 1 : 2 }, (_, i) => (
        <Pterosaur
          key={i}
          index={i}
          interactive={interactive}
          onInspect={inspect}
        />
      ))}
      {Array.from({ length: low ? 2 : 3 }, (_, i) => (
        <Raptor
          key={i}
          index={i}
          interactive={interactive}
          onInspect={inspect}
        />
      ))}
      {Array.from({ length: low ? 1 : 2 }, (_, i) => (
        <Peacock
          key={i}
          index={i}
          interactive={interactive}
          onInspect={inspect}
        />
      ))}
      {dinosaurHabitats.map((h, i) => {
        const p = dinosaurTrail[[3, 2, 5, 8][i]!]!;
        return (
          <group key={h.id} position={[p.x + 3.8, 0, p.z]}>
            <Box
              position={[0, 1.6, 0]}
              scale={[0.25, 3.2, 0.25]}
              color="#7f7051"
            />
            <Box position={[0, 3.1, 0]} scale={[3, 1.5, 0.3]} color={h.color} />
          </group>
        );
      })}
      <group
        position={[0, 0, dinosaurPark.gate.z]}
        onClick={exitClick(tool, onExit)}
      >
        {[-4, 4].map((x) => (
          <Box
            key={x}
            position={[x, 3, 0]}
            scale={[0.9, 6, 0.9]}
            color="#8b7858"
          />
        ))}
        <Box position={[0, 6, 0]} scale={[9.5, 1.6, 1]} color="#55775c" />
      </group>
      {props.onExplore && <group position={[0, 0, -45]} onClick={exitClick(tool, props.onExplore)}>
        {[-4, 4].map(x => <Box key={x} position={[x, 2.8, 0]} scale={[.6, 5.6, .6]} color="#8b7858" />)}
        <Box position={[0, 5.6, 0]} scale={[9, 1.1, .7]} color="#66835a" />
      </group>}
      <Collectibles scene="dinosaur" seed={world.seed} />
      {props.walk && props.avatar && props.onGate && (
        <PlayerRig
          scene="dinosaur"
          avatar={props.avatar}
          entities={world.entities}
          onGate={props.onGate}
        />
      )}
      <SceneFrame
        reset={props.reset}
        position={[145, 155, 190]}
        max={600}
        zoom={1.5}
      />
      <TourCamera
        focus={props.focus}
        walking={!!props.walk && !!props.avatar}
      />
      <MapLabels elements={props.labels} />
    </>
  );
}
const signPoints = dinosaurHabitats.map((h, i) => {
  const p = dinosaurTrail[[3, 2, 5, 8][i]!]!;
  return { x: p.x + 3.8, y: 4.8, z: p.z, title: h.title, id: h.id };
});
function MapLabels({
  elements,
}: {
  elements: RefObject<(HTMLButtonElement | null)[]>;
}) {
  const point = useRef(new T.Vector3());
  useFrame(({ camera, size }) => {
    signPoints.forEach((p, i) => {
      const el = elements.current[i];
      if (!el) return;
      const v = point.current.set(p.x, p.y, p.z).project(camera);
      el.style.visibility =
        v.z < -1 || v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1
          ? "hidden"
          : "visible";
      el.style.transform = `translate(${((v.x + 1) * size.width) / 2}px,${((1 - v.y) * size.height) / 2}px) translate(-50%,-50%)`;
    });
  });
  return null;
}
export default function DinosaurScene(props: SceneProps) {
  const labels = useRef<(HTMLButtonElement | null)[]>([]);
  const [open, setOpen] = useState(false),
    [selected, setSelected] = useState<DinosaurHabitatId | null>(null);
  const [focus, setFocus] = useState<Focus>({ id: "all", stamp: 0 });
  const inspect = (id: DinosaurHabitatId) => {
    setSelected(id);
    setOpen(true);
  };
  const card = selected ? observations[selected] : null;
  return (
    <>
      <SceneCanvas low={props.low} scene="dinosaur" position={[145, 155, 190]}>
        <Park {...props} focus={focus} inspect={inspect} labels={labels} />
      </SceneCanvas>
      <div className="dino-labels">
        {signPoints.map((p, i) => (
          <button
            key={p.id}
            ref={(el) => {
              labels.current[i] = el;
            }}
            className="dino-map-label"
            disabled={props.tool !== "explore"}
            onClick={() => inspect(p.id)}
          >
            {p.title}
          </button>
        ))}
      </div>
      <aside className="dino-guide" aria-label="恐龙公园导览">
        {props.onExplore && <button className="dino-explore" onClick={props.onExplore}>北部出口 · 探索外围 ↗</button>}
        <button
          className="dino-guide-toggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "收起导览" : "公园导览 · 四处发现"}
        </button>
        {open && (
          <div className="dino-guide-content">
            <p className="dino-guide-intro">
              核心园区 · 180 × 150
              <br />
              沿浅色环路探索四个栖息地
            </p>
            <nav aria-label="公园观察区域">
              {dinosaurHabitats.map((h, i) => (
                <button
                  key={h.id}
                  aria-pressed={selected === h.id}
                  onClick={() => {
                    setSelected(h.id);
                    setFocus({ id: h.id, stamp: Date.now() });
                  }}
                >
                  <span style={{ background: h.color }}>{i + 1}</span>
                  {h.title}
                </button>
              ))}
            </nav>
            {card && (
              <section aria-live="polite">
                <h2>{card.title}</h2>
                <p>{card.text}</p>
                <p className="dino-prompt">{card.prompt}</p>
                {card.source && (
                  <a href={card.source} target="_blank" rel="noreferrer">
                    阅读博物馆资料 ↗
                  </a>
                )}
              </section>
            )}
            <p className="dino-guide-footnote">
              想象中的自然公园：远古动物与现代孔雀同园，模型比例为观察而调整。
            </p>
            {props.walk && props.avatar ? (
              <p className="dino-guide-footnote dino-walking-hint">
                行走模式下导览只显示介绍；关闭行走可使用分区镜头。
              </p>
            ) : (
              <button
                className="dino-overview"
                onClick={() => {
                  setSelected(null);
                  setFocus({ id: "all", stamp: Date.now() });
                }}
              >
                查看全园
              </button>
            )}
          </div>
        )}
      </aside>
    </>
  );
}
