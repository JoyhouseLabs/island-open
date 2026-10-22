import { z } from "zod";
export const solidKinds = [
  "triangular-pyramid",
  "square-pyramid",
  "cylinder",
  "cone",
] as const;
export const solidSchema = z.enum(solidKinds);
export type SolidKind = z.infer<typeof solidSchema>;
export const solidFacts: Record<
  SolidKind,
  {
    name: string;
    base: string;
    surfaces: string;
    vertices: string;
    edges: string;
    formation: string;
    invariant: string;
  }
> = {
  "triangular-pyramid": {
    name: "三角锥（三棱锥）",
    base: "三角形",
    surfaces: "4 个平面：1 个底面 + 3 个三角形侧面",
    vertices: "4 个顶点",
    edges: "6 条棱",
    formation:
      "先画三角形底面，再把底面边界连接到同一个顶点。动画让顶点沿高度线升起。",
    invariant:
      "高和底边长改变后，仍有 4 个顶点、6 条棱。这里展示底面为正三角形的直棱锥，不是所有三棱锥的唯一外形。",
  },
  "square-pyramid": {
    name: "四棱锥",
    base: "正方形（本例）",
    surfaces: "5 个平面：1 个底面 + 4 个三角形侧面",
    vertices: "5 个顶点",
    edges: "8 条棱",
    formation:
      "先画正方形底面，再把四条底边连接到同一个顶点，形成四个三角形侧面。",
    invariant:
      "高和底边长改变后，仍有 5 个顶点、8 条棱。四棱锥的底面也可以是其他四边形。",
  },
  cylinder: {
    name: "圆柱",
    base: "两个大小相同、互相平行的圆",
    surfaces: "2 个圆形平面 + 1 个曲面",
    vertices: "没有顶点",
    edges: "圆形边界不按多面体的棱计数",
    formation:
      "让一个圆沿垂直方向平移，留下的空间形成直圆柱。两个圆形底面一样大。",
    invariant:
      "高和半径改变后，仍有两个相同的圆形底面。显示的细分线只是绘图近似，不是圆柱的棱。",
  },
  cone: {
    name: "圆锥",
    base: "一个圆",
    surfaces: "1 个圆形平面 + 1 个曲面",
    vertices: "1 个顶点",
    edges: "圆形边界不按多面体的棱计数",
    formation:
      "把圆形底面边界连接到同一个顶点，围成直圆锥的侧面。动画让顶点沿高度线升起。",
    invariant:
      "高和半径改变后，仍有一个圆形底面和一个顶点。曲面不是许多个三角形平面，屏幕上的细分只是绘图近似。",
  },
};
export const geometryWorkSchema = z
  .object({
    type: z.literal("geometry"),
    solid: solidSchema,
    height: z.number().min(0.8).max(3.2),
    size: z.number().min(0.6).max(2),
    observed: z
      .array(solidSchema)
      .max(4)
      .refine((v) => new Set(v).size === v.length, "观察记录不能重复"),
    note: z.string().trim().max(500),
  })
  .strict();
export type GeometryWork = z.infer<typeof geometryWorkSchema>;
export const modelWorkSchema = z
  .object({
    type: z.literal("model"),
    weight: z.number().min(0).max(4),
    note: z.string().trim().max(500),
  })
  .strict();
export type ModelWork = z.infer<typeof modelWorkSchema>;
export const geometryTaskSchema = z
  .object({
    mode: z.enum(["observe", "formation", "features", "parameters"]),
    target: z
      .object({
        solid: solidSchema,
        height: z.number().min(0.8).max(3.2),
        size: z.number().min(0.6).max(2),
      })
      .strict()
      .optional(),
  })
  .strict();
export type GeometryTask = z.infer<typeof geometryTaskSchema>;
export const modelTaskSchema = z
  .object({ mode: z.enum(["train", "adapt"]) })
  .strict();
export type ModelTask = z.infer<typeof modelTaskSchema>;
export function initialGeometry(): GeometryWork {
  return {
    type: "geometry",
    solid: "triangular-pyramid",
    height: 2,
    size: 1.3,
    observed: [],
    note: "",
  };
}
export const modelExamples = {
  train: [
    { width: 0.5, height: 1 },
    { width: 1, height: 2 },
    { width: 1.5, height: 3 },
  ],
  adapt: [
    { width: 0.5, height: 1.5 },
    { width: 1, height: 3 },
    { width: 1.5, height: 4.5 },
  ],
} as const;
export function modelError(weight: number, mode: ModelTask["mode"]) {
  const data = modelExamples[mode];
  return (
    data.reduce((sum, p) => sum + (weight * p.width - p.height) ** 2, 0) /
    data.length
  );
}
/** One gradient step for h = k × width, using only the three training examples. */
export function trainModelStep(weight: number, mode: ModelTask["mode"]) {
  const data = modelExamples[mode];
  const gradient =
    (2 *
      data.reduce(
        (sum, p) => sum + p.width * (weight * p.width - p.height),
        0,
      )) /
    data.length;
  return Math.max(0, Math.min(4, weight - 0.15 * gradient));
}
