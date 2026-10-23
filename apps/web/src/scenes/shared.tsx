import RendererCleanup from "../RendererCleanup";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import {
  Canvas,
  useFrame,
  useThree,
  type ThreeEvent,
} from "@react-three/fiber";
import type { BuildingEditor } from "../building/types";
import { OrbitControls, Stars } from "@react-three/drei";
import * as T from "three";
import type { SubSceneId, Weather, WorldSnapshot } from "@island/contracts";
import { random } from "@island/world-core";
import type { Tool } from "../Island";
import { moveBus, playerIntent, type AvatarConfig } from "../player/avatar";
import { RemoteLayer } from "../presence/RemoteLayer";
import { playerAgent } from "../animals/registry";
import { acquireStorm, onStormFlash } from "../storm";
import { swayingMaterial } from "../Plants";

export type SceneProps = {
  unknownSnapshot?: WorldSnapshot;
  building?: BuildingEditor;
  onDevicePositions?: (
    points: import("../building/DeviceLabels").DeviceScreenPoint[],
  ) => void;
  onDevice?: (id: string) => void;
  world: WorldSnapshot;
  tool: Tool;
  low: boolean;
  reset: number;
  onPlace: (x: number, z: number, kind: "tree" | "flower" | "bench") => void;
  onExit: () => void;
  /** Owner-side procedural exploration, outside editable room snapshots. */
  onExplore?: () => void;
  /** Owner activity menu requests the park guide; visitors use its inline toggle. */
  guideRequest?: number;
  /** Avatar walking: when set with `avatar`, a resident walks this room. */
  walk?: boolean;
  avatar?: AvatarConfig | null;
  onGate?: (dest: "island" | SubSceneId) => void;
  /** Library only: opens the reading shelf. */
  onRead?: () => void;
  /** Library only: opens the lesson panel straight at one book. */
  onOpenBook?: (bookId: string) => void;
  /** Library only: summons the tutor (lesson panel with chat). */
  onTutor?: () => void;
};

export function isNight(hour: number) {
  return hour < 6 || hour > 19;
}

/** Weather visuals moved to their own module so the physics rooms can share
 * them without importing legacy world state. */
import { WeatherFx } from "./weather-fx";
export { weatherWind, Rain, ThunderFlash, WindStreaks, WeatherFx } from "./weather-fx";

type SkyRigProps = {
  hour: number;
  low: boolean;
  sky: { day: string; night: string };
  fog: [number, number];
  hemi?: string;
  ambient?: [number, number];
  sun?: [number, number];
  shadowHalf?: number;
  stars?: number;
  forceNight?: boolean;
  weather?: Weather;
};
/** Day/night light rig with weather moods; defaults reproduce the garden. */
export function SkyRig({
  hour,
  low,
  sky,
  fog,
  hemi = "#708561",
  ambient = [1.3, 0.45],
  sun = [2.5, 0.5],
  shadowHalf = 65,
  stars = 0,
  forceNight = false,
  weather = "sun",
}: SkyRigProps) {
  const night = forceNight || isNight(hour);
  const angle = ((hour - 6) / 12) * Math.PI;
  const wet = weather === "rain" || weather === "thunder";
  const gloom = weather === "thunder" ? 0.55 : wet ? 0.35 : 0;
  const mood = useMemo(() => {
    const grey = new T.Color(night ? "#2c3a47" : "#93a1ab");
    return {
      sky: new T.Color(night ? sky.night : sky.day).lerp(grey, gloom),
      sun: wet ? sun[0] * 0.5 : weather === "wind" ? sun[0] * 0.85 : sun[0],
    };
  }, [sky, night, gloom, sun, weather, wet]);
  return (
    <>
      <color attach="background" args={[mood.sky]} />
      <fog attach="fog" args={[mood.sky, fog[0], fog[1]]} />
      <ambientLight
        intensity={night ? ambient[1] : wet ? ambient[0] * 0.8 : ambient[0]}
      />
      <hemisphereLight args={["#f0f3d7", hemi, night ? 0.7 : 1.4]} />
      <directionalLight
        position={[
          Math.cos(angle) * 65,
          Math.max(18, Math.sin(angle) * 85),
          35,
        ]}
        intensity={night ? sun[1] : mood.sun}
        color={night ? "#afcbdf" : wet ? "#d8dce0" : "#fff1ce"}
        castShadow={!low}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-shadowHalf}
        shadow-camera-right={shadowHalf}
        shadow-camera-top={shadowHalf}
        shadow-camera-bottom={-shadowHalf}
        shadow-camera-far={220}
        shadow-normalBias={0.05}
      />
      <WeatherFx weather={weather} low={low} />
      {/* drei's star shader divides point size by twice the distance, so rooms
          need a large factor to keep stars visible on screen. */}
      {night && stars > 0 && !wet && (
        <Stars
          radius={170}
          depth={80}
          count={low ? Math.min(600, stars) : stars}
          factor={18}
          fade
        />
      )}
    </>
  );
}

/** Orbit camera shared by every room: same framing, wider on narrow screens. */
export function SceneFrame({
  reset,
  position,
  target = [0, 0, -2],
  min = 18,
  max = 340,
  zoom = 2,
}: {
  reset: number;
  position: [number, number, number];
  target?: [number, number, number];
  min?: number;
  max?: number;
  zoom?: number;
}) {
  const camera = useThree((s) => s.camera),
    width = useThree((s) => s.size.width);
  const controls = useRef<any>(null);
  useEffect(() => {
    const scale = width < 700 ? zoom : 1;
    camera.position.set(
      position[0] * scale,
      position[1] * scale,
      position[2] * scale,
    );
    controls.current?.target.set(...target);
    controls.current?.update();
  }, [camera, width, reset]);
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      minDistance={min}
      maxDistance={max}
      maxPolarAngle={Math.PI * 0.47}
      target={target}
      // No damping: with it, releases glide and fight the follow camera's
      // per-frame target moves, which reads as a shaking view.
      enableDamping={false}
    />
  );
}

export function SceneCanvas({
  low,
  position,
  fov = 42,
  scene,
  children,
}: {
  low: boolean;
  position: [number, number, number];
  fov?: number;
  /** Which room this canvas shows; remote players render inside it so
   *  co-presence works even in orbit (non-walking) mode. */
  scene?: "island" | SubSceneId | (string & {});
  children: ReactNode;
}) {
  return (
    <Canvas
      shadows={!low}
      dpr={low ? 1 : [1, 1.5]}
      camera={{ position, fov, near: 0.3, far: 2000 }}
      gl={{
        antialias: !low,
        powerPreference: low ? "low-power" : "high-performance",
      }}
      onCreated={({ gl }) => {
        gl.toneMapping = T.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
      }}
    >
      <RendererCleanup />
      {children}
      {scene && <RemoteLayer scene={scene} />}
    </Canvas>
  );
}

/**
 * One grass tuft: four crossed blades that taper to a tip, so a tuft
 * reads as grass from every side instead of a flat rectangle strip that
 * vanishes edge-on. Blades lean outwards a touch for a soft clump shape.
 */
function createGrassTuftGeometry() {
  const positions: number[] = [],
    normals: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  const heightSeed = [1.0, 0.8, 0.9, 0.7];
  for (let b = 0; b < 4; b++) {
    // Spread the blade planes roughly 45° apart, never in line.
    const angle = (b / 4) * Math.PI + 0.4,
      dx = Math.cos(angle),
      dz = Math.sin(angle),
      px = -dz,
      pz = dx,
      h = 1.55 * heightSeed[b]!,
      w0 = 0.22,
      w1 = 0.025,
      lean = 0.18,
      base = positions.length / 3;
    positions.push(
      px * -w0 * 0.5,
      0,
      pz * -w0 * 0.5,
      px * w0 * 0.5,
      0,
      pz * w0 * 0.5,
      px * w1 * 0.5 + dx * lean * h,
      h,
      pz * w1 * 0.5 + dz * lean * h,
      px * -w1 * 0.5 + dx * lean * h,
      h,
      pz * -w1 * 0.5 + dz * lean * h,
    );
    const nx = dx * 0.82,
      ny = 0.57,
      nz = dz * 0.82; // up-tilted fake normal: soft light on both faces
    for (let i = 0; i < 4; i++) normals.push(nx, ny, nz);
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  g.setAttribute("normal", new T.Float32BufferAttribute(normals, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  return g;
}

/** A soft tuft tint derived from a scene's ground colour. */
export function grassTint(base: string | T.Color): string {
  return new T.Color(base).lerp(new T.Color("#54855e"), 0.45).getStyle();
}

/**
 * A field of instanced grass tufts bending with the shared wind — the
 * meadow's signature look, reusable by every scene. Tufts scatter over
 * `spread`, optionally clustered around `anchors`, dropped wherever
 * `accept` refuses, and follow `height` on non-flat ground.
 */
export function GrassField({
  low,
  tint,
  count,
  spread,
  seed = 239,
  height,
  accept,
  anchors,
  scale = 1,
}: {
  low: boolean;
  tint: string;
  count: number;
  /** Full scatter rectangle [width, depth]; keep margins in the caller. */
  spread: [number, number];
  seed?: number;
  height?: (x: number, z: number) => number;
  accept?: (x: number, z: number) => boolean;
  anchors?: Array<{ x: number; z: number; r: number }>;
  scale?: number;
}) {
  const blades = useRef<T.InstancedMesh>(null);
  // A gentle 0.13 amplitude: tufts nod a few degrees, never lean over.
  const material = useMemo(
    () =>
      swayingMaterial(
        { color: "#ffffff", roughness: 1, side: T.DoubleSide },
        0.13,
        0.02,
      ),
    [],
  );
  const geometry = useMemo(() => createGrassTuftGeometry(), []);
  const { matrices, colors } = useMemo(() => {
    const rng = random(seed),
      dummy = new T.Object3D(),
      matrices: T.Matrix4[] = [],
      colors: T.Color[] = [],
      base = new T.Color(tint),
      total = Math.round(count * (low ? 0.45 : 1)),
      settle = (x: number, z: number) => {
        dummy.position.set(x, height ? height(x, z) : 0, z);
        dummy.rotation.set(
          (rng() - 0.5) * 0.1,
          rng() * Math.PI,
          (rng() - 0.5) * 0.1,
        );
        dummy.scale.set(
          (0.85 + rng() * 0.5) * scale,
          (0.7 + rng() * 0.75) * scale,
          (0.85 + rng() * 0.5) * scale,
        );
        dummy.updateMatrix();
        matrices.push(dummy.matrix.clone());
        // Two or three visual shade tiers keep the field from reading flat.
        colors.push(
          base
            .clone()
            .offsetHSL(0, 0, (rng() < 0.5 ? -1 : 1) * (0.02 + rng() * 0.05)),
        );
      };
    for (let i = 0; i < total; i++) {
      // Up to six attempts: rejected spots (water, walls, platform edges)
      // simply don't grow grass.
      for (let tries = 0; tries < 6; tries++) {
        let x: number, z: number;
        if (anchors && rng() < 0.34) {
          const a = anchors[Math.floor(rng() * anchors.length)]!,
            ang = rng() * Math.PI * 2;
          x = a.x + Math.cos(ang) * rng() * a.r;
          z = a.z + Math.sin(ang) * rng() * a.r;
        } else {
          x = (rng() - 0.5) * spread[0];
          z = (rng() - 0.5) * spread[1];
        }
        if (!accept || accept(x, z)) {
          settle(x, z);
          break;
        }
      }
    }
    return { matrices, colors };
  }, [low, tint, count, spread, seed, height, accept, anchors, scale]);
  useEffect(() => {
    if (!blades.current) return;
    matrices.forEach((m, i) => blades.current!.setMatrixAt(i, m));
    colors.forEach((c, i) => blades.current!.setColorAt(i, c));
    blades.current.instanceMatrix.needsUpdate = true;
    if (blades.current.instanceColor)
      blades.current.instanceColor.needsUpdate = true;
    blades.current.computeBoundingSphere();
  }, [matrices, colors]);
  return (
    <instancedMesh
      ref={blades}
      args={[undefined, undefined, matrices.length]}
      castShadow
    >
      <primitive object={geometry} attach="geometry" />
      <primitive object={material} attach="material" />
    </instancedMesh>
  );
}

export function Butterflies({
  low,
  count = 12,
  center = [0, 12],
  spread = [27, 15],
  colors = ["#e7bb7d", "#d8b6d1"],
  height = 2.5,
}: {
  low: boolean;
  count?: number;
  center?: [number, number];
  spread?: [number, number];
  colors?: [string, string];
  height?: number;
}) {
  const swarm = useRef<T.Group>(null);
  const anchor = useRef({ x: center[0], z: center[1] });
  useFrame(({ clock }) => {
    // Butterflies drift toward the walking resident — the world says hello.
    const player = playerAgent();
    if (player) {
      anchor.current.x += (player.x - anchor.current.x) * 0.02;
      anchor.current.z += (player.z - anchor.current.z) * 0.02;
    } else {
      anchor.current.x += (center[0] - anchor.current.x) * 0.02;
      anchor.current.z += (center[1] - anchor.current.z) * 0.02;
    }
    const ax = anchor.current.x,
      az = anchor.current.z;
    swarm.current?.children.forEach((bug, i) => {
      const t = clock.elapsedTime * 0.3 + i * 2.4;
      bug.position.set(
        ax + Math.sin(t) * spread[0],
        height + Math.sin(t * 2 + i) * 1.3,
        az + Math.cos(t * 0.7 + i) * spread[1],
      );
      bug.rotation.y = t;
      bug.children.forEach((wing, n) => {
        wing.rotation.z = (n ? 1 : -1) * (0.4 + Math.sin(t * 35) * 0.8);
      });
    });
  });
  return (
    <group ref={swarm}>
      {Array.from({ length: low ? Math.ceil(count / 2) : count }, (_, i) => (
        <group key={i}>
          {[-1, 1].map((side) => (
            <mesh
              key={side}
              position={[side * 0.24, 0, 0]}
              scale={[0.42, 0.08, 0.58]}
            >
              <sphereGeometry args={[1, 6, 4]} />
              <meshStandardMaterial color={i % 2 ? colors[0] : colors[1]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/** Click-to-place handler every room ground reuses. In walk mode, explore
 *  taps send the resident walking instead of being ignored. */
export function usePlacer(tool: Tool, onPlace: SceneProps["onPlace"]) {
  return (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 5) return;
    if (tool === "explore") {
      if (playerIntent.active) {
        e.stopPropagation();
        moveBus.send(e.point.x, e.point.z);
      }
      return;
    }
    e.stopPropagation();
    onPlace(e.point.x, e.point.z, tool);
  };
}

/** Explore-mode click on a room's exit landmark walks back to the island. */
export function exitClick(tool: Tool, onExit: () => void) {
  return (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 5) return;
    e.stopPropagation();
    if (tool === "explore") onExit();
  };
}
