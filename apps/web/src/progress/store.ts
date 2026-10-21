import { useSyncExternalStore } from "react";
import {
  applyGrowthEvent,
  buyUnlock,
  collectItem,
  emptyGrowth,
  forageCatalog,
  starterTasks,
  taskProgress,
  unlocks,
  type GrowthEvent,
  type GrowthState,
} from "@island/world-core";
import { readDraft, writeDraft } from "../drafts";

const KEY = "growth-v1";

/**
 * One resident growth journal for the whole island: every page reads the
 * same store, every deed lands here. Persisted locally; cloud sync later.
 */
class GrowthStore {
  state: GrowthState = emptyGrowth();
  toasts: string[] = [];
  private listeners = new Set<() => void>();
  private version = 0;
  private loaded = false;
  private pending: GrowthEvent[] = [];
  private saveTimer: number | undefined;

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };
  getVersion = () => this.version;
  private bump() {
    this.version++;
    for (const l of this.listeners) l();
  }

  async load() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const saved = await readDraft<GrowthState>(KEY);
      if (saved) this.state = { ...emptyGrowth(), ...saved };
      this.bump();
    } catch {
      /* A fresh journal is fine. */
    }
    // Scene-visit events fire at page mount, possibly before the journal
    // finished loading — replay them instead of losing them.
    for (const event of this.pending.splice(0)) this.emit(event);
  }

  emit(event: GrowthEvent) {
    if (!this.loaded) {
      this.pending.push(event);
      return;
    }
    const { state, completed } = applyGrowthEvent(this.state, event);
    this.state = state;
    for (const task of completed)
      this.toasts = [...this.toasts, `✦ ${task.title} · +${task.stars}★`];
    this.bump();
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      void writeDraft(KEY, this.state).catch(() => {});
    }, 400);
  }

  dismissToast() {
    this.toasts = this.toasts.slice(1);
    this.bump();
  }

  /** Spend stars on a hat, a resident or a lantern. */
  buy(id: string): boolean {
    const { state, ok, error } = buyUnlock(this.state, id);
    if (!ok) {
      this.toasts = [...this.toasts, error ?? "暂时换不了。"];
      this.bump();
      return false;
    }
    this.state = state;
    const def = unlocks.find((u) => u.id === id);
    this.toasts = [...this.toasts, `✦ 换来了「${def?.name ?? id}」`];
    this.bump();
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      void writeDraft(KEY, this.state).catch(() => {});
    }, 400);
    return true;
  }

  owns(id: string) {
    return !!this.state.owned[id];
  }

  /** Picking up a forage item; the first of each kind earns a star. */
  collect(kind: string, name: string) {
    const { state, first } = collectItem(this.state, kind, name);
    this.state = state;
    if (first) {
      const emoji =
        forageCatalog.find((c) => c.kind === kind)?.emoji ?? "✦";
      this.toasts = [...this.toasts, `${emoji} 第一次捡到「${name}」 · +1★`];
    }
    this.bump();
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      void writeDraft(KEY, this.state).catch(() => {});
    }, 400);
  }

  snapshot() {
    return this.state;
  }
}

export const growth = new GrowthStore();
void growth.load();

export function useGrowth() {
  useSyncExternalStore(growth.subscribe, growth.getVersion);
  return {
    state: growth.state,
    tasks: starterTasks,
    unlocks,
    progress: (id: string) =>
      taskProgress(
        growth.state,
        starterTasks.find((t) => t.id === id)!,
      ),
    buy: (id: string) => growth.buy(id),
    collect: (kind: string, name: string) => growth.collect(kind, name),
  };
}

/** Emit from anywhere: planting, reading, petting, walking. */
export function emitGrowth(event: GrowthEvent) {
  growth.emit(event);
}
