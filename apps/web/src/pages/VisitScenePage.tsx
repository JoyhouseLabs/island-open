import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import type { SubSceneId } from "@island/contracts";
import { subSceneIds } from "@island/contracts";
import { sceneConfig } from "../sceneConfig";
import { sceneVisuals } from "../scenes";
import type { Tool } from "../Island";
import { visitIslandPath, visitScenePath } from "../routes";
import { useVisitSession } from "../VisitSession";
import { cameraMode, useFirstPerson } from "../player/avatar";
import TalkPrompt from "../dialogue/TalkPrompt";
import DialogueBox from "../dialogue/DialogueBox";
import { emitGrowth } from "../progress/store";
import { RequestError } from "../api";

const PLANT_TOOLS: { id: Exclude<Tool, "explore">; label: string }[] = [
  { id: "tree", label: "种树" },
  { id: "flower", label: "种花" },
  { id: "bench", label: "长椅" },
];

/**
 * A host's room: the same visual the owner sees, fed by the visit snapshot
 * with the island's shared environment. When the host opened co-play
 * planting, the visitor may plant here too (the server applies it to the
 * host's world). Residents follow the host's simulation when a host is
 * live; otherwise they wander locally from the same seed.
 */
export default function VisitScenePage() {
  const { scene: raw = "" } = useParams();
  const scene = subSceneIds.includes(raw as SubSceneId)
    ? (raw as SubSceneId)
    : null;
  const { visit, worldId, token, avatar, walking, quality } =
    useVisitSession();
  const navigate = useNavigate();
  const fp = useFirstPerson();
  const island = visit.island!;
  const record = scene ? visit.scenes[scene] : undefined;
  const [reset, setReset] = useState(0);
  const [tool, setTool] = useState<Tool>("explore");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (scene && record === undefined) void visit.loadScene(scene);
  }, [scene, record, visit]);

  const config = scene ? sceneConfig[scene] : null;
  const Visual = scene ? sceneVisuals[scene] : null;
  const night =
    (island.world.snapshot.environment.hour ?? 12) < 6 ||
    (island.world.snapshot.environment.hour ?? 12) > 19;

  if (!scene || !config || !Visual)
    return (
      <div className="scene-loading visit-gate">
        <h1>这处小天地没有开放</h1>
        <Link to={visitIslandPath(worldId, token)}>回到岛上</Link>
      </div>
    );
  if (record === 404)
    return (
      <div className="scene-loading visit-gate">
        <h1>{config.title}还未开放</h1>
        <p>岛主还没有布置这里。</p>
        <Link className="small-button" to={visitIslandPath(worldId, token)}>
          回到岛上
        </Link>
      </div>
    );
  if (!record)
    return (
      <div className="scene-loading" role="status">
        正在打开{config.short}…
      </div>
    );

  const place = async (x: number, z: number, kind: "tree" | "flower" | "bench") => {
    try {
      await visit.place(scene, kind, x, z);
      emitGrowth({ type: `${kind}.planted` });
      setNote("种好啦！岛主马上就能看到。");
    } catch (e) {
      setNote(
        e instanceof RequestError && e.status !== 401 && e.status !== 403
          ? e.message
          : "这里种不下，换个位置试试。",
      );
    }
    setTimeout(() => setNote(""), 3600);
  };

  return (
    <main
      className={`app scene-room${night ? " night" : ""}`}
      style={{ ["--room-accent" as string]: config.accent }}
    >
      <div className="visit-topbar">
        <Link className="small-button" to={visitIslandPath(worldId, token)}>
          回到岛上
        </Link>
        <span className="visit-title">
          {(() => {
            const Icon = config.icon;
            return <Icon size={14} />;
          })()}{" "}
          {config.title}
          <small>正在参观 · {island.owner.name}的家园</small>
        </span>
        <button className="small-button" onClick={() => setReset(Date.now())}>
          重置视角
        </button>
        <button className="small-button" onClick={() => cameraMode.toggle()}>
          {fp ? "跟随视角" : "第一人称"}
        </button>
      </div>
      {island.plant && (
        <nav className="visit-toolbar" aria-label="参观种植工具">
          <button
            className={tool === "explore" ? "active" : ""}
            onClick={() => setTool("explore")}
          >
            漫游
          </button>
          {PLANT_TOOLS.map((t) => (
            <button
              key={t.id}
              className={tool === t.id ? "active" : ""}
              onClick={() => setTool(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      )}
      {note && <div className="visit-note" role="status">{note}</div>}
      <div className={`scene tool-${tool}`} aria-label={`${config.title}（参观）`}>
        <Visual
          world={{
            ...record.snapshot,
            environment: island.world.snapshot.environment,
          }}
          tool={tool}
          low={quality === "low"}
          reset={reset}
          onPlace={island.plant ? (x, z, kind) => void place(x, z, kind) : () => {}}
          onExit={() => navigate(visitIslandPath(worldId, token))}
          walk={walking}
          avatar={avatar}
          onGate={(dest) =>
            dest === "island"
              ? navigate(visitIslandPath(worldId, token))
              : navigate(visitScenePath(worldId, dest, token))
          }
        />
      </div>
      <TalkPrompt />
      <DialogueBox />
    </main>
  );
}
