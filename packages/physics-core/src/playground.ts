import {
  identityQuaternion as rotation,
  physicsSceneSchema,
  PHYSICS_RULES_VERSION,
  type ObjectDefinition,
  type ObjectPart,
  type PhysicsScene,
  type Vector3,
} from "@island/contracts";
const zero = { x: 0, y: 0, z: 0 };
function box(
  id: string,
  size: Vector3,
  position = zero,
  color = "#a67548",
): ObjectPart {
  return {
    id,
    shape: {
      kind: "box",
      halfExtents: { x: size.x / 2, y: size.y / 2, z: size.z / 2 },
    },
    position,
    rotation,
    color,
    sensor: false,
  };
}
function definition(
  id: string,
  name: string,
  parts: ObjectPart[],
  bodyType: ObjectDefinition["bodyType"] = "fixed",
  material: ObjectDefinition["material"] = "wood",
): ObjectDefinition {
  return {
    id,
    name,
    version: 1,
    source: "official",
    bodyType,
    material,
    parts,
    abilities: bodyType === "dynamic" ? ["grabbable"] : [],
  };
}
export const playgroundIds = {
  floor: "00000000-0000-4000-8000-000000000001",
  ramp: "00000000-0000-4000-8000-000000000002",
  table: "00000000-0000-4000-8000-000000000003",
  ball: "00000000-0000-4000-8000-000000000004",
  box: "00000000-0000-4000-8000-000000000005",
  cylinder: "00000000-0000-4000-8000-000000000006",
  platform: "00000000-0000-4000-8000-000000000007",
};
export function createPlayground(): PhysicsScene {
  const angle = -Math.PI / 9;
  const definitions: ObjectDefinition[] = [
    definition(
      "core:floor",
      "草地",
      [box("ground", { x: 32, y: 1, z: 26 }, zero, "#87ad80")],
      "fixed",
      "stone",
    ),
    definition("core:ramp", "斜坡", [
      box("slope", { x: 7, y: 0.35, z: 3 }, zero, "#d5ba85"),
    ]),
    definition("core:table", "木桌", [
      box("top", { x: 3, y: 0.25, z: 2 }, { x: 0, y: 1.5, z: 0 }, "#c18d57"),
      ...[-1.2, 1.2].flatMap((x) =>
        [-0.7, 0.7].map((z) =>
          box(`leg-${x}-${z}`, { x: 0.22, y: 1.4, z: 0.22 }, { x, y: 0.7, z }),
        ),
      ),
    ]),
    definition(
      "core:ball",
      "弹力球",
      [
        {
          id: "ball",
          shape: { kind: "ball", radius: 0.4 },
          position: zero,
          rotation,
          color: "#ee9162",
          sensor: false,
        },
      ],
      "dynamic",
      "rubber",
    ),
    definition(
      "core:box",
      "木箱",
      [box("box", { x: 0.9, y: 0.9, z: 0.9 }, zero, "#d6ab6f")],
      "dynamic",
    ),
    definition(
      "core:cylinder",
      "圆柱",
      [
        {
          id: "cylinder",
          shape: { kind: "cylinder", halfHeight: 0.5, radius: 0.35 },
          position: zero,
          rotation,
          color: "#8ba9d8",
          sensor: false,
        },
      ],
      "dynamic",
    ),
    {
      ...definition(
        "core:platform",
        "升降台",
        [box("platform", { x: 2.5, y: 0.25, z: 2.5 }, zero, "#829cb5")],
        "kinematic",
      ),
      abilities: ["platform"],
    },
  ];
  return physicsSceneSchema.parse({
    schemaVersion: 4,
    physicsVersion: PHYSICS_RULES_VERSION,
    id: "physics-playground",
    name: "物理游乐场",
    definitions,
    spawn: { x: 0, y: 1, z: 7 },
    bounds: { min: { x: -16, y: -5, z: -13 }, max: { x: 16, y: 20, z: 13 } },
    objects: [
      {
        id: playgroundIds.floor,
        definitionId: "core:floor",
        position: { x: 0, y: -0.5, z: 0 },
      },
      {
        id: playgroundIds.ramp,
        definitionId: "core:ramp",
        position: { x: -4, y: 1.4, z: -2 },
        rotation: {
          x: 0,
          y: 0,
          z: Math.sin(angle / 2),
          w: Math.cos(angle / 2),
        },
      },
      {
        id: playgroundIds.table,
        definitionId: "core:table",
        position: { x: 3, y: 0, z: 0 },
      },
      {
        id: playgroundIds.ball,
        definitionId: "core:ball",
        position: { x: -6.5, y: 3, z: -2 },
      },
      {
        id: playgroundIds.box,
        definitionId: "core:box",
        position: { x: 3, y: 2.3, z: 0 },
      },
      {
        id: playgroundIds.cylinder,
        definitionId: "core:cylinder",
        position: { x: 0, y: 1, z: 2 },
      },
      {
        id: playgroundIds.platform,
        definitionId: "core:platform",
        position: { x: -4, y: 0.25, z: 4 },
        motion: { offset: { x: 0, y: 2, z: 0 }, periodTicks: 600 },
      },
    ].map((o) => ({ rotation, definitionVersion: 1, ...o })),
  });
}
