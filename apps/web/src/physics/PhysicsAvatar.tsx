import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Group, Vector3 } from "three";
import { characterProfile } from "@island/physics-core";
import { AvatarMesh, type AvatarAnim } from "../player/AvatarModel";
import PresenceLabel from "../presence/PresenceLabel";
import { EMOTES, phraseLabel } from "../presence/phrases";
import type { PhysicsConnection } from "./PhysicsConnection";

/** A visual skin over the shared capsule; clothing never changes collision or movement. */
export default function PhysicsAvatar({
  conn,
  id,
  bubble,
  onTalkPlayer,
}: {
  conn: PhysicsConnection;
  id: string;
  bubble?: { phrase?: string; emote?: string; at: number };
  onTalkPlayer?(id: string, name: string): void;
}) {
  const root = useRef<Group>(null),
    skin = useRef<Group>(null);
  const [showing, setShowing] = useState<{
    phrase?: string;
    emote?: string;
    at: number;
  } | null>(null),
    lastStamp = useRef(0);
  useEffect(() => {
    if (!bubble || bubble.at === lastStamp.current) return;
    lastStamp.current = bubble.at;
    setShowing(bubble);
    const timer = setTimeout(() => setShowing(null), 4200);
    return () => clearTimeout(timer);
  }, [bubble]);
  const last = useRef<Vector3 | null>(null),
    target = useMemo(() => new Vector3(), []);
  const anim = useRef<AvatarAnim>({ phase: 0, moving: false });
  const current = conn.buffer.latest?.players.find((p) => p.id === id);
  useFrame((_, dt) => {
    if (!root.current || !skin.current) return;
    const sample = conn.buffer.sample(performance.now());
    const state =
      id === conn.you
        ? conn.me
        : sample?.after.players.find((p) => p.id === id);
    if (!state) return;
    root.current.rotation.y = state.yaw;
    if (id === conn.you && conn.prediction)
      root.current.position.copy(conn.prediction.visualPosition);
    else if (sample) {
      const start = sample.before.players.find((p) => p.id === id) ?? state;
      root.current.position
        .copy(start.position)
        .lerp(
          target.set(state.position.x, state.position.y, state.position.z),
          sample.alpha,
        );
    }
    const at = root.current.position;
    anim.current.moving =
      !!last.current &&
      Math.hypot(at.x - last.current.x, at.z - last.current.z) >
        Math.max(0.001, dt * 0.15) &&
      !state.seatId;
    anim.current.phase += Math.min(dt, 0.1) * (anim.current.moving ? 1.5 : 1);
    anim.current.airborne = !state.grounded && !state.seatId;
    anim.current.action = state.seatId ? "sit" : undefined;
    anim.current.creationSeat = !!state.seatId;
    skin.current.position.y = state.seatId
      ? -0.46
      : -(characterProfile.halfHeight + characterProfile.radius + 0.06);
    (last.current ??= new Vector3()).copy(at);
  }, -1);
  if (!current) return null;
  const remote = id !== conn.you;
  return (
    <group
      ref={root}
      onClick={
        remote && onTalkPlayer
          ? (e) => {
              if (e.delta > 5) return;
              e.stopPropagation();
              onTalkPlayer(id, current.appearance.name);
            }
          : undefined
      }
    >
      <group ref={skin}>
        <AvatarMesh config={current.appearance.avatar} anim={anim.current} />
      </group>
      <PresenceLabel
        name={current.appearance.name}
        self={id === conn.you}
        position={[0, 1.45, 0]}
        maxDistance={55}
      />
      {showing && (
        <PresenceLabel
          phrase={
            phraseLabel(showing.phrase ?? "") ||
            (EMOTES.find((e) => e.id === showing.emote)?.label ?? "")
          }
          stamp={showing.at}
          self={id === conn.you}
          position={[0, 2.15, 0]}
          maxDistance={55}
        />
      )}
    </group>
  );
}
