import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";

import type { SubSceneId, IslandEntity } from "@island/contracts";
import { speciesProfiles } from "@island/contracts";
import {
  pond,
  pondShape,
  random,
  type Interest,
  type Resident,
} from "@island/world-core";
import { specFor } from "../places/specs";
import { AnimalMesh, type AnimalAction, type AnimalAnim } from "./AnimalMesh";
import { Emote, type EmoteKind } from "./Emote";
import { nearbyAgents, playerAgent, reportAgent, dropAgent, agentById } from "./registry";
import { activeEncounter } from "./ecologyStore";
import { playVoice } from "./voices";
import { emitGrowth } from "../progress/store";
import { dialogue } from "../dialogue/store";

const actionFor = (prefer: Interest, species: Resident["species"]): AnimalAction => {
  const { behavior } = speciesProfiles[species];
  if (prefer === "bench") return "rest";
  if (prefer === "water") return "drink";
  if (behavior.browse && prefer === behavior.browse) return "browse";
  return "sniff";
};
const emoteFor: Record<AnimalAction, EmoteKind> = {
  none: "sparkle",
  sniff: "sparkle",
  rest: "zzz",
  browse: "note",
  drink: "drop",
  greet: "heart",
  pet: "heart",
};

function lerpAngle(from: number, to: number, t: number) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return from + d * t;
}

type Mode = "idle" | "walk" | "act" | "greet" | "follow" | "chat" | "play";
const chatEmotes = ["heart", "sparkle", "note"] as const;

/**
 * One resident animal: wanders its home, seeks out flowers, trees, benches
 * or water, greets other animals and the player, and can be petted.
 */
export function Animal({
  id,
  resident,
  scene,
  entities,
}: {
  id: string;
  resident: Resident;
  /** Built-in scene, or "place-<id>" for a published place. */
  scene: "island" | SubSceneId | (string & {});
  entities: IslandEntity[];
}) {
  const spec = specFor(scene);
  const root = useRef<any>(null);
  const [emoteKind, setEmoteKind] = useState<EmoteKind | null>(null);
  const emoteAge = useRef(0);
  const rng = useMemo(() => random(hash(resident.name + scene)), [resident.name, scene]);
  const st = useRef({
    x: resident.home.x + (rng() - 0.5) * 4,
    z: resident.home.z + (rng() - 0.5) * 4,
    y: 0,
    yaw: rng() * Math.PI * 2,
    phase: rng() * 10,
    mode: "idle" as Mode,
    until: 1 + rng() * 2,
    target: null as { x: number; z: number } | null,
    meetWith: null as { x: number; z: number } | null,
    /** The companion this one is chatting or playing with, by agent id. */
    partnerId: null as string | null,
    action: "none" as AnimalAction,
    /** The ecology encounter this animal is following, if the current
     *  ten-minute slot scheduled one for it. */
    ecoBehavior: null as "meet" | "chase" | "hide" | null,
    lastMeet: -30,
    lastPlayer: -30,
    followUntil: -1,
    petUntil: -1,
    voiceNext: 0,
    pauseUntil: -1,
  });
  const anim = useRef<AnimalAnim>({ phase: 0, moving: false, action: "none", mouth: 0 });

  useEffect(() => () => dropAgent(id), [id]);

  const showEmote = (kind: EmoteKind) => {
    emoteAge.current = 0;
    setEmoteKind(kind);
  };

  const pickTarget = () => {
    const s = st.current;
    // Water dwellers walk to the pond rim; others visit a favourite object.
    // The main island's pond sits east with a wide unwalkable shore margin,
    // so its rim target is scaled past that margin; the pond scene's basin
    // is pondShape itself.
    if (resident.prefer === "water") {
      const pool =
        scene === "island"
          ? { x: pond.x, z: pond.z, rx: pond.rx + 6.4, rz: pond.rz + 6.4 }
          : pondShape;
      const dx = s.x - pool.x,
        dz = s.z - pool.z,
        k = 1 / Math.hypot(dx / (pool.rx + 1.4), dz / (pool.rz + 1.4));
      return { x: pool.x + dx * k, z: pool.z + dz * k };
    }
    const kind =
      resident.prefer === "flower" || resident.prefer === "grass"
        ? "flower"
        : resident.prefer;
    const near = entities.filter(
      (e) =>
        e.kind === kind &&
        Math.hypot(e.x - resident.home.x, e.z - resident.home.z) <
          resident.home.r + 14,
    );
    if (near.length) {
      const pick = near[Math.floor(rng() * near.length)]!;
      const d = Math.hypot(pick.x - resident.home.x, pick.z - resident.home.z) || 1;
      return {
        x: pick.x + ((resident.home.x - pick.x) / d) * 1.4,
        z: pick.z + ((resident.home.z - pick.z) / d) * 1.4,
      };
    }
    for (let i = 0; i < 6; i++) {
      const a = rng() * Math.PI * 2,
        r = rng() * resident.home.r;
      const x = resident.home.x + Math.cos(a) * r,
        z = resident.home.z + Math.sin(a) * r;
      if (spec.walkable(x, z)) return { x, z };
    }
    return { x: resident.home.x, z: resident.home.z };
  };

  const voiceMouth = useRef<(() => number) | null>(null);
  const callVoice = (hold = false) => {
    playVoice(resident.species, st.current.x, st.current.z, (mouth, duration) => {
      voiceMouth.current = mouth;
      if (hold) petFlag.current = Math.max(petFlag.current, duration);
    });
  };

  const pet = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 5) return;
    e.stopPropagation();
    petFlag.current = 1.8;
    showEmote("heart");
    callVoice(true);
    emitGrowth({ type: "animal.petted", detail: resident.name });
  };
  const petFlag = useRef(0);

  useFrame(({ clock }, rawDt) => {
    const s = st.current,
      dt = Math.min(rawDt, 0.05),
      t = clock.elapsedTime;
    // Sample the audio clock even during petting or dialogue.
    anim.current.mouth = voiceMouth.current?.() ?? 0;
    const speed =
      (s.mode === "play" ? 1.6 : 1) * speciesProfiles[resident.species].behavior.speed;

    // While this animal is the one being talked to, it stands still,
    // faces the player and listens; the walk resumes afterwards.
    if (dialogue.talkingWith(id)) {
      s.target = null;
      s.meetWith = null;
      s.followUntil = -1;
      const p = playerAgent();
      if (p) {
        const want = Math.atan2(p.x - s.x, p.z - s.z);
        s.yaw = lerpAngle(s.yaw, want, 1 - Math.exp(-dt * 6));
      }
      s.phase += dt;
      anim.current.moving = false;
      anim.current.action = "none";
      const ground = spec.height(s.x, s.z);
      s.y += (ground - s.y) * Math.min(1, dt * 10);
      if (root.current) {
        root.current.position.set(s.x, s.y, s.z);
        root.current.rotation.y = s.yaw;
      }
      emoteAge.current += dt;
      reportAgent(id, {
        kind: resident.species,
        x: s.x,
        z: s.z,
        name: resident.name,
        yaw: s.yaw,
        action: s.action,
      });
      return;
    }

    let moving = false;
    let faceX: number | null = null,
      faceZ: number | null = null;

    // Petting overrides everything for a moment of joy.
    if (petFlag.current > 0) {
      petFlag.current -= dt;
      s.action = "pet";
      anim.current.action = "pet";
      const p = playerAgent();
      if (p) {
        faceX = p.x - s.x;
        faceZ = p.z - s.z;
      }
    } else {
      if (s.action === "pet") s.action = "none";
      const player = playerAgent();
      const distPlayer = player
        ? Math.hypot(player.x - s.x, player.z - s.z)
        : Infinity;
      if (player && distPlayer < 5 && t > s.lastPlayer + 14) {
        s.lastPlayer = t;
        showEmote("heart");
        if (rng() < 0.5) {
          callVoice();
        }
        if (rng() < 0.5) s.followUntil = t + 9;
      }
      if (s.followUntil > t && player) {
        if (distPlayer > 11) s.followUntil = -1;
        else if (distPlayer > 3.2) {
          s.mode = "follow";
          s.target = { x: player.x, z: player.z };
          faceX = player.x;
          faceZ = player.z;
        }
      }
      // The ecology slot plan comes first: a scheduled encounter walks both
      // animals to the same spot for a chat, a chase or a hide-and-nap.
      const eco = activeEncounter(id);
      if (eco && (s.mode === "idle" || s.mode === "walk") && t > s.lastMeet + 12) {
        s.lastMeet = t;
        s.ecoBehavior = eco.behavior;
        s.partnerId = eco.behavior === "hide" ? null : eco.partnerId;
        if (eco.behavior === "hide") {
          // Nap behind the nearest tree to the meeting point.
          let best: { x: number; z: number; d: number } | null = null;
          for (const e of entities)
            if (e.kind === "tree") {
              const d = Math.hypot(e.x - eco.at.x, e.z - eco.at.z);
              if (!best || d < best.d) best = { x: e.x, z: e.z, d };
            }
          s.meetWith = null;
          s.target = best
            ? { x: best.x + 1.1, z: best.z + 1.1 }
            : eco.at;
        } else {
          s.meetWith = eco.at;
          s.target = eco.at;
        }
        s.mode = "walk";
      }

      // Seek out a fellow resident for a little meeting.
      if (
        !eco &&
        (s.mode === "idle" || s.mode === "walk") &&
        t > s.lastMeet + 24
      ) {
        const other = nearbyAgents(s.x, s.z, 7, id).find(
          (a) => a.kind !== "player",
        );
        if (other) {
          s.lastMeet = t;
          s.mode = "walk";
          s.meetWith = { x: other.x, z: other.z };
          s.partnerId = other.id;
          s.target = {
            x: (s.x + other.x) / 2,
            z: (s.z + other.z) / 2,
          };
        }
      }

      if (s.mode === "idle" && t > s.until) {
        s.target = pickTarget();
        s.meetWith = null;
        s.mode = "walk";
      }

      if (s.target && s.mode !== "idle" && s.mode !== "act" && s.mode !== "greet") {
        const dx = s.target.x - s.x,
          dz = s.target.z - s.z,
          dist = Math.hypot(dx, dz);
        const arrive = s.meetWith ? 2.6 : 0.7;
        if (dist < arrive) {
          if (s.meetWith) {
            // Meeting a friend becomes a little face-to-face chat.
            s.mode = "chat";
            s.until = t + 4 + rng() * 2;
            s.action = "greet";
            // Staggered per animal, so two voices naturally alternate.
            s.voiceNext = t + 0.2 + rng() * 0.9;
            showEmote("heart");
            emitGrowth({ type: "animal.greeted" });
            faceX = s.meetWith.x;
            faceZ = s.meetWith.z;
          } else {
            s.mode = "act";
            s.until = t + (s.ecoBehavior === "hide" ? 9 : 2.6 + rng() * 2.4);
            s.action =
              s.ecoBehavior === "hide"
                ? "rest"
                : actionFor(resident.prefer, resident.species);
            showEmote(emoteFor[s.action]);
            s.meetWith = null;
          }
          s.target = null;
        } else {
          const vx = dx / dist,
            vz = dz / dist;
          const nx = s.x + vx * speed * dt,
            nz = s.z + vz * speed * dt;
          if (spec.walkable(nx, nz)) {
            s.x = nx;
            s.z = nz;
            moving = true;
          } else if (spec.walkable(nx, s.z)) {
            s.x = nx;
            moving = true;
          } else if (spec.walkable(s.x, nz)) {
            s.z = nz;
            moving = true;
          } else s.target = null;
          faceX = dx;
          faceZ = dz;
        }
      }

      if (s.mode === "greet" && t > s.until) {
        s.action = "none";
        s.mode = "idle";
        s.until = t + 2 + rng() * 3;
        s.meetWith = null;
      }
      if (s.mode === "chat") {
        // Stand face to face and trade little calls and emotes.
        faceX = s.meetWith?.x ?? null;
        faceZ = s.meetWith?.z ?? null;
        if (t >= s.voiceNext) {
          s.voiceNext = t + 1.3 + rng() * 0.8;
          callVoice();
          showEmote(chatEmotes[Math.floor(rng() * chatEmotes.length)]!);
        }
        if (t > s.until) {
          if (s.partnerId && (s.ecoBehavior === "chase" || rng() < 0.35)) {
            // Sometimes a chat turns into a game of chase; the ecology plan
            // can schedule it directly.
            s.mode = "play";
            s.until = t + 6 + rng() * 2;
            s.voiceNext = t + 0.3;
            s.target = null;
            s.meetWith = null;
          } else {
            s.action = "none";
            s.mode = "idle";
            s.until = t + 2 + rng() * 3;
            s.meetWith = null;
            s.partnerId = null;
            s.ecoBehavior = null;
          }
        }
      }
      if (s.mode === "play") {
        const partner = s.partnerId ? agentById(s.partnerId) : null;
        if (partner) {
          faceX = partner.x;
          faceZ = partner.z;
          const gap = Math.hypot(partner.x - s.x, partner.z - s.z);
          if (gap > 1.4 && t > s.pauseUntil) s.target = { x: partner.x, z: partner.z };
          else {
            s.target = null;
            if (gap <= 1.4) s.pauseUntil = t + 0.6;
          }
          if (t >= s.voiceNext) {
            s.voiceNext = t + 1.4 + rng() * 0.6;
            callVoice();
            showEmote("sparkle");
          }
        } else {
          s.mode = "idle";
          s.until = t + 1;
        }
        if (t > s.until) {
          s.action = "none";
          s.mode = "idle";
          s.until = t + 2 + rng() * 3;
          s.target = null;
          s.partnerId = null;
          s.ecoBehavior = null;
        }
      }
      if (s.mode === "act" && t > s.until) {
        s.action = "none";
        s.mode = "idle";
        s.until = t + 2 + rng() * 4;
        s.ecoBehavior = null;
      }
      if (s.mode === "follow" && (!s.target || s.followUntil < t)) {
        s.mode = "idle";
        s.until = t + 1;
      }
      anim.current.action = s.action;

    }

    if (faceX !== null && faceZ !== null)
      s.yaw = lerpAngle(s.yaw, Math.atan2(faceX, faceZ), 1 - Math.exp(-dt * 6));
    s.phase += dt * (moving ? 1.3 : 1);
    anim.current.phase = s.phase;
    anim.current.moving = moving;

    const ground = spec.height(s.x, s.z);
    s.y += (ground - s.y) * Math.min(1, dt * 10);
    if (root.current) {
      root.current.position.set(s.x, s.y, s.z);
      root.current.rotation.y = s.yaw;
    }
    emoteAge.current += dt;
    reportAgent(id, {
        kind: resident.species,
        x: s.x,
        z: s.z,
        name: resident.name,
        yaw: s.yaw,
        action: s.action,
      });
  });

  const headY = speciesProfiles[resident.species].behavior.headY;
  return (
    <group ref={root} onClick={pet}>
      <AnimalMesh species={resident.species} anim={anim.current} />
      {emoteKind && <Emote kind={emoteKind} ageRef={emoteAge} y={headY} />}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <circleGeometry args={[0.7, 20]} />
        <meshBasicMaterial
          color={speciesProfiles[resident.species].behavior.shadow ?? "#c9b184"}
          transparent
          opacity={0.28}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
