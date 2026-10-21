/**
 * A soft two-note sparkle for the moment a forage find lands in the
 * backpack. Synthesized on the spot — no asset to load — and it follows the
 * same autoplay discipline as the animal voices: browsers keep the context
 * suspended until a user gesture, so the first pickup after page load may
 * stay silent and that is fine.
 */
let ctx: AudioContext | null = null;

/** Each find gets its own gentle key so a beach haul sounds like a tune. */
const baseFor: Record<string, number> = {
  petal: 690,
  pinecone: 600,
  mushroom: 620,
  shell: 660,
  starfish: 740,
  crab: 580,
  pebble: 560,
  mote: 820,
};

export function pickupChime(kind: string) {
  if (typeof window === "undefined") return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const base = baseFor[kind] ?? 660,
      t0 = ctx.currentTime;
    // A quick rising fifth: pluck, then the little bell on top.
    for (const [i, mul] of [1, 1.5, 2].entries()) {
      const osc = ctx.createOscillator(),
        gain = ctx.createGain(),
        at = t0 + i * 0.085;
      osc.type = "sine";
      osc.frequency.value = base * mul;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(i === 2 ? 0.05 : 0.13, at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.32);
    }
  } catch {
    /* No audio available: the pickup stays quiet, nothing breaks. */
  }
}
