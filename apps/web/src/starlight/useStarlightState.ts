import { useCallback, useEffect, useRef, useState } from "react";
import {
  starlightStateSchema,
  starlightRequestSchema,
  type IslandEntity,
  type StarlightAction,
  type StarlightRequest,
  type StarlightResponse,
  type StarlightState,
} from "@island/contracts";
import { applyStarlight, emptyStarlight } from "@island/world-core";
import { api, RequestError } from "../api";

export function useStarlightState({
  enabled,
  worldId,
  localKey,
  entities,
  token,
  readOnly = false,
}: {
  enabled: boolean;
  worldId: string | null;
  localKey: string;
  entities: IslandEntity[];
  token?: string;
  readOnly?: boolean;
}) {
  const key = `island-starlight.v1:${worldId ?? `local:${localKey}`}`;
  const [state, setState] = useState<StarlightState>(emptyStarlight);
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [storageWarning, setStorageWarning] = useState("");
  const [pending, setPending] = useState<StarlightRequest | null>(null);
  const [offset, setOffset] = useState(0);
  const epoch = useRef(0),
    locked = useRef(false),
    stateRef = useRef(state),
    pendingRef = useRef(pending);
  stateRef.current = state;
  pendingRef.current = pending;
  const remember = (request: StarlightRequest | null) => {
    pendingRef.current = request;
    setPending(request);
    try {
      request
        ? localStorage.setItem(`${key}:pending`, JSON.stringify(request))
        : localStorage.removeItem(`${key}:pending`);
    } catch {
      setStorageWarning(
        "浏览器无法保存操作记录，请保持本页打开，使用重试确认结果。",
      );
    }
  };
  const accept = useCallback((result: StarlightResponse) => {
    setState((prev) =>
      result.state.revision >= prev.revision ? result.state : prev,
    );
    setOffset(result.serverTime - Date.now());
    setReady(true);
  }, []);
  const refresh = useCallback(async () => {
    if (!enabled || !worldId) return;
    const run = epoch.current;
    try {
      const result = await api<StarlightResponse>(
        `/starlight/${worldId}${token ? `?token=${encodeURIComponent(token)}` : ""}`,
      );
      if (run !== epoch.current) return;
      accept(result);
      setError("");
    } catch (e) {
      if (run === epoch.current)
        setError(e instanceof Error ? e.message : "暂时无法读取观星角。");
    }
  }, [enabled, worldId, token, accept]);
  useEffect(() => {
    epoch.current++;
    locked.current = false;
    setBusy(false);
    setState(emptyStarlight());
    setReady(false);
    setError("");
    setMessage("");
    setPending(null);
    pendingRef.current = null;
    setStorageWarning("");
    setOffset(0);
    if (!enabled) return;
    let raw: string | null = null,
      corrupt = false;
    try {
      raw = localStorage.getItem(worldId ? `${key}:pending` : key);
    } catch {
      setStorageWarning(
        "本机存储不可用，请保持本页打开；刷新后本机进度可能丢失。",
      );
    }
    if (raw && !readOnly) {
      try {
        if (worldId) {
          const parsed = starlightRequestSchema.parse(JSON.parse(raw));
          setPending(parsed);
          pendingRef.current = parsed;
        } else setState(starlightStateSchema.parse(JSON.parse(raw)));
      } catch {
        if (worldId)
          setStorageWarning(
            "本机待确认操作无法读取；请刷新核对云端记录后再操作。",
          );
        else {
          corrupt = true;
          setError(
            "本机观星角记录格式无法识别，已暂停写入以保留原记录。请使用原版本打开或先备份记录。",
          );
        }
      }
    }
    if (worldId) void refresh();
    else setReady(!corrupt);
    return () => {
      epoch.current++;
    };
  }, [key, enabled, readOnly, refresh, worldId]);
  useEffect(() => {
    if (!enabled || !worldId) return;
    const refreshVisible = () => {
      if (!document.hidden && !locked.current) void refresh();
    };
    const timer = setInterval(refreshVisible, 15_000);
    window.addEventListener("focus", refreshVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refreshVisible);
    };
  }, [enabled, worldId, refresh]);
  const send = async (request: StarlightRequest) => {
    if (locked.current || !ready || readOnly) return null;
    locked.current = true;
    setBusy(true);
    setError("");
    const run = epoch.current;
    if (worldId) remember(request);
    try {
      const result = worldId
        ? await api<StarlightResponse>(`/starlight/${worldId}/actions`, {
            method: "POST",
            body: JSON.stringify(request),
          })
        : {
            ...applyStarlight(stateRef.current, request, Date.now(), entities),
            serverTime: Date.now(),
          };
      if (run !== epoch.current) return null;
      accept(result);
      stateRef.current = result.state;
      setMessage(result.message);
      if (worldId) remember(null);
      else {
        try {
          localStorage.setItem(key, JSON.stringify(result.state));
        } catch {
          setStorageWarning("本机存储不可用，刷新后这次进度可能丢失。");
        }
      }
      return result;
    } catch (e) {
      if (run !== epoch.current) return null;
      setError(
        e instanceof Error ? e.message : "连接中断，请重试确认操作结果。",
      );
      if (e instanceof RequestError && e.status >= 400 && e.status < 500) {
        remember(null);
        if (e.code === "PLAY_CONFLICT") void refresh();
      }
      return null;
    } finally {
      if (run === epoch.current) {
        locked.current = false;
        setBusy(false);
      }
    }
  };
  const act = (action: StarlightAction) => {
    if (pendingRef.current) {
      setError("上次操作结果尚未确认，请先重试；不会重复扣料。");
      return Promise.resolve(null);
    }
    return send({
      actionId: crypto.randomUUID(),
      expectedRevision: stateRef.current.revision,
      action,
    });
  };
  return {
    state,
    ready,
    busy,
    error,
    message,
    storageWarning,
    pending,
    offset,
    refresh,
    act,
    retry: () => (pendingRef.current ? send(pendingRef.current) : refresh()),
    cloud: !!worldId,
    readOnly,
  };
}
