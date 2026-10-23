import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ElementRef,
} from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import { Group, Vector3 } from "three";
import {
  avatarProfileSchema,
  placeSchema,
  type AvatarConfig,
  type PlaceConfig,
} from "@island/contracts";
import { placePhysicsRegion } from "@island/world-core";
import { PhysicsRegionWorld, characterProfile } from "@island/physics-core";
import { api } from "../api";
import { useActivity } from "../activities/context";
import { AvatarMesh, type AvatarAnim } from "../player/AvatarModel";
import { usePlaceAmbience } from "../places/ambience";
import { PhysicsPart } from "./PhysicsPart";
import "./place.css";

function Scene({
  place,
  avatar,
  keys,
  jump,
  night,
  reset,
  report,
  onExit,
}: {
  place: PlaceConfig;
  avatar: AvatarConfig;
  keys: Set<string>;
  jump: { current: boolean };
  night: boolean;
  reset: number;
  report(ready: boolean, error?: string): void;
  onExit(): void;
}) {
  const region = useMemo(() => placePhysicsRegion(place), [place]);
  const world = useRef<PhysicsRegionWorld | null>(null),
    body = useRef<Group>(null),
    controls = useRef<ElementRef<typeof OrbitControls>>(null);
  const { camera, gl } = useThree();
  const anim = useMemo<AvatarAnim>(() => ({ phase: 0, moving: false }), []);
  const spawn = useMemo(
    () => ({ x: 0, y: 0.9, z: place.ground.size / 4 }),
    [place],
  );
  const respawn = useCallback(
    (w: PhysicsRegionWorld) => {
      w.placeOnSurface(spawn.x, spawn.z);
      const p = w.player.position();
      camera.position.set(p.x + 10, p.y + 12, p.z + 16);
      controls.current?.target.set(p.x, p.y, p.z);
      controls.current?.update();
      keys.clear();
      jump.current = false;
    },
    [spawn, camera, keys, jump],
  );
  useEffect(() => {
    let cancelled = false,
      created: PhysicsRegionWorld | undefined;
    report(false);
    void PhysicsRegionWorld.create(spawn)
      .then((w) => {
        if (cancelled) {
          w.dispose();
          return;
        }
        created = w;
        try {
          w.mount(region);
          w.refreshQueries();
          respawn(w);
          world.current = w;
          report(true);
        } catch (e) {
          report(false, (e as Error).message);
        }
      })
      .catch((e) => {
        if (!cancelled) report(false, e.message);
      });
    return () => {
      cancelled = true;
      world.current = null;
      created?.dispose();
    };
  }, [region, spawn, respawn, report]);
  useEffect(() => {
    if (world.current) respawn(world.current);
  }, [reset, respawn]);
  useFrame((_, dt) => {
    const w = world.current;
    if (!w) return;
    if (document.hidden) {
      w.runtime.pauseClock();
      return;
    }
    const old = w.player.position(),
      target = controls.current?.target;
    const dx =
        Number(keys.has("KeyD") || keys.has("ArrowRight")) -
        Number(keys.has("KeyA") || keys.has("ArrowLeft")),
      dz =
        Number(keys.has("KeyS") || keys.has("ArrowDown")) -
        Number(keys.has("KeyW") || keys.has("ArrowUp"));
    const angle = target
        ? Math.atan2(camera.position.x - target.x, camera.position.z - target.z)
        : 0,
      length = Math.max(1, Math.hypot(dx, dz)),
      x = (dx * Math.cos(angle) + dz * Math.sin(angle)) / length,
      z = (dz * Math.cos(angle) - dx * Math.sin(angle)) / length;
    w.runtime.advance(dt, (step) => {
      const requestedJump = jump.current;
      jump.current = false;
      w.player.step(
        {
          x,
          z,
          jump: requestedJump || keys.has("Space"),
          sprint: keys.has("ShiftLeft") || keys.has("ShiftRight"),
        },
        step,
      );
    });
    let next = w.player.position();
    const fallen = next.y < -8 || !Number.isFinite(next.y);
    if (fallen) {
      respawn(w);
      next = w.player.position();
    }
    const feet = next.y - characterProfile.halfHeight - characterProfile.radius;
    body.current?.position.set(next.x, feet - 0.03, next.z);
    if (body.current && (dx || dz)) body.current.rotation.y = Math.atan2(x, z);
    anim.moving = Math.hypot(next.x - old.x, next.z - old.z) > 0.001;
    anim.airborne = !w.player.grounded;
    anim.phase += Math.min(dt, 0.1);
    if (!fallen)
      camera.position.add(
        new Vector3(next.x - old.x, next.y - old.y, next.z - old.z),
      );
    controls.current?.target.set(next.x, feet + 1.2, next.z);
    controls.current?.update();
    gl.domElement.dataset.physicsTick = String(w.runtime.tick);
    gl.domElement.dataset.physicsColliders = String(w.stats.colliders);
    gl.domElement.dataset.position = JSON.stringify(next);
    gl.domElement.dataset.grounded = String(w.player.grounded);
  });
  return (
    <>
      <color
        attach="background"
        args={[night ? place.sky.night : place.sky.day]}
      />
      <ambientLight intensity={night ? 0.5 : 1.4} />
      <directionalLight position={[20, 30, 15]} intensity={night ? 0.5 : 2.5} />
      {night && place.sky.stars > 0 && (
        <Stars count={place.sky.stars} radius={90} depth={30} fade />
      )}
      {region.parts.map((part) => (
        <group
          key={part.id}
          onClick={
            part.id.startsWith("gate-")
              ? (e) => {
                  e.stopPropagation();
                  onExit();
                }
              : undefined
          }
        >
          <PhysicsPart
            part={part}
            selected={false}
            glow={part.id.endsWith("-bulb") && night ? "#ffdd99" : undefined}
          />
        </group>
      ))}
      {night &&
        place.props
          .filter((p) => p.kind === "lamp")
          .map((p, i) => (
            <pointLight
              key={i}
              position={[p.x, 2.35 * p.scale, p.z]}
              color="#ffdd99"
              intensity={3}
              distance={11}
            />
          ))}
      <group ref={body}>
        <AvatarMesh config={avatar} anim={anim} />
      </group>
      <OrbitControls
        ref={controls}
        makeDefault
        enablePan={false}
        minDistance={5}
        maxDistance={place.ground.size * 2}
        maxPolarAngle={Math.PI * 0.48}
      />
    </>
  );
}
function Visit({
  place,
  avatar,
}: {
  place: PlaceConfig;
  avatar: AvatarConfig;
}) {
  const navigate = useNavigate(),
    jump = useRef(false);
  const activity = useActivity(),
    keys = useMemo(() => new Set<string>(), []);
  const [night, setNight] = useState(false),
    [reset, setReset] = useState(0),
    [ready, setReady] = useState(false),
    [error, setError] = useState("");
  const ambience = usePlaceAmbience(
    place.ambience.assetId,
    place.ambience.volume,
  );
  const report = useCallback((ok: boolean, error = "") => {
    setReady(ok);
    setError(error);
  }, []);
  useEffect(() => {
    const allowed = new Set([
      "KeyW",
      "KeyA",
      "KeyS",
      "KeyD",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "Space",
      "ShiftLeft",
      "ShiftRight",
    ]);
    const down = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLElement &&
        e.target.closest(
          "input,textarea,select,button,a,[contenteditable=true]",
        )
      )
        return;
      if (allowed.has(e.code)) {
        e.preventDefault();
        keys.add(e.code);
        if (e.code === "Space" && !e.repeat) jump.current = true;
      }
    };
    const up = (e: KeyboardEvent) => keys.delete(e.code),
      clear = () => {
        keys.clear();
        jump.current = false;
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
  }, [keys]);
  return (
    <main
      className="physics-place"
      style={{ "--place-accent": place.accent } as React.CSSProperties}
    >
      <header>
        <Link to={activity.returnTo}>返回家园</Link>
        <div>
          <small>{place.eyebrow}</small>
          <h1>{place.name}</h1>
          <p>{place.tagline}</p>
        </div>
      </header>
      <div className="physics-place-view" aria-label={`${place.name}三维漫游`}>
        <Canvas
          dpr={[1, 1.5]}
          camera={{
            position: [10, 14, place.ground.size / 4 + 16],
            near: 0.1,
            far: 500,
          }}
        >
          <Scene
            place={place}
            avatar={avatar}
            keys={keys}
            jump={jump}
            night={night}
            reset={reset}
            report={report}
            onExit={() => navigate(activity.returnTo)}
          />
        </Canvas>
        {!ready && (
          <p role={error ? "alert" : "status"}>
            {error || "正在准备这处小天地…"}
          </p>
        )}
      </div>
      <nav aria-label="漫游控制">
        <button onClick={() => setNight(!night)}>
          {night ? "看看白天" : "看看夜晚"}
        </button>
        <button disabled={!ready} onClick={() => setReset((n) => n + 1)}>
          回到入口
        </button>
        {place.ambience.assetId && (
          <button disabled={ambience.loading} onClick={ambience.toggle}>
            {ambience.loading
              ? "声音加载中…"
              : ambience.on
                ? "关闭环境声"
                : "听听环境声"}
          </button>
        )}
        {[
          ["KeyW", "向前"],
          ["KeyA", "向左"],
          ["KeyS", "向后"],
          ["KeyD", "向右"],
          ["Space", "跳跃"],
        ].map(([code, label]) => (
          <button
            key={code}
            disabled={!ready}
            className="place-move"
            aria-label={label}
            onPointerDown={(e) => {
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              keys.add(code!);
              if (code === "Space") jump.current = true;
            }}
            onClick={(e) => {
              if (e.detail === 0 && code === "Space") jump.current = true;
            }}
            onPointerUp={() => keys.delete(code!)}
            onPointerCancel={() => keys.delete(code!)}
            onLostPointerCapture={() => keys.delete(code!)}
          >
            {label}
          </button>
        ))}
      </nav>
      <footer>
        方向键 / WASD 行走 · 空格跳跃 · 拖动旋转视角 ·
        这里可以自由漫游，暂不开放布置；点击木门也可回家
      </footer>
    </main>
  );
}
export default function PhysicsPlace() {
  const { sceneId } = useParams(),
    activity = useActivity();
  const [loaded, setLoaded] = useState<{
      place: PlaceConfig;
      avatar: AvatarConfig;
    } | null>(null),
    [error, setError] = useState(""),
    [attempt, retry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoaded(null);
    setError("");
    void Promise.all([
      api<{ place: unknown }>(
        `/physics/activities/places/${encodeURIComponent(sceneId ?? "")}`,
        {
          method: "POST",
          body: JSON.stringify({ accountId: activity.user.id }),
        },
      ),
      api(`/physics/avatar?accountId=${activity.user.id}`),
    ])
      .then(([feed, profile]) => {
        const place = placeSchema.parse(feed.place);
        if (!place)
          throw new Error("这处小天地尚未安装到你的账号，或已停止发布。");
        const avatar = avatarProfileSchema.parse(profile).avatar;
        if (active) setLoaded({ place, avatar });
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [sceneId, activity.user.id, attempt]);
  if (!loaded)
    return (
      <main className="physics-playground physics-lobby">
        <Link to={activity.returnTo}>返回家园</Link>
        <p role={error ? "alert" : "status"}>
          {error || "正在读取已安装的小天地…"}
        </p>
        {error && <button onClick={() => retry((n) => n + 1)}>重新读取</button>}
      </main>
    );
  return (
    <Visit key={`${activity.user.id}:${sceneId}:${attempt}`} {...loaded} />
  );
}
