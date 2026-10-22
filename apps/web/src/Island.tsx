import RendererCleanup from "./RendererCleanup";
import {
  Component,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
  type ComponentRef,
} from "react";
import {
  Canvas,
  useFrame,
  useThree,
  type ThreeEvent,
} from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import * as T from "three";
import type { WorldSnapshot, Season, IslandEntity } from "@island/contracts";
import {
  groundHeight,
  generateTree,
  random,
  route,
  roadSegments,
  island,
  pond as pondLocation,
  shoreline,
  zoneAt,
  buildings,
  landmarks,
  walkRoute,
  routeLoopLength,
} from "@island/world-core";
import { Plants, Box, palettes } from "./Plants";
import { Districts } from "./Districts";
import {
  WeatherFx,
  weatherWind,
  GrassField,
  grassTint,
} from "./scenes/shared";
import { useFoxModel } from "./scenes/useFox";
import { RemoteLayer } from "./presence/RemoteLayer";
import { FoxEyes, useFoxPet } from "./animals/FoxDressing";
import { PlayerRig } from "./player/Player";
import { moveBus, playerIntent } from "./player/avatar";
import { Residents } from "./animals";
import Collectibles from "./collect/Collectibles";
import { reportAgent, dropAgent, playerAgent } from "./animals/registry";
import { dialogue } from "./dialogue/store";
import { useGrowth } from "./progress/store";

export type Tool = "explore" | "tree" | "flower" | "bench";
export type Focus = { x: number; z: number; stamp: number } | null;
type Props = {
  world: WorldSnapshot;
  tool: Tool;
  focus: Focus;
  cameraReset?: number;
  quality: "auto" | "low" | "high";
  onPlace: (x: number, z: number, kind: "tree" | "flower" | "bench") => void;
  onSelect: (id: string) => void;
  onAsset: (state: string) => void;
  walk?: boolean;
  avatar?: import("./player/avatar").AvatarConfig | null;
  onGate?: (dest: "island" | import("@island/contracts").SubSceneId) => void;
  onNote?: () => void;
};
function terrain(season: Season) {
  const geo = new T.BufferGeometry(),
    vertices: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  const segments = 160,
    rings = 80;
  for (let r = 0; r <= rings; r++)
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2,
        rad = (r / rings) * shoreline(a),
        x = Math.cos(a) * island.radiusX * rad,
        z = Math.sin(a) * island.radiusZ * rad,
        h = groundHeight(x, z);
      vertices.push(x, Math.max(-1.5, h), z);
      const zone = zoneAt({ x, z });
      const c = new T.Color(rad > 0.86 ? "#e6d6ac" : palettes[season].ground);
      if (rad <= 0.86 && season !== "winter") {
        if (zone === "meadow") c.set("#afc78a");
        if (zone === "garden" || zone === "nursery") c.set("#a0b881");
        if (zone === "village") c.set("#bcc49c");
        if (zone === "forest") c.set("#859f70");
        if (h > 18) c.lerp(new T.Color("#a7aa8e"), Math.min(1, (h - 18) / 25));
        if (h > 30)
          c.lerp(new T.Color("#acaca0"), Math.min(0.8, (h - 30) / 14));
      }
      c.multiplyScalar(0.96 + 0.04 * Math.sin(x * 0.2) * Math.cos(z * 0.19));
      colors.push(c.r, c.g, c.b);
      if (r < rings && i < segments) {
        const k = r * (segments + 1) + i;
        indices.push(
          k,
          k + segments + 1,
          k + 1,
          k + 1,
          k + segments + 1,
          k + segments + 2,
        );
      }
    }
  geo.setAttribute("position", new T.Float32BufferAttribute(vertices, 3));
  geo.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}
function roadGeometry() {
  const positions: number[] = [],
    indices: number[] = [];
  const paths = roadSegments;
  for (const path of paths) {
    const a = path[0]!,
      b = path[1]!,
      dx = b.x - a.x,
      dz = b.z - a.z,
      len = Math.hypot(dx, dz),
      steps = Math.ceil(len);
    for (let n = 0; n < steps; n++) {
      const start = positions.length / 3;
      for (const [t, side] of [
        [n / steps, -1],
        [n / steps, 1],
        [(n + 1) / steps, -1],
        [(n + 1) / steps, 1],
      ]) {
        const x = a.x + dx * t! + (dz / len) * 1.35 * side!,
          z = a.z + dz * t! - (dx / len) * 1.35 * side!;
        positions.push(x, groundHeight(x, z) + 0.13, z);
      }
      indices.push(
        start,
        start + 2,
        start + 1,
        start + 1,
        start + 2,
        start + 3,
      );
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}
function Ground({ world, tool, onPlace, onSelect }: Props) {
  const geometry = useMemo(
      () => terrain(world.environment.season),
      [world.environment.season],
    ),
    road = useMemo(roadGeometry, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => road.dispose(), [road]);
  return (
    <>
      <mesh
        geometry={geometry}
        receiveShadow
        onClick={(e: ThreeEvent<MouseEvent>) => {
          if (e.delta > 5) return;
          if (tool === "explore") {
            if (playerIntent.active) {
              e.stopPropagation();
              moveBus.send(e.point.x, e.point.z);
              return;
            }
            if (zoneAt({ x: e.point.x, z: e.point.z }) === "garden") {
              e.stopPropagation();
              onSelect("garden");
            }
            return;
          }
          e.stopPropagation();
          onPlace(e.point.x, e.point.z, tool);
        }}
      >
        <meshStandardMaterial vertexColors roughness={1} side={T.DoubleSide} />
      </mesh>
      <mesh geometry={road} receiveShadow>
        <meshStandardMaterial
          color="#dcd1aa"
          roughness={1}
          side={T.DoubleSide}
        />
      </mesh>
    </>
  );
}

const vertex = `varying vec2 vUv;varying vec3 vPosition;void main(){vUv=uv;vPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
function Water({
  pond = false,
  night = false,
}: {
  pond?: boolean;
  night?: boolean;
}) {
  const ref = useRef<T.ShaderMaterial>(null),
    ripple = useRef(new T.Vector3(0, 0, -100));
  const uniforms = useMemo(
    () => ({
      time: { value: 0 },
      night: { value: 0 },
      pond: { value: pond ? 1 : 0 },
      ripple: { value: ripple.current },
    }),
    [pond],
  );
  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.uniforms.time!.value = clock.elapsedTime;
      ref.current.uniforms.night!.value = night ? 1 : 0;
    }
  });
  return (
    <mesh
      scale={
        pond ? [pondLocation.rx * 0.97, pondLocation.rz * 0.97, 1] : [1, 1, 1]
      }
      rotation={[-Math.PI / 2, 0, 0]}
      position={
        pond
          ? [pondLocation.x, pondLocation.level, pondLocation.z]
          : [0, -0.35, 0]
      }
      onClick={(e) => {
        if (!pond || e.delta > 5) return;
        e.stopPropagation();
        ripple.current.set(
          e.uv!.x,
          e.uv!.y,
          ref.current?.uniforms.time?.value ?? 0,
        );
      }}
    >
      <circleGeometry args={pond ? [1, 80] : [1200, 100]} />
      <shaderMaterial
        ref={ref}
        uniforms={uniforms}
        vertexShader={vertex}
        fragmentShader={`varying vec2 vUv;varying vec3 vPosition;uniform float time;uniform float night;uniform float pond;uniform vec3 ripple;void main(){float wave=sin(vPosition.x*${pond ? "20." : "0.16"}+time*.7)*sin(vPosition.y*${pond ? "24." : "0.13"}-time*.45);float small=sin(vPosition.x*${pond ? "68." : "0.8"}+vPosition.y*${pond ? "35." : "0.4"}+time);vec3 color=mix(vec3(.48,.69,.66),vec3(.27,.55,.54),pond);color+=wave*.012+small*.004;float age=time-ripple.z;float d=length(vUv-ripple.xy);float ring=exp(-pow((d-age*.12)*65.,2.))*max(0.,1.-age/5.);color+=ring*.25;float radius=length(vec2(vPosition.x/150.,vPosition.y/125.));if(pond<.5){float foam=smoothstep(.93,1.,sin(radius*150.-time))*smoothstep(.98,1.02,radius)*(1.-smoothstep(1.02,1.14,radius));color=mix(color,vec3(.86,.91,.83),foam*.4);}gl_FragColor=vec4(mix(color,color*vec3(.24,.36,.53),night),1.);}`}
        side={T.DoubleSide}
      />
    </mesh>
  );
}

function roofGeometry() {
  const g = new T.BufferGeometry();
  g.setAttribute(
    "position",
    new T.Float32BufferAttribute(
      [-1, 0, -1, 1, 0, -1, 0, 1, -1, -1, 0, 1, 1, 0, 1, 0, 1, 1],
      3,
    ),
  );
  g.setIndex([
    0, 2, 1, 3, 4, 5, 0, 3, 5, 0, 5, 2, 2, 5, 4, 2, 4, 1, 0, 1, 4, 0, 4, 3,
  ]);
  g.computeVertexNormals();
  return g;
}
function Building({
  index,
  night,
  onSelect,
}: {
  index: number;
  night: boolean;
  onSelect: Props["onSelect"];
}) {
  const b = buildings[index]!,
    style = b.style,
    roof = useMemo(roofGeometry, []);
  useEffect(() => () => roof.dispose(), [roof]);
  const color = ["#b87856", "#5c7f7b", "#738b72"][style]!;
  return (
    <group
      position={[b.x, groundHeight(b.x, b.z), b.z]}
      onClick={(e) => {
        if (e.delta < 5) {
          e.stopPropagation();
          onSelect(style === 0 || b.id === "atelier" ? "home" : b.id);
        }
      }}
    >
      <Box position={[0, 0.35, 0]} scale={[13, 0.7, 11]} color="#cbbf9d" />
      <Box
        position={[0, 3.7, 0]}
        scale={[10, 6.5, 8]}
        color={style === 2 ? "#a9c0af" : "#f0e4c8"}
      />
      <mesh
        geometry={roof}
        position={[0, 6.9, 0]}
        scale={[6.3, 4.2, 5.1]}
        castShadow
      >
        <meshStandardMaterial
          color={color}
          roughness={0.9}
          side={T.DoubleSide}
        />
      </mesh>
      <Box position={[0, 2.2, 4.06]} scale={[2.1, 4, 0.2]} color="#6b7566" />
      {[-3.1, 3.1].map((x) => (
        <group key={x}>
          <Box
            position={[x, 4.1, 4.08]}
            scale={[1.8, 2.1, 0.2]}
            color={night ? "#f5cc7c" : "#7daba7"}
            emissive={night}
          />
          <Box
            position={[x, 4.1, 4.22]}
            scale={[0.12, 2.1, 0.12]}
            color="#f0e4c8"
          />
        </group>
      ))}
      <Box position={[0, 0.35, 5.5]} scale={[5, 0.7, 3]} color="#b5a17c" />
      {style === 0 && (
        <Box
          position={[3.1, 8.4, -1.5]}
          scale={[1.4, 4, 1.4]}
          color="#a78b74"
        />
      )}
      {style === 2 && (
        <>
          <Box position={[6, 2, -1]} scale={[2.2, 3.5, 6]} color="#94b3a6" />
          <Box
            position={[0, 11.3, 0]}
            scale={[0.15, 2, 0.15]}
            color="#b7b6a2"
          />
        </>
      )}
    </group>
  );
}
function Scenery() {
  const stones = useMemo(() => {
    const rng = random(71);
    return Array.from({ length: 24 }, () => {
      const a = rng() * Math.PI * 2,
        r = 0.9 + rng() * 0.045;
      return {
        x: Math.cos(a) * island.radiusX * r,
        z: Math.sin(a) * island.radiusZ * r,
        s: 0.8 + rng() * 2.4,
      };
    });
  }, []);
  return (
    <>
      {stones.map((r, i) => (
        <mesh
          key={i}
          position={[r.x, groundHeight(r.x, r.z) + r.s * 0.3, r.z]}
          scale={[r.s, r.s * 0.6, r.s * 0.8]}
          castShadow
        >
          <icosahedronGeometry args={[1, 0]} />
          <meshStandardMaterial
            color={i % 2 ? "#b8b9a7" : "#c3c4af"}
            flatShading
          />
        </mesh>
      ))}
      <group position={[8, 1.3, 115]} rotation={[0, -0.28, 0]}>
        {Array.from({ length: 12 }, (_, i) => (
          <Box
            key={i}
            position={[0, 0, i * 1.1]}
            scale={[5, 0.35, 0.9]}
            color="#a78d67"
          />
        ))}
        {[0, 10].flatMap((z) =>
          [-2, 2].map((x) => (
            <Box
              key={`${z}-${x}`}
              position={[x, -1, z]}
              scale={[0.4, 3, 0.4]}
              color="#82755b"
            />
          )),
        )}
      </group>
    </>
  );
}
/** Fox loop distance from the wall clock: speed × elapsed time mod loop. */
const FOX_TROT_SPEED = 1.8;
function clockTrot() {
  const loop = routeLoopLength();
  return (((Date.now() / 1000) * FOX_TROT_SPEED) % loop + loop) % loop;
}
function Fox({ onAsset }: { onAsset: Props["onAsset"] }) {
  const { model, failed } = useFoxModel(),
    group = useRef<T.Group>(null),
    trot = useRef(clockTrot()),
    foxIdle = useRef(false),
    petUntil = useRef(0),
    clockNow = useRef(0),
    foxPet = useFoxPet();
  useEffect(() => {
    onAsset("loading");
  }, [onAsset]);
  useEffect(() => {
    if (model) onAsset("ready");
    else if (failed) onAsset("error");
  }, [model, failed, onAsset]);
  useFrame(({ clock }, rawDt) => {
    if (!group.current) return;
    const dt = Math.min(rawDt, 0.05);
    clockNow.current = clock.elapsedTime;
    foxPet.emoteAge.current += dt;
    // Petting, talking, or simply meeting: the fox stops, faces you and
    // looks around — walking up to it is enough, no chasing required.
    const talking = dialogue.open?.speaker.id === "fox";
    const petting = clock.elapsedTime < petUntil.current;
    const met = playerAgent();
    const meeting =
      !talking &&
      !petting &&
      !!met &&
      Math.hypot(
        met.x - group.current.position.x,
        met.z - group.current.position.z,
      ) < 4;
    if (talking || petting || meeting) {
      if (model?.survey && !foxIdle.current) {
        model.walk?.fadeOut(0.2);
        model.survey.reset().fadeIn(0.2).play();
        foxIdle.current = true;
      }
      const p = met ?? playerAgent();
      if (p)
        group.current.rotation.y = Math.atan2(
          p.x - group.current.position.x,
          p.z - group.current.position.z,
        );
    } else {
      if (foxIdle.current && model?.survey) {
        model.survey.fadeOut(0.25);
        model.walk?.reset().fadeIn(0.25).play();
        foxIdle.current = false;
      }
      // Wall-clock driven: every client (host and visitors) computes the
      // same fox position without syncing a thing. After a pause the fox
      // trots a little faster until it catches up to the clock instead of
      // teleporting ahead.
      const clockAt = clockTrot(),
        loop = routeLoopLength();
      let deficit = (clockAt - trot.current) % loop;
      if (deficit < -loop / 2) deficit += loop;
      if (deficit > loop / 2) deficit -= loop;
      const speed =
        FOX_TROT_SPEED * (1 + Math.min(Math.max(deficit, 0) / 4, 2.5));
      trot.current = (trot.current + speed * dt) % loop;
      const p = walkRoute(trot.current),
        next = walkRoute(trot.current + 0.6);
      group.current.position.set(p.x, groundHeight(p.x, p.z) + 0.2, p.z);
      group.current.rotation.y = Math.atan2(next.x - p.x, next.z - p.z);
    }
    reportAgent("fox", {
      kind: "fox",
      x: group.current.position.x,
      z: group.current.position.z,
      name: "小狐狸",
      yaw: group.current.rotation.y,
      action: talking || petting ? "survey" : "walk",
    });
    model?.mixer.update(Math.min(dt, 0.1));
  });
  useEffect(() => () => dropAgent("fox"), []);
  return (
    <group
      ref={group}
      onClick={(e) => {
        if (!foxPet.pet(e)) return;
        petUntil.current = clockNow.current + 2.6;
      }}
    >
      {model ? (
        <>
          <primitive object={model.scene} />
          <FoxEyes model={model.scene} />
          {foxPet.emote}
        </>
      ) : (
        <group>
          <FoxEyes />
          {foxPet.emote}
          <Box position={[0, 1, 0]} scale={[1.1, 1.3, 2.7]} color="#b87944" />
          <Box
            position={[0, 1.6, 1.6]}
            scale={[0.9, 0.9, 1.1]}
            color="#d89456"
          />
        </group>
      )}
    </group>
  );
}
function Snow() {
  const ref = useRef<T.Points>(null),
    positions = useMemo(() => {
      const rng = random(17);
      return new Float32Array(
        Array.from({ length: 900 }, (_, i) =>
          i % 3 === 1 ? rng() * 70 : (rng() - 0.5) * 300,
        ),
      );
    }, []);
  useFrame((_, dt) => {
    if (!ref.current) return;
    const p = ref.current.geometry.attributes.position!;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) - dt * 2.8;
      p.setY(i, y < 0 ? 70 : y);
    }
    p.needsUpdate = true;
  });
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#f9faf4"
        size={0.5}
        transparent
        opacity={0.75}
        depthWrite={false}
      />
    </points>
  );
}
function Camera({ focus, reset }: { focus: Focus; reset?: number }) {
  const viewportWidth = useThree((s) => s.size.width);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null),
    camera = useThree((s) => s.camera),
    target = useRef(new T.Vector3()),
    destination = useRef(new T.Vector3()),
    moving = useRef(false);
  useEffect(() => {
    target.current.set(
      focus?.x ?? 0,
      focus ? groundHeight(focus.x, focus.z) + 4 : 6,
      focus?.z ?? 0,
    );
    destination.current
      .copy(target.current)
      .add(
        focus
          ? new T.Vector3(45, 46, 59)
          : viewportWidth < 700
            ? new T.Vector3(450, 480, 590)
            : new T.Vector3(220, 210, 285),
      );
    moving.current = true;
  }, [focus, viewportWidth, reset]);
  useFrame((_, dt) => {
    if (!moving.current || !controls.current) return;
    const t = 1 - Math.exp(-dt * 4);
    camera.position.lerp(destination.current, t);
    controls.current.target.lerp(target.current, t);
    controls.current.update();
    if (camera.position.distanceTo(destination.current) < 0.05)
      moving.current = false;
  });
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      target={[0, 0, 0]}
      minDistance={25}
      maxDistance={1100}
      maxPolarAngle={Math.PI * 0.47}
      minPolarAngle={0.15}
      enablePan
      // No damping: release-glide plus the follow camera's per-frame target
      // moves used to fight and read as a shaking view.
      enableDamping={false}
      onStart={() => {
        moving.current = false;
      }}
    />
  );
}
/** A paper note the fox leaves at the plaza: tap it to see today's invite. */
function FoxNote({ onNote }: { onNote: () => void }) {
  const { state, tasks } = useGrowth();
  const note = useRef<T.Group>(null);
  // Kept clear of the floating place labels so it stays clickable.
  const base = groundHeight(3, 76);
  useFrame(({ clock }) => {
    if (note.current) {
      note.current.position.y = base + 2.3 + Math.sin(clock.elapsedTime * 1.6) * 0.25;
      note.current.rotation.y = Math.sin(clock.elapsedTime * 0.8) * 0.4;
    }
  });
  const next = tasks.find((t) => !state.done[t.id]);
  if (!next) return null;
  return (
    <group
      ref={note}
      position={[3, base + 2.3, 76]}
      onClick={(e) => {
        if (e.delta > 5) return;
        e.stopPropagation();
        onNote();
      }}
    >
      <mesh castShadow>
        <boxGeometry args={[0.95, 0.64, 0.06]} />
        <meshStandardMaterial color="#f4ead2" roughness={1} />
      </mesh>
      <mesh position={[0, 0, 0.04]} rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[0.52, 0.52, 0.02]} />
        <meshStandardMaterial color="#e7d9b8" roughness={1} />
      </mesh>
      <mesh position={[0, -0.06, 0.07]}>
        <sphereGeometry args={[0.09, 8, 8]} />
        <meshStandardMaterial
          color="#c2564f"
          emissive="#c2564f"
          emissiveIntensity={0.4}
          roughness={0.9}
        />
      </mesh>
    </group>
  );
}

function Scene(props: Props) {
  const night =
    props.world.environment.hour < 6 || props.world.environment.hour > 19;
  const weather = props.world.environment.weather ?? "sun",
    wet = weather === "rain" || weather === "thunder";
  const angle = ((props.world.environment.hour - 6) / 12) * Math.PI;
  const low =
    props.quality === "low" ||
    (props.quality === "auto" && window.innerWidth < 700);
  const sky = new T.Color(night ? "#152f42" : "#b7d2c5");
  if (wet)
    sky.lerp(new T.Color("#7f8d96"), weather === "thunder" ? 0.5 : 0.32);
  return (
    <>
      <color attach="background" args={[sky]} />
      <fog attach="fog" args={[sky, 1100, 2000]} />
      <ambientLight intensity={night ? 0.5 : 1.2} />
      <hemisphereLight args={["#eaf5e5", "#7b8d6b", night ? 0.6 : 1.8]} />
      <directionalLight
        position={[
          Math.cos(angle) * 120,
          Math.max(22, Math.sin(angle) * 140),
          50,
        ]}
        color={night ? "#b5cfea" : wet ? "#d8dce0" : "#fff0cd"}
        intensity={night ? 0.6 : wet ? 1.4 : 2.6}
        castShadow={!low}
        shadow-mapSize={low ? [512, 512] : [2048, 2048]}
        shadow-camera-left={-180}
        shadow-camera-right={180}
        shadow-camera-top={170}
        shadow-camera-bottom={-170}
        shadow-camera-far={400}
        shadow-bias={-0.001}
        shadow-normalBias={0.1}
      />
      <WeatherFx weather={weather} low={low} span={150} />
      <Water night={night} />
      <Ground {...props} />
      <Water pond night={night} />
      {/* Wild grass: clumped around the island's trees, scattered over
          the inner wilds — never on the shore ring or near buildings. */}
      <GrassField
        low={low}
        tint={grassTint(palettes[props.world.environment.season].ground)}
        count={210}
        spread={[216, 190]}
        seed={2026}
        height={groundHeight}
        anchors={props.world.entities
          .filter((e) => e.kind === "tree")
          .slice(0, 26)
          .map((e) => ({ x: e.x, z: e.z, r: 3.4 }))}
        accept={(x, z) =>
          zoneAt({ x, z }) !== "shore" &&
          landmarks.every((l) => Math.hypot(l.x - x, l.z - z) > 7)
        }
      />
      <Plants
        entities={props.world.entities}
        season={props.world.environment.season}
        low={low}
        wind={weatherWind[weather]}
      />
      {buildings.map((_, i) => (
        <Building key={i} index={i} night={night} onSelect={props.onSelect} />
      ))}
      <Scenery />
      <Districts />
      <Fox onAsset={props.onAsset} />
      <Residents
        scene="island"
        entities={props.world.entities}
        seed={props.world.seed}
        season={props.world.environment.season}
      />
      <Collectibles scene="island" seed={props.world.seed} />
      {props.onNote && <FoxNote onNote={props.onNote} />}
      {props.walk && props.avatar && props.onGate && (
        <PlayerRig scene="island" avatar={props.avatar} entities={props.world.entities} onGate={props.onGate} />
      )}
      {night && !wet && (
        <Stars
          radius={450}
          depth={150}
          count={low ? 600 : 1800}
          factor={26}
          fade
          speed={0.1}
        />
      )}{" "}
      {props.world.environment.season === "winter" && <Snow />}
      <Camera focus={props.focus} reset={props.cameraReset} />
    </>
  );
}
class Boundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="canvas-error">
        <strong>这台设备暂时无法绘制岛屿</strong>
        <p>
          请尝试开启浏览器硬件加速，或使用较新的浏览器。存档与导出功能仍可使用。
        </p>
      </div>
    ) : (
      this.props.children
    );
  }
}
const labelPlaces = landmarks.filter((l) =>
  ["home", "garden", "meadow", "nursery", "mountain", "cave"].includes(l.id),
);
function LabelPositions({
  elements,
}: {
  elements: React.RefObject<(HTMLButtonElement | null)[]>;
}) {
  const point = useMemo(() => new T.Vector3(), []);
  useFrame(({ camera, size }) => {
    labelPlaces.forEach((l, i) => {
      const element = elements.current[i];
      if (!element) return;
      point
        .set(l.x, groundHeight(l.x, l.z) + (l.id === "mountain" ? 9 : 7), l.z)
        .project(camera);
      element.style.visibility =
        point.z < -1 ||
        point.z > 1 ||
        Math.abs(point.x) > 1.1 ||
        Math.abs(point.y) > 1.1
          ? "hidden"
          : "visible";
      element.style.transform = `translate(${((point.x + 1) * size.width) / 2}px,${((1 - point.y) * size.height) / 2}px) translate(-50%,-50%)`;
    });
  });
  return null;
}
export default function Island(props: Props) {
  const labels = useRef<(HTMLButtonElement | null)[]>([]);
  const night =
    props.world.environment.hour < 6 || props.world.environment.hour > 19;
  const low =
    props.quality === "low" ||
    (props.quality === "auto" && window.innerWidth < 700);
  return (
    <Boundary>
      <div style={{ position: "absolute", inset: 0 }}>
        <Canvas
          shadows={!low}
          dpr={low ? 1 : [1, 1.5]}
          camera={{ position: [220, 210, 285], fov: 40, near: 1, far: 2000 }}
          gl={{
            antialias: !low,
            powerPreference: low ? "low-power" : "high-performance",
          }}
          onCreated={({ gl }) => {
            gl.toneMapping = T.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1.05;
          }}
        >
          <Scene {...props} />
          <LabelPositions elements={labels} />
          {/* Remote players render in the canvas itself, so co-presence
              survives switching back to orbit (non-walking) view. */}
          <RemoteLayer scene="island" />
          <RendererCleanup/>
        </Canvas>
        <div className="scene-labels">
          {labelPlaces.map((l, i) => (
            <button
              key={l.id}
              ref={(el) => {
                labels.current[i] = el;
              }}
              className={`world-label ${night ? "dark" : ""}`}
              title={`进入${l.id === "cave" ? "星光秘境" : l.name}`}
              onClick={() => props.onSelect(l.id)}
            >
              <span />
              {l.id === "cave" ? "星光秘境" : l.name}
              <small aria-hidden="true">进入</small>
            </button>
          ))}
        </div>
      </div>
    </Boundary>
  );
}
