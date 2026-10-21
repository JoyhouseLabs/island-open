import { useEffect } from "react";
import { useNavigate } from "react-router";
import type { SubSceneId } from "@island/contracts";
import { useHomeSession } from "../HomeSession";
import SceneExperience from "../SceneExperience";
import { sceneConfig } from "../sceneConfig";
import { paths } from "../routes";
import { emitGrowth } from "../progress/store";

/** Each room is its own page: own scene, own save, own way back. */
export default function SubScenePage({ scene }: { scene: SubSceneId }) {
  const { world, quality, setIslandEntry } = useHomeSession(),
    navigate = useNavigate(),
    entry = sceneConfig[scene].entry;
  useEffect(() => {
    setIslandEntry({ x: entry.x, z: entry.z, stamp: Date.now() });
    emitGrowth({ type: "scene.visited", detail: scene });
  }, [entry, setIslandEntry, scene]);
  return (
    <SceneExperience
      key={`${scene}:${world.record?.id ?? "guest"}:${world.snapshot.seed}`}
      scene={scene}
      parent={world}
      quality={quality}
      onExit={() => {
        void navigate(paths.island);
      }}
    />
  );
}
