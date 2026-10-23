import { useCallback, useEffect, useRef, useState } from "react";
import {
  forageAvailabilitySchema,
  type ForageAvailability,
} from "@island/contracts";
import { forageCatalog } from "@island/world-core";
import { api } from "../api";

export type PlaceForageSpot = ForageAvailability["spots"][number];

/** Published places roam on a local runtime, so the shared capsule rule in the
 * scene calls collect(); receipts, cooldowns and recovery stay server-side. */
export function usePlaceForage(
  placeId: string,
  accountId: string,
  paused: boolean,
  onPickedUp?: () => void,
) {
  const [spots, setSpots] = useState<PlaceForageSpot[]>([]),
    [message, setMessage] = useState("");
  const live = useRef({ paused, onPickedUp });
  live.current = { paused, onPickedUp };
  const state = useRef({
    alive: false,
    reading: false,
    collecting: false,
    offset: 0,
    retryAt: 0,
    available: [] as ForageAvailability["spots"],
  });
  const refresh = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    const s = state.current,
      base = `/physics/activities/places/${encodeURIComponent(placeId)}/forage`;
    s.alive = true;
    s.reading = false;
    s.collecting = false;
    s.offset = 0;
    s.retryAt = 0;
    s.available = [];
    setSpots([]);
    setMessage("");
    const publish = () => {
      if (!s.alive) return;
      const visible = s.available.filter(
        (x) => x.readyAt + s.offset <= Date.now(),
      );
      setSpots((previous) =>
        previous.length === visible.length &&
        previous.every((x, i) => x === visible[i])
          ? previous
          : visible,
      );
    };
    const read = async () => {
      if (!s.alive || s.reading) return;
      s.reading = true;
      try {
        const result = forageAvailabilitySchema.parse(
          await api(`${base}?${new URLSearchParams({ accountId })}`),
        );
        if (s.alive) {
          s.available = result.spots;
          s.offset = Date.now() - result.serverTime;
          publish();
        }
      } catch (error) {
        if (s.alive)
          setMessage(
            error instanceof Error ? error.message : "采集状态尚未同步",
          );
      } finally {
        s.reading = false;
      }
    };
    refresh.current = read;
    void read();
    const timer = setInterval(() => {
      if (!document.hidden) publish();
    }, 250);
    const poll = setInterval(() => {
      if (!document.hidden) void read();
    }, 15000);
    const retry = () => void read();
    window.addEventListener("focus", retry);
    window.addEventListener("online", retry);
    return () => {
      s.alive = false;
      clearInterval(timer);
      clearInterval(poll);
      window.removeEventListener("focus", retry);
      window.removeEventListener("online", retry);
    };
  }, [placeId, accountId]);
  const collect = useCallback(
    async (spot: PlaceForageSpot) => {
      const s = state.current;
      if (
        !s.alive ||
        s.collecting ||
        live.current.paused ||
        Date.now() < s.retryAt
      )
        return;
      s.collecting = true;
      let confirmed = false;
      try {
        const result = await api<{ readyAt: number }>(
          `/physics/activities/places/${encodeURIComponent(placeId)}/forage`,
          {
            method: "POST",
            body: JSON.stringify({
              accountId,
              spotId: spot.id,
              claimId: spot.claimId,
            }),
          },
        );
        if (s.alive) {
          confirmed = true;
          s.available = s.available.map((x) =>
            x.id === spot.id ? { ...x, readyAt: result.readyAt } : x,
          );
          setSpots(
            s.available.filter((x) => x.readyAt + s.offset <= Date.now()),
          );
          setMessage(
            `捡到了${forageCatalog.find((f) => f.kind === spot.kind)!.name}，已放入背包`,
          );
          live.current.onPickedUp?.();
        }
      } catch (error) {
        if (s.alive)
          setMessage(
            error instanceof Error ? error.message : "拾取结果尚未确认，联网后重试",
          );
        s.retryAt = Date.now() + 5000;
      } finally {
        s.collecting = false;
        await refresh.current();
        const recovered = s.available.find((x) => x.id === spot.id);
        if (
          !confirmed &&
          s.alive &&
          recovered &&
          recovered.claimId !== spot.claimId &&
          recovered.readyAt + s.offset > Date.now()
        ) {
          setMessage("拾取记录已恢复，收获已放入背包");
          live.current.onPickedUp?.();
        }
      }
    },
    [placeId, accountId],
  );
  return { spots, message, collect };
}
