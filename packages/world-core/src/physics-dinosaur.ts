import {
  identityQuaternion,
  type ObjectPart,
  type PhysicsTerrainTile,
} from "@island/contracts";
import {
  dinosaurPark,
  dinosaurTrail,
  dinosaurHabitats,
  dinosaurWater,
  dinosaurPathDistance,
} from "./dinosaur-geography.js";
import { PhysicsSceneBuilder } from "./physics-scene-builder.js";
import { box, cylinder, hull } from "./physics-primitives.js";
import { physicsPlants } from "./physics-plants.js";
import { random } from "./random.js";

const p = (x: number, z: number, y = 0) => ({ x, y, z });
export const dinosaurSigns = dinosaurHabitats.map((h, i) => {
  const at = dinosaurTrail[[3, 2, 5, 8][i]!]!;
  return { ...h, x: at.x + 5.5, z: at.z };
});
export function dinosaurTerrainHeight(x: number, z: number) {
  const pond = dinosaurPark.pond;
  const r = Math.hypot((x - pond.x) / pond.rx, (z - pond.z) / pond.rz);
  const t = Math.max(0, Math.min(1, (r - 0.55) / 0.45));
  return Math.round(-1.2 * (1 - t * t * (3 - 2 * t)) * 1000) / 1000;
}
export function dinosaurGroundColor(x: number, z: number) {
  if (dinosaurPathDistance(x, z) < 2.8) return "#cabb95";
  if (dinosaurWater(x, z, 1.5)) return "#a7b297";
  return "#a6bb8a";
}
export function dinosaurPlantingError(x: number, z: number) {
  if (
    dinosaurWater(x, z, 2) ||
    dinosaurPark.cliffs.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + 2)
  )
    return "请避开湿地水池与岩崖";
  if (dinosaurPathDistance(x, z) < 4.5) return "环园步道和入口需要保持通畅";
  if (dinosaurHabitats.some((h) => Math.hypot(x - h.x, z - h.z) < h.r))
    return "请在动物和蛋巢观察区外种植";
  return null;
}
export function createDinosaurPhysicsScene() {
  const b = new PhysicsSceneBuilder("dinosaur", "60000000");
  const terrain: PhysicsTerrainTile[] = Array.from({ length: 4 }, (_, i) => {
    const x = -90 + (i % 2) * 90,
      z = -75 + Math.floor(i / 2) * 75;
    return {
      id: `dinosaur-${i}`,
      origin: p(x, z),
      columns: 60,
      rows: 50,
      step: 1.5,
      heights: Array.from({ length: 61 * 51 }, (_, j) =>
        dinosaurTerrainHeight(x + (j % 61) * 1.5, z + Math.floor(j / 61) * 1.5),
      ),
      material: "stone",
      color: "#a6bb8a",
    };
  });
  b.fixed("gate", "恐龙公园入口", p(0, 65), [
    ...[-4, 4].map((x, i) => box(`post-${i}`, x, 3, 0, 0.9, 6, 0.9, "#8b7858")),
    box("sign", 0, 6, 0, 9.5, 1.6, 1, "#55775c"),
  ]);
  for (const [i, c] of dinosaurPark.cliffs.entries()) {
    const ring = (r: number, y: number) =>
      Array.from({ length: 6 }, (_, j) => {
        const angle = (j * Math.PI) / 3 + i * 0.4;
        return p(Math.cos(angle) * r, Math.sin(angle) * r, y);
      });
    b.fixed(
      `cliff-${i}`,
      "翼龙岩崖",
      p(c.x, c.z),
      [
        hull(
          "rock",
          [...ring(c.r, 0), ...ring(c.r * 0.6, c.h)],
          ["#9c9e8b", "#afb09a", "#858e7e"][i]!,
        ),
        hull(
          "cap",
          [...ring(c.r * 0.62, c.h), ...ring(c.r * 0.61, c.h + 0.3)],
          "#849766",
        ),
      ],
      { material: "stone" },
    );
  }
  for (const [i, n] of dinosaurPark.nests.entries()) {
    const eggs = Array.from({ length: 5 }, (_, j) => {
      const a = (j * Math.PI * 2) / 5,
        x = Math.sin(a) * 1.2,
        z = Math.cos(a) * 1.2;
      const vertices = [p(x, z, 0.3), p(x, z, 1.9)];
      for (let lat = 1; lat < 5; lat++)
        for (let k = 0; k < 8; k++) {
          const theta = (Math.PI * lat) / 5,
            phi = (k * Math.PI) / 4;
          vertices.push(
            p(
              x + 0.55 * Math.sin(theta) * Math.cos(phi),
              z + 0.55 * Math.sin(theta) * Math.sin(phi),
              1.1 + 0.8 * Math.cos(theta),
            ),
          );
        }
      return hull(`egg-${j}`, vertices, j % 2 ? "#e2cda6" : "#eeddbd");
    });
    const rim: ObjectPart[] = Array.from({ length: 12 }, (_, j) => ({
      id: `rim-${j}`,
      position: p(
        Math.cos((j * Math.PI) / 6) * 2.4,
        Math.sin((j * Math.PI) / 6) * 2.4,
        0.5,
      ),
      rotation: identityQuaternion,
      shape: { kind: "ball", radius: 0.65 },
      color: "#9b784c",
      sensor: false,
    }));
    b.fixed(`nest-${i}`, "蛋巢观察点", p(n.x, n.z), [
      cylinder("base", 0, 0.15, 0, 2.75, 0.3, "#a7915e"),
      ...rim,
      ...eggs,
    ]);
  }
  for (const h of dinosaurSigns)
    b.fixed(`habitat-${h.id}`, h.title, p(h.x, h.z), [
      box("post", 0, 1.6, 0, 0.25, 3.2, 0.25, "#7f7051"),
      box("sign", 0, 3.1, 0, 3, 1.5, 0.3, h.color),
    ]);
  for (const [i, [x, z]] of [
    [-33, 46],
    [-58, 3],
    [24, -37],
    [72, 36],
  ].entries())
    b.fixed(
      `seat-${i}`,
      "园区长椅",
      p(x!, z!),
      [
        box("seat", 0, 0.6, 0, 2.4, 0.2, 1, "#ad936f"),
        ...[-0.9, 0.9].map((x, j) =>
          box(`leg-${j}`, x, 0.25, 0, 0.22, 0.5, 0.75, "#7b6853"),
        ),
        box("back", 0, 1.1, -0.45, 2.4, 0.65, 0.14, "#ad936f"),
      ],
      { abilities: ["seat"], seat: { partId: "seat", yaw: 0 } },
    );
  const tree = physicsPlants().find((d) => d.id === "core:plant-oak-3")!,
    flower = physicsPlants().find((d) => d.id === "core:plant-daisy-2")!;
  const rng = random(20261024),
    placed: Array<{ x: number; z: number }> = [];
  for (let i = 0; i < 1200 && placed.length < 55; i++) {
    const x = Math.round((rng() - 0.5) * 168 * 100) / 100,
      z = Math.round((rng() - 0.5) * 138 * 100) / 100;
    if (
      dinosaurPlantingError(x, z) ||
      placed.some((q) => Math.hypot(x - q.x, z - q.z) < 5) ||
      b.objects.some((o) => Math.hypot(x - o.position.x, z - o.position.z) < 5)
    )
      continue;
    b.object(placed.length < 35 ? tree : flower, p(x, z));
    placed.push({ x, z });
  }
  return b.build(
    "恐龙公园",
    p(0, 58, 0.87),
    { min: p(-90, -75, -6), max: p(90, 75, 60) },
    terrain,
  );
}
