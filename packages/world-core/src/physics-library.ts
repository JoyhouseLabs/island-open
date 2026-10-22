import {
  identityQuaternion,
  PHYSICS_RULES_VERSION,
  physicsSceneSchema,
  type ObjectDefinition,
  type ObjectPart,
  type PhysicsScene,
} from "@island/contracts";
import { box, cylinder } from "./physics-primitives.js";

export const libraryTable = { x: -2, z: 3, top: 0.84 };
export const libraryTrees = Array.from({ length: 30 }, (_, i) => {
  const angle = ((i + 0.5) / 30) * Math.PI * 2;
  return {
    x: Math.cos(angle) * 34,
    z: Math.sin(angle) * 29,
    height: 4 + (i % 4) * 0.4,
  };
}).filter((tree) => !(Math.abs(tree.x) < 4 && tree.z > 24));

/** An ordinary editable object: its physical state is saved, never part of immutable infrastructure. */
export function libraryBookDefinition(): ObjectDefinition {
  return {
    id: "core:reading-book",
    version: 1,
    name: "桌边读本",
    source: "official",
    bodyType: "dynamic",
    material: "wood",
    abilities: ["grabbable"],
    parts: [
      box("pages", 0, 0, 0, 1.12, 0.1, 0.82, "#f5e9cd"),
      box("cover-top", 0, 0.075, 0, 1.2, 0.05, 0.9, "#718c9d"),
      box("cover-bottom", 0, -0.075, 0, 1.2, 0.05, 0.9, "#718c9d"),
    ],
  };
}

/** Canonical new-world geometry; no snapshot, old walk specification or runtime conversion. */
export function createLibraryPhysicsScene(): PhysicsScene {
  const objects: PhysicsScene["objects"] = [],
    definitions: ObjectDefinition[] = [];
  const nextId = () =>
    `20000000-0000-4000-8000-${String(objects.length + 1).padStart(12, "0")}`;
  const add = (
    key: string,
    name: string,
    x: number,
    z: number,
    parts: ObjectPart[],
    extra: Partial<Pick<ObjectDefinition, "abilities" | "light" | "seat">> = {},
  ) => {
    const definition: ObjectDefinition = {
      id: `core:library-${key}`,
      version: 1,
      name,
      source: "official",
      bodyType: "fixed",
      material: "wood",
      parts,
      abilities: [],
      ...extra,
    };
    definitions.push(definition);
    objects.push({
      id: nextId(),
      definitionId: definition.id,
      definitionVersion: 1,
      infrastructureKey: key,
      position: { x, y: 0, z },
      rotation: identityQuaternion,
    });
  };
  add("deck-base", "书屋木台", 0, 0, [
    box("base", 0, -0.65, 0, 78, 1.2, 66, "#9c896b"),
  ]);
  add("pavilion", "林间书亭", -18, -10, [
    box("wall", -8, 3.5, 0, 1.6, 7, 14, "#9a7860"),
    box("floor", 0, 0.06, 0, 14, 0.12, 14, "#cfba98"),
    ...[-6, 6].flatMap((x, i) =>
      [-6, 6].map((z, j) =>
        cylinder(`post-${i}-${j}`, x, 3.5, z, 0.22, 7, "#927554"),
      ),
    ),
    {
      ...box("roof", -0.5, 7.4, 0, 16, 0.4, 16, "#6c8372"),
      rotation: { x: 0, y: 0, z: Math.sin(0.08), w: Math.cos(0.08) },
    },
  ]);
  // Shelf planks and spines are physical, with a small number of compound parts per object.
  const colors = ["#bd8670", "#7f9c9a", "#c3b06b", "#8a849d", "#789264"];
  for (let row = 0; row < 4; row++) {
    const y = 1.5 + row * 1.3;
    add(`shelf-${row}`, "藏书架", -24.6, -10, [
      box("shelf", 0, y, 0, 1.2, 0.14, 12.4, "#ac8c61"),
      ...Array.from({ length: 19 }, (_, i) =>
        box(
          `spine-${i}`,
          0,
          y + 0.58,
          -5.8 + i * 0.63,
          0.85,
          0.95 + (i % 3) * 0.05,
          0.38,
          colors[(i + row) % colors.length]!,
        ),
      ),
    ]);
  }
  add("table", "阅读矮桌", libraryTable.x, libraryTable.z, [
    box("top", 0, libraryTable.top - 0.09, 0, 2.6, 0.18, 1.6, "#c49c6d"),
    ...[-1, 1].flatMap((x, i) =>
      [-0.55, 0.55].map((z, j) =>
        box(`leg-${i}-${j}`, x, 0.33, z, 0.16, 0.66, 0.16, "#927554"),
      ),
    ),
  ]);
  for (const [i, [x, z]] of [
    [-4.8, 3],
    [0.8, 3],
    [-2, 6],
  ].entries()) {
    add(
      `cushion-${i}`,
      "阅读坐垫",
      x!,
      z!,
      [cylinder("pad", 0, 0.2, 0, 0.8, 0.4, colors[i]!)],
      {
        abilities: ["seat"],
        seat: {
          partId: "pad",
          yaw: i === 0 ? Math.PI / 2 : i === 1 ? -Math.PI / 2 : Math.PI,
        },
      },
    );
  }
  for (const [i, [x, z]] of [
    [2, 0],
    [10, 12],
  ].entries()) {
    add(
      `lamp-${i}`,
      "书屋暖灯",
      x!,
      z!,
      [
        cylinder("base", 0, 0.18, 0, 0.7, 0.36, "#8d7960"),
        cylinder("pole", 0, 1.8, 0, 0.1, 3.4, "#695c4a"),
        cylinder("bulb", 0, 3.75, 0, 0.48, 0.7, "#ffe8b0"),
        cylinder("cap", 0, 4.2, 0, 0.7, 0.2, "#7e8061"),
      ],
      {
        abilities: ["light"],
        light: { partId: "bulb", color: "#ffe4ac", intensity: 8, distance: 10 },
      },
    );
  }
  add("entrance", "书屋入口", 0, 28, [
    ...[-2.8, 2.8].map((x, i) =>
      cylinder(`post-${i}`, x, 2.2, 0, 0.25, 4.4, "#8f795a"),
    ),
    box("beam", 0, 4.5, 0, 6.5, 0.35, 0.6, "#7c936a"),
    ...[-1.6, 0, 1.6].map((x, i) =>
      box(`book-${i}`, x, 3.8, 0, 0.7, 0.7, 0.16, colors[i]!),
    ),
  ]);
  for (const [i, tree] of libraryTrees.entries())
    add(`tree-${i}`, "书屋林木", tree.x, tree.z, [
      cylinder("trunk", 0, tree.height / 2, 0, 0.4, tree.height, "#8e7354"),
    ]);
  const book = libraryBookDefinition();
  definitions.push(book);
  objects.push({
    id: nextId(),
    definitionId: book.id,
    definitionVersion: 1,
    position: {
      x: libraryTable.x,
      y: libraryTable.top + 0.14,
      z: libraryTable.z,
    },
    rotation: identityQuaternion,
  });
  return physicsSceneSchema.parse({
    schemaVersion: 4,
    physicsVersion: PHYSICS_RULES_VERSION,
    id: "physics-library",
    name: "林间书屋",
    template: { id: "core:library", version: 1 },
    spawn: { x: 1, y: 0.87, z: 8 },
    bounds: { min: { x: -39, y: -5, z: -33 }, max: { x: 39, y: 24, z: 33 } },
    terrain: [
      {
        id: "library-deck",
        origin: { x: -39, y: 0, z: -33 },
        columns: 26,
        rows: 22,
        step: 3,
        heights: Array(621).fill(0),
        material: "wood",
        color: "#d6c29e",
      },
    ],
    objects,
    definitions,
  });
}
