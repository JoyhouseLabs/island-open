import { useSyncExternalStore } from "react";
import type { SubSceneId } from "@island/contracts";

/** A doorway the walking player is standing in, if any. Entering is always
 *  explicit (Space or the chip) — nobody gets pulled into another room. */
export interface GateNear {
  dest: "island" | SubSceneId;
  label: string;
  x: number;
  z: number;
}

class GatePromptStore {
  near: GateNear | null = null;
  /** Registered by the player rig: performs the actual transition. */
  onEnter: (() => void) | null = null;
  private readonly listeners = new Set<() => void>();
  private version = 0;
  subscribe = (notify: () => void) => {
    this.listeners.add(notify);
    return () => this.listeners.delete(notify);
  };
  getVersion = () => this.version;
  /** Called per frame by the rig; dedupes so React only wakes on change. */
  report(near: GateNear | null) {
    const same =
      (near === null && this.near === null) ||
      (near && this.near && this.near.dest === near.dest);
    if (same) return;
    this.near = near;
    this.version++;
    for (const notify of this.listeners) notify();
  }
  enter() {
    this.onEnter?.();
  }
}

export const gatePrompt = new GatePromptStore();

export function useGateNear(): GateNear | null {
  useSyncExternalStore(gatePrompt.subscribe, gatePrompt.getVersion);
  return gatePrompt.near;
}
