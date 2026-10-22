import {
  furnitureCatalog,
  identityQuaternion,
  objectDefinitionSchema,
  type ObjectDefinition,
  type ObjectPart,
  type FurnitureId,
} from "@island/contracts";

/** Immutable v1 shop geometry: the same compound parts render and collide. */
export function shopPhysicsDefinition(itemId: FurnitureId): ObjectDefinition {
  const d = furnitureCatalog.find((d) => d.id === itemId)!;
  const parts: ObjectPart[] = [];
  const box = (
    id: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    depth: number,
    color = d.color,
  ) =>
    parts.push({
      id,
      position: { x, y, z },
      rotation: identityQuaternion,
      color,
      sensor: false,
      shape: { kind: "box", halfExtents: { x: w / 2, y: h / 2, z: depth / 2 } },
    });
  const ball = (
    id: string,
    x: number,
    y: number,
    z: number,
    radius: number,
    color = d.color,
  ) =>
    parts.push({
      id,
      position: { x, y, z },
      rotation: identityQuaternion,
      color,
      sensor: false,
      shape: { kind: "ball", radius },
    });
  const cylinder = (
    id: string,
    y: number,
    radius: number,
    height: number,
    color = d.color,
  ) =>
    parts.push({
      id,
      position: { x: 0, y, z: 0 },
      rotation: identityQuaternion,
      color,
      sensor: false,
      shape: { kind: "cylinder", radius, halfHeight: height / 2 },
    });
  const { width: w, depth: dep, height: h } = d;
  if (d.shape === "table") {
    box("top", 0, h - 0.12, 0, w, 0.24, dep);
    for (const x of [-1, 1])
      for (const z of [-1, 1])
        box(
          `leg-${x}-${z}`,
          x * (w / 2 - 0.25),
          (h - 0.24) / 2,
          z * (dep / 2 - 0.25),
          0.18,
          h - 0.24,
          0.18,
          "#765a43",
        );
  } else if (d.shape === "chair") {
    box("seat", 0, 1, 0, w, 0.25, dep);
    box("back", 0, 1.9, -dep / 2 + 0.15, w, 1.4, 0.25);
    for (const x of [-1, 1])
      for (const z of [-1, 1])
        box(`leg-${x}-${z}`, x * 0.6, 0.4375, z * 0.6, 0.2, 0.875, 0.2);
  } else if (d.shape === "sofa") {
    box("base", 0, 0.45, 0, w, 0.9, dep, "#668577");
    box("cushion", 0, 1.1, 0.2, w - 0.6, 0.4, dep - 0.5);
    box("back", 0, 1.6, -dep / 2 + 0.2, w, 1.4, 0.45);
    for (const x of [-1, 1])
      box(`arm-${x}`, x * (w / 2 - 0.2), 1.2, 0, 0.4, 1, dep);
  } else if (d.shape === "stool") {
    cylinder("seat", h - 0.15, w / 2, 0.3);
    for (const x of [-1, 1])
      for (const z of [-1, 1])
        box(
          `leg-${x}-${z}`,
          x * 0.4,
          (h - 0.3) / 2,
          z * 0.4,
          0.15,
          h - 0.3,
          0.15,
          "#ad875e",
        );
  } else if (d.shape === "rug") {
    box("rug", 0, 0.05, 0, w, 0.1, dep);
  } else if (d.shape === "lamp") {
    box("base", 0, 0.12, 0, w, 0.24, dep);
    box("stem", 0, 1.4, 0, 0.18, 2.8, 0.18);
    ball("globe", 0, 2.95, 0, 0.42, "#ffe6af");
    box("cap", 0, 3.35, 0, 0.9, 0.1, 0.9);
  } else if (d.shape === "pot") {
    cylinder("pot", 0.45, w * 0.35, 0.9, "#bd8362");
    box("stem", 0, h * 0.6, 0, 0.1, h * 0.6, 0.1, "#628553");
    for (const x of [-1, 0, 1])
      ball(
        `leaf-${x}`,
        x * 0.3,
        h - 0.35 - Math.abs(x) * 0.15,
        x * 0.13,
        w * 0.22,
      );
  } else if (d.shape === "fence") {
    for (const y of [-1, 1])
      box(`rail-${y}`, 0, 0.9 + y * 0.35, 0, w, 0.18, 0.22);
    for (const x of [-2, -1, 0, 1, 2])
      box(`post-${x}`, x * 0.72, h / 2, 0, 0.3, h, 0.3);
  } else {
    box("post", 0, 1, 0, 0.2, 2, 0.2, "#87684e");
    box("house", 0, 2.35, 0, 1.15, 0.85, 1.1);
    parts.push({
      id: "roof",
      position: { x: 0, y: 2.775, z: 0 },
      rotation: identityQuaternion,
      color: "#739281",
      sensor: false,
      shape: {
        kind: "convex",
        vertices: [
          { x: -0.75, y: 0, z: -0.75 },
          { x: 0.75, y: 0, z: -0.75 },
          { x: 0.75, y: 0, z: 0.75 },
          { x: -0.75, y: 0, z: 0.75 },
          { x: 0, y: 0.5, z: 0 },
        ],
      },
    });
  }
  return objectDefinitionSchema.parse({
    id: `shop:${d.id}`,
    version: 1,
    name: d.name,
    source: "shop",
    bodyType: "fixed",
    material: "wood",
    parts,
    abilities: d.shape === "lamp" ? ["light"] : [],
    ...(d.shape === "lamp"
      ? {
          light: {
            partId: "globe",
            color: "#ffe6af",
            intensity: 20,
            distance: 10,
          },
        }
      : {}),
  });
}
