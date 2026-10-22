import { useEffect, useState } from "react";
import {
  deviceDefinitions,
  deviceSchema,
  type WorldSnapshot,
  type InventoryState,
  type ItemDefinition,
  type DeviceInstance,
} from "@island/contracts";
import type { useWorld } from "../useWorld";
import { api } from "../api";
import { readDraft, writeDraft } from "../drafts";
import SceneContentPanel from "../scene-content/SceneContentPanel";
import { glyphForDevice, ItemGlyph } from "../building/itemGlyphs";
type Props = {
  room?: ReturnType<typeof useWorld>;
  snapshot?: WorldSnapshot;
  worldId?: string;
  userId?: string;
  token?: string;
  deviceId: string;
  onClose: () => void;
  onSelect?: (id: string) => void;
};
type DeviceDraft = { value: string; basePayload: string | null };
function deviceText(d: DeviceInstance): string {
  return d.payload.kind === "sign"
    ? d.payload.lines.join("\n")
    : d.payload.kind === "nameplate"
      ? d.payload.name
      : d.payload.kind === "displayCase"
        ? (d.payload.itemRef?.itemId ?? "")
        : "";
}

export default function DevicePanel(p: Props) {
  // Scope async reads and unsaved input to one account, room and device.
  const scope = `${p.room?.user?.id ?? p.userId ?? "local"}:${p.room?.record?.id ?? p.worldId ?? "local-library"}:${p.deviceId}`;
  return <DeviceEditor key={scope} {...p} />;
}

function DeviceEditor(p: Props) {
  const snapshot = p.room?.snapshot ?? p.snapshot!,
    d = snapshot.devices?.find((d) => d.id === p.deviceId),
    worldId = p.room?.record?.id ?? p.worldId,
    readonly = !p.room || p.room.unsupported,
    userId = p.room?.user?.id ?? p.userId ?? "local",
    key = `device-text-v1:${userId}:${worldId ?? "local-library"}:${p.deviceId}`;
  const [draft, setDraft] = useState<DeviceDraft | null>(null),
    [ready, setReady] = useState(false),
    [items, setItems] = useState<ItemDefinition[]>([]),
    [message, setMessage] = useState(""),
    [display, setDisplay] = useState("");
  const payload = d ? JSON.stringify(d.payload) : "",
    value = draft?.value ?? (d ? deviceText(d) : ""),
    conflict = draft !== null && draft.basePayload !== payload;
  useEffect(() => {
    let active = true;
    if (readonly) {
      setReady(true);
      return;
    }
    void readDraft<DeviceDraft | string | null>(key)
      .then((v) => {
        if (!active) return;
        // Legacy drafts did not record their editing baseline. Require an
        // explicit comparison instead of assuming they match the cloud.
        if (typeof v === "string" || (v && typeof v.value === "string")) {
          setDraft(typeof v === "string" ? { value: v, basePayload: null } : v);
          setMessage("已恢复本机未提交文字。");
        }
      })
      .catch(() => {
        if (active) setMessage("本机草稿暂不可用，请先复制文字。");
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, [key, readonly]);
  useEffect(() => {
    let active = true;
    setDisplay("");
    if (d?.payload.kind === "displayCase") {
      if (!readonly)
        void Promise.all([
          api<{ items: ItemDefinition[] }>("/items"),
          api<InventoryState>("/inventory"),
        ])
          .then(([catalog, inventory]) => {
            if (active)
              setItems(
                catalog.items.filter(
                  (i) =>
                    inventory.owned[i.id] ||
                    (inventory.collected[i.id] ?? 0) > 0,
                ),
              );
          })
          .catch((e) => {
            if (active) setMessage(e.message);
          });
      if (worldId)
        void api<{ name: string; available: boolean }>(
          `/worlds/${worldId}/devices/${d.id}?${p.token ? `t=${encodeURIComponent(p.token)}` : ""}`,
        )
          .then((v) => {
            if (active) setDisplay(v.available ? v.name : "展示物暂不可用");
          })
          .catch(() => {
            if (active) setDisplay("展示权限已失效。");
          });
    }
    return () => {
      active = false;
    };
  }, [p.deviceId, worldId, payload, readonly, p.token]);
  const persistDraft = (next: DeviceDraft | null) => {
    setDraft(next);
    void writeDraft(key, next).catch(() =>
      setMessage("本机草稿无法保存，请先复制文字。"),
    );
  };
  const changeValue = (value: string) => {
    persistDraft({
      value,
      basePayload: draft?.basePayload ?? (draft ? null : payload),
    });
    setMessage("文字已留在本机，点击保存修改后同步。");
  };
  if (!d) return null;
  const save = () => {
    if (readonly || !ready || conflict) return;
    const next =
      d.payload.kind === "sign"
        ? {
            ...d,
            payload: {
              kind: "sign",
              lines: value.split("\n").concat(["", "", "", ""]).slice(0, 4),
            },
          }
        : d.payload.kind === "nameplate"
          ? { ...d, payload: { kind: "nameplate", name: value } }
          : d.payload.kind === "displayCase"
            ? {
                ...d,
                payload: {
                  kind: "displayCase",
                  itemRef: value ? { itemId: value } : null,
                },
              }
            : d;
    if (d.payload.kind === "sign" && value.split("\n").length > 4) {
      setMessage("告示最多四行，请保留本地文字后缩短。");
      return;
    }
    const parsed = deviceSchema.safeParse(next);
    if (!parsed.success) {
      setMessage("文字太长：命名牌最多 20 字，告示每行最多 24 字。");
      return;
    }
    const applied = p.room!.edit((w) => {
      const current = w.devices?.find((x) => x.id === d.id);
      // The layout can advance between rendering this form and handling a
      // click. Preserve its placement and check the payload again here.
      if (!current || JSON.stringify(current.payload) !== payload) {
        setMessage("装置已发生变化，本机输入已保留，请先查看当前内容。");
        return w;
      }
      return {
        ...w,
        devices: w.devices?.map((x) =>
          x.id === d.id ? { ...parsed.data, placement: x.placement } : x,
        ),
      };
    });
    if (!applied) return;
    persistDraft(null);
    setMessage("修改已加入房间草稿，等待同步。");
  };
  return (
    <aside
      className="device-panel panel"
      role="dialog"
      aria-label={deviceDefinitions[d.definitionId].name}
      aria-modal="false"
    >
      <button
        className="panel-close"
        onClick={p.onClose}
        aria-label="关闭装置面板"
      >
        ×
      </button>
      <h2>
        <ItemGlyph id={glyphForDevice(d.definitionId)} size={36} />
        {deviceDefinitions[d.definitionId].name}
      </h2>
      {p.onSelect && (
        <label>
          选择装置
          <select
            aria-label="选择装置"
            value={d.id}
            onChange={(e) => p.onSelect?.(e.target.value)}
          >
            {snapshot.devices
              ?.filter((x) => !readonly || x.placement.state === "placed")
              .map((x, i) => (
                <option key={x.id} value={x.id}>
                  {deviceDefinitions[x.definitionId].name} {i + 1}
                  {x.placement.state === "stored" ? " · 待摆放" : ""}
                </option>
              ))}
          </select>
        </label>
      )}
      {d.payload.kind === "bookshelf" ? (
        worldId ? (
          <SceneContentPanel
            key={`${userId}:${worldId}:${d.id}`}
            worldId={worldId}
            userId={userId}
            collectionId={d.payload.collectionId}
            readOnly={readonly}
            token={p.token}
          />
        ) : (
          <p>请先登录并保存房间，再创建书屋作品。布局草稿已在本机保留。</p>
        )
      ) : (
        <>
          {readonly ? (
            <p className="plain-text">
              {d.payload.kind === "sign"
                ? d.payload.lines.join("\n")
                : d.payload.kind === "nameplate"
                  ? d.payload.name
                  : display || "未放展品"}
            </p>
          ) : (
            <>
              {d.payload.kind === "displayCase" ? (
                <label>
                  选择背包已有物品
                  <select
                    value={value}
                    disabled={!ready}
                    onChange={(e) => changeValue(e.target.value)}
                  >
                    <option value="">不展示</option>
                    {items.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label>
                  {d.payload.kind === "sign"
                    ? "告示 · 四行，每行 24 字"
                    : "地点名称 · 20 字"}
                  <textarea
                    value={value}
                    rows={4}
                    disabled={!ready}
                    onChange={(e) => changeValue(e.target.value)}
                  />
                </label>
              )}
              {conflict && (
                <div role="alert">
                  <p>
                    其他设备已修改这个装置，或本机草稿缺少版本记录。本机输入已保留，请先比较当前内容。
                  </p>
                  <p className="plain-text">
                    当前内容：{deviceText(d) || "空白"}
                  </p>
                  <button onClick={() => persistDraft(null)}>
                    使用当前文字
                  </button>
                  <button
                    onClick={() =>
                      persistDraft({ value, basePayload: payload })
                    }
                  >
                    以当前文字为基准继续编辑
                  </button>
                </div>
              )}
              <button
                className="primary-button"
                onClick={save}
                disabled={!ready || conflict}
              >
                保存修改
              </button>
              {d.payload.kind === "displayCase" && (
                <p>只引用展品，不扣除或返还背包物品。</p>
              )}
            </>
          )}
        </>
      )}
      {message && <p role="status">{message}</p>}
      {!readonly && (
        <button
          onClick={() => {
            p.room!.edit((w) => ({
              ...w,
              devices: w.devices?.map((x) =>
                x.id === d.id ? { ...x, placement: { state: "stored" } } : x,
              ),
            }));
            p.onClose();
          }}
        >
          收起装置，保留内容
        </button>
      )}
    </aside>
  );
}
