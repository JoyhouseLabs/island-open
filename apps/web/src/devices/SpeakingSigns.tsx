import { useEffect, useState } from "react";
import type { DeviceInstance } from "@island/contracts";
import { dropAgent, reportAgent } from "../animals/registry";
import { signWorlds } from "../animals/personas";
import { featuresStatus } from "../contentStore";

/**
 * Signposts that can talk: every placed island:sign registers into the agent
 * registry, so the proximity prompt, Space and the scripted greeting work
 * with no further wiring. The world context rides along for deep chat —
 * the server looks the sign up on that island. Entirely absent while the
 * speaking-entities flag is off.
 */
export default function SpeakingSigns({
  devices,
  worldId,
  token,
}: {
  devices: DeviceInstance[] | undefined;
  worldId: string | null;
  token?: string;
}) {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    void featuresStatus().then((f) => setEnabled(f.speakingEntities));
  }, []);
  const signature = JSON.stringify(
    (devices ?? [])
      .filter(
        (d) =>
          d.definitionId === "island:sign" && d.placement.state === "placed",
      )
      .map((s) => [s.id, s.placement]),
  );
  useEffect(() => {
    if (!enabled) return;
    const signs = (devices ?? []).filter(
      (d) =>
        d.definitionId === "island:sign" && d.placement.state === "placed",
    );
    for (const sign of signs) {
      const id = `device:${sign.id}`;
      if (worldId) signWorlds.set(id, { worldId, token });
      const p = sign.placement;
      if (p.state !== "placed") continue;
      reportAgent(id, { kind: "sign", x: p.x, z: p.z, name: "告示牌" });
    }
    return () => {
      for (const sign of signs) {
        const id = `device:${sign.id}`;
        dropAgent(id);
        signWorlds.delete(id);
      }
    };
    // signature covers the placed-sign list; worldId/token the chat context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, worldId, token, signature]);
  return null;
}
