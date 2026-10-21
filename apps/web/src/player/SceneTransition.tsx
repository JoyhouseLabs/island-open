import { useSyncExternalStore } from "react";
import { DoorOpen } from "lucide-react";
import type { SubSceneId } from "@island/contracts";
import { gatePrompt, useGateNear } from "./gatePrompt";
import { useNearSpeaker } from "../dialogue/proximity";

/**
 * Walking into a doorway no longer teleports: this chip says where the door
 * leads, and Space (or a tap) steps through. A conversation partner nearby
 * takes priority, same as always.
 */
export default function GatePrompt() {
  const near = useGateNear();
  const speaker = useNearSpeaker();
  if (!near || speaker) return null;
  const verb = `进入${near.label}`;
  return (
    <button
      className="gate-prompt"
      onClick={() => gatePrompt.enter()}
      aria-label={verb}
    >
      <DoorOpen size={13} />
      空格 · {verb}
    </button>
  );
}

interface TransitionState {
  title: string;
  at: number;
}

/**
 * Full-screen scene change veil: fades in with the destination's name,
 * swaps the page underneath, then fades out. One instance lives in App.
 */
class SceneTransitionStore {
  state: TransitionState | null = null;
  private readonly listeners = new Set<() => void>();
  private version = 0;
  subscribe = (notify: () => void) => {
    this.listeners.add(notify);
    return () => this.listeners.delete(notify);
  };
  getVersion = () => this.version;
  private commit(state: TransitionState | null) {
    this.state = state;
    this.version++;
    for (const notify of this.listeners) notify();
  }
  /** Fade in (~0.4s), navigate, hold briefly, fade out (~0.45s). */
  go(title: string, navigate: () => void) {
    if (this.state) return; // one transition at a time
    this.commit({ title, at: Date.now() });
    setTimeout(navigate, 400);
    setTimeout(() => this.commit(null), 1250);
  }
}

export const sceneTransition = new SceneTransitionStore();

export function SceneTransitionVeil() {
  useSyncExternalStore(
    sceneTransition.subscribe,
    sceneTransition.getVersion,
  );
  const state = sceneTransition.state;
  if (!state) return null;
  return (
    <div className="scene-transition" key={state.at} aria-hidden>
      <span className="scene-transition-title">{state.title}</span>
    </div>
  );
}

/** Title for a gate destination, shared by the rig and the prompt. */
export function gateLabel(dest: "island" | SubSceneId): string {
  return dest === "island" ? "主岛" : sceneTitle(dest);
}
function sceneTitle(dest: SubSceneId): string {
  // Kept local to avoid an import cycle (sceneConfig pulls Island types).
  const titles: Record<SubSceneId, string> = {
    garden: "私家花园",
    home: "家园小院",
    meadow: "风眠草地",
    forest: "狐狸森林",
    library: "林间书屋",
    pond: "静水池塘",
    lab: "自然实验室",
    nursery: "实验种植园",
    mountain: "听风山",
    starlight: "星光秘境",
    beach: "月牙沙滩",
  };
  return titles[dest] ?? "新的地方";
}
