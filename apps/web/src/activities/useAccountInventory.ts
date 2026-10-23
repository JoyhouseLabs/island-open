import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { inventoryStateSchema, type InventoryState } from "@island/contracts";
import { api, RequestError } from "../api";
import { ActivityEvents } from "./events";
const permanent = new Set([
  "INVALID_ACTION",
  "UNKNOWN_ITEM",
  "STACK_FULL",
  "ALREADY_OWNED",
  "NOT_ENOUGH_STARS",
  "TOO_MANY_EVENTS",
  "IDEMPOTENCY_KEY_REUSED",
  "SERVER_ACTIVITY_REQUIRED",
  "REWARD_UNAVAILABLE",
]);
export type AccountInventory = ReturnType<typeof useAccountInventory>;
export function useAccountInventory(accountId: string | null) {
  const queue = useMemo(
    () =>
      accountId
        ? new ActivityEvents(
            accountId,
            {
              getItem: (key) => localStorage.getItem(key),
              setItem: (key, value) => localStorage.setItem(key, value),
              removeItem: (key) => localStorage.removeItem(key),
              key: (index) => localStorage.key(index),
              get length() {
                return localStorage.length;
              },
            },
            (request) =>
              api("/inventory/act", {
                method: "POST",
                body: JSON.stringify(request),
              }),
            (error) =>
              error instanceof RequestError && permanent.has(error.code),
          )
        : null,
    [accountId],
  );
  const [state, setState] = useState<InventoryState | null>(null),
    [error, setError] = useState(""),
    [pending, setPending] = useState(0),
    [busy, setBusy] = useState(false);
  const scope = useRef(accountId),
    active = useRef(true),
    stateRef = useRef(state);
  const control = useMemo(
    () => ({
      running: null as Promise<boolean> | null,
      requested: false,
      purchasing: false,
    }),
    [queue],
  );
  scope.current = accountId;
  const refresh = useCallback((): Promise<boolean> => {
    if (!queue || !accountId) return Promise.resolve(false);
    if (control.running) {
      control.requested = true;
      return control.running;
    }
    const valid = () => active.current && scope.current === accountId;
    if (valid()) setBusy(true);
    control.running = (async () => {
      try {
        do {
          control.requested = false;
          await queue.flush();
          const { fresh: _fresh, ...data } = await api<
            InventoryState & { fresh?: boolean }
          >(`/inventory?accountId=${encodeURIComponent(accountId)}`);
          const next = inventoryStateSchema.parse(data);
          if (valid()) {
            stateRef.current = next;
            setState(next);
            setError("");
          }
        } while (control.requested && valid());
        return true;
      } catch (e) {
        if (valid()) {
          if (
            e instanceof RequestError &&
            (e.code === "ACCOUNT_CHANGED" || e.status === 401)
          ) {
            setState(null);
            stateRef.current = null;
          }
          setError(
            e instanceof Error ? e.message : "背包尚未同步，请联网后重试",
          );
        }
        return false;
      } finally {
        if (valid()) {
          try {
            setPending(queue.pending);
          } catch {
            /* Keep the visible storage error. */
          }
          setBusy(false);
        }
        control.running = null;
      }
    })();
    return control.running;
  }, [queue, accountId, control]);
  useEffect(() => {
    active.current = true;
    // Keyed page mounts normally isolate accounts; also fence a prop-only account switch.
    stateRef.current = null;
    setState(null);
    setError("");
    setPending(0);
    void refresh();
    const retry = () => {
      if (!document.hidden) void refresh();
    };
    const storage = (e: StorageEvent) => {
      if (
        !e.key ||
        e.key.startsWith(queue?.prefix ?? "island-account-action-v2:")
      )
        retry();
    };
    const timer = setInterval(retry, 15000);
    window.addEventListener("focus", retry);
    window.addEventListener("online", retry);
    window.addEventListener("storage", storage);
    document.addEventListener("visibilitychange", retry);
    return () => {
      active.current = false;
      clearInterval(timer);
      window.removeEventListener("focus", retry);
      window.removeEventListener("online", retry);
      window.removeEventListener("storage", storage);
      document.removeEventListener("visibilitychange", retry);
    };
  }, [queue, refresh]);
  const record = useCallback(
    (event: { type: string; detail?: string }) => {
      if (!queue) return;
      try {
        queue.record(event);
        setPending(queue.pending);
        void refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [queue, refresh],
  );
  const buy = useCallback(
    async (id: string) => {
      if (!queue || control.purchasing) return false;
      control.purchasing = true;
      try {
        if (!(await refresh()) || scope.current !== accountId) return false;
        if (stateRef.current?.owned[id]) return true;
        queue.enqueue({ op: "buy", itemId: id });
        setPending(queue.pending);
        return await refresh();
      } catch (e) {
        if (active.current && scope.current === accountId)
          setError((e as Error).message);
        return false;
      } finally {
        control.purchasing = false;
      }
    },
    [queue, accountId, refresh, control],
  );
  return { accountId, state, error, pending, busy, refresh, record, buy };
}
