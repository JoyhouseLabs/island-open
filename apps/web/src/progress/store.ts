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
import type { InventoryAction, InventoryState } from "@island/contracts";
import { readDraft, writeDraft } from "../drafts";
import { api, RequestError } from "../api";

const KEY = "growth-v1";
const userKey = (userId: string) => `${KEY}:${userId}`;

type Remote = InventoryState & { fresh?: boolean };
type Queued = { key: string; action: InventoryAction };

function payload(state: GrowthState): InventoryState {
  const owned: InventoryState["owned"] = {};
  const collected: InventoryState["collected"] = {};
  for (const [id, yes] of Object.entries(state.owned)) if (yes) owned[id] = true;
  for (const [id, qty] of Object.entries(state.collected)) if (qty > 0) collected[id] = qty;
  return {
    stars: state.stars,
    counts: state.counts,
    done: state.done,
    deeds: state.deeds.slice(0, 40),
    owned,
    collected,
  };
}

function hasProgress(state: GrowthState) {
  return (
    state.stars > 0 ||
    state.deeds.length > 0 ||
    Object.keys(state.counts).length > 0 ||
    Object.keys(state.owned).length > 0 ||
    Object.keys(state.collected).length > 0
  );
}

function fold(base: InventoryState, queue: Queued[]): GrowthState {
  let state: GrowthState = { ...emptyGrowth(), ...base };
  for (const item of queue) {
    const action = item.action;
    if (action.op === "event")
      state = applyGrowthEvent(state, { type: action.type, detail: action.detail }).state;
    else if (action.op === "collect")
      state = collectItem(
        state,
        action.itemId,
        forageCatalog.find((entry) => entry.kind === action.itemId)?.name ?? action.itemId,
      ).state;
    else {
      const bought = buyUnlock(state, action.itemId);
      if (bought.ok) state = bought.state;
    }
  }
  return state;
}

/**
 * One growth journal for the whole island. Logged-in play is stored on the
 * server; a browser with no account keeps the same journal locally.
 */
class GrowthStore {
  state: GrowthState = emptyGrowth();
  toasts: string[] = [];
  private listeners = new Set<() => void>();
  private version = 0;
  private loaded = false;
  private pending: GrowthEvent[] = [];
  private saveTimer: number | undefined;
  private userId: string | null = null;
  /** null while the journal still belongs to this browser only. */
  private source: string | null = null;
  private queue: Queued[] = [];
  private syncing = false;
  private flushing = false;

  constructor() {
    if (typeof window !== "undefined")
      window.addEventListener("online", () => void this.flush());
  }

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

  /** Cloud journal for this account. A different account never inherits the previous one. */
  bind(userId: string | null) {
    if (userId === this.userId && (userId === null || this.source === userId)) return;
    this.userId = userId;
    if (userId) void this.sync(userId);
  }

  private async sync(userId: string) {
    this.syncing = true;
    try {
      const remote = await api<Remote>("/inventory");
      if (this.userId !== userId) return;
      if (remote.fresh && this.source === null && hasProgress(this.state)) {
        this.queue = [];
        await api("/inventory/import", {
          method: "POST",
          body: JSON.stringify(payload(this.state)),
        });
      } else {
        this.state = fold(remote, this.queue);
        this.bump();
      }
      this.source = userId;
      await writeDraft(userKey(userId), this.state).catch(() => {});
    } catch {
      /* Keep the local journal and try again on the next action. */
    } finally {
      this.syncing = false;
      void this.flush();
    }
  }

  private note(action: InventoryAction) {
    if (!this.userId) return;
    this.queue.push({ key: crypto.randomUUID(), action });
    if (!this.syncing) void this.flush();
  }

  private async flush() {
    if (
      this.flushing ||
      this.syncing ||
      !this.userId ||
      this.source !== this.userId ||
      !this.queue.length
    )
      return;
    const item = this.queue[0]!;
    this.flushing = true;
    try {
      const remote = await api<InventoryState>("/inventory/act", {
        method: "POST",
        body: JSON.stringify({ idempotencyKey: item.key, action: item.action }),
      });
      if (this.queue[0]?.key === item.key) this.queue.shift();
      this.state = fold(remote, this.queue);
      this.bump();
      await writeDraft(userKey(this.userId), this.state).catch(() => {});
    } catch (e) {
      const rejected =
        e instanceof RequestError && e.status >= 400 && e.status < 500 && e.status !== 429;
      if (rejected && this.queue[0]?.key === item.key) this.queue.shift();
      if (!rejected) return;
      try {
        const remote = await api<Remote>("/inventory");
        this.state = fold(remote, this.queue);
        this.bump();
      } catch {
        /* The next action will try again. */
      }
    } finally {
      this.flushing = false;
    }
    if (this.queue.length) void this.flush();
  }

  emit(event: GrowthEvent) {
    if (!this.loaded) {
      this.pending.push(event);
      return;
    }
    const { state, completed } = applyGrowthEvent(this.state, event);
    this.state = state;
    this.note({
      op: "event",
      type: event.type,
      ...(event.detail ? { detail: event.detail } : {}),
    });
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

  /** A small island notice (ecology arrivals and departures use this). */
  pushToast(text: string) {
    this.toasts = [...this.toasts, text];
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
    this.note({ op: "buy", itemId: id });
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
    this.note({ op: "collect", itemId: kind });
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
