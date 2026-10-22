import { useEffect, useState } from "react";
import type { SubSceneId, IslandEntity, AnimalConfig } from "@island/contracts";
import { residents, type Resident } from "@island/world-core";
import { Animal } from "./Animal";
import { CustomAnimal } from "./CustomAnimal";
import { useEcology } from "./ecologyStore";
import { npcSpeakers, useContentFeed } from "../contentStore";
import { useGrowth } from "../progress/store";
import { presence } from "../presence/client";
import { HostAgentsSender, RemoteAgents } from "../presence/RemoteAgents";

/** The resident animals of one scene; scenes render this once.
 *  Some residents only move in after a growth unlock. On the main island,
 *  the bounded ecology adds (and gently loses) a few friends around the
 *  static roster — same derivation for host and visitors.
 *
 *  Co-play: whoever simulates the animals locally also relays them
 *  (HostAgentsSender no-ops unless the server called this connection the
 *  host), while a visitor with a live host swaps its own wander AI for
 *  the host's authoritative frames. */
export function Residents({
  scene,
  entities,
  seed,
  season,
}: {
  /** Built-in scene, or "place-<id>" for a published place. */
  scene: "island" | SubSceneId | (string & {});
  entities: IslandEntity[];
  /** World seed + season drive the island ecology (main island only). */
  seed?: number;
  season?: "spring" | "summer" | "autumn" | "winter";
}) {
  const { state } = useGrowth();
  const [remote, setRemote] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setRemote(presence.agentsFresh()), 700);
    return () => clearInterval(timer);
  }, []);
  // Hooks stay unconditional; useEcology no-ops without a seed.
  const ecology = useEcology(
    scene === "island" && seed !== undefined ? seed : null,
    season ?? "summer",
  );
  const roster = residents[scene as keyof typeof residents]?.filter(
    (r) => !r.unlockId || state.owned[r.unlockId],
  );
  const born = (ecology ?? [])
    .filter((m) => m.bornTick > 0)
    // A born wolf still waits on the same unlock as 风哨.
    .filter(
      (m) =>
        m.species !== "wolf" || state.owned["resident-wolf"],
    );
  return (
    <>
      <HostAgentsSender />
      {remote ? (
        <RemoteAgents scene={scene} />
      ) : (
        <>
          {roster?.map((r) => (
            <Animal
              key={`${scene}-${r.name}`}
              id={`${scene}-${r.name}`}
              resident={r}
              scene={scene}
              entities={entities}
            />
          ))}
          {born.map((m) => (
            <Animal
              key={m.id}
              id={m.id}
              resident={m}
              scene={scene}
              entities={entities}
            />
          ))}
        </>
      )}
      <ContentAnimals scene={scene} entities={entities} />
    </>
  );
}

/** Admin-configured animals published for this scene. Builtin species reuse
 *  the full resident behavior; custom GLBs get their own gentle wander.
 *  While host animal frames are flowing, visitors skip the local wander —
 *  RemoteAgents renders the same animals from the host's simulation. */
export function ContentAnimals({
  scene,
  entities,
}: {
  /** Built-in scene, or "place-<id>" for a published place. */
  scene: "island" | SubSceneId | (string & {});
  entities: IslandEntity[];
}) {
  const [animals, setAnimals] = useState<AnimalConfig[] | null>(null);
  const [remote, setRemote] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setRemote(presence.agentsFresh()), 700);
    return () => clearInterval(timer);
  }, []);
  const roster = useContentFeed()?.animals;
  useEffect(() => {
    if (!roster) return;
    setAnimals(roster.filter((a) => a.placement.scene === scene));
  }, [roster, scene]);
  // Publish configs by live agent id so dialogue can find their persona.
  useEffect(() => {
    if (!animals) return;
    for (const a of animals) npcSpeakers.set(`content-${a.id}`, a);
    return () => {
      for (const a of animals) npcSpeakers.delete(`content-${a.id}`);
    };
  }, [animals]);
  if (!animals?.length || remote) return null;
  return (
    <>
      {animals.map((a) =>
        a.species === "custom" && a.assetId ? (
          <CustomAnimal
            key={`content-${a.id}`}
            id={`content-${a.id}`}
            config={a}
            scene={scene}
          />
        ) : (
          <Animal
            key={`content-${a.id}`}
            id={`content-${a.id}`}
            resident={
              {
                species: a.species === "custom" ? "fox" : a.species,
                name: a.name,
                home: {
                  x: a.placement.x,
                  z: a.placement.z,
                  r: a.placement.wander,
                },
                prefer: "grass",
              } satisfies Resident
            }
            scene={scene}
            entities={entities}
          />
        ),
      )}
    </>
  );
}
