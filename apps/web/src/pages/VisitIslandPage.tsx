import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { landmarks } from "@island/world-core";
import Island, { type Focus, type Tool } from "../Island";
import { paths, visitScenePath } from "../routes";
import { sceneByLandmark, sceneConfig } from "../sceneConfig";
import { useVisitSession } from "../VisitSession";
import { cameraMode, useFirstPerson } from "../player/avatar";
import TalkPrompt from "../dialogue/TalkPrompt";
import DialogueBox from "../dialogue/DialogueBox";
import { emitGrowth } from "../progress/store";
import { RequestError } from "../api";
import { useContentFeed } from "../contentStore";
import { cursorStyle, glyphForTool, ItemGlyph } from "../building/itemGlyphs";

const PLANT_TOOLS: { id: Exclude<Tool, "explore">; label: string }[] = [
  { id: "tree", label: "种树" },
  { id: "flower", label: "种花" },
  { id: "bench", label: "长椅" },
];

/**
 * Someone else's island: walk around, look, greet the host — and, when the
 * host opened co-play planting, leave a tree or flower behind. Weather and
 * storage panels never exist on this page.
 */
export default function VisitIslandPage() {
  const { visit, worldId, token, avatar, walking, quality } = useVisitSession();
  const island = visit.island!;
  const navigate = useNavigate();
  const fp = useFirstPerson();
  const [focus, setFocus] = useState<Focus>(null);
  const [cameraReset, setCameraReset] = useState(0);
  const [asset, setAsset] = useState("idle");
  const [tool, setTool] = useState<Tool>("explore");
  const [note, setNote] = useState("");
  const places = useContentFeed()?.places ?? [];
  const canPlant = island.plant;

  const select = (id: string) => {
    const scene = sceneByLandmark[id],
      place = landmarks.find((p) => p.id === id);
    if (scene && island.scenes.some((s) => s.scene === scene)) {
      navigate(visitScenePath(worldId, scene, token));
      return;
    }
    if (place) setFocus({ x: place.x, z: place.z, stamp: Date.now() });
  };

  const place = async (x: number, z: number, kind: "tree" | "flower" | "bench") => {
    try {
      await visit.place("island", kind, x, z);
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
    <main className="app visit-room">
      <div className="visit-topbar">
        <Link className="small-button" to={paths.island}>
          返回我的家园
        </Link>
        <span className="visit-title">
          正在参观 · {island.world.snapshot.name}
          <small>岛主 {island.owner.name}</small>
        </span>
        <button
          className="small-button"
          onClick={() => setCameraReset(Date.now())}
        >
          俯瞰全岛
        </button>
        <button className="small-button" onClick={() => cameraMode.toggle()}>
          {fp ? "跟随视角" : "第一人称"}
        </button>
      </div>
      {island.scenes.length > 0 && (
        <div className="visit-scene-chips">
          {island.scenes.map((s) => {
            const config = sceneConfig[s.scene];
            const Icon = config.icon;
            return (
              <Link key={s.scene} to={visitScenePath(worldId, s.scene, token)}>
                <Icon size={13} /> {config.title}
              </Link>
            );
          })}
          {places.map((place) => (
            <Link key={place.id} to={`/place/${place.id}`}>
              ✦ {place.name}
            </Link>
          ))}
        </div>
      )}
      {canPlant && (
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
              <ItemGlyph id={t.id} size={22} />
              {t.label}
            </button>
          ))}
        </nav>
      )}
      {note && <div className="visit-note" role="status">{note}</div>}
      <div
        className={`scene tool-${tool}`}
        style={cursorStyle(glyphForTool(tool))}
        aria-label="朋友的主岛（参观）"
      >
        <Island
          world={island.world.snapshot}
          tool={tool}
          focus={focus}
          cameraReset={cameraReset}
          quality={quality}
          onPlace={canPlant ? (x, z, kind) => void place(x, z, kind) : () => {}}
          onSelect={select}
          onAsset={setAsset}
          walk={walking}
          avatar={avatar}
          onGate={(dest) =>
            dest === "island"
              ? setCameraReset(Date.now())
              : navigate(visitScenePath(worldId, dest, token))
          }
        />
        {asset === "loading" && (
          <div className="scene-loading" role="status">
            正在唤醒岛上的朋友…
          </div>
        )}
      </div>
      <TalkPrompt />
      <DialogueBox />
    </main>
  );
}
