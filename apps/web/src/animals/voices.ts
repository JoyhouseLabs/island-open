import { SPECIES, speciesProfiles, type Species } from "@island/contracts";
import { assetBytes } from "../api";
import { playerAgent } from "./registry";

type VoiceSpecies = Species | "custom" | "friend";
// Which clip each species calls with; new species bring their own asset id
// in the species registry, so nothing here changes per species anymore.
const assetFor: Record<VoiceSpecies, string> = {
  ...Object.fromEntries(SPECIES.map((s) => [s, speciesProfiles[s].voice])),
  custom: "voice-friend",
  friend: "voice-friend",
} as Record<VoiceSpecies, string>;

const buffers = new Map<string, Promise<AudioBuffer>>();
let context: AudioContext | null = null,
  ready = false,
  unlocked = false;
const lastPlay = new Map<string, number>();
let live = 0;

// Browser autoplay rules: stay silent until the first user gesture.
if (typeof window !== "undefined") {
  const unlock = () => {
    unlocked = true;
    window.removeEventListener("pointerdown", unlock);
  };
  window.addEventListener("pointerdown", unlock, { once: true });
}

let enabled = true;
try {
  enabled = localStorage.getItem("island-voices-v1") !== "off";
} catch {
  /* Private browsing keeps the default. */
}
const listeners = new Set<() => void>();
export function voicesEnabled() {
  return enabled;
}
export function setVoicesEnabled(next: boolean) {
  enabled = next;
  try {
    localStorage.setItem("island-voices-v1", next ? "on" : "off");
  } catch {
    /* Keep the choice for this visit only. */
  }
  for (const l of listeners) l();
}
export function onVoicesChanged(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function load(species: VoiceSpecies) {
  const id = assetFor[species];
  let cached = buffers.get(id);
  if (!cached) {
    cached = assetBytes(id)
      .then((bytes) => {
        context ??= new AudioContext();
        return context.decodeAudioData(bytes);
      })
      .catch((error) => {
        buffers.delete(id);
        throw error;
      });
    buffers.set(id, cached);
  }
  return cached;
}

/**
 * One species voice at a world position, attenuated by the distance to the
 * walking player. Skips silently before the first gesture, when muted, when
 * too far away, or when the same species just called (avoiding a barnyard).
 */
export function playVoice(species: VoiceSpecies, x: number, z: number,
  onStart?: (mouth: () => number, duration: number) => void) {
  if (!enabled || !unlocked) return;
  const now = performance.now();
  if (now - (lastPlay.get(species) ?? 0) < 280) return;
  const player = playerAgent();
  const distance = player ? Math.hypot(player.x - x, player.z - z) : 0;
  const gain = Math.max(0, 1 - distance / 32) ** 2;
  if (gain < 0.04 || live >= 4) return;
  lastPlay.set(species, now);
  void load(species)
    .then((buffer) => {
      const ctx = (context ??= new AudioContext());
      if (ctx.state === "suspended") void ctx.resume().catch(() => {});
      const g = ctx.createGain();
      g.gain.value = gain * 0.5;
      g.connect(ctx.destination);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      // A touch of pitch variance keeps repeats from sounding mechanical.
      source.playbackRate.value = 0.94 + Math.random() * 0.14;
      source.connect(g);
      source.onended = () => {
        live--;
        g.disconnect();
      };
      live++;
      source.start();
      const started = ctx.currentTime;
      const rate = source.playbackRate.value;
      const beats = species === "custom" || species === "friend" ? undefined : speciesProfiles[species].voiceBeats;
      onStart?.(() => {
        const elapsed = (ctx.currentTime - started) * rate;
        if (elapsed >= buffer.duration || !enabled) return 0;
        if (beats) return beats.some(([from, to]) => elapsed >= from && elapsed < to) ? 1 : 0;
        return (Math.sin(elapsed * 18) + 1) / 2;
      }, buffer.duration / rate);
    })
    .catch(() => {
      /* A missing voice never interrupts the island. */
    });
}
