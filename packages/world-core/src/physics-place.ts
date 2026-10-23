import {
  identityQuaternion,
  placeSchema,
  physicsRegionSchema,
  type PlaceConfig,
  type PhysicsRegion,
  type ColliderShape,
} from "@island/contracts";

/** Published content is compiled into shared solid geometry, never a saved-world adapter. */
export function placePhysicsRegion(input: PlaceConfig): PhysicsRegion {
  const place = placeSchema.parse(input);
  const parts: PhysicsRegion["parts"] = [];
  const add = (
    id: string,
    shape: ColliderShape,
    x: number,
    y: number,
    z: number,
    color: string,
    material: "stone" | "wood" = "wood",
  ) => {
    parts.push({
      id,
      shape,
      position: { x, y, z },
      rotation: identityQuaternion,
      color,
      material,
      sensor: false,
    });
  };
  const box = (
    id: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: string,
  ) =>
    add(
      id,
      { kind: "box", halfExtents: { x: w / 2, y: h / 2, z: d / 2 } },
      x,
      y,
      z,
      color,
    );
  const half = place.ground.size / 2;
  add(
    "ground",
    place.ground.shape === "disc"
      ? {
          kind: "convex",
          vertices: [-1, 1].flatMap((y) =>
            Array.from({ length: 32 }, (_, i) => ({
              x: Math.cos((i * Math.PI) / 16) * half,
              y,
              z: Math.sin((i * Math.PI) / 16) * half,
            })),
          ),
        }
      : { kind: "box", halfExtents: { x: half, y: 1, z: half } },
    0,
    -1,
    0,
    place.ground.color,
    "stone",
  );
  place.props.forEach((p, i) => {
    const id = `prop-${i}`,
      s = p.scale;
    switch (p.kind) {
      case "tree":
        add(
          `${id}-trunk`,
          { kind: "cylinder", radius: 0.3 * s, halfHeight: 1.5 * s },
          p.x,
          1.5 * s,
          p.z,
          "#856343",
        );
        add(
          `${id}-crown`,
          { kind: "ball", radius: 1.6 * s },
          p.x,
          3.8 * s,
          p.z,
          (p.seed ?? i) % 2 ? "#638950" : "#749957",
        );
        break;
      case "flower":
        add(
          id,
          { kind: "ball", radius: 0.18 * s },
          p.x,
          0.18 * s,
          p.z,
          "#f3d386",
        );
        break;
      case "bench":
        box(
          `${id}-seat`,
          p.x,
          0.65 * s,
          p.z,
          2.4 * s,
          0.2 * s,
          0.8 * s,
          "#bd9362",
        );
        box(
          `${id}-back`,
          p.x,
          1.15 * s,
          p.z - 0.35 * s,
          2.4 * s,
          0.8 * s,
          0.15 * s,
          "#bd9362",
        );
        for (const sign of [-1, 1])
          box(
            `${id}-leg-${sign}`,
            p.x + sign * 0.9 * s,
            0.3 * s,
            p.z,
            0.18 * s,
            0.6 * s,
            0.65 * s,
            "#80674b",
          );
        break;
      case "rock":
        add(
          id,
          { kind: "ball", radius: 1.2 * s },
          p.x,
          0.65 * s,
          p.z,
          "#a3a495",
          "stone",
        );
        break;
      case "lamp":
        add(
          `${id}-post`,
          { kind: "cylinder", radius: 0.09 * s, halfHeight: 1.1 * s },
          p.x,
          1.1 * s,
          p.z,
          "#80674b",
        );
        add(
          `${id}-bulb`,
          { kind: "ball", radius: 0.24 * s },
          p.x,
          2.35 * s,
          p.z,
          "#ffe4a4",
        );
        break;
      case "pond":
        // A shallow decorative basin with a solid bed; water does not block the character.
        add(
          id,
          { kind: "cylinder", radius: 2.5 * s, halfHeight: 0.025 },
          p.x,
          0.025,
          p.z,
          "#5f8f96",
          "stone",
        );
        break;
    }
  });
  const gate = half - 2;
  for (const sign of [-1, 1])
    box(`gate-post-${sign}`, sign * 1.7, 1.5, gate, 0.28, 3, 0.28, "#a08a63");
  box("gate-beam", 0, 3.05, gate, 3.8, 0.28, 0.5, "#8f7a55");
  return physicsRegionSchema.parse({
    id: `place:${place.id}:v1`,
    origin: { x: 0, y: 0, z: 0 },
    terrain: [],
    parts,
  });
}
