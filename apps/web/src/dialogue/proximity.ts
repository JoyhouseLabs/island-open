import { useSyncExternalStore } from "react";
import type { AgentInfo } from "../animals/registry";

export type NearSpeaker = AgentInfo & { id: string; distance: number };

/** Who is standing close enough to talk to right now. */
class ProximityStore {
  speaker: NearSpeaker | null = null;
  env: { weather: string; season: string; night: boolean } = {
    weather: "sun",
    season: "summer",
    night: false,
  };
  private listeners = new Set<() => void>();
  private version = 0;
  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };
  getVersion = () => this.version;
  private bump() {
    this.version++;
    for (const l of this.listeners) l();
  }
  setSpeaker(speaker: NearSpeaker | null) {
    const changed =
      (this.speaker?.name ?? this.speaker?.kind) !==
      (speaker?.name ?? speaker?.kind);
    if (!speaker && !this.speaker) return;
    this.speaker = speaker;
    if (changed || speaker) this.bump();
  }
  setEnv(env: { weather: string; season: string; night: boolean }) {
    this.env = env;
  }
}

export const proximity = new ProximityStore();

export function useNearSpeaker() {
  useSyncExternalStore(proximity.subscribe, proximity.getVersion);
  return proximity.speaker;
}
