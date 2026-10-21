import { useCallback, useEffect, useRef, useState } from "react";
import { contentAssetBytes } from "../api";

/** Decoded place loops cached per asset so revisits start instantly. */
const buffers = new Map<string, Promise<AudioBuffer>>();

/**
 * The place's own ambience loop. v1 runs beside the island mixer with a
 * dedicated context, started only by an explicit tap (browser gesture rules).
 */
export function usePlaceAmbience(assetId: string | undefined, volume: number) {
  const [on, setOn] = useState(false),
    [loading, setLoading] = useState(false);
  const context = useRef<AudioContext | null>(null),
    source = useRef<AudioBufferSourceNode | null>(null),
    gain = useRef<GainNode | null>(null);
  useEffect(() => {
    if (!on || !assetId) return;
    let disposed = false;
    setLoading(true);
    let load = buffers.get(assetId);
    if (!load) {
      load = contentAssetBytes(assetId)
        .then((bytes) => new AudioContext().decodeAudioData(bytes))
        .catch((error) => {
          buffers.delete(assetId);
          throw error;
        });
      buffers.set(assetId, load);
    }
    load.then((buffer) => {
        if (disposed) return;
        const ctx = (context.current ??= new AudioContext());
        const g = (gain.current ??= ctx.createGain());
        g.connect(ctx.destination);
        const s = ctx.createBufferSource();
        s.buffer = buffer;
        s.loop = true;
        s.connect(g);
        s.start();
        source.current = s;
        void ctx.resume().catch(() => {});
        g.gain.setValueAtTime(0, ctx.currentTime);
        g.gain.setTargetAtTime(volume, ctx.currentTime, 0.4);
      })
      .catch(() => {
        if (!disposed) setOn(false);
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [on, assetId, volume]);
  useEffect(() => {
    if (gain.current && context.current)
      gain.current.gain.setTargetAtTime(
        on ? volume : 0,
        context.current.currentTime,
        0.15,
      );
  }, [volume, on]);
  const toggle = useCallback(() => {
    if (on) {
      setOn(false);
      const g = gain.current,
        ctx = context.current,
        s = source.current;
      if (g && ctx) {
        g.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
        window.setTimeout(() => {
          try {
            s?.stop();
          } catch {
            /* Already stopped. */
          }
          g.disconnect();
          source.current = null;
          // A fresh gain next time; the old node is disconnected forever.
          gain.current = null;
        }, 400);
      }
    } else {
      setOn(true);
    }
  }, [on]);
  useEffect(
    () => () => {
      try {
        source.current?.stop();
      } catch {
        /* Context may already be gone. */
      }
      gain.current?.disconnect();
      if (context.current && context.current.state !== "closed")
        void context.current.close().catch(() => {});
      context.current = null;
      gain.current = null;
      source.current = null;
    },
    [],
  );
  return { on, loading, toggle };
}
