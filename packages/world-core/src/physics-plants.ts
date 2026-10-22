import {
  identityQuaternion,
  type ObjectDefinition,
  type ObjectPart,
} from "@island/contracts";
import { cylinder } from "./physics-primitives.js";

/** Bounded, manually advanced stages; each is an immutable shared object definition. */
export function physicsPlants(): ObjectDefinition[] {
  return (["oak", "daisy"] as const).flatMap((species) =>
    [1, 2, 3].map((stage): ObjectDefinition => {
      const tree = species === "oak",
        height = tree
          ? [1.5, 3, 5][stage - 1]!
          : [0.35, 0.65, 0.95][stage - 1]!;
      const decoration = (
        id: string,
        x: number,
        y: number,
        z: number,
        radius: number,
        color: string,
      ): ObjectPart => ({
        id,
        position: { x, y, z },
        rotation: identityQuaternion,
        shape: { kind: "ball", radius },
        color,
        sensor: false,
      });
      return {
        id: `core:plant-${species}-${stage}`,
        version: 1,
        name: `${tree ? "橡树" : "雏菊"} · ${["幼苗", "成长", "成熟"][stage - 1]}`,
        source: "official",
        bodyType: "fixed",
        material: "wood",
        plant: {
          species,
          stage,
          ...(stage < 3
            ? { next: { id: `core:plant-${species}-${stage + 1}`, version: 1 } }
            : {}),
        },
        abilities: stage < 3 ? ["grow"] : [],
        parts: tree
          ? [
              cylinder(
                "trunk",
                0,
                height / 2,
                0,
                0.12 + stage * 0.09,
                height,
                "#8b7052",
              ),
              decoration(
                "crown",
                0,
                height + 0.2,
                0,
                0.5 + stage * 0.45,
                "#668b57",
              ),
              decoration(
                "crown-side",
                0.3 * stage,
                height - 0.2,
                0.15,
                0.3 + stage * 0.3,
                "#83a56a",
              ),
            ]
          : [
              cylinder("stem", 0, height / 2, 0, 0.035, height, "#68914c"),
              decoration("heart", 0, height, 0, 0.06 + stage * 0.02, "#e3bd61"),
              ...Array.from({ length: stage === 1 ? 0 : 5 }, (_, i) =>
                decoration(
                  `petal-${i}`,
                  Math.cos(i * Math.PI * 0.4) * 0.15,
                  height - 0.02,
                  Math.sin(i * Math.PI * 0.4) * 0.15,
                  0.13,
                  "#f6e6cb",
                ),
              ),
            ],
      };
    }),
  );
}
