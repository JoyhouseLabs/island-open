import type { CreationDraft, CreationPart } from "@island/contracts";
export function creationTemplate(
  kind: "table" | "chair" | "lamp",
): CreationDraft {
  const part = (values: Partial<CreationPart>): CreationPart => ({
    id: crypto.randomUUID(),
    shape: "box",
    x: 0,
    y: 0.5,
    z: 0,
    width: 1,
    height: 1,
    depth: 1,
    color: "#b89063",
    rotation: 0,
    ...values,
  });
  const parts: CreationPart[] =
    kind === "table"
      ? [
          part({ width: 3, depth: 2, height: 0.25, y: 1.375 }),
          ...[-1.25, 1.25].flatMap((x) =>
            [-0.75, 0.75].map((z) =>
              part({ x, z, width: 0.25, depth: 0.25, height: 1.25, y: 0.625 }),
            ),
          ),
        ]
      : kind === "chair"
        ? [
            part({
              width: 1.5,
              depth: 1.5,
              height: 0.25,
              y: 0.875,
              seat: true,
              color: "#8bb8a2",
            }),
            ...[-0.5, 0.5].flatMap((x) =>
              [-0.5, 0.5].map((z) =>
                part({
                  x,
                  z,
                  width: 0.25,
                  depth: 0.25,
                  height: 0.75,
                  y: 0.375,
                }),
              ),
            ),
            part({
              width: 1.5,
              depth: 0.25,
              height: 1.25,
              y: 1.25,
              z: -0.625,
              color: "#8bb8a2",
            }),
          ]
        : [
            part({
              shape: "cylinder",
              width: 1.25,
              depth: 1.25,
              height: 0.25,
              y: 0.125,
              color: "#54735e",
            }),
            part({
              width: 0.25,
              depth: 0.25,
              height: 1.5,
              y: 1,
              color: "#54735e",
            }),
            part({
              shape: "sphere",
              y: 2.25,
              color: "#ffcf87",
              light: { color: "#ffcf87", intensity: 4, distance: 6 },
            }),
          ];
  return {
    id: crypto.randomUUID(),
    version: 0,
    blueprint: {
      name:
        kind === "table"
          ? "我的小桌子"
          : kind === "chair"
            ? "我的小椅子"
            : "我的小灯",
      physics: "parts",
      parts,
    },
  };
}
