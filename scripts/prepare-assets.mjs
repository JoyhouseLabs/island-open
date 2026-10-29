import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const root = new URL("../apps/web/public/assets/", import.meta.url);
await mkdir(root, { recursive: true });
const source =
  "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/edc7c9e67c639d230715049ee31f9a96a6babbbe/Models/Fox/glTF-Binary/Fox.glb";
let fox;
try {
  fox = await readFile(new URL("fox.glb", root));
} catch {
  const r = await fetch(source);
  if (!r.ok) throw new Error(`Fox asset HTTP ${r.status}`);
  fox = Buffer.from(await r.arrayBuffer());
  if (fox.toString("ascii", 0, 4) !== "glTF") throw new Error("Invalid GLB");
  await writeFile(new URL("fox.glb", root), fox);
}
const sampleRate = 22050,
  seconds = 16,
  N = sampleRate * seconds;
// Deterministic noise source shared by every texture below.
let seed = 41;
const rnd = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return (seed / 4294967296) * 2 - 1;
};
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
// Original seamless procedural ambience: filtered noise with slow periodic surf.
const shore = new Float32Array(N);
{
  let low = 0;
  for (let i = 0; i < N; i++) {
    const noise = rnd();
    low = 0.975 * low + 0.025 * noise;
    const t = i / sampleRate;
    const swell = 0.35 + 0.65 * Math.sin((Math.PI * t) / 8) ** 2;
    shore[i] = low * swell * 0.6 + noise * 0.014 * swell;
  }
}
// Rain: steady high hiss over low patter that clusters via a random walk.
const rain = new Float32Array(N);
{
  let hiss = 0,
    body = 0,
    walk = 0.5;
  for (let i = 0; i < N; i++) {
    const noise = rnd();
    hiss = 0.55 * hiss + 0.45 * noise;
    body = 0.94 * body + 0.06 * noise;
    walk = clamp(walk + rnd() * 0.02, 0.25, 1);
    rain[i] = hiss * 0.16 + body * walk * 0.5;
  }
}
// Wind: deeply filtered noise swelled by a slow gusting random walk.
const wind = new Float32Array(N);
{
  let low = 0,
    gust = 0.4;
  for (let i = 0; i < N; i++) {
    const noise = rnd();
    low = 0.985 * low + 0.015 * noise;
    gust = clamp(gust + rnd() * 0.012, 0.12, 1);
    wind[i] = low * gust * 4 + noise * 0.012 * gust;
  }
}
// Thunder: one clap — a short broadband crack over a long rolling rumble.
const thunder = new Float32Array(sampleRate * 6);
{
  let brown = 0,
    low = 0;
  for (let i = 0; i < thunder.length; i++) {
    const noise = rnd(),
      t = i / sampleRate;
    brown = brown * 0.995 + noise * 0.02;
    low = 0.972 * low + 0.028 * brown;
    const crack = t < 0.3 ? Math.exp(-t / 0.08) : 0,
      roll = t < 0.12 ? t / 0.12 : Math.exp(-(t - 0.12) / 1.4),
      echo = t > 1.1 ? Math.exp(-(t - 1.1) / 0.9) * 0.8 : 0;
    thunder[i] = noise * crack * 0.6 + low * (roll + echo) * 2.2;
  }
}
// Species voices: short one-shot chirps, hums, howls and barks. `glide` is
// [from, to, tail?] in Hz; the oscillator accumulates phase so vibrato and
// glides stay smooth instead of clicking.
const tone = (
  out,
  start,
  dur,
  glide,
  { vib = 0, vibHz = 0, noise = 0, curve = 2, gain = 1 } = {},
) => {
  const s0 = Math.floor(start * sampleRate),
    n = Math.floor(dur * sampleRate);
  let phase = 0;
  for (let j = 0; j < n && s0 + j < out.length; j++) {
    const t = j / sampleRate,
      k = t / dur;
    let f = glide[0] + (glide[1] - glide[0]) * k;
    if (glide[2] !== undefined)
      f += (glide[2] - glide[1]) * Math.max(0, k - 0.55) / 0.45;
    phase += ((2 * Math.PI * f) / sampleRate) * (1 + (vib ? Math.sin(2 * Math.PI * vibHz * t) * vib : 0));
    const env = Math.sin(Math.PI * Math.min(1, k)) ** curve;
    out[s0 + j] +=
      (Math.sin(phase) + (noise ? rnd() * noise : 0)) * env * gain;
  }
};
const silence = (seconds) => new Float32Array(Math.floor(sampleRate * seconds));
// Species voices as data: each recipe is a clip length plus a list of
// tone() notes [start, dur, glide, opts] and an optional slow amplitude
// swell [hz, floor, depth]. Adding a species voice = one recipe here; the
// id must match the species registry's `voice` field in
// packages/contracts/src/species.ts.
const voiceRecipes = [
  // Panda: two soft rising chirps.
  {
    id: "voice-panda",
    seconds: 0.62,
    tones: [
      [0.02, 0.17, [620, 940], { vib: 0.012, vibHz: 5.5 }],
      [0.27, 0.24, [660, 1000], { vib: 0.012, vibHz: 5.5 }],
    ],
  },
  // Giraffe: a low hum with stacked harmonics and a slow swell.
  {
    id: "voice-giraffe",
    seconds: 1.2,
    swell: [2.2, 0.72, 0.28],
    tones: [
      [0.04, 1.05, [88, 96], { curve: 1.2, gain: 1 }],
      [0.04, 1.05, [132, 144], { curve: 1.2, gain: 0.45 }],
      [0.04, 1.05, [176, 192], { curve: 1.2, gain: 0.25 }],
    ],
  },
  // Wolf: a smooth howl that rises, holds and falls, with a little breath.
  {
    id: "voice-wolf",
    seconds: 1.5,
    tones: [
      [0.06, 1.32, [300, 520, 390], { vib: 0.014, vibHz: 6, noise: 0.05, curve: 1.1 }],
    ],
  },
  // Fox: one quick bright bark.
  {
    id: "voice-fox",
    seconds: 0.26,
    tones: [
      [0.01, 0.22, [820, 1180], { vib: 0.02, vibHz: 8, noise: 0.1, curve: 1.6 }],
    ],
  },
  // Friend: a generic happy two-hop chirp for custom companions.
  {
    id: "voice-friend",
    seconds: 0.52,
    tones: [
      [0.02, 0.14, [520, 640], { curve: 1.4 }],
      [0.2, 0.2, [700, 880], { curve: 1.4 }],
    ],
  },
  // Three soft original meows, with quiet gaps for the closed mouth.
  {
    id: "voice-cat",
    seconds: 2.12,
    tones: [0, 0.7, 1.4].flatMap((offset) => [
      [offset + 0.02, 0.16, [530, 820], { vib: 0.012, vibHz: 6, curve: 1.3 }],
      [offset + 0.15, 0.43, [820, 410], { vib: 0.018, vibHz: 7, curve: 1.4 }],
    ]),
  },
  // Vaporeon: bubbly water chirps — two droppy plips, then a splash.
  {
    id: "voice-vaporeon",
    seconds: 0.58,
    tones: [
      [0.02, 0.16, [980, 640], { vib: 0.016, vibHz: 9, curve: 1.5 }],
      [0.22, 0.14, [880, 560], { vib: 0.016, vibHz: 9, curve: 1.5 }],
      [0.4, 0.14, [520, 760], { noise: 0.08, curve: 1.8 }],
    ],
  },
];
function renderVoice(recipe) {
  const out = silence(recipe.seconds);
  for (const [start, dur, glide, opts] of recipe.tones)
    tone(out, start, dur, glide, opts);
  if (recipe.swell) {
    const [hz, floor, depth] = recipe.swell;
    for (let i = 0; i < out.length; i++)
      out[i] *= floor + depth * Math.sin((2 * Math.PI * hz * i) / sampleRate);
  }
  return out;
}
const normalize = (samples, peak) => {
  let max = 0;
  for (const v of samples) max = Math.max(max, Math.abs(v));
  if (max > 0) for (let i = 0; i < samples.length; i++) samples[i] = (samples[i] / max) * peak;
  return samples;
};
// Fade both ends to zero to avoid loop discontinuities; thunder only tails out.
const fadeLoop = (samples, fade) => {
  for (let i = 0; i < samples.length; i++)
    samples[i] *= Math.min(
      1,
      i / (sampleRate * fade),
      (samples.length - i - 1) / (sampleRate * fade),
    );
  return samples;
};
const fadeOut = (samples, fade) => {
  for (let i = 0; i < samples.length; i++)
    samples[i] *= Math.min(1, (samples.length - i - 1) / (sampleRate * fade));
  return samples;
};
const wav = (samples) => {
  const pcm = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++)
    pcm.writeInt16LE(
      Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767),
      i * 2,
    );
  const header = Buffer.alloc(44);
  header.write("RIFF");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
};
const files = [
  ["shore", wav(fadeLoop(shore, 0.12))],
  ["rain", wav(fadeLoop(normalize(rain, 0.5), 0.12))],
  ["wind", wav(fadeLoop(normalize(wind, 0.55), 0.12))],
  ["thunder", wav(fadeOut(normalize(thunder, 0.9), 0.05))],
  ...voiceRecipes.map((r) => [r.id, wav(fadeOut(normalize(renderVoice(r), 0.5), 0.03))]),
];
for (const [id, data] of files) await writeFile(new URL(`${id}.wav`, root), data);
const manifest = {
  id: "island/core",
  version: "1.1.0",
  assets: [
    ["fox", fox, "model/gltf-binary", "fox.glb"],
    ...files.map(([id, data]) => [id, data, "audio/wav", `${id}.wav`]),
  ].map(([id, data, mime, file]) => ({
    id,
    file,
    url: `/api/content/core/${id}`,
    sha256: createHash("sha256").update(data).digest("hex"),
    bytes: data.length,
    mime,
  })),
};
await writeFile(
  new URL("manifest.json", root),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  "Prepared versioned HTTP asset package:",
  manifest.assets.map((a) => `${a.id}: ${a.bytes} bytes`).join(", "),
);
