import {
  physicsSceneSchema,
  type ObjectDefinition,
  type PhysicsLayoutOperation,
  type PhysicsScene,
} from "@island/contracts";
import { createPlayground } from "./playground.js";

/** Official definitions available for new placements. Infrastructure stays immutable. */
export function officialPhysicsObjects(): ObjectDefinition[] {
  const definitions = createPlayground().definitions.filter(
    (d) => !["core:floor", "core:platform"].includes(d.id),
  );
  const box = definitions.find((d) => d.id === "core:box")!;
  return [
    ...definitions,
    {
      ...box,
      id: "core:block",
      name: "木方块",
      bodyType: "fixed",
      abilities: [],
      parts: box.parts.map((p) => ({
        ...p,
        shape: { kind: "box", halfExtents: { x: 0.5, y: 0.5, z: 0.5 } },
      })),
    },
  ];
}

/** Pure layout rules, shared by preview and authority. Definition resolution is server-owned. */
export function editedPhysicsScene(
  scene: PhysicsScene,
  operation: PhysicsLayoutOperation,
  definition?: ObjectDefinition,
): PhysicsScene {
  const next = structuredClone(scene);
  if (operation.type === "place") {
    const object = operation.object;
    if (next.objects.some((o) => o.id === object.id))
      throw new Error("物品编号已存在");
    if (
      !definition ||
      definition.id !== object.definitionId ||
      definition.version !== object.definitionVersion
    )
      throw new Error("找不到物品定义版本");
    if (object.motion) throw new Error("不能自行配置运动轨迹");
    const existing = next.definitions.find(
      (d) => d.id === definition.id && d.version === definition.version,
    );
    if (existing && JSON.stringify(existing) !== JSON.stringify(definition))
      throw new Error("物品定义版本不一致");
    if (!existing) next.definitions.push(definition);
    next.objects.push(object);
  } else {
    const object = next.objects.find((o) => o.id === operation.objectId);
    if (!object) throw new Error("物品已被收起");
    if (["core:floor", "core:platform"].includes(object.definitionId))
      throw new Error("场景基础设施暂不能编辑");
    if (operation.type === "remove")
      next.objects = next.objects.filter((o) => o.id !== object.id);
    else {
      object.position = operation.position;
      object.rotation = operation.rotation;
    }
  }
  const used = new Set(
    next.objects.map((o) => `${o.definitionId}@${o.definitionVersion}`),
  );
  next.definitions = next.definitions.filter((d) =>
    used.has(`${d.id}@${d.version}`),
  );
  return physicsSceneSchema.parse(next);
}
