import { playerAppearanceSchema } from "./avatar.js";
import { z } from "zod";
import {
  physicsTerrainSchema,
  physicsTerrainTileSchema,
} from "./physics-terrain.js";
export * from "./physics-terrain.js";

export const PHYSICS_RULES_VERSION = "1.0.0" as const;
export const physicsBudgets = Object.freeze({
  players: 4,
  creations: 16,
  shopObjects: 100,
  lights: 4,
  dynamicBodies: 32,
  partsPerObject: 24,
  staticColliders: 4096,
  behaviorNodes: 64,
  behaviorLinks: 128,
  signalsPerTick: 256,
  tickRate: 60,
  maxCatchUpSteps: 4,
  frameRate: 15,
});
export const physicsMaterials = {
  wood: { density: 0.6, friction: 0.65, restitution: 0.05 },
  stone: { density: 2.4, friction: 0.8, restitution: 0.02 },
  rubber: { density: 1.1, friction: 0.9, restitution: 0.65 },
  ice: { density: 0.9, friction: 0.03, restitution: 0.02 },
} as const;
export const vector3Schema = z
  .object({
    x: z.number().finite().min(-100000).max(100000),
    y: z.number().finite().min(-10000).max(10000),
    z: z.number().finite().min(-100000).max(100000),
  })
  .strict();
export const quaternionSchema = z
  .object({
    x: z.number().finite().min(-1).max(1),
    y: z.number().finite().min(-1).max(1),
    z: z.number().finite().min(-1).max(1),
    w: z.number().finite().min(-1).max(1),
  })
  .strict()
  .refine(
    (q) => Math.abs(Math.hypot(q.x, q.y, q.z, q.w) - 1) < 0.0001,
    "旋转必须是单位四元数",
  );
export const identityQuaternion = { x: 0, y: 0, z: 0, w: 1 };
const extent = z.number().finite().min(0.025).max(256);
const localVector = z
  .object({
    x: z.number().finite().min(-256).max(256),
    y: z.number().finite().min(-256).max(256),
    z: z.number().finite().min(-256).max(256),
  })
  .strict();
export const colliderShapeSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("box"),
      halfExtents: z.object({ x: extent, y: extent, z: extent }).strict(),
    })
    .strict(),
  z.object({ kind: z.literal("ball"), radius: extent }).strict(),
  z
    .object({ kind: z.literal("cylinder"), radius: extent, halfHeight: extent })
    .strict(),
  z
    .object({ kind: z.literal("capsule"), radius: extent, halfHeight: extent })
    .strict(),
  z
    .object({
      kind: z.literal("convex"),
      vertices: z.array(localVector).min(4).max(64),
    })
    .strict(),
]);
export const objectPartSchema = z
  .object({
    id: z.string().min(1).max(48),
    shape: colliderShapeSchema,
    position: localVector,
    rotation: quaternionSchema,
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    sensor: z.boolean().default(false),
    opacity: z.number().finite().min(0.05).max(1).optional(),
  })
  .strict();
/** One bounded point light, anchored to an actual solid part in object-local coordinates. */
export const physicsLightSchema = z
  .object({
    partId: z.string().min(1).max(48),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    intensity: z.number().finite().min(0.1).max(30),
    distance: z.number().finite().min(1).max(12),
  })
  .strict();
export type PhysicsLight = z.infer<typeof physicsLightSchema>;
export function physicsLightError(
  parts: ObjectPart[],
  light?: PhysicsLight,
): string | null {
  if (light && !parts.some((p) => p.id === light.partId && !p.sensor))
    return "光源须绑定到作品中的实体部件";
  return null;
}
export const physicsSeatSchema = z
  .object({
    partId: z.string().min(1).max(48),
    yaw: z.number().finite().min(-Math.PI).max(Math.PI),
  })
  .strict();
export type PhysicsSeat = z.infer<typeof physicsSeatSchema>;
export function physicsSeatError(
  parts: ObjectPart[],
  bodyType: string,
  seat?: PhysicsSeat,
): string | null {
  if (!seat) return null;
  if (bodyType !== "fixed") return "座面只能设置在固定家具上";
  const p = parts.find((p) => p.id === seat.partId && !p.sensor);
  if (!p || Math.abs(p.rotation.x) > 1e-5 || Math.abs(p.rotation.z) > 1e-5)
    return "座面须绑定水平的实体方块或圆柱";
  const shape = p.shape;
  if (!(
    (shape.kind === "box" &&
      shape.halfExtents.x >= 0.35 &&
      shape.halfExtents.z >= 0.35) ||
    (shape.kind === "cylinder" && shape.radius >= 0.35)
  ))
    return "座面须是宽、深至少 0.7 米的方块或圆柱顶面";
  return null;
}
export const physicsBehaviorSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("switch"), version: z.literal(1) }).strict(),
  z
    .object({
      kind: z.literal("pressure"),
      version: z.literal(1),
      partId: z.string().min(1).max(48),
    })
    .strict(),
  z
    .object({
      kind: z.literal("door"),
      version: z.literal(1),
      travel: z.number().finite().min(0.5).max(4),
      speed: z.number().finite().min(0.2).max(2),
    })
    .strict(),
]);
export const physicsBehaviorLinkSchema = z
  .object({
    id: z.string().uuid(),
    from: z
      .object({ objectId: z.string().uuid(), port: z.literal("signal") })
      .strict(),
    to: z
      .object({ objectId: z.string().uuid(), port: z.enum(["open", "on"]) })
      .strict(),
  })
  .strict();
export type PhysicsBehaviorLink = z.infer<typeof physicsBehaviorLinkSchema>;
export const physicsBehaviorStateSchema = z
  .object({ id: z.string().uuid(), active: z.boolean(), blocked: z.boolean() })
  .strict();
export type PhysicsBehaviorState = z.infer<typeof physicsBehaviorStateSchema>;
export const physicsSwitchStateSchema = z
  .object({ id: z.string().uuid(), on: z.boolean() })
  .strict();
export type PhysicsSwitchState = z.infer<typeof physicsSwitchStateSchema>;
export const objectDefinitionSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9:._-]{0,95}$/),
    version: z.number().int().positive(),
    name: z.string().trim().min(1).max(60),
    source: z.enum(["official", "shop", "creation"]),
    bodyType: z.enum(["fixed", "dynamic", "kinematic"]),
    material: z.enum(["wood", "stone", "rubber", "ice"]),
    parts: z.array(objectPartSchema).min(1).max(physicsBudgets.partsPerObject),
    plant: z
      .object({
        species: z.enum(["oak", "daisy"]),
        stage: z.number().int().min(1).max(3),
        next: z
          .object({
            id: z.string().regex(/^[a-z0-9][a-z0-9:._-]{0,95}$/),
            version: z.number().int().positive(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    light: physicsLightSchema.optional(),
    seat: physicsSeatSchema.optional(),
    behavior: physicsBehaviorSchema.optional(),
    abilities: z
      .array(
        z.enum([
          "grabbable",
          "grow",
          "seat",
          "light",
          "switch",
          "pressure",
          "door",
          "platform",
          "content",
        ]),
      )
      .max(8),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.plant && (d.source !== "official" || d.bodyType !== "fixed"))
      ctx.addIssue({ code: "custom", message: "当前植物使用官方固定物体定义" });
    if (!!d.plant?.next !== d.abilities.includes("grow"))
      ctx.addIssue({ code: "custom", message: "生长能力需要下一阶段定义" });
    if (d.plant?.next?.id === d.id && d.plant.next.version === d.version)
      ctx.addIssue({ code: "custom", message: "生长不能指向当前阶段" });
    for (const kind of ["switch", "pressure", "door"] as const)
      if ((d.behavior?.kind === kind) !== d.abilities.includes(kind))
        ctx.addIssue({
          code: "custom",
          message: "机关能力须有匹配的版本化配置",
        });
    if (d.behavior) {
      if (d.source !== "official")
        ctx.addIssue({ code: "custom", message: "当前机关部件由官方定义提供" });
      if (d.light || d.seat)
        ctx.addIssue({
          code: "custom",
          message: "单件机关不能同时设置灯光或座面",
        });
      if (d.behavior.kind === "door") {
        if (
          d.bodyType !== "kinematic" ||
          d.parts.length !== 1 ||
          d.parts[0]?.shape.kind !== "box" ||
          d.parts[0]?.sensor
        )
          ctx.addIssue({
            code: "custom",
            message: "升降门须是单个运动学实体方块",
          });
      } else if (d.bodyType !== "fixed")
        ctx.addIssue({ code: "custom", message: "开关和压力板必须固定" });
      if (
        d.behavior.kind === "pressure" &&
        !d.parts.some(
          (p) =>
            p.id === (d.behavior as { partId: string }).partId &&
            p.sensor &&
            p.shape.kind === "box",
        )
      )
        ctx.addIssue({ code: "custom", message: "压力板须引用方块感应部件" });
    }
    const seatError = physicsSeatError(d.parts, d.bodyType, d.seat);
    if (seatError) ctx.addIssue({ code: "custom", message: seatError });
    if (!!d.seat !== d.abilities.includes("seat"))
      ctx.addIssue({ code: "custom", message: "座面能力须有匹配配置" });
    const lightError = physicsLightError(d.parts, d.light);
    if (lightError) ctx.addIssue({ code: "custom", message: lightError });
    if (!!d.light !== d.abilities.includes("light"))
      ctx.addIssue({ code: "custom", message: "发光能力须有匹配的光源配置" });
    if (new Set(d.parts.map((p) => p.id)).size !== d.parts.length)
      ctx.addIssue({ code: "custom", message: "部件编号不能重复" });
    if (new Set(d.abilities).size !== d.abilities.length)
      ctx.addIssue({ code: "custom", message: "能力不能重复" });
    if (d.bodyType !== "dynamic" && d.abilities.includes("grabbable"))
      ctx.addIssue({ code: "custom", message: "只有活动物体可以搬动" });
    if (d.bodyType === "dynamic" && d.parts.every((p) => p.sensor))
      ctx.addIssue({ code: "custom", message: "活动物体需要实体碰撞" });
  });
export const physicsContentRefSchema = z
  .object({
    id: z.string().uuid(),
    version: z.number().int().min(1).max(100),
  })
  .strict();
export const objectInstanceSchema = z
  .object({
    id: z.string().uuid(),
    definitionId: z.string(),
    definitionVersion: z.number().int().positive(),
    position: vector3Schema,
    rotation: quaternionSchema,
    contentRef: physicsContentRefSchema.optional(),
    infrastructureKey: z
      .string()
      .regex(/^[a-z][a-z0-9-]{0,47}$/)
      .optional(),
    motion: z
      .object({
        offset: localVector,
        periodTicks: z.number().int().min(120).max(3600),
      })
      .strict()
      .optional(),
  })
  .strict();
export const physicsSceneKeys = [
  "playground",
  "building-yard",
  "island",
  "library",
  "garden",
  "nursery",
  "home",
  "meadow",
  "forest",
  "pond",
  "lab",
  "beach",
  "starlight",
  "mountain",
  "dinosaur",
] as const;
export const physicsSceneKeySchema = z.enum(physicsSceneKeys);
export const physicsSceneTemplateRefSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9:._-]{0,95}$/),
    version: z.number().int().positive(),
  })
  .strict();
export type PhysicsSceneTemplateRef = z.infer<
  typeof physicsSceneTemplateRefSchema
>;
export const physicsSceneSchema = z
  .object({
    schemaVersion: z.literal(4),
    physicsVersion: z.literal(PHYSICS_RULES_VERSION),
    id: z.string().min(1).max(96),
    name: z.string().min(1).max(60),
    template: physicsSceneTemplateRefSchema,
    definitions: z.array(objectDefinitionSchema).max(512),
    objects: z.array(objectInstanceSchema).max(4096),
    links: z
      .array(physicsBehaviorLinkSchema)
      .max(physicsBudgets.behaviorLinks)
      .default([]),
    terrain: physicsTerrainSchema.default([]),
    spawn: vector3Schema,
    bounds: z.object({ min: vector3Schema, max: vector3Schema }).strict(),
  })
  .strict()
  .superRefine((s, ctx) => {
    const definitions = new Map(
      s.definitions.map((d) => [`${d.id}@${d.version}`, d]),
    );
    for (const axis of ["x", "y", "z"] as const) {
      if (s.bounds.min[axis] >= s.bounds.max[axis])
        ctx.addIssue({ code: "custom", message: "场景边界无效" });
      if (
        s.spawn[axis] < s.bounds.min[axis] ||
        s.spawn[axis] > s.bounds.max[axis]
      )
        ctx.addIssue({ code: "custom", message: "出生点超出场景" });
    }
    for (const tile of s.terrain) {
      if (
        tile.origin.x < s.bounds.min.x ||
        tile.origin.z < s.bounds.min.z ||
        tile.origin.x + tile.columns * tile.step > s.bounds.max.x ||
        tile.origin.z + tile.rows * tile.step > s.bounds.max.z ||
        tile.heights.some(
          (h) =>
            tile.origin.y + h < s.bounds.min.y ||
            tile.origin.y + h > s.bounds.max.y,
        )
      )
        ctx.addIssue({ code: "custom", message: "地形超出场景边界" });
    }
    if (definitions.size !== s.definitions.length)
      ctx.addIssue({ code: "custom", message: "定义版本重复" });
    if (new Set(s.objects.map((o) => o.id)).size !== s.objects.length)
      ctx.addIssue({ code: "custom", message: "物体编号重复" });
    const infrastructureKeys = s.objects.flatMap((o) =>
      o.infrastructureKey ? [o.infrastructureKey] : [],
    );
    if (new Set(infrastructureKeys).size !== infrastructureKeys.length)
      ctx.addIssue({ code: "custom", message: "场景基础设施标识不能重复" });
    const nodes = new Map(
      s.objects.flatMap((o) => {
        const d = definitions.get(`${o.definitionId}@${o.definitionVersion}`);
        return d?.behavior || d?.light ? [[o.id, d] as const] : [];
      }),
    );
    if (nodes.size > physicsBudgets.behaviorNodes)
      ctx.addIssue({ code: "custom", message: "机关节点超过房间预算" });
    if (
      new Set(s.links.map((l) => l.id)).size !== s.links.length ||
      new Set(
        s.links.map((l) => `${l.from.objectId}:${l.to.objectId}:${l.to.port}`),
      ).size !== s.links.length
    )
      ctx.addIssue({ code: "custom", message: "机关连接编号或端点不能重复" });
    for (const link of s.links) {
      const from = nodes.get(link.from.objectId),
        to = nodes.get(link.to.objectId);
      if (
        !(
          from?.behavior?.kind === "switch" ||
          from?.behavior?.kind === "pressure"
        ) ||
        !(link.to.port === "open"
          ? to?.behavior?.kind === "door"
          : to?.light) ||
        link.from.objectId === link.to.objectId
      )
        ctx.addIssue({
          code: "custom",
          message: "只能将开关或压力板的信号连接到门或灯",
        });
    }
    let creations = 0,
      shopObjects = 0,
      lights = 0;
    let dynamic = 0,
      staticParts = s.terrain.length;
    for (const o of s.objects) {
      const d = definitions.get(`${o.definitionId}@${o.definitionVersion}`);
      if (!d) {
        ctx.addIssue({ code: "custom", message: "物体引用不存在的定义版本" });
        continue;
      }
      if (
        o.motion &&
        (d.bodyType !== "kinematic" || !d.abilities.includes("platform"))
      )
        ctx.addIssue({ code: "custom", message: "移动轨迹只适用于运动平台" });
      if (o.infrastructureKey && d.source !== "official")
        ctx.addIssue({ code: "custom", message: "基础设施必须由场景模板提供" });
      if (o.contentRef && !d.abilities.includes("content"))
        ctx.addIssue({ code: "custom", message: "该物品不能展示正文" });
      if (
        d.behavior &&
        (o.motion ||
          Math.abs(o.rotation.x) > 1e-5 ||
          Math.abs(o.rotation.z) > 1e-5)
      )
        ctx.addIssue({
          code: "custom",
          message: "机关须竖直摆放且不能另配运动轨迹",
        });
      if (d.light) lights++;
      if (d.source === "creation") creations++;
      if (d.source === "shop") shopObjects++;
      if (d.bodyType === "dynamic") dynamic++;
      else staticParts += d.parts.length;
    }
    if (
      creations > physicsBudgets.creations ||
      shopObjects > physicsBudgets.shopObjects
    )
      ctx.addIssue({ code: "custom", message: "作品或家具超过房间预算" });
    if (lights > physicsBudgets.lights)
      ctx.addIssue({
        code: "custom",
        message: `每个房间最多 ${physicsBudgets.lights} 个光源`,
      });
    if (dynamic > physicsBudgets.dynamicBodies)
      ctx.addIssue({ code: "custom", message: "活动物体超过房间预算" });
    if (staticParts > physicsBudgets.staticColliders)
      ctx.addIssue({ code: "custom", message: "静态碰撞超过房间预算" });
  });
export const bodyStateSchema = z
  .object({
    id: z.string().uuid(),
    position: vector3Schema,
    rotation: quaternionSchema,
    sleeping: z.boolean(),
  })
  .strict();
export const physicsCheckpointSchema = z
  .object({
    schemaVersion: z.literal(4),
    physicsVersion: z.literal(PHYSICS_RULES_VERSION),
    layoutRevision: z.number().int().nonnegative(),
    revision: z.number().int().nonnegative(),
    tick: z.number().int().nonnegative(),
    states: z.array(bodyStateSchema).max(4096),
    switches: z
      .array(physicsSwitchStateSchema)
      .max(physicsBudgets.behaviorNodes)
      .default([]),
  })
  .strict()
  .refine(
    (s) =>
      new Set(s.states.map((o) => o.id)).size === s.states.length &&
      new Set(s.switches.map((o) => o.id)).size === s.switches.length,
    "检查点物体编号重复",
  );
export type PhysicsScene = z.infer<typeof physicsSceneSchema>;
export type ObjectDefinition = z.infer<typeof objectDefinitionSchema>;
export type ObjectInstance = z.infer<typeof objectInstanceSchema>;
export type ObjectPart = z.infer<typeof objectPartSchema>;
export type ColliderShape = z.infer<typeof colliderShapeSchema>;
export type Vector3 = z.infer<typeof vector3Schema>;
export type Quaternion = z.infer<typeof quaternionSchema>;
export type BodyState = z.infer<typeof bodyStateSchema>;

export const characterStateSchema = z
  .object({
    position: vector3Schema,
    velocity: vector3Schema,
    grounded: z.boolean(),
    jumpHeld: z.boolean(),
    coyote: z.number().finite().min(0).max(0.1),
    seated: z.boolean(),
  })
  .strict();
const roomCommandFields = {
  layoutRevision: z.number().int().positive(),
  sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
};
export const physicsRoomCommandSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("toggle"),
      ...roomCommandFields,
      commandId: z.string().uuid(),
      objectId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      type: z.literal("input"),
      ...roomCommandFields,
      x: z.number().finite().min(-1).max(1),
      z: z.number().finite().min(-1).max(1),
      jump: z.boolean(),
      yaw: z.number().finite().min(-Math.PI).max(Math.PI),
    })
    .strict(),
  z
    .object({
      type: z.literal("sit"),
      ...roomCommandFields,
      commandId: z.string().uuid(),
      objectId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      type: z.literal("stand"),
      ...roomCommandFields,
      commandId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      type: z.literal("grab"),
      ...roomCommandFields,
      commandId: z.string().uuid(),
      objectId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      type: z.literal("push"),
      ...roomCommandFields,
      commandId: z.string().uuid(),
      objectId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      type: z.literal("drop"),
      ...roomCommandFields,
      commandId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      type: z.literal("toss"),
      ...roomCommandFields,
      commandId: z.string().uuid(),
    })
    .strict(),
]);
export type PhysicsRoomCommand = z.infer<typeof physicsRoomCommandSchema>;
export const physicsPlayerStateSchema = characterStateSchema.extend({
  appearance: playerAppearanceSchema,
  id: z.string().min(1).max(96),
  ackInput: z.number().int().min(-1),
  held: z.string().uuid().nullable(),
  seatId: z.string().uuid().nullable(),
  yaw: z.number().finite(),
  canInteract: z.boolean(),
  dropPreview: z
    .object({
      valid: z.boolean(),
      position: vector3Schema,
      rotation: quaternionSchema,
      reason: z.string(),
    })
    .strict()
    .nullable(),
});
export const physicsFrameSchema = z
  .object({
    baseSequence: z.number().int().min(-1),
    epoch: z.string().uuid(),
    sequence: z.number().int().nonnegative(),
    tick: z.number().int().nonnegative(),
    layoutRevision: z.number().int().positive(),
    full: z.boolean(),
    bodies: z.array(bodyStateSchema).max(4096),
    behaviors: z
      .array(physicsBehaviorStateSchema)
      .max(physicsBudgets.behaviorNodes)
      .optional(),
    players: z.array(physicsPlayerStateSchema).max(physicsBudgets.players),
  })
  .strict();
export type PhysicsPlayerState = z.infer<typeof physicsPlayerStateSchema>;
export type PhysicsFrame = z.infer<typeof physicsFrameSchema>;

export const selectPhysicsHomeSchema = z
  .object({ worldId: z.string().uuid().optional() })
  .strict();

export const createPhysicsWorldSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(60),
  })
  .strict();
export const physicsSharingSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    sharing: z.enum(["private", "link"]),
    interactive: z.boolean(),
  })
  .strict()
  .refine(
    (value) => value.sharing === "link" || !value.interactive,
    "私有世界不能开放互动",
  );
/** Clients reference a server-resolved immutable definition; never submit geometry. */
export const physicsLayoutOperationSchema = z.discriminatedUnion("type", [
  z
    .object({ type: z.literal("link"), link: physicsBehaviorLinkSchema })
    .strict(),
  z.object({ type: z.literal("unlink"), linkId: z.string().uuid() }).strict(),
  z.object({ type: z.literal("place"), object: objectInstanceSchema }).strict(),
  z
    .object({
      type: z.literal("move"),
      objectId: z.string().uuid(),
      position: vector3Schema,
      rotation: quaternionSchema,
    })
    .strict(),
  z.object({ type: z.literal("remove"), objectId: z.string().uuid() }).strict(),
  z.object({ type: z.literal("grow"), objectId: z.string().uuid() }).strict(),
  z
    .object({
      type: z.literal("content"),
      objectId: z.string().uuid(),
      contentRef: physicsContentRefSchema.nullable(),
    })
    .strict(),
]);
export const physicsLayoutEditSchema = z
  .object({
    commandId: z.string().uuid(),
    expectedRevision: z.number().int().positive(),
    operation: physicsLayoutOperationSchema,
  })
  .strict();
export type PhysicsLayoutOperation = z.infer<
  typeof physicsLayoutOperationSchema
>;
export type PhysicsLayoutEdit = z.infer<typeof physicsLayoutEditSchema>;
export const physicsEditLeaseSchema = z
  .object({
    holder: z.string().uuid().nullable(),
    expiresAt: z.number().nonnegative(),
  })
  .strict();
export const physicsClientMessageSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("editLease"),
      requestId: z.string().uuid(),
      action: z.enum(["acquire", "renew", "release"]),
      takeover: z.boolean().default(false),
    })
    .strict(),
  z.object({ type: z.literal("edit"), edit: physicsLayoutEditSchema }).strict(),
  z
    .object({ type: z.literal("command"), command: physicsRoomCommandSchema })
    .strict(),
  z
    .object({
      type: z.literal("sync"),
      layoutRevision: z.number().int().positive().optional(),
    })
    .strict(),
  z.object({ type: z.literal("save"), requestId: z.string().uuid() }).strict(),
]);
export const physicsServerMessageSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("editLease"),
      lease: physicsEditLeaseSchema,
      requestId: z.string().uuid().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("layout"),
      scene: physicsSceneSchema,
      frame: physicsFrameSchema,
      checkpointRevision: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      type: z.literal("edited"),
      commandId: z.string().uuid(),
      revision: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      type: z.literal("welcome"),
      you: z.string().uuid(),
      worldId: z.string().uuid(),
      scene: physicsSceneSchema,
      frame: physicsFrameSchema,
      canEdit: z.boolean(),
      checkpointRevision: z.number().int().nonnegative(),
    })
    .strict(),
  z.object({ type: z.literal("frame"), frame: physicsFrameSchema }).strict(),
  z
    .object({
      type: z.literal("receipt"),
      commandId: z.string().uuid(),
      ok: z.boolean(),
      message: z.string(),
      tick: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      type: z.literal("saved"),
      requestId: z.string().uuid().optional(),
      revision: z.number().int().nonnegative(),
      tick: z.number().int().nonnegative(),
      savedAt: z.string(),
    })
    .strict(),
  z
    .object({
      type: z.literal("error"),
      code: z.string(),
      message: z.string(),
      requestId: z.string().uuid().optional(),
    })
    .strict(),
]);
export type PhysicsServerMessage = z.infer<typeof physicsServerMessageSchema>;

export const physicsRegionSchema = z
  .object({
    id: z.string().min(1).max(96),
    origin: vector3Schema,
    terrain: z.array(physicsTerrainTileSchema).max(4),
    parts: z
      .array(
        objectPartSchema
          .extend({ material: z.enum(["wood", "stone", "rubber", "ice"]) })
          .refine((p) => !p.sensor, "区域基础设施不能是感应体"),
      )
      .max(256),
  })
  .strict();
export type PhysicsRegion = z.infer<typeof physicsRegionSchema>;
