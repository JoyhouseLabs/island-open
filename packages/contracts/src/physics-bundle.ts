import { z } from "zod";
import { physicsSceneSchema, physicsCheckpointSchema } from "./physics.js";
import { physicsTextSchema } from "./physics-content.js";
export const PHYSICS_BUNDLE_BYTES = 8 * 1024 * 1024;
export const physicsBundleSchema = z
  .object({
    format: z.literal("island-physics"),
    version: z.literal(1),
    scene: physicsSceneSchema,
    checkpoint: physicsCheckpointSchema,
    texts: z
      .array(
        physicsTextSchema
          .extend({
            id: z.string().uuid(),
            version: z.number().int().min(1).max(100),
          })
          .strict(),
      )
      .max(4096),
  })
  .strict()
  .superRefine((b, ctx) => {
    const states = new Map(b.checkpoint.states.map((s) => [s.id, s]));
    if (
      states.size !== b.scene.objects.length ||
      b.scene.objects.some((o) => !states.has(o.id))
    )
      ctx.addIssue({ code: "custom", message: "检查点必须与包内布局逐一对应" });
    const used = new Set(
      b.scene.objects.flatMap((o) =>
        o.contentRef ? [`${o.contentRef.id}@${o.contentRef.version}`] : [],
      ),
    );
    const texts = new Set(b.texts.map((t) => `${t.id}@${t.version}`));
    if (
      texts.size !== b.texts.length ||
      texts.size !== used.size ||
      [...used].some((k) => !texts.has(k))
    )
      ctx.addIssue({
        code: "custom",
        message: "正文版本必须与装置引用逐一对应",
      });
  });
export const importPhysicsBundleSchema = z
  .object({
    connectionId: z.string().uuid(),
    commandId: z.string().uuid(),
    expectedRevision: z.number().int().positive(),
    bundle: physicsBundleSchema,
  })
  .strict();
export type PhysicsBundle = z.infer<typeof physicsBundleSchema>;
export type ImportPhysicsBundle = z.infer<typeof importPhysicsBundleSchema>;
