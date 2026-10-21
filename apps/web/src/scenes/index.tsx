import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import type { SubSceneId } from "@island/contracts";
import type { SceneProps } from "./shared";

const loaders: Record<
  SubSceneId,
  () => Promise<{ default: ComponentType<SceneProps> }>
> = {
  garden: () => import("./GardenScene"),
  home: () => import("./HomeScene"),
  meadow: () => import("./MeadowScene"),
  forest: () => import("./ForestScene"),
  library: () => import("./LibraryScene"),
  pond: () => import("./PondScene"),
  lab: () => import("./LabScene"),
  nursery: () => import("./NurseryScene"),
  mountain: () => import("./MountainScene"),
  starlight: () => import("./StarlightScene"),
  beach: () => import("./BeachScene"),
};

export const sceneVisuals = Object.fromEntries(
  (Object.keys(loaders) as SubSceneId[]).map((id) => [
    id,
    lazy(loaders[id]!),
  ]),
) as Record<SubSceneId, LazyExoticComponent<ComponentType<SceneProps>>>;
