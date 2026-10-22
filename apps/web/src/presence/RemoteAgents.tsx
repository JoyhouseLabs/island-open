import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import type * as T from "three";
import type { AgentWire, SubSceneId } from "@island/contracts";
import { walkSpecs } from "@island/world-core";
import { AnimalMesh, type AnimalAction, type AnimalAnim } from "../animals/AnimalMesh";
import { useGlbModel } from "../animals/CustomAnimal";
import { allAgents, reportAgent, dropAgent } from "../animals/registry";
import { contentFeed, useIslandConfig } from "../contentStore";
import { Emote } from "../animals/Emote";
import { playVoice } from "../animals/voices";
import { emitGrowth } from "../progress/store";
import { presence } from "./client";

function lerpAngle(from: number, to: number, t: number) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return from + d * t;
}

/** Wrap any angle into [-π, π] — the wire protocol refuses anything else
 *  (animal spawns start at rng()×2π, which overflows the bound). */
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * On the host: relays its locally simulated residents (and only those —
 * players, visitors and the static tutor stay out) a few times a second.
 * The server drops these frames from non-host connections, so mounting
 * this everywhere is harmless.
 */
export function HostAgentsSender() {
  useEffect(() => {
    const timer = setInterval(() => {
      if (!presence.selfHost) return;
      presence.sendAgents(
        allAgents()
          .filter(
            (a) =>
              a.kind !== "player" &&
              a.kind !== "visitor" &&
              a.kind !== "tutor" &&
              // The fox is wall-clock driven, identical on every client —
              // it renders locally everywhere and needs no relay.
              a.kind !== "fox",
          )
          .map((a) => ({
            id: a.id,
            kind: String(a.kind),
            x: a.x,
            z: a.z,
            ...(a.yaw !== undefined ? { yaw: wrapAngle(a.yaw) } : {}),
            ...(a.action ? { action: a.action } : {}),
            ...(a.name ? { name: a.name } : {}),
          })),
      );
    }, 300);
    return () => clearInterval(timer);
  }, []);
  return null;
}

/**
 * One resident animal on a visitor's screen: instead of running its own
 * wander AI, it eases toward the pose the host reported and mirrors the
 * host's action (sniffing, resting…), so both sides watch the same fox
 * trail choreography.
 */
function RemoteAnimal({
  agent,
  scene,
}: {
  agent: AgentWire;
  scene: "island" | SubSceneId | (string & {});
}) {
  const spec = walkSpecs[scene as "island" | SubSceneId];
  const root = useRef<T.Group>(null);
  const anim = useRef<AnimalAnim>({
    phase: 0,
    moving: false,
    action: "none",
    mouth: 0,
  });
  const at = useRef({ x: agent.x, z: agent.z, yaw: agent.yaw ?? 0, seen: true });

  useFrame((_, rawDt) => {
    if (!root.current) return;
    const dt = Math.min(rawDt, 0.05),
      s = at.current,
      k = 1 - Math.exp(-dt * 8);
    root.current.position.x += (s.x - root.current.position.x) * k;
    root.current.position.z += (s.z - root.current.position.z) * k;
    root.current.position.y +=
      (spec.height(root.current.position.x, root.current.position.z) -
        root.current.position.y) *
      Math.min(1, dt * 10);
    root.current.rotation.y = lerpAngle(root.current.rotation.y, s.yaw, k);
    anim.current.phase += dt;
  });

  return (
    <group
      ref={root}
      position={[agent.x, 0, agent.z]}
      rotation={[0, agent.yaw ?? 0, 0]}
    >
      <AgentPulse agent={agent} at={at} anim={anim} />
      <AnimalMesh
        species={agent.kind as "panda"}
        anim={anim.current}
      />
    </group>
  );
}

/** Bridges the 4 Hz wire frames into the per-frame refs above. */
const KNOWN_ACTIONS: AnimalAction[] = [
  "none",
  "sniff",
  "rest",
  "browse",
  "drink",
  "greet",
  "pet",
];
function AgentPulse({
  agent,
  at,
  anim,
}: {
  agent: AgentWire;
  at: { current: { x: number; z: number; yaw: number } };
  anim: { current: { action: AnimalAnim["action"] } };
}) {
  useEffect(() => {
    at.current.x = agent.x;
    at.current.z = agent.z;
    if (agent.yaw !== undefined) at.current.yaw = agent.yaw;
    // Unknown actions (fox "walk"/"survey" etc.) must never reach the
    // poses table lookup — AnimalMesh would read pose.body of undefined.
    anim.current.action = KNOWN_ACTIONS.includes(agent.action as AnimalAction)
      ? (agent.action as AnimalAction)
      : "none";
  }, [agent, at, anim]);
  return null;
}

/** The published config for a relayed custom animal, by its live agent id
 *  (`content-<configId>`); null until the feed resolves. */
function useAnimalConfig(agentId: string) {
  const [config, setConfig] = useState<Awaited<
    ReturnType<typeof contentFeed>
  >["animals"][number] | null>(null);
  const islandConfig = useIslandConfig();
  useEffect(() => {
    let alive = true;
    void contentFeed(islandConfig).then((feed) => {
      const found = feed.animals.find(
        (a) => agentId === `content-${a.id}`,
      );
      if (alive) setConfig(found ?? null);
    });
    return () => {
      alive = false;
    };
  }, [agentId, islandConfig.userId, islandConfig.worldId, islandConfig.token]);
  return config;
}

/**
 * A host-published custom GLB animal on a visitor's screen: the model loads
 * from the same public content feed, the pose eases toward whatever the
 * host reported, and a tap pets it (local flavour — heart, voice, deed).
 */
function RemoteCustomAnimal({
  agent,
  scene,
}: {
  agent: AgentWire;
  scene: "island" | SubSceneId | (string & {});
}) {
  const spec = walkSpecs[scene as "island" | SubSceneId];
  const config = useAnimalConfig(agent.id);
  const model = useGlbModel(config?.assetId);
  const root = useRef<T.Group>(null);
  const emoteAge = useRef(99);
  const at = useRef({ x: agent.x, z: agent.z, yaw: agent.yaw ?? 0 });

  useEffect(() => () => dropAgent(agent.id), [agent.id]);

  const pet = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 5) return;
    e.stopPropagation();
    emoteAge.current = 0;
    if (config) {
      playVoice("custom", at.current.x, at.current.z);
      emitGrowth({ type: "animal.petted", detail: config.name });
    }
  };

  useFrame((_, rawDt) => {
    if (!root.current) return;
    const dt = Math.min(rawDt, 0.05),
      s = at.current,
      k = 1 - Math.exp(-dt * 8);
    root.current.position.x += (s.x - root.current.position.x) * k;
    root.current.position.z += (s.z - root.current.position.z) * k;
    root.current.position.y +=
      (spec.height(root.current.position.x, root.current.position.z) -
        root.current.position.y) *
      Math.min(1, dt * 10);
    root.current.rotation.y += Math.atan2(
      Math.sin(s.yaw - root.current.rotation.y),
      Math.cos(s.yaw - root.current.rotation.y),
    ) * k;
    emoteAge.current += dt;
    if (model.model) model.model.mixer.update(dt);
    reportAgent(agent.id, {
      kind: "custom",
      x: root.current.position.x,
      z: root.current.position.z,
      name: agent.name ?? config?.name,
    });
  });

  if (!config || model.failed) return null;
  return (
    <group ref={root} onClick={pet} position={[agent.x, 0, agent.z]}>
      {model.model && <primitive object={model.model.scene} />}
      <Emote kind="heart" ageRef={emoteAge} y={1.8} />
    </group>
  );
}

/**
 * All host-simulated residents on a visitor's screen: built-in species
 * render as procedural meshes, published custom GLBs load from the content
 * feed. Renders nothing unless fresh host frames are flowing; Residents
 * falls back to its own local simulation in that case.
 */
export function RemoteAgents({
  scene,
}: {
  scene: "island" | SubSceneId | (string & {});
}) {
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(timer);
  }, []);
  if (!presence.agentsFresh()) return null;
  return (
    <>
      {presence.agentList().map((a) =>
        a.kind === "custom" ? (
          <RemoteCustomAnimal key={a.id} agent={a} scene={scene} />
        ) : (
          <RemoteAnimal key={a.id} agent={a} scene={scene} />
        ),
      )}
    </>
  );
}
