import { useSyncExternalStore } from "react";
import {
  presenceServerSchema,
  type AgentWire,
  type AvatarWire,
  type PresenceServerMessage,
} from "@island/contracts";

/** Everything the renderer needs for one remote player each frame. */
export interface RemotePlayer {
  id: string;
  name: string;
  avatar: AvatarWire;
  /** The island's owner connection. */
  host: boolean;
}

export interface Pose {
  x: number;
  z: number;
  yaw: number;
  moving: boolean;
}

export interface Bubble {
  by: string; // remote conn id or "self"
  phrase?: string;
  emote?: string;
  at: number;
}

export interface WorldEvent {
  world: string;
  scene: string;
  revision: number;
  at: number;
}

export type PresenceStatus = "offline" | "connecting" | "online";

/**
 * Low-frequency state (membership, bubbles, connection status, world
 * updates) goes through React; the high-frequency poses live in plain
 * mutable maps that the rigs read inside useFrame, so an 8 Hz position
 * stream never re-renders the scene tree.
 */
interface Snapshot {
  status: PresenceStatus;
  players: RemotePlayer[];
  bubbles: Bubble[];
  /** Latest "the world you are looking at changed" notice. */
  worldEvent: WorldEvent | null;
}

interface ConnectOptions {
  worldId: string;
  scene: string;
  /** Visitors carry the share token; the owner connects without one. */
  token?: string;
  name: string;
  avatar: AvatarWire;
}

/**
 * The presence singleton (same pattern as moveBus/dialogue): one WebSocket
 * per room (`<parentWorldId>:<scene>`), reconnected with capped backoff.
 * Outgoing positions are throttled to ~8 Hz and suppressed while standing
 * still; bubbles are echoed locally immediately because the server never
 * sends them back to their author.
 */
class PresenceClient {
  private socket: WebSocket | null = null;
  private room: string | null = null;
  private opts: ConnectOptions | null = null;
  private retry = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSent = 0;
  private lastAgentsSent = 0;
  private lastSentPose = { x: NaN, z: NaN, yaw: NaN, moving: false };
  private readonly poses = new Map<string, Pose>();
  /** Host-simulated NPC poses; read per frame by the visitor's renderer. */
  private readonly agents = new Map<string, AgentWire>();
  agentsAt = 0;
  private hostConnId: string | null = null;
  private readonly listeners = new Set<() => void>();
  readonly selfPose: Pose = { x: 0, z: 0, yaw: 0, moving: false };
  /** True when the server recognised this connection as the island owner. */
  selfHost = false;
  private state: Snapshot = {
    status: "offline",
    players: [],
    bubbles: [],
    worldEvent: null,
  };

  subscribe = (notify: () => void) => {
    this.listeners.add(notify);
    return () => this.listeners.delete(notify);
  };
  getSnapshot = () => this.state;
  private commit(patch: Partial<Snapshot>) {
    this.state = { ...this.state, ...patch };
    for (const notify of this.listeners) notify();
  }

  /** Latest pose of a remote player, or null before their first report. */
  poseOf(id: string): Pose | null {
    return this.poses.get(id) ?? null;
  }

  /** The host's latest resident-animal frames (empty when none arrived). */
  agentList(): AgentWire[] {
    return [...this.agents.values()];
  }
  /** Whether host animal frames are flowing (visitors fall back to local
   *  simulation when the host leaves or pauses). */
  agentsFresh(maxAgeMs = 4000): boolean {
    return !!this.hostConnId && Date.now() - this.agentsAt < maxAgeMs;
  }

  connect(opts: ConnectOptions) {
    const room = `${opts.worldId}:${opts.scene}`;
    if (this.room === room && this.opts?.name === opts.name) {
      this.opts = opts; // avatar/token may refresh without rejoining
      return;
    }
    this.disconnect();
    this.room = room;
    this.opts = opts;
    this.open();
  }

  disconnect() {
    this.room = null;
    this.opts = null;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.socket?.close();
    this.socket = null;
    this.poses.clear();
    this.agents.clear();
    this.hostConnId = null;
    this.agentsAt = 0;
    if (this.state.status !== "offline" || this.state.players.length)
      this.commit({ status: "offline", players: [], bubbles: [] });
  }

  private open() {
    if (!this.room || !this.opts) return;
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    const url =
      `${scheme}://${location.host}/api/presence` +
      `?world=${encodeURIComponent(this.opts.worldId)}` +
      `&scene=${encodeURIComponent(this.opts.scene)}` +
      (this.opts.token ? `&t=${encodeURIComponent(this.opts.token)}` : "");
    this.commit({ status: "connecting" });
    const socket = new WebSocket(url);
    this.socket = socket;
    socket.onopen = () => {
      this.retry = 0;
      const { name, avatar } = this.opts!;
      socket.send(JSON.stringify({ type: "hello", name, avatar }));
      this.commit({ status: "online" });
    };
    socket.onmessage = (e) => {
      let msg: PresenceServerMessage;
      try {
        msg = presenceServerSchema.parse(JSON.parse(String(e.data)));
      } catch {
        return;
      }
      this.receive(msg);
    };
    socket.onclose = (event) => {
      if (this.socket !== socket) return; // replaced or disconnected
      this.socket = null;
      this.poses.clear();
      this.commit({ status: "offline", players: [] });
      if (!this.room) return;
      // 4401/4403 are deliberate refusals (session ended, sharing closed,
      // bad token or origin): retrying cannot succeed, so drop to offline
      // for good instead of hammering the server. A fresh connect() — new
      // page or re-entered scene — starts over.
      if (event.code === 4401 || event.code === 4403) {
        this.agents.clear();
        this.hostConnId = null;
        this.agentsAt = 0;
        return;
      }
      const wait = Math.min(15000, 1000 * 2 ** this.retry++);
      this.retryTimer = setTimeout(() => this.open(), wait);
    };
    socket.onerror = () => socket.close();
  }

  private receive(msg: PresenceServerMessage) {
    if (msg.type === "welcome" || msg.type === "join") {
      const list =
        msg.type === "welcome" ? msg.players : [msg.player];
      if (msg.type === "welcome") this.selfHost = msg.host;
      const players = [...this.state.players];
      for (const p of list) {
        if (!players.some((q) => q.id === p.id)) players.push(p);
        if (p.host) this.hostConnId = p.id;
        if (!this.poses.has(p.id)) this.poses.set(p.id, { x: 0, z: 0, yaw: 0, moving: false });
      }
      this.commit({ players });
    } else if (msg.type === "leave") {
      this.poses.delete(msg.id);
      if (msg.id === this.hostConnId) {
        this.hostConnId = null;
        this.agents.clear();
        this.agentsAt = 0;
      }
      this.commit({
        players: this.state.players.filter((p) => p.id !== msg.id),
        bubbles: this.state.bubbles.filter((b) => b.by !== msg.id),
      });
    } else if (msg.type === "pos") {
      const pose = this.poses.get(msg.id);
      if (pose) {
        pose.x = msg.x;
        pose.z = msg.z;
        pose.yaw = msg.yaw;
        pose.moving = msg.moving;
      }
    } else if (msg.type === "bubble") {
      this.addBubble({ by: msg.id, phrase: msg.phrase, emote: msg.emote, at: msg.at });
    } else if (msg.type === "agents") {
      // Only frames from the host connection are authoritative.
      if (msg.id !== this.hostConnId) return;
      this.agents.clear();
      for (const a of msg.agents) this.agents.set(a.id, a);
      this.agentsAt = Date.now();
    } else if (msg.type === "content") {
      window.dispatchEvent(new CustomEvent("island-content-changed",{detail:{worldId:msg.world,revision:msg.revision}}));
    } else if (msg.type === "world") {
      this.commit({
        worldEvent: {
          world: msg.world,
          scene: msg.scene,
          revision: msg.revision,
          at: Date.now(),
        },
      });
    }
  }

  private addBubble(bubble: Bubble) {
    this.commit({
      bubbles: [...this.state.bubbles.filter((b) => b.by !== bubble.by), bubble],
    });
  }

  /** Called every frame by the player rig; internally throttled to 8 Hz. */
  pose(x: number, z: number, yaw: number, moving: boolean) {
    const self = this.selfPose;
    self.x = x;
    self.z = z;
    self.yaw = yaw;
    self.moving = moving;
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    if (
      !moving &&
      this.lastSentPose.x === x &&
      this.lastSentPose.z === z &&
      this.lastSentPose.yaw === yaw
    )
      return; // standing still: nothing new to say
    const now = performance.now();
    if (now - this.lastSent < 125) return;
    this.lastSent = now;
    this.lastSentPose = { x, z, yaw, moving };
    this.socket.send(JSON.stringify({ type: "pos", x, z, yaw, moving }));
  }

  /** The host rig calls this every frame with its resident animals; frames
   *  are throttled to ~4 Hz and the server ignores them from visitors. */
  sendAgents(list: AgentWire[]) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    const now = performance.now();
    if (now - this.lastAgentsSent < 250) return;
    this.lastAgentsSent = now;
    this.socket.send(JSON.stringify({ type: "agents", list: list.slice(0, 24) }));
  }

  sendBubble(bubble: { phrase?: string; emote?: string }) {
    this.addBubble({ by: "self", ...bubble, at: Date.now() });
    if (this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify({ type: "bubble", ...bubble }));
  }
}

export const presence = new PresenceClient();

export function usePresence(): Snapshot {
  return useSyncExternalStore(presence.subscribe, presence.getSnapshot);
}
