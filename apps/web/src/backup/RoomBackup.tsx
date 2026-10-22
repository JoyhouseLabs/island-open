import { useState } from "react";
import type { useWorld } from "../useWorld";
import { api } from "../api";
import { readDraft } from "../drafts";
export default function RoomBackup({
  room,
}: {
  room: ReturnType<typeof useWorld>;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [preview, setPreview] = useState<{
      id: string;
      documents: number;
      entries: number;
      devices: number;
    } | null>(null);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="room-backup">
      <h3>完整书屋备份</h3>
      <p>
        包含房间布局、全部作品、未上架内容及回收站；不含历史版本和外部出版物文件。
      </p>
      <button
        disabled={busy || !room.record || room.status !== "synced"}
        onClick={() =>
          void run(async () => {
            const local = await readDraft<{ queue: unknown[] }>(
              `scene-content-v1:${room.user?.id}:${room.record!.id}`,
            );
            if (local?.queue.length)
              throw Error(
                "作品仍有待同步提交，请先打开作品面板完成同步，或下载本机救援草稿。",
              );
            const result = await api<{ id: string }>(
              `/worlds/${room.record!.id}/exports`,
              { method: "POST", body: "{}" },
            );
            const a = document.createElement("a");
            a.href = `/api/worlds/${room.record!.id}/exports/${result.id}`;
            a.download = "完整书屋备份.json";
            a.click();
            setMessage("已生成一致版本的完整备份。");
          })
        }
      >
        导出云端完整备份
      </button>
      {room.status !== "synced" && (
        <p>
          先保存布局并等待作品同步完毕，再导出云端版本。离线草稿请使用本机救援下载。
        </p>
      )}
      <label>
        导入为新副本
        <input
          aria-label="选择完整书屋备份"
          type="file"
          accept=".json,application/json"
          disabled={busy || !room.record}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            void run(async () => {
              const form = new FormData();
              form.append("file", file);
              const response = await fetch(
                `/api/worlds/${room.record!.id}/imports`,
                { method: "POST", body: form },
              );
              const data = await response.json();
              if (!response.ok)
                throw Error(data.error?.message ?? "备份验证失败");
              setPreview(data);
              setMessage("文件已验证，请确认创建副本。");
            });
            e.currentTarget.value = "";
          }}
        />
      </label>
      {preview && (
        <div>
          <p>
            将创建独立岛屿的书屋副本：{preview.devices} 件装置、
            {preview.documents} 份作品、{preview.entries} 条正文。原书屋保留。
          </p>
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const result = await api<{
                  parentId: string;
                  warnings: string[];
                }>(`/worlds/${room.record!.id}/imports/${preview.id}/commit`, {
                  method: "POST",
                  body: "{}",
                });
                setMessage(`副本已创建。${result.warnings.join(" ")}`);
                window.location.assign(`/library?world=${result.parentId}`);
              })
            }
          >
            确认创建副本
          </button>
          <button onClick={() => setPreview(null)}>取消</button>
        </div>
      )}
      <p role="status">{message}</p>
    </section>
  );
}
