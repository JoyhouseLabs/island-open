import { useEffect, useRef, useState } from "react";
import type { Weather } from "@island/contracts";
import { assetBytes } from "./api";
import { acquireStorm, onStormFlash } from "./storm";

export type AmbientId = "shore" | "rain" | "wind" | "thunder";
/** Looping beds; thunder is not a bed but a clap scheduled after each flash. */
const LOOPS = { shore: 1, rain: 0.85, wind: 0.7 } as const;
const LOOP_IDS = Object.keys(LOOPS) as (keyof typeof LOOPS)[];
const VOLUME_KEY = "island-audio-volume-v1";
const allOff = (): Record<AmbientId, boolean> => ({
  shore: false,
  rain: false,
  wind: false,
  thunder: false,
});
const stormy = (weather: Weather) =>
  ({
    rain: weather === "rain" || weather === "thunder",
    wind: weather === "wind" || weather === "thunder",
    thunder: weather === "thunder",
  }) satisfies Record<"rain" | "wind" | "thunder", boolean>;

/**
 * The island's ambience mixer: the shore bed plus weather-driven rain, wind
 * and thunder claps. Weather and the island/beach route set the defaults;
 * a manual toggle holds until the next weather or route change.
 */
export function useAudio(
  notify: (message: string) => void,
  {
    weather,
    coastal,
  }: { weather: Weather; coastal: boolean },
) {
  const [on, setOn] = useState<Record<AmbientId, boolean>>(allOff),
    [loading, setLoading] = useState(false),
    [volume, setVolume] = useState(() => {
      try {
        const saved = Number(localStorage.getItem(VOLUME_KEY));
        if (Number.isFinite(saved) && saved >= 0 && saved <= 1) return saved;
      } catch {
        /* Private browsing keeps the default for this visit. */
      }
      return 0.35;
    });
  const context = useRef<AudioContext | null>(null),
    master = useRef<GainNode | null>(null),
    loops = useRef<
      Partial<
        Record<
          keyof typeof LOOPS,
          { source: AudioBufferSourceNode; gain: GainNode }
        >
      >
    >({}),
    buffers = useRef<Partial<Record<AmbientId, Promise<AudioBuffer>>>>({});
  const thunder = useRef<{
    release: () => void;
    off: () => void;
    clap: ReturnType<typeof setTimeout>;
  } | null>(null);
  const desired = useRef<Record<AmbientId, boolean>>(allOff()),
    started = useRef(false),
    remember = useRef<Record<AmbientId, boolean> | null>(null),
    volumeRef = useRef(volume),
    loadingCount = useRef(0);
  volumeRef.current = volume;
  const ensureContext = () => {
    const ctx = (context.current ??= new AudioContext());
    if (!master.current) {
      const g = ctx.createGain();
      g.gain.value = volumeRef.current;
      g.connect(ctx.destination);
      master.current = g;
    }
    return ctx;
  };
  const loadBuffer = (id: AmbientId) =>
    (buffers.current[id] ??= assetBytes(id)
      .then((bytes) => ensureContext().decodeAudioData(bytes))
      .catch((error) => {
        delete buffers.current[id];
        throw error;
      }));
  const startLoop = async (id: keyof typeof LOOPS) => {
    loadingCount.current++;
    setLoading(true);
    try {
      const ctx = ensureContext();
      await ctx.resume().catch(() => {});
      const buffer = await loadBuffer(id);
      if (desired.current[id] !== true) return;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, ctx.currentTime);
      g.connect(master.current!);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(g);
      source.start();
      if (loops.current[id]) {
        source.stop();
        g.disconnect();
        return;
      }
      loops.current[id] = { source, gain: g };
      g.gain.setTargetAtTime(LOOPS[id], ctx.currentTime, 0.3);
    } catch {
      notify("环境音未能加载，请检查连接后再次点击声音按钮。");
      setOn((prev) => ({ ...prev, [id]: false }));
    } finally {
      if (--loadingCount.current <= 0) setLoading(false);
    }
  };
  const stopLoop = (id: keyof typeof LOOPS) => {
    const entry = loops.current[id];
    if (!entry) return;
    delete loops.current[id];
    entry.gain.gain.setTargetAtTime(0, context.current!.currentTime, 0.08);
    setTimeout(() => {
      try {
        entry.source.stop();
      } catch {
        /* Already stopped with its context. */
      }
      entry.gain.disconnect();
    }, 500);
  };
  const clap = async () => {
    if (!thunder.current || desired.current.thunder !== true) return;
    try {
      const ctx = ensureContext();
      const buffer = await loadBuffer("thunder");
      if (!thunder.current || desired.current.thunder !== true) return;
      const g = ctx.createGain();
      // Each clap differs a little in loudness and pitch.
      g.gain.value = 0.45 + Math.random() * 0.3;
      g.connect(master.current!);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = 0.85 + Math.random() * 0.3;
      source.connect(g);
      source.start();
      source.onended = () => g.disconnect();
    } catch {
      notify("雷声未能加载，雷雨暂时只有雨声。");
      setOn((prev) => ({ ...prev, thunder: false }));
    }
  };
  const armThunder = () => {
    let armed = true;
    const release = acquireStorm(),
      off = onStormFlash(() => {
        // Thunder trails its flash, the way it does in a real storm.
        const delay = 700 + Math.random() * 1500;
        const timer = setTimeout(() => {
          if (armed) void clap();
        }, delay);
        if (thunder.current) thunder.current.clap = timer;
      });
    thunder.current = {
      release: () => {
        armed = false;
        release();
      },
      off,
      clap: setTimeout(() => {}, 0),
    };
  };
  const disarmThunder = () => {
    const t = thunder.current;
    if (!t) return;
    clearTimeout(t.clap);
    t.release();
    t.off();
    thunder.current = null;
  };
  // Play what the state asks for; nothing before the first user gesture.
  useEffect(() => {
    desired.current = on;
    for (const id of LOOP_IDS) {
      if (on[id] && !loops.current[id]) void startLoop(id);
      if (!on[id] && loops.current[id]) stopLoop(id);
    }
    if (on.thunder && !thunder.current) armThunder();
    if (!on.thunder && thunder.current) disarmThunder();
    // The mixer owns these functions; notify comes from the world session.
  }, [on, notify]);
  useEffect(() => {
    if (!started.current) return;
    // Weather re-sets the storm sounds; manual picks hold until it changes.
    setOn((prev) => ({ ...prev, ...stormy(weather) }));
  }, [weather]);
  useEffect(() => {
    if (!started.current) return;
    // The shore bed belongs to the island and the beach; rooms may opt in.
    setOn((prev) => ({ ...prev, shore: coastal }));
  }, [coastal]);
  useEffect(() => {
    if (!master.current || !context.current) return;
    master.current.gain.setTargetAtTime(
      volume,
      context.current.currentTime,
      0.1,
    );
    try {
      localStorage.setItem(VOLUME_KEY, String(volume));
    } catch {
      /* Private browsing keeps the choice for this visit only. */
    }
  }, [volume]);
  useEffect(() => {
    const change = () => {
      if (document.hidden) {
        void context.current?.suspend();
      } else if (Object.values(desired.current).some(Boolean)) {
        void context.current?.resume().catch(() => {
          setOn(allOff());
          notify("点击声音按钮恢复环境音。");
        });
      }
    };
    document.addEventListener("visibilitychange", change);
    return () => document.removeEventListener("visibilitychange", change);
  }, [notify]);
  useEffect(
    () => () => {
      for (const id of LOOP_IDS) {
        const entry = loops.current[id];
        if (entry) {
          try {
            entry.source.stop();
          } catch {
            /* Context may already be gone. */
          }
          entry.gain.disconnect();
        }
      }
      disarmThunder();
      if (context.current && context.current.state !== "closed") {
        void context.current.close().catch(() => {});
      }
      context.current = null;
      master.current = null;
      // Stale entries would block new sources; buffers die with their context.
      loops.current = {};
      buffers.current = {};
    },
    [],
  );
  const defaults = (): Record<AmbientId, boolean> => ({
    shore: coastal,
    ...stormy(weather),
  });
  const toggle = (id: AmbientId) => {
    if (!started.current) {
      started.current = true;
      // First gesture opens the soundscape with the current defaults.
      setOn({ ...defaults(), [id]: true });
      return;
    }
    setOn((prev) => ({ ...prev, [id]: !prev[id] }));
  };
  const masterButton = () => {
    if (!started.current) {
      started.current = true;
      setOn(defaults());
      return;
    }
    if (Object.values(on).some(Boolean)) {
      remember.current = on;
      setOn(allOff());
    } else {
      setOn(remember.current ?? defaults());
    }
  };
  return {
    on,
    audible: Object.values(on).some(Boolean),
    loading,
    volume,
    setVolume,
    toggle,
    masterButton,
  };
}
