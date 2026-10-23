import ForageMesh from "./ForageMesh";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as T from "three";
import {
  forageCatalog,
  forageSpots,
  type ForageKind,
  type ForageSpot,
} from "@island/world-core";
import { playerAgent } from "../animals/registry";
import { openCard } from "../cards/store";
import { specFor } from "../places/specs";
import { emitGrowth, growth } from "../progress/store";
import { pickupChime } from "./chime";

/** How long a picked spot stays empty before it refills (per session). */
const RESPAWN_MS = 180_000;
const PICK_RADIUS = 1.15;
const BURST_MS = 700;

/** The pick-up moment: a little ring of sparks that scatters upward. */
function PickupBurst({
  x,
  z,
  y,
  color,
  born,
}: {
  x: number;
  z: number;
  y: number;
  color: string;
  born: number;
}) {
  const group = useRef<T.Group>(null),
    sparks = useRef<T.Mesh[]>([]);
  const angles = useMemo(
    () => Array.from({ length: 6 }, (_, i) => (i / 6) * Math.PI * 2),
    [],
  );
  useFrame(({ clock }) => {
    const t = Math.min(1, (clock.elapsedTime - born) / (BURST_MS / 1000));
    if (group.current) {
      group.current.position.y = y + t * 0.9;
      group.current.rotation.y = t * 2.4;
    }
    for (const m of sparks.current) {
      m.scale.setScalar(Math.max(0.001, 1 - t));
      const material = m.material as T.MeshStandardMaterial;
      material.opacity = 1 - t;
    }
  });
  return (
    <group ref={group} position={[x, y, z]}>
      {angles.map((a, i) => (
        <mesh
          key={i}
          ref={(m) => {
            if (m) sparks.current[i] = m;
          }}
          position={[Math.cos(a) * 0.22, 0, Math.sin(a) * 0.22]}
        >
          <sphereGeometry args={[0.045, 6, 5]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.7}
            transparent
            opacity={1}
          />
        </mesh>
      ))}
    </group>
  );
}

/** One little forage thing, hovering above the ground. */

/**
 * The scene's forage: deterministic per world seed, auto-picked by walking
 * close, refilling after a while. Counts and first-find stars go to the
 * growth journal, which the backpack panel reads.
 */
export default function Collectibles({
  scene,
  seed,
  size = 60,
}: {
  scene: "island" | (string & {});
  seed: number;
  size?: number;
}) {
  const spec = specFor(scene);
  const spots = useMemo(
    () => forageSpots(scene, seed, size).filter((s) => spec.walkable(s.x, s.z)),
    [scene, seed, size, spec],
  );
  const names = useMemo(
    () =>
      Object.fromEntries(forageCatalog.map((c) => [c.kind, c.name])) as Record<
        string,
        string
      >,
    [],
  );
  const colors = useMemo(
    () =>
      Object.fromEntries(forageCatalog.map((c) => [c.kind, c.color])) as Record<
        string,
        string
      >,
    [],
  );
  const [taken, setTaken] = useState<Record<string, number>>({});
  const [bursts, setBursts] = useState<
    {
      id: string;
      x: number;
      z: number;
      y: number;
      color: string;
      born: number;
    }[]
  >([]);
  const groups = useRef(new Map<string, T.Group>());
  const lastCheck = useRef(0);

  useEffect(() => {
    // Refills are checked lazily on render ticks, not by a timer.
    const id = window.setInterval(() => {
      const now = Date.now();
      setTaken((prev) => {
        const next: Record<string, number> = {};
        let changed = false;
        for (const [id, at] of Object.entries(prev))
          if (now - at < RESPAWN_MS) next[id] = at;
          else changed = true;
        return changed ? next : prev;
      });
    }, 5000);
    return () => window.clearInterval(id);
  }, []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    let i = 0;
    for (const spot of spots) {
      const g = groups.current.get(spot.id);
      if (g) {
        g.rotation.y = t * 0.8 + i;
        g.position.y =
          spec.height(spot.x, spot.z) + 0.3 + Math.sin(t * 2 + i * 1.7) * 0.07;
      }
      i++;
    }
    if (t - lastCheck.current < 0.2) return;
    lastCheck.current = t;
    const player = playerAgent();
    if (!player) return;
    const now = Date.now();
    for (const spot of spots) {
      if (taken[spot.id]) continue;
      if (Math.hypot(player.x - spot.x, player.z - spot.z) < PICK_RADIUS) {
        growth.collect(spot.kind, names[spot.kind] ?? spot.kind);
        emitGrowth({ type: "collect.picked", detail: spot.kind });
        pickupChime(spot.kind);
        const burst = {
          id: spot.id,
          x: spot.x,
          z: spot.z,
          y: spec.height(spot.x, spot.z) + 0.3,
          color: colors[spot.kind] ?? "#efe3cf",
          born: clock.elapsedTime,
        };
        setBursts((prev) => [...prev, burst]);
        window.setTimeout(
          () => setBursts((prev) => prev.filter((b) => b.id !== burst.id)),
          BURST_MS,
        );
        setTaken((prev) => ({ ...prev, [spot.id]: now }));
        break;
      }
    }
  });

  if (!spots.length) return null;
  return (
    <>
      {spots.map((spot: ForageSpot) =>
        taken[spot.id] ? null : (
          <group
            key={spot.id}
            onClick={(e) => {
              // A camera drag also ends in a click; only real taps open cards.
              if (e.delta > 5) return;
              e.stopPropagation();
              openCard(`forage:${spot.kind}`);
            }}
            ref={(g) => {
              if (g) groups.current.set(spot.id, g);
              else groups.current.delete(spot.id);
            }}
            position={[spot.x, spec.height(spot.x, spot.z) + 0.3, spot.z]}
          >
            <ForageMesh kind={spot.kind} />
          </group>
        ),
      )}
      {bursts.map((b) => (
        <PickupBurst
          key={b.id}
          x={b.x}
          z={b.z}
          y={b.y}
          color={b.color}
          born={b.born}
        />
      ))}
    </>
  );
}
