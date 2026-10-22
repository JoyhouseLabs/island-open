import {
  physicsSceneSchema,
  identityQuaternion,
  type ObjectDefinition,
  type PhysicsLayoutOperation,
  type PhysicsScene,
} from "@island/contracts";
import { createPlayground } from "./playground.js";

/** Official definitions available for new placements. Infrastructure stays immutable. */
export function officialPhysicsObjects(): ObjectDefinition[] {
  const scene = createPlayground();
  const infrastructure = new Set(
    scene.objects.filter((o) => o.infrastructureKey).map((o) => o.definitionId),
  );
  const definitions = scene.definitions.filter(
    (d) => !infrastructure.has(d.id),
  );
  const box = definitions.find((d) => d.id === "core:box")!;
  return [
    ...definitions,
    ...(["sign", "bookshelf"] as const).map((kind): ObjectDefinition => ({
      id: `core:${kind}`,
      version: 1,
      name: kind === "sign" ? "告示牌" : "展示书架",
      source: "official",
      bodyType: "fixed",
      material: "wood",
      abilities: ["content"],
      parts: (kind === "sign"
        ? [
            {
              id: "board",
              x: 0,
              y: 1.6,
              z: 0,
              hx: 1,
              hy: 0.5,
              hz: 0.08,
              color: "#c79b65",
            },
            {
              id: "post",
              x: 0,
              y: 0.55,
              z: 0,
              hx: 0.1,
              hy: 0.55,
              hz: 0.1,
              color: "#856344",
            },
          ]
        : [
            {
              id: "back",
              x: 0,
              y: 1.1,
              z: -0.32,
              hx: 1,
              hy: 1.1,
              hz: 0.08,
              color: "#a47b51",
            },
            {
              id: "left",
              x: -0.92,
              y: 1.1,
              z: 0,
              hx: 0.08,
              hy: 1.1,
              hz: 0.4,
              color: "#856344",
            },
            {
              id: "right",
              x: 0.92,
              y: 1.1,
              z: 0,
              hx: 0.08,
              hy: 1.1,
              hz: 0.4,
              color: "#856344",
            },
            ...[0.08, 0.78, 1.48, 2.12].map((y, i) => ({
              id: `shelf-${i}`,
              x: 0,
              y,
              z: 0,
              hx: 1,
              hy: 0.08,
              hz: 0.4,
              color: "#c79b65",
            })),
          ]
      ).map((p) => ({
        id: p.id,
        position: { x: p.x, y: p.y, z: p.z },
        rotation: identityQuaternion,
        shape: { kind: "box", halfExtents: { x: p.hx, y: p.hy, z: p.hz } },
        color: p.color,
        sensor: false,
      })),
    })),
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
    if (object.infrastructureKey) throw new Error("不能自行添加场景基础设施");
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
    if (object.infrastructureKey) throw new Error("场景基础设施暂不能编辑");
    if (operation.type === "remove")
      next.objects = next.objects.filter((o) => o.id !== object.id);
    else if (operation.type === "content") {
      const definition = next.definitions.find(
        (d) =>
          d.id === object.definitionId &&
          d.version === object.definitionVersion,
      )!;
      if (
        !definition.abilities.includes("content") ||
        definition.bodyType !== "fixed"
      )
        throw new Error("只有固定内容装置可以展示正文");
      if (operation.contentRef) object.contentRef = operation.contentRef;
      else delete object.contentRef;
    } else {
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
