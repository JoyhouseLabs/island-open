import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ElementRef,
  type MutableRefObject,
} from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as T from "three";
import {
  PhysicsRegionWorld,
  canReachForage,
  characterProfile,
} from "@island/physics-core";
import type { PhysicsForageSpot } from "@island/contracts";
import {
  CHUNK_SIZE,
  chunkAt,
  chunkKey,
  wildRing,
  wildPhysicsRegion,
  wildHeight,
  type WildStream,
  type ChunkCoord,
} from "@island/world-core";
import { AvatarMesh, type AvatarAnim } from "../player/AvatarModel";
import type { AvatarConfig } from "../player/avatar";
const travelLimit = 999997 * CHUNK_SIZE; // Keep the entire loaded/observed ring inside journal coordinate bounds.
export type ExplorePosition = { x: number; z: number; y?: number };
export type ExploreInput = {
  keys: Set<string>;
  touch: string;
  sprint: boolean;
  jump: boolean;
};
export default function PhysicsWalker({
  seed,
  stream,
  center,
  revision,
  position,
  input,
  avatar,
  forageSpots,
  onPickup,
  report,
  onStatus,
  paused = false,
}: {
  seed: number;
  stream: WildStream;
  center: ChunkCoord;
  revision: number;
  position: MutableRefObject<ExplorePosition>;
  input: MutableRefObject<ExploreInput>;
  avatar: AvatarConfig;
  /** Forage offers already shifted into this walker's chunk-local frame. */
  forageSpots?: PhysicsForageSpot[];
  onPickup?(spot: PhysicsForageSpot): void;
  report(p: ExplorePosition): void;
  onStatus(ready: boolean, error?: string): void;
  paused?: boolean;
}) {
  const body = useRef<T.Group>(null),
    controls = useRef<ElementRef<typeof OrbitControls>>(null),
    origin = useRef(center),
    viewOrigin = useRef(center),
    physics = useRef<PhysicsRegionWorld | null>(null),
    initialized = useRef(false),
    ready = useRef(false),
    lastSafe = useRef({ ...position.current }),
    timer = useRef(0);
  const [generation, setGeneration] = useState(0);
  const { camera, gl } = useThree();
  const initialTarget = useMemo(
    () =>
      new T.Vector3(
        position.current.x - origin.current.x * CHUNK_SIZE,
        wildHeight(seed, position.current.x, position.current.z) + 1.4,
        position.current.z - origin.current.z * CHUNK_SIZE,
      ),
    [seed, position],
  );
  const anim = useMemo<AvatarAnim>(() => ({ phase: 0, moving: false }), []);
  useEffect(() => {
    let cancelled = false,
      created: PhysicsRegionWorld | undefined;
    initialized.current = false;
    ready.current = false;
    lastSafe.current = { ...position.current };
    onStatus(false);
    const p = position.current;
    if (Math.abs(p.x) > travelLimit || Math.abs(p.z) > travelLimit) {
      onStatus(false, "当前位置超过探索范围，请返回营地");
      return;
    }
    void PhysicsRegionWorld.create({
      x: p.x - origin.current.x * CHUNK_SIZE,
      y: 30,
      z: p.z - origin.current.z * CHUNK_SIZE,
    })
      .then((world) => {
        if (cancelled) {
          world.dispose();
          return;
        }
        created = world;
        physics.current = world;
        setGeneration((v) => v + 1);
      })
      .catch((error) => {
        if (!cancelled) onStatus(false, (error as Error).message);
      });
    return () => {
      cancelled = true;
      physics.current = null;
      ready.current = false;
      created?.dispose();
    };
  }, [seed, onStatus, position]);
  useLayoutEffect(() => {
    const world = physics.current;
    if (!world) return;
    try {
      const dx = (center.x - origin.current.x) * CHUNK_SIZE,
        dz = (center.z - origin.current.z) * CHUNK_SIZE;
      if (dx || dz) world.rebase({ x: dx, y: 0, z: dz });
      origin.current = center;
      world.retain(
        new Set([...stream.chunks.values()].map((c) => `wild:${c.x}:${c.z}`)),
      );
      for (const chunk of stream.chunks.values())
        if (!world.has(`wild:${chunk.x}:${chunk.z}`))
          world.mount(wildPhysicsRegion(seed, chunk, center));
      world.refreshQueries();
      ready.current = wildRing(center, 1).every((c) =>
        world.has(`wild:${c.x}:${c.z}`),
      );
      if (ready.current && !initialized.current) {
        world.placeOnSurface(
          position.current.x - center.x * CHUNK_SIZE,
          position.current.z - center.z * CHUNK_SIZE,
        );
        initialized.current = true;
      }
      onStatus(ready.current);
    } catch (error) {
      ready.current = false;
      onStatus(false, (error as Error).message);
    }
  }, [generation, revision, center, seed, stream, position, onStatus]);
  useLayoutEffect(() => {
    const dx = (center.x - viewOrigin.current.x) * CHUNK_SIZE,
      dz = (center.z - viewOrigin.current.z) * CHUNK_SIZE;
    camera.position.x -= dx;
    camera.position.z -= dz;
    if (controls.current) {
      controls.current.target.x -= dx;
      controls.current.target.z -= dz;
    }
    viewOrigin.current = center;
  }, [center, camera]);
  useFrame((_, delta) => {
    const world = physics.current;
    if (!world) return;
    gl.domElement.dataset.physicsRegions = String(world.stats.regions);
    gl.domElement.dataset.physicsColliders = String(world.stats.colliders);
    gl.domElement.dataset.physicsTick = String(world.runtime.tick);
    if (!ready.current || document.hidden || paused) {
      world.runtime.pauseClock();
      return;
    }
    const old = world.player.position(),
      p = position.current;
    const currentChunk = chunkAt(
      old.x + origin.current.x * CHUNK_SIZE,
      old.z + origin.current.z * CHUNK_SIZE,
    );
    if (
      !wildRing(currentChunk, 1).every((c) => world.has(`wild:${c.x}:${c.z}`))
    ) {
      world.runtime.pauseClock();
      return;
    }
    const held = (key: string) =>
      input.current.keys.has(key) || input.current.touch === key;
    const dx =
        Number(held("KeyD") || held("ArrowRight")) -
        Number(held("KeyA") || held("ArrowLeft")),
      dz =
        Number(held("KeyS") || held("ArrowDown")) -
        Number(held("KeyW") || held("ArrowUp"));
    const target = controls.current?.target,
      angle = target
        ? Math.atan2(camera.position.x - target.x, camera.position.z - target.z)
        : 0;
    const length = Math.max(1, Math.hypot(dx, dz)),
      x = (dx * Math.cos(angle) + dz * Math.sin(angle)) / length,
      z = (dz * Math.cos(angle) - dx * Math.sin(angle)) / length;
    world.runtime.advance(delta, (dt) =>
      world.player.step(
        {
          x,
          z,
          jump: held("Space") || input.current.jump,
          sprint:
            input.current.sprint || held("ShiftLeft") || held("ShiftRight"),
        },
        dt,
      ),
    );
    let next = world.player.position();
    const globalX = next.x + origin.current.x * CHUNK_SIZE,
      globalZ = next.z + origin.current.z * CHUNK_SIZE;
    if (
      !Number.isFinite(next.y) ||
      next.y < -20 ||
      Math.abs(globalX) > travelLimit ||
      Math.abs(globalZ) > travelLimit
    ) {
      world.placeOnSurface(
        lastSafe.current.x - origin.current.x * CHUNK_SIZE,
        lastSafe.current.z - origin.current.z * CHUNK_SIZE,
      );
      next = world.player.position();
    }
    const feet = next.y - characterProfile.halfHeight - characterProfile.radius;
    p.x = next.x + origin.current.x * CHUNK_SIZE;
    p.z = next.z + origin.current.z * CHUNK_SIZE;
    p.y = feet;
    if (world.player.grounded) lastSafe.current = { ...p };
    body.current?.position.set(next.x, feet + 0.04, next.z);
    if (body.current && (dx || dz)) body.current.rotation.y = Math.atan2(x, z);
    anim.moving = Math.hypot(next.x - old.x, next.z - old.z) > 0.0001;
    anim.phase += Math.min(delta, 0.1);
    camera.position.x += next.x - old.x;
    camera.position.z += next.z - old.z;
    camera.position.y += next.y - old.y;
    controls.current?.target.set(next.x, feet + 1.4, next.z);
    controls.current?.update();
    // Local roaming has no authoritative room, so reach uses the shared rule.
    if (forageSpots?.length && !document.hidden) {
      const reached = forageSpots.find((s) =>
        canReachForage(world.runtime, world.player, s),
      );
      if (reached) onPickup?.(reached);
    }
    gl.domElement.dataset.grounded = String(world.player.grounded);
    gl.domElement.dataset.feetY = feet.toFixed(3);
    timer.current += delta;
    const c = chunkAt(p.x, p.z);
    if (timer.current > 0.2 || chunkKey(c) !== chunkKey(center)) {
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
        target={initialTarget}
        makeDefault
        enablePan={false}
        minDistance={8}
        maxDistance={70}
        maxPolarAngle={Math.PI * 0.47}
      />
    </>
  );
}
