import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import PresenceLabel from "./PresenceLabel";
import type * as T from "three";
import type { SubSceneId } from "@island/contracts";
import { walkSpecs } from "@island/world-core";
import { AvatarMesh, type AvatarAnim } from "../player/AvatarModel";
import type { AvatarConfig } from "../player/avatar";
import { reportAgent, dropAgent } from "../animals/registry";
import { Emote, type EmoteKind } from "../animals/Emote";
import { presence, type RemotePlayer, type Bubble } from "./client";
import { phraseLabel } from "./phrases";

function lerpAngle(from: number, to: number, t: number) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return from + d * t;
}

/**
 * Another player walking the same room: interpolates toward their latest
 * reported pose, wears their avatar, floats a name tag and the odd phrase
 * or emote bubble. Registers as a "visitor" agent so the existing proximity
 * prompt (空格 · 和X说说话) picks them up like any friendly NPC.
 */
export function RemoteAvatar({
  player,
  scene,
  bubble,
}: {
  player: RemotePlayer;
  /** Accepts the rig's widened scene key (`(string & {})` escape hatch). */
  scene: "island" | SubSceneId | (string & {});
  bubble?: Bubble;
}) {
  const spec = walkSpecs[scene as "island" | SubSceneId];
  const root = useRef<T.Group>(null);
  const anim = useRef<AvatarAnim>({ phase: 0, moving: false });
  const emoteAge = useRef(99);
  const at = useRef({ x: 0, z: 0, yaw: 0, moving: false, seen: false });

  useEffect(() => {
    emoteAge.current = 0; // a fresh bubble restarts the emote clock
    return () => dropAgent(`guest:${player.id}`);
  }, [player.id, bubble?.at]);
  // Name tags come and go with the component; keep them out of pointer
  // events so they never block canvas drags.

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const pose = presence.poseOf(player.id);
    if (pose) {
      at.current.x = pose.x;
      at.current.z = pose.z;
      at.current.yaw = pose.yaw;
      at.current.moving = pose.moving;
      at.current.seen = true;
    }
    if (!root.current || !at.current.seen) return;
    const s = at.current,
      k = 1 - Math.exp(-dt * 10);
    root.current.position.x += (s.x - root.current.position.x) * k;
    root.current.position.z += (s.z - root.current.position.z) * k;
    root.current.position.y +=
      (spec.height(root.current.position.x, root.current.position.z) -
        root.current.position.y) *
      Math.min(1, dt * 10);
    root.current.rotation.y = lerpAngle(root.current.rotation.y, s.yaw, k);
    anim.current.moving = s.moving;
    anim.current.phase += dt * (s.moving ? 1.2 : 1);
    emoteAge.current += dt;
    reportAgent(`guest:${player.id}`, {
      kind: "visitor",
      x: root.current.position.x,
      z: root.current.position.z,
      name: player.name,
    });
  });

  return (
    <group ref={root}>
      <AvatarMesh config={player.avatar as AvatarConfig} anim={anim.current} />
      <PresenceLabel
        position={[0, 2.35, 0]}
        name={player.name}
        phrase={bubble?.phrase ? phraseLabel(bubble.phrase) : undefined}
        stamp={bubble?.at}
      />
      {bubble?.emote && <Emote kind={bubble.emote as EmoteKind} ageRef={emoteAge} y={2.6} />}
    </group>
  );
}
