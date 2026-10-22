import { z } from "zod";

export const BUILDING_CAPABILITIES = [
  "constructionV1",
  "devicesV1",
  "sceneContentV1",
] as const;
export const buildingBudgets = {
  blocks: 4096,
  devices: 64,
  layoutTargets: 256,
  commands: 20,
  page: 20,
  maxPage: 100,
  contentBytes: 32 * 1024 * 1024,
  backupBytes: 48 * 1024 * 1024,
  backupEntries: 50000,
} as const;
export const libraryGrid = {
  id: "library-build-v1",
  origin: { x: 12, y: 0, z: -22 },
  size: 1,
  width: 18,
  depth: 18,
  height: 16,
} as const;
export const playerBody = { radius: 0.4, height: 1.8, step: 0.18 } as const;
const segmenter = new Intl.Segmenter("zh", { granularity: "grapheme" });
export const visibleLength = (s: string) => [...segmenter.segment(s)].length;
export function plainText(max: number, multiline = false) {
  return z
    .string()
    .refine((s) => visibleLength(s) <= max, `最多 ${max} 个可见字符`)
    .refine(
      (s) => new TextEncoder().encode(s).length <= max * 64,
      "文字字节数超限",
    )
    .refine(
      (s) =>
        !(
          multiline
            ? /[\u0000-\u0009\u000b-\u001f\u007f]/
            : /[\u0000-\u001f\u007f]/
        ).test(s),
      "文字含不允许的控制字符",
    );
}
const rotation = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);
export const cellSchema = z
  .object({
    x: z.number().int().min(-256).max(256),
    y: z.number().int().min(-256).max(256),
    z: z.number().int().min(-256).max(256),
  })
  .strict();
export type Cell = z.infer<typeof cellSchema>;
export const blockValueSchema = z
  .object({
    definitionId: z.enum(["island:stone", "island:wood", "island:glass"]),
    definitionVersion: z.literal(1),
    rotation: rotation.default(0),
  })
  .strict();
export type BlockValue = z.infer<typeof blockValueSchema>;
export const constructionSchema = z
  .object({
    dataVersion: z.literal(1),
    gridId: z.literal(libraryGrid.id),
    blockPalette: z.array(blockValueSchema).max(12),
    chunks: z
      .array(
        z
          .object({
            cx: z.number().int().min(-16).max(16),
            cy: z.number().int().min(-16).max(16),
            cz: z.number().int().min(-16).max(16),
            cells: z
              .array(
                z
                  .object({
                    index: z.number().int().min(0).max(4095),
                    palette: z.number().int().min(0).max(11),
                  })
                  .strict(),
              )
              .max(4096),
          })
          .strict(),
      )
      .max(64),
  })
  .strict()
  .superRefine((v, ctx) => {
    const keys = new Set<string>();
    let count = 0;
    for (const c of v.chunks) {
      const key = `${c.cx},${c.cy},${c.cz}`;
      if (keys.has(key)) ctx.addIssue({ code: "custom", message: "重复区块" });
      keys.add(key);
      const indices = new Set<number>();
      for (const cell of c.cells) {
        count++;
        if (indices.has(cell.index) || !v.blockPalette[cell.palette])
          ctx.addIssue({ code: "custom", message: "重复格子或未知材质" });
        indices.add(cell.index);
      }
    }
    if (count > buildingBudgets.blocks)
      ctx.addIssue({ code: "custom", message: "建筑格子超限" });
  });
export type ConstructionSnapshot = z.infer<typeof constructionSchema>;
export const blockSupportSchema = cellSchema
  .extend({ type: z.literal("blockTop") })
  .strict();
export const placementSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("stored") }).strict(),
  z
    .object({
      state: z.literal("placed"),
      x: z.number().finite().min(-160).max(160),
      y: z.number().finite().min(0).max(16),
      z: z.number().finite().min(-135).max(135),
      rotation,
      support: z.union([
        z.object({ type: z.literal("ground") }).strict(),
        blockSupportSchema,
      ]),
    })
    .strict(),
]);
const baseDevice = {
  id: z.string().uuid(),
  definitionVersion: z.literal(1),
  dataVersion: z.literal(1),
  placement: placementSchema,
};
export const deviceSchema = z.discriminatedUnion("definitionId", [
  z
    .object({
      ...baseDevice,
      definitionId: z.literal("island:bookshelf"),
      payload: z
        .object({
          kind: z.literal("bookshelf"),
          collectionId: z.string().uuid(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...baseDevice,
      definitionId: z.literal("island:sign"),
      payload: z
        .object({
          kind: z.literal("sign"),
          lines: z.tuple([
            plainText(24),
            plainText(24),
            plainText(24),
            plainText(24),
          ]),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...baseDevice,
      definitionId: z.literal("island:nameplate"),
      payload: z
        .object({ kind: z.literal("nameplate"), name: plainText(20) })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...baseDevice,
      definitionId: z.literal("island:display-case"),
      payload: z
        .object({
          kind: z.literal("displayCase"),
          itemRef: z
            .object({ itemId: z.string().min(1).max(100) })
            .strict()
            .nullable(),
        })
        .strict(),
    })
    .strict(),
]);
export type DeviceInstance = z.infer<typeof deviceSchema>;
export type Placement = z.infer<typeof placementSchema>;
export const entityPlacementSchema = z
  .object({
    entityId: z.string().min(1).max(100),
    y: z.number().finite().min(1).max(16),
    support: blockSupportSchema,
  })
  .strict();
export type EntityPlacement = z.infer<typeof entityPlacementSchema>;
export const buildingOps = [
  z
    .object({
      op: z.literal("block.set"),
      cell: cellSchema,
      expected: blockValueSchema.nullable(),
      value: blockValueSchema.nullable(),
    })
    .strict(),
  z
    .object({
      op: z.literal("device.put"),
      device: deviceSchema,
      expected: deviceSchema.nullable(),
    })
    .strict(),
  z
    .object({
      op: z.literal("entity.support"),
      id: z.string().min(1).max(100),
      value: entityPlacementSchema.nullable(),
    })
    .strict(),
] as const;
export const deviceDefinitions = {
  "island:bookshelf": { name: "书架", width: 2, depth: 1, height: 2, front: 1 },
  "island:sign": {
    name: "告示牌",
    width: 1,
    depth: 0.5,
    height: 1.6,
    front: 0.8,
  },
  "island:nameplate": {
    name: "命名牌",
    width: 0.8,
    depth: 0.5,
    height: 1.2,
    front: 0.6,
  },
  "island:display-case": {
    name: "展示柜",
    width: 1.5,
    depth: 1.5,
    height: 1.5,
    front: 0.8,
  },
} as const;
const uuid = z.string().uuid(),
  rev = z.number().int().positive();
export const contentCommandSchema = z.discriminatedUnion("op", [
  z
    .object({
      op: z.literal("document.create"),
      id: uuid,
      kind: z.enum(["note", "notebook"]),
      title: plainText(60),
    })
    .strict(),
  z
    .object({
      op: z.literal("document.title"),
      id: uuid,
      expectedRevision: rev,
      title: plainText(60),
    })
    .strict(),
  z
    .object({
      op: z.literal("document.archive"),
      id: uuid,
      expectedRevision: rev,
    })
    .strict(),
  z
    .object({
      op: z.literal("document.restore"),
      id: uuid,
      expectedRevision: rev,
    })
    .strict(),
  z
    .object({
      op: z.literal("entry.add"),
      id: uuid,
      documentId: uuid,
      expectedRevision: rev,
      text: plainText(4000, true),
    })
    .strict(),
  z
    .object({
      op: z.literal("entry.restore"),
      id: uuid,
      expectedRevision: rev,
      historyId: z.string().regex(/^\d+$/),
    })
    .strict(),
  z
    .object({
      op: z.literal("entry.move"),
      id: uuid,
      documentId: uuid,
      expectedRevision: rev,
      beforeId: uuid.nullable(),
    })
    .strict(),
  z
    .object({
      op: z.literal("document.move"),
      id: uuid,
      collectionId: uuid,
      expectedRevision: rev,
      beforeId: uuid.nullable(),
    })
    .strict(),
  z
    .object({
      op: z.literal("entry.edit"),
      id: uuid,
      expectedRevision: rev,
      text: plainText(4000, true),
    })
    .strict(),
  z
    .object({
      op: z.literal("document.shelve"),
      id: uuid,
      collectionId: uuid,
      expectedRevision: rev,
    })
    .strict(),
  z
    .object({
      op: z.literal("document.unshelve"),
      id: uuid,
      collectionId: uuid,
      expectedRevision: rev,
    })
    .strict(),
]);
export const contentRequestSchema = z
  .object({
    idempotencyKey: uuid,
    deviceId: uuid,
    commands: z.array(contentCommandSchema).min(1).max(20),
  })
  .strict();
export type ContentRequest = z.infer<typeof contentRequestSchema>;
export type ContentCommand = z.infer<typeof contentCommandSchema>;
export type SceneDocument = {
  id: string;
  kind: "note" | "notebook";
  title: string;
  revision: number;
  createdAt: string;
  deletedAt: string | null;
  collectionId: string | null;
};
export type DocumentEntry = {
  id: string;
  documentId: string;
  position: number;
  text: string;
  revision: number;
};
export type SceneCollection = { id: string; revision: number };
export type ContentPage<T> = {
  items: T[];
  nextCursor: string | null;
  contentRevision: number;
};
