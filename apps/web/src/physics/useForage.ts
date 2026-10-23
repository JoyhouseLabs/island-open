import { useEffect, useRef, useState } from "react";
import {
  forageAvailabilitySchema,
  type ForageAvailability,
} from "@island/contracts";
import { forageCatalog } from "@island/world-core";
import { api } from "../api";
import type { PhysicsConnection } from "./PhysicsConnection";
import type { AccountInventory } from "../activities/useAccountInventory";

export function useForage(
  conn: PhysicsConnection | null,
  inventory: AccountInventory,
  paused: boolean,
) {
  const [spots, setSpots] = useState<ForageAvailability["spots"]>([]),
    [message, setMessage] = useState("");
  const live = useRef({ paused, inventory });
  live.current = { paused, inventory };
  const accountId = inventory.accountId,
    connectionId = conn?.you,
    layout = conn?.scene;
  useEffect(() => {
    setSpots([]);
    setMessage("");
    if (!conn || !accountId || !connectionId || conn.status !== "connected")
      return;
    let alive = true,
      reading = false,
      collecting = false,
      offset = 0,
      available: ForageAvailability["spots"] = [],
      retryAt = 0;
    const base = `/physics/scenes/${conn.sceneId}/forage`,
      context = { accountId, connectionId };
    const current = () =>
      alive && conn.status === "connected" && conn.you === connectionId;
    const refresh = async () => {
      if (!current() || reading) return;
      reading = true;
      try {
        const result = forageAvailabilitySchema.parse(
          await api(`${base}?${new URLSearchParams(context)}`),
        );
        if (current()) {
          available = result.spots;
          offset = Date.now() - result.serverTime;
        }
      } catch (error) {
        if (current())
          setMessage(
            error instanceof Error ? error.message : "采集状态尚未同步",
          );
      } finally {
        reading = false;
      }
    };
    const tick = async () => {
      if (!current() || document.hidden) return;
      const visible = available.filter((s) => s.readyAt + offset <= Date.now());
      setSpots((previous) =>
        previous.length === visible.length &&
        previous.every((s, i) => s === visible[i])
          ? previous
          : visible,
      );
      const actor = conn.me;
      if (
        live.current.paused ||
        conn.editing ||
        !actor?.grounded ||
        actor.seatId ||
        collecting ||
        Date.now() < retryAt
      )
        return;
      const spot = visible.find(
        (s) =>
          Math.hypot(
            actor.position.x - s.position.x,
            actor.position.z - s.position.z,
          ) < 1.05 && Math.abs(actor.position.y - s.position.y - 0.55) < 0.5,
      );
      if (!spot) return;
      collecting = true;
      let confirmed = false;
      try {
        const result = await api<{ readyAt: number }>(base, {
          method: "POST",
          body: JSON.stringify({
            ...context,
            spotId: spot.id,
            claimId: spot.claimId,
          }),
        });
        if (current()) {
          confirmed = true;
          available = available.map((s) =>
            s.id === spot.id ? { ...s, readyAt: result.readyAt } : s,
          );
          setSpots(available.filter((s) => s.readyAt + offset <= Date.now()));
          setMessage(
            `捡到了${forageCatalog.find((f) => f.kind === spot.kind)!.name}，已放入背包`,
          );
          void live.current.inventory.refresh();
        }
      } catch (error) {
        if (current())
          setMessage(
            error instanceof Error
              ? error.message
              : "拾取结果尚未确认，联网后重试",
          );
        retryAt = Date.now() + 5000;
      } finally {
        collecting = false;
        await refresh();
        const recovered = available.find((s) => s.id === spot.id);
        if (
          !confirmed &&
          current() &&
          recovered &&
          recovered.claimId !== spot.claimId &&
          recovered.readyAt + offset > Date.now()
        ) {
          setMessage("拾取记录已恢复，收获已放入背包");
          void live.current.inventory.refresh();
        }
      }
    };
    void refresh();
    const timer = setInterval(() => void tick(), 200),
      poll = setInterval(() => {
        if (!document.hidden) void refresh();
      }, 15000);
    const retry = () => {
      void refresh();
    };
    window.addEventListener("focus", retry);
    window.addEventListener("online", retry);
    return () => {
      alive = false;
      clearInterval(timer);
      clearInterval(poll);
      window.removeEventListener("focus", retry);
      window.removeEventListener("online", retry);
    };
  }, [conn, connectionId, accountId, layout]);
  return { spots, message };
}
