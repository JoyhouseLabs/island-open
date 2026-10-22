import { useEffect, useState } from "react";
import type { PhysicsConnection } from "./PhysicsConnection";
export default function PhysicsMechanisms({
  conn,
  owner,
  selected,
}: {
  conn: PhysicsConnection;
  owner: boolean;
  selected: string | null;
}) {
  const [source, setSource] = useState(""),
    [target, setTarget] = useState("");
  const nodes = conn.scene!.objects.flatMap((object) => {
    const definition = conn.scene!.definitions.find(
      (d) =>
        d.id === object.definitionId && d.version === object.definitionVersion,
    )!;
    return definition.behavior || definition.light
      ? [{ object, definition }]
      : [];
  });
  useEffect(() => {
    if (!conn.editing) return;
    const node = nodes.find((n) => n.object.id === selected);
    if (
      node?.definition.behavior?.kind === "switch" ||
      node?.definition.behavior?.kind === "pressure"
    )
      setSource(node.object.id);
    else if (
      node?.definition.light ||
      node?.definition.behavior?.kind === "door"
    )
      setTarget(node.object.id);
  }, [conn, selected, conn.editing]);
  if (!nodes.length) return null;
  const sources = nodes.filter((n) =>
    ["switch", "pressure"].includes(n.definition.behavior?.kind ?? ""),
  );
  const targets = nodes.filter(
    (n) => n.definition.behavior?.kind === "door" || n.definition.light,
  );
  const selectedSource = sources.find((n) => n.object.id === source),
    selectedTarget = targets.find((n) => n.object.id === target);
  const name = (id: string) => {
    const node = nodes.find((n) => n.object.id === id);
    if (!node) return "已收起";
    const p = node.object.position;
    return `${node.definition.name}（${[p.x, p.y, p.z].map((v) => Number(v.toFixed(2))).join(", ")}）`;
  };
  const disabled = !conn.editing || !!conn.editPending || conn.editBusy;
  return (
    <details className="physics-mechanisms">
      <summary>机关连接 · {conn.scene!.links.length} 条</summary>
      <p>
        开关或压力板可以控制门和灯。多个信号中任意一个开启就会触发；未连接的灯保持亮着。
      </p>
      {nodes.map((n) => {
        const state = conn.buffer.latest?.behaviors?.find(
          (s) => s.id === n.object.id,
        );
        return (
          <p key={n.object.id} data-testid={`mechanism-${n.object.id}`}>
            {name(n.object.id)}：
            {state?.blocked
              ? "遇到阻挡，等待让开"
              : state?.active
                ? "开启"
                : "关闭"}
          </p>
        );
      })}
      {owner && (
        <>
          {!conn.editing ? (
            <p>进入「布置家园」后可添加或移除连接。</p>
          ) : (
            <p>
              点选场景中的开关/压力板和门/灯即可填入连接，也可按摆放坐标选择。
            </p>
          )}
          <label>
            信号来源
            <select
              aria-label="机关信号来源"
              disabled={disabled}
              value={selectedSource ? source : ""}
              onChange={(e) => setSource(e.target.value)}
            >
              <option value="">选择开关或压力板</option>
              {sources.map((n) => (
                <option key={n.object.id} value={n.object.id}>
                  {name(n.object.id)}
                </option>
              ))}
            </select>
          </label>
          <label>
            控制目标
            <select
              aria-label="机关控制目标"
              disabled={disabled}
              value={selectedTarget ? target : ""}
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="">选择门或灯</option>
              {targets.map((n) => (
                <option key={n.object.id} value={n.object.id}>
                  {name(n.object.id)}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={
              disabled ||
              !selectedSource ||
              !selectedTarget ||
              conn.scene!.links.some(
                (l) => l.from.objectId === source && l.to.objectId === target,
              )
            }
            onClick={() =>
              conn.edit({
                type: "link",
                link: {
                  id: crypto.randomUUID(),
                  from: { objectId: source, port: "signal" },
                  to: {
                    objectId: target,
                    port: selectedTarget!.definition.light ? "on" : "open",
                  },
                },
              })
            }
          >
            连接机关
          </button>
        </>
      )}
      {conn.scene!.links.map((link) => (
        <p key={link.id}>
          {name(link.from.objectId)} → {name(link.to.objectId)}{" "}
          {owner && (
            <button
              disabled={disabled}
              onClick={() => conn.edit({ type: "unlink", linkId: link.id })}
            >
              移除此连接
            </button>
          )}
        </p>
      ))}
      <p>收起物品会同时移除它的连接。门被挡住时会停下，让开后继续移动。</p>
    </details>
  );
}
