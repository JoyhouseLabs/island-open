import type { ObjectDefinition } from "@island/contracts";

export type PhysicsSound = "step" | "land" | "contact";
/** Short synthesized material cues, activated only by the sound button. */
export class PhysicsAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices = new Set<OscillatorNode>();
  private last = new Map<string, number>();
  private disposed = false;
  enabled = false;
  paused = false;
  played = 0;
  async toggle(): Promise<boolean> {
    if (this.disposed) return false;
    if (this.enabled) {
      this.enabled = false;
      this.master?.gain.setValueAtTime(0, this.context!.currentTime);
      return false;
    }
    try {
      this.context ??= new AudioContext();
      if (!this.master) {
        this.master = this.context.createGain();
        this.master.connect(this.context.destination);
      }
      await this.context.resume();
      if (this.disposed) return false;
      this.enabled = this.context.state === "running";
      this.master.gain.value = this.enabled && !this.paused ? 0.6 : 0;
      return this.enabled;
    } catch {
      return false;
    }
  }
  setPaused(paused: boolean) {
    this.paused = paused;
    if (this.context && this.master)
      this.master.gain.setValueAtTime(
        this.enabled && !paused ? 0.6 : 0,
        this.context.currentTime,
      );
  }
  play(
    kind: PhysicsSound,
    material: ObjectDefinition["material"],
    strength = 0.5,
  ) {
    const ctx = this.context;
    if (
      this.disposed ||
      !this.enabled ||
      this.paused ||
      document.hidden ||
      ctx?.state !== "running" ||
      !this.master ||
      this.voices.size >= 4
    )
      return;
    const key = `${kind}:${material}`,
      now = ctx.currentTime;
    if (now - (this.last.get(key) ?? -1) < (kind === "step" ? 0.18 : 0.08))
      return;
    this.last.set(key, now);
    const base = { wood: 170, stone: 95, rubber: 290, ice: 650 }[material];
    const oscillator = ctx.createOscillator(),
      gain = ctx.createGain();
    const duration = kind === "step" ? 0.07 : 0.17;
    oscillator.type = material === "stone" ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(base, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      base * 0.45,
      now + duration,
    );
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(
      Math.min(0.12, Math.max(0.01, strength * 0.1)),
      now + 0.005,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(this.master);
    this.voices.add(oscillator);
    oscillator.onended = () => {
      this.voices.delete(oscillator);
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start();
    oscillator.stop(now + duration + 0.01);
    this.played++;
  }
  dispose() {
    this.disposed = true;
    this.enabled = false;
    for (const voice of this.voices) {
      try {
        voice.stop();
      } catch {
        /* already stopped */
      }
      voice.disconnect();
    }
    this.voices.clear();
    this.master?.disconnect();
    if (this.context && this.context.state !== "closed")
      void this.context.close().catch(() => {});
    this.context = null;
    this.master = null;
  }
}
