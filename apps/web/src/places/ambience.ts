import { useCallback, useEffect, useRef, useState } from "react";
import { contentAssetBytes } from "../api";

/** Bounded decoded buffers; all live audio nodes belong to the mounted page. */
const buffers = new Map<string, AudioBuffer>();
export function usePlaceAmbience(assetId: string | undefined, volume: number) {
  const [on, setOn] = useState(false),
    [loading, setLoading] = useState(false);
  const context = useRef<AudioContext | null>(null);
  const toggle = useCallback(() => {
    if (!on && assetId) {
      // Create/resume within the explicit gesture, including on mobile browsers.
      try {
        const ctx = (context.current ??= new AudioContext());
        void ctx.resume().catch(() => setOn(false));
        setOn(true);
      } catch {
        setOn(false);
      }
    } else setOn(false);
  }, [on, assetId]);
  useEffect(() => {
    if (!on || !assetId || !context.current) return;
    const ctx = context.current;
    let disposed = false,
      source: AudioBufferSourceNode | undefined,
      gain: GainNode | undefined;
    setLoading(true);
    const load = async () => {
      let buffer = buffers.get(assetId);
      if (!buffer) {
        buffer = await ctx.decodeAudioData(await contentAssetBytes(assetId));
        if (disposed) return;
        if (buffers.size >= 8) buffers.delete(buffers.keys().next().value!);
        buffers.set(assetId, buffer);
      }
      if (disposed) return;
      source = ctx.createBufferSource();
      gain = ctx.createGain();
      source.buffer = buffer;
      source.loop = true;
      gain.gain.value = volume;
      source.connect(gain);
      gain.connect(ctx.destination);
      source.start();
      if (document.hidden) await ctx.suspend();
      else await ctx.resume();
    };
    void load()
      .catch(() => {
        if (!disposed) setOn(false);
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    const visibility = () => {
      if (disposed || ctx.state === "closed") return;
      void (document.hidden ? ctx.suspend() : ctx.resume()).catch(() => {});
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", visibility);
      try {
        source?.stop();
      } catch {
        /* Already stopped. */
      }
      source?.disconnect();
      gain?.disconnect();
      setLoading(false);
    };
  }, [on, assetId, volume]);
  useEffect(
    () => () => {
      const ctx = context.current;
      context.current = null;
      if (ctx && ctx.state !== "closed") void ctx.close().catch(() => {});
    },
    [],
  );
  return { on, loading, toggle };
}
