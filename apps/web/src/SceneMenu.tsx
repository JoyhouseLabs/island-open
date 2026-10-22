import type { ReactNode } from "react";
import type { SubSceneId } from "@island/contracts";
import {
  BookOpen,
  Compass,
  Flower2,
  Hammer,
  NotebookPen,
  Footprints,
  ArrowUpRight,
  Check,
} from "lucide-react";
import { BackpackButton } from "./player/PlayerPanel";

/** Scene activities stay visible; editing tools only appear during decoration. */
export default function SceneMenu({
  scene,
  short,
  editing,
  reason,
  onEdit,
  onDone,
  onWalk,
  onRead,
  onWorks,
  onGuide,
  onExplore,
  learning,
  children,
}: {
  scene: SubSceneId;
  short: string;
  editing: boolean;
  reason: string;
  onEdit: (plant?: boolean) => void;
  onDone: () => void;
  onWalk: () => void;
  onRead: () => void;
  onWorks?: () => void;
  onGuide: () => void;
  onExplore: () => void;
  learning?: ReactNode;
  children: ReactNode;
}) {
  const gardening = scene === "garden" || scene === "nursery";
  return (
    <>
      {editing ? (
        <section className="scene-editor" aria-label={`布置${short}`}>
          <header>
            <strong>布置{short}</strong>
            <button className="small-button" onClick={onDone}>
              <Check size={16} />
              完成布置
            </button>
          </header>
          {reason && <p role="status">{reason}</p>}
          {children}
        </section>
      ) : (
        <nav className="toolbar activity-toolbar" aria-label="场景活动">
          {scene === "library" ? (
            <>
              <button className="tool" onClick={onRead}>
                <BookOpen size={20} />
                <span>读书</span>
              </button>
              {learning}
              {onWorks && (
                <button className="tool" onClick={onWorks}>
                  <NotebookPen size={20} />
                  <span>我的作品</span>
                </button>
              )}
            </>
          ) : scene === "dinosaur" ? (
            <>
              <button
                className="tool"
                aria-label="公园导览 · 四处发现"
                onClick={onGuide}
              >
                <Compass size={20} />
                <span>公园导览</span>
              </button>
              <button className="tool" onClick={onExplore}>
                <ArrowUpRight size={20} />
                <span>探索外围</span>
              </button>
            </>
          ) : (
            <>
              {gardening && (
                <button
                  className="tool"
                  disabled={!!reason}
                  onClick={() => onEdit(true)}
                >
                  <Flower2 size={20} />
                  <span>种植</span>
                </button>
              )}
              <button className="tool" onClick={onWalk}>
                <Footprints size={20} />
                <span>逛一逛</span>
              </button>
              {!gardening && scene !== "lab" && scene !== "home" && (
                <BackpackButton tool label="我的发现" />
              )}
            </>
          )}
          <button
            className="tool"
            disabled={!!reason}
            title={reason || `布置${short}`}
            onClick={() => onEdit()}
          >
            <Hammer size={20} />
            <span>布置{short}</span>
          </button>
        </nav>
      )}
      {!editing && reason && (
        <p className="menu-status" role="status">
          {reason}
        </p>
      )}
    </>
  );
}
