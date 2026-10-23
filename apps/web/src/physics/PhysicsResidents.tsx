import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Group } from "three";
import { terrainHeightAt, type PhysicsTerrainTile } from "@island/contracts";
import { random, residents, type Resident } from "@island/world-core";
import {
  AnimalMesh,
  type AnimalAction,
  type AnimalAnim,
} from "../animals/AnimalMesh";
import { dialogue } from "../dialogue/store";

const speeds: Record<Resident["species"], number> = {
  panda: 1.7,
  giraffe: 1.3,
  wolf: 2.3,
  fox: 1.8,
};
const idleAction = (prefer: Resident["prefer"]): AnimalAction =>
  prefer === "bench"
    ? "rest"
    : prefer === "water"
      ? "drink"
      : prefer === "tree"
        ? "browse"
        : "sniff";

function groundAt(terrain: PhysicsTerrainTile[], x: number, z: number) {
  let best: number | undefined;
  for (const tile of terrain) {
    const h = terrainHeightAt(tile, x, z);
    if (h !== undefined && (best === undefined || h > best)) best = h;
  }
  return best ?? 0;
}

function lerpAngle(from: number, to: number, t: number) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < Math.PI) d += Math.PI * 2;
  return from + d * t;
}

/** One resident wandering its home circle on the real physics terrain.
 * Decorative only: no colliders, no registry, no ecology or growth events —
 * the shared deep-chat panel does the talking. */
function ResidentAnimal({
  resident,
  terrain,
  paused,
  player,
  onTalk,
  onNear,
  report,
}: {
  resident: Resident;
  terrain: PhysicsTerrainTile[];
  paused: boolean;
  player(): { x: number; z: number } | null;
  onTalk(): void;
  onNear(within: boolean): void;
  report(x: number, z: number): void;
}) {
  const subject = `resident:${resident.name}`;
  const root = useRef<Group>(null);
  const rng = useMemo(
    () => random(hashText(`physics:${resident.name}`)),
    [resident.name],
  );
  const st = useRef({
    x: resident.home.x + (rng() - 0.5) * 4,
    z: resident.home.z + (rng() - 0.5) * 4,
    yaw: rng() * Math.PI * 2,
    mode: "idle" as "idle" | "walk",
    until: 1 + rng() * 3,
    target: null as { x: number; z: number } | null,
  });
  const anim = useMemo<AnimalAnim>(
    () => ({ phase: 0, moving: false, action: idleAction(resident.prefer), mouth: 0 }),
    [resident.prefer],
  );
  const wasNear = useRef(false);
  useFrame((_, rawDt) => {
    if (paused) return;
    const s = st.current,
      dt = Math.min(rawDt, 0.05),
      me = player();
    if (dialogue.talkingWith(subject)) {
      s.target = null;
      s.mode = "idle";
      s.until = 2;
      if (me)
        s.yaw = lerpAngle(
          s.yaw,
          Math.atan2(me.x - s.x, me.z - s.z),
          1 - Math.exp(-dt * 6),
        );
      anim.moving = false;
      anim.action = "greet";
      anim.phase += dt;
    } else {
      s.until -= dt;
      if (s.mode === "walk" && s.target) {
        const dx = s.target.x - s.x,
          dz = s.target.z - s.z,
          d = Math.hypot(dx, dz);
        if (d < 0.3) {
          s.mode = "idle";
          s.target = null;
          s.until = 2 + rng() * 4;
        } else {
          const step = Math.min(speeds[resident.species] * dt, d);
          s.x += (dx / d) * step;
          s.z += (dz / d) * step;
          s.yaw = lerpAngle(s.yaw, Math.atan2(dx, dz), 1 - Math.exp(-dt * 5));
        }
      } else if (s.until <= 0) {
        const a = rng() * Math.PI * 2,
          r = rng() * resident.home.r;
        s.target = {
          x: resident.home.x + Math.cos(a) * r,
          z: resident.home.z + Math.sin(a) * r,
        };
        s.mode = "walk";
      }
      anim.moving = s.mode === "walk";
      anim.action = anim.moving ? "none" : idleAction(resident.prefer);
      anim.phase += dt * (anim.moving ? 1.9 : 0.8);
    }
    root.current?.position.set(s.x, groundAt(terrain, s.x, s.z), s.z);
    if (root.current) root.current.rotation.y = s.yaw;
    report(s.x, s.z);
    if (me) {
      // Hysteresis keeps the talk chip from flickering as either side moves.
      const distance = Math.hypot(me.x - s.x, me.z - s.z),
        near = distance < (wasNear.current ? 4.6 : 3.4);
      if (near !== wasNear.current) {
        wasNear.current = near;
        onNear(near);
      }
    } else if (wasNear.current) {
      wasNear.current = false;
      onNear(false);
    }
  });
  return (
    <group
      ref={root}
      onClick={(e) => {
        if (paused || e.delta > 5) return;
        e.stopPropagation();
        onTalk();
      }}
    >
      <AnimalMesh species={resident.species} anim={anim} />
    </group>
  );
}

function hashText(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** The named residents of one physics scene. Locked rosters (the wolf waits
 *  on a growth unlock that has not migrated yet) simply do not move in. */
export default function PhysicsResidents({
  templateId,
  terrain,
  paused,
  player,
  onTalk,
  onNearChange,
}: {
  templateId: string;
  terrain: PhysicsTerrainTile[];
  paused: boolean;
  player(): { x: number; z: number } | null;
  onTalk(resident: Resident): void;
  /** The first resident currently in talking range, or null. */
  onNearChange(resident: Resident | null): void;
}) {
  const key = templateId.replace(/^core:/, "");
  const near = useRef(new Map<string, Resident>()),
    reported = useRef<Resident | null>(null),
    notify = useRef(onNearChange);
  notify.current = onNearChange;
  const positions = useRef(new Map<string, { x: number; z: number }>()),
    lastPublish = useRef(0);
  const { gl } = useThree();
  // A slow observable trace of who lives where; tests and debugging walk this.
  useFrame(({ clock }) => {
    if (clock.elapsedTime - lastPublish.current < 0.25) return;
    lastPublish.current = clock.elapsedTime;
    const trace = [...positions.current.entries()].map(
      ([name, p]) => `${name}:${p.x.toFixed(1)}:${p.z.toFixed(1)}`,
    );
    gl.domElement.dataset.residents = trace.join("|");
  });
  const roster = residents[key as keyof typeof residents]?.filter(
    (r) => !r.unlockId,
  );
  if (!roster?.length) return null;
  const settle = () => {
    const next = near.current.values().next().value ?? null;
    if (next !== reported.current) {
      reported.current = next;
      notify.current(next);
    }
  };
  return (
    <>
      {roster.map((resident) => (
        <ResidentAnimal
          key={`${key}-${resident.name}`}
          resident={resident}
          terrain={terrain}
          paused={paused}
          player={player}
          onTalk={() => onTalk(resident)}
          report={(x, z) =>
            positions.current.set(resident.name, { x, z })
          }
          onNear={(within) => {
            if (within) near.current.set(resident.name, resident);
            else near.current.delete(resident.name);
            settle();
          }}
        />
      ))}
    </>
  );
}
