import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type * as T from "three";
import type { SubSceneId } from "@island/contracts";
import { usePresence, presence } from "./client";
import { RemoteAvatar } from "./RemoteAvatar";
import { phraseLabel } from "./phrases";
import PresenceLabel from "./PresenceLabel";

/** The local player's own speech bubble, anchored to the live self pose. */
function SelfBubble({ phrase, stamp }: { phrase: string; stamp: number }) {
  const group = useRef<T.Group>(null);
  useFrame(() => {
    if (!group.current) return;
    const s = presence.selfPose;
    group.current.position.set(s.x, 2.6, s.z);
  });
  return (
    <group ref={group}>
      <PresenceLabel phrase={phrase} stamp={stamp} self />
    </group>
  );
}

/**
 * Everyone else currently in the same room, plus one's own latest bubble.
 * Mounted inside the player rig, so it renders wherever walking is on.
 */
export function RemoteLayer({
  scene,
}: {
  scene: "island" | SubSceneId | (string & {});
}) {
  const { players, bubbles } = usePresence();
  const self = bubbles.find((b) => b.by === "self");
  return (
    <group>
      {players.map((p) => (
        <RemoteAvatar
          key={p.id}
          player={p}
          scene={scene}
          bubble={bubbles.find((b) => b.by === p.id)}
        />
      ))}
      {self?.phrase && (
        <SelfBubble phrase={phraseLabel(self.phrase)} stamp={self.at} />
      )}
    </group>
  );
}
