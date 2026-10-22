import { useSyncExternalStore } from "react";
class CreationSeatPrompt {
  private state: "ready" | "blocked" | "sitting" | null = null;
  private listeners = new Set<() => void>();
  subscribe = (f: () => void) => {
    this.listeners.add(f);
    return () => {
      this.listeners.delete(f);
    };
  };
  snapshot = () => this.state;
  report(state: typeof this.state) {
    if (state === this.state) return;
    this.state = state;
    for (const listener of this.listeners) listener();
  }
}
export const creationSeatPrompt = new CreationSeatPrompt();
export function useCreationSeatPrompt() {
  return useSyncExternalStore(
    creationSeatPrompt.subscribe,
    creationSeatPrompt.snapshot,
  );
}
