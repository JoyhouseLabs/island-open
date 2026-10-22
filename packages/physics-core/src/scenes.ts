import {
  physicsSceneSchema,
  PHYSICS_RULES_VERSION,
  type PhysicsScene,
  type PhysicsSceneTemplateRef,
} from "@island/contracts";
import {
  createIslandPhysicsScene,
  createLibraryPhysicsScene,
  createGardenPhysicsScene,
  physicalThemeSpecs,
  createThemePhysicsScene,
} from "@island/world-core";
import { createPlayground } from "./playground.js";

/** Registered, versioned scene identities. Each template owns its canonical infrastructure. */
export const physicsSceneDefinitions = [
  ...physicalThemeSpecs.map((spec) => ({
    key: spec.key,
    id: `core:${spec.key}`,
    version: 1,
    name: spec.name,
    description: spec.description,
    environment: {
      sky: spec.sky,
      ambient: spec.key === "starlight" ? 0.7 : 1.3,
      sun: spec.key === "starlight" ? 0.5 : 2,
    },
  })),
  {
    key: "garden",
    id: "core:garden",
    version: 1,
    name: "私家花园",
    description: "种花、育树，围坐茶桌与睡莲池",
    environment: { sky: "#dce7d4", ambient: 1.3, sun: 2 },
  },
  {
    key: "nursery",
    id: "core:nursery",
    version: 1,
    name: "实验种植园",
    description: "在温室与苗床里培育自己的植物",
    environment: { sky: "#dce8d7", ambient: 1.3, sun: 2 },
  },
  {
    key: "library",
    id: "core:library",
    version: 1,
    name: "林间书屋",
    description: "读书、学习，在木台与书亭间探索",
    environment: { sky: "#e3eadb", ambient: 1.3, sun: 2 },
  },
  {
    key: "island",
    id: "core:island",
    version: 1,
    name: "主岛",
    description: "沿山路、聚落与花园探索的新主岛",
    environment: { sky: "#d9e8e8", ambient: 1.3, sun: 2 },
  },
  {
    key: "playground",
    id: "core:playground",
    version: 1,
    name: "物理游乐场",
    description: "试验滚动、搬运、桌面和升降台",
    environment: { sky: "#e5eee5", ambient: 1.4, sun: 2 },
  },
  {
    key: "building-yard",
    id: "core:building-yard",
    version: 2,
    name: "建造庭院",
    description: "独立保存的开阔场地，组合自己的建筑和家具",
    environment: { sky: "#e6edf5", ambient: 1.3, sun: 2 },
  },
] as const;
export type PhysicsSceneKey = (typeof physicsSceneDefinitions)[number]["key"];
export function sceneDefinition(ref: PhysicsSceneTemplateRef) {
  const d = physicsSceneDefinitions.find(
    (d) => d.id === ref.id && d.version === ref.version,
  );
  if (!d) throw new Error("场景模板版本尚未支持");
  return d;
}
export function createPhysicsScene(
  key: string,
  nextId?: () => string,
): PhysicsScene {
  const d = physicsSceneDefinitions.find((d) => d.key === key);
  if (!d) throw new Error("这个场景尚未开放");
  let scene: PhysicsScene;
  if (d.key === "playground") scene = createPlayground();
  else if (d.key === "garden" || d.key === "nursery")
    scene = createGardenPhysicsScene(d.key);
  else if (
    d.key === "home" ||
    d.key === "meadow" ||
    d.key === "forest" ||
    d.key === "pond" ||
    d.key === "lab" ||
    d.key === "beach" ||
    d.key === "starlight" ||
    d.key === "mountain" ||
    d.key === "dinosaur"
  )
    scene = createThemePhysicsScene(d.key);
  else if (d.key === "library") scene = createLibraryPhysicsScene();
  else if (d.key === "island") scene = createIslandPhysicsScene();
  else
    scene = physicsSceneSchema.parse({
      schemaVersion: 4,
      physicsVersion: PHYSICS_RULES_VERSION,
      id: "physics-building-yard",
      name: d.name,
      template: { id: d.id, version: d.version },
      spawn: { x: 0, y: 1, z: 7 },
      bounds: { min: { x: -24, y: -5, z: -20 }, max: { x: 24, y: 32, z: 20 } },
      definitions: [],
      objects: [],
      terrain: [
        {
          id: "yard-ground",
          origin: { x: -24, y: 0, z: -20 },
          columns: 12,
          rows: 10,
          step: 4,
          heights: Array(143).fill(0),
          material: "stone",
          color: "#b6b49d",
        },
      ],
    });
  if (nextId) {
    scene.id = nextId();
    for (const o of scene.objects) o.id = nextId();
  }
  return scene;
}
/** Template identity and infrastructure are server-owned; authored content may change independently. */
export function assertSceneTemplate(scene: PhysicsScene): PhysicsScene {
  const template = createPhysicsScene(sceneDefinition(scene.template).key);
  const ordered = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(ordered);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, entry]) => [key, ordered(entry)]),
      );
    return value;
  };
  const same = (a: unknown, b: unknown) =>
    JSON.stringify(ordered(a)) === JSON.stringify(ordered(b));
  if (
    !same(scene.terrain, template.terrain) ||
    !same(scene.bounds, template.bounds) ||
    !same(scene.spawn, template.spawn)
  )
    throw new Error("场景地形、边界与出生点不能更改");
  const expected = template.objects.filter((o) => o.infrastructureKey),
    actual = scene.objects.filter((o) => o.infrastructureKey);
  if (expected.length !== actual.length) throw new Error("场景基础设施不完整");
  const definitions = new Map(
    scene.definitions.map((d) => [`${d.id}@${d.version}`, d]),
  );
  const infrastructureDefinitions = new Set(
    expected.map((o) => `${o.definitionId}@${o.definitionVersion}`),
  );
  for (const base of expected) {
    const instance = actual.find(
      (o) => o.infrastructureKey === base.infrastructureKey,
    );
    if (!instance) throw new Error("场景基础设施标识不匹配");
    const { id: _, ...a } = instance,
      { id: __, ...b } = base;
    if (!same(a, b)) throw new Error("场景基础设施不能更改");
    const definition = template.definitions.find(
      (d) => d.id === base.definitionId && d.version === base.definitionVersion,
    )!;
    if (
      !same(
        definitions.get(`${definition.id}@${definition.version}`),
        definition,
      )
    )
      throw new Error("基础设施定义与模板不匹配");
  }
  if (
    scene.objects.some(
      (o) =>
        !o.infrastructureKey &&
        (!!o.motion ||
          infrastructureDefinitions.has(
            `${o.definitionId}@${o.definitionVersion}`,
          )),
    )
  )
    throw new Error("不能伪造场景基础设施或运动轨迹");
  return template;
}
