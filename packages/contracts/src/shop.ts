import { z } from "zod";

export const furnitureIds = [
  "oak-chair",
  "oak-table",
  "mint-sofa",
  "round-stool",
  "woven-rug",
  "sun-rug",
  "garden-lamp",
  "flower-pot",
  "leaf-pot",
  "picket-fence",
  "picnic-table",
  "bird-house",
] as const;
export const furnitureIdSchema = z.enum(furnitureIds);
export type FurnitureId = z.infer<typeof furnitureIdSchema>;
export type FurnitureDefinition = {
  id: FurnitureId;
  name: string;
  description: string;
  price: number;
  width: number;
  depth: number;
  height: number;
  shape:
    | "chair"
    | "table"
    | "sofa"
    | "stool"
    | "rug"
    | "lamp"
    | "pot"
    | "fence"
    | "birdhouse";
  color: string;
  icon: string;
};
/** Public display data; the API uses this same fixed catalog to determine prices. */
export const furnitureCatalog: readonly FurnitureDefinition[] = [
  {
    id: "oak-chair",
    name: "橡木小椅",
    description: "给花园角落添一把温暖的木椅。",
    price: 60,
    width: 1.8,
    depth: 1.8,
    height: 2.6,
    shape: "chair",
    color: "#b88659",
    icon: "🪑",
  },
  {
    id: "oak-table",
    name: "橡木茶桌",
    description: "方方的小桌，留给午后的茶点。",
    price: 100,
    width: 3,
    depth: 2.4,
    height: 1.7,
    shape: "table",
    color: "#c49464",
    icon: "🫖",
  },
  {
    id: "mint-sofa",
    name: "薄荷沙发",
    description: "柔和的绿色，让空地成为客厅。",
    price: 180,
    width: 4,
    depth: 2.2,
    height: 2.3,
    shape: "sofa",
    color: "#86ad98",
    icon: "🛋️",
  },
  {
    id: "round-stool",
    name: "奶油圆凳",
    description: "小巧的圆凳，哪里都能添一点暖意。",
    price: 40,
    width: 1.5,
    depth: 1.5,
    height: 1.2,
    shape: "stool",
    color: "#e9cb8b",
    icon: "🟡",
  },
  {
    id: "woven-rug",
    name: "海风地毯",
    description: "把一小片海蓝铺在草地上。",
    price: 80,
    width: 4,
    depth: 3,
    height: 0.1,
    shape: "rug",
    color: "#83aeb8",
    icon: "🧵",
  },
  {
    id: "sun-rug",
    name: "阳光地毯",
    description: "暖黄色的编织装饰。",
    price: 80,
    width: 3,
    depth: 3,
    height: 0.1,
    shape: "rug",
    color: "#e0b568",
    icon: "☀️",
  },
  {
    id: "garden-lamp",
    name: "星光庭院灯",
    description: "一盏带着柔和光泽的小灯。",
    price: 90,
    width: 1.1,
    depth: 1.1,
    height: 3.4,
    shape: "lamp",
    color: "#53695f",
    icon: "🏮",
  },
  {
    id: "flower-pot",
    name: "陶盆小花",
    description: "粉色小花，装进一只陶盆。",
    price: 35,
    width: 1.4,
    depth: 1.4,
    height: 1.8,
    shape: "pot",
    color: "#da938d",
    icon: "🌷",
  },
  {
    id: "leaf-pot",
    name: "常绿盆栽",
    description: "四季常绿的装饰盆栽。",
    price: 45,
    width: 1.6,
    depth: 1.6,
    height: 2.2,
    shape: "pot",
    color: "#6c9973",
    icon: "🪴",
  },
  {
    id: "picket-fence",
    name: "白色小围栏",
    description: "用一段围栏勾勒自己的小角落。",
    price: 50,
    width: 3.6,
    depth: 0.5,
    height: 1.8,
    shape: "fence",
    color: "#eee3cc",
    icon: "🤍",
  },
  {
    id: "picnic-table",
    name: "森林长桌",
    description: "宽一些的桌面，适合布置野餐角。",
    price: 140,
    width: 4.4,
    depth: 2.6,
    height: 1.9,
    shape: "table",
    color: "#92714d",
    icon: "🧺",
  },
  {
    id: "bird-house",
    name: "小鸟木屋",
    description: "一座装饰小屋，等待你的想象。",
    price: 70,
    width: 1.5,
    depth: 1.5,
    height: 3,
    shape: "birdhouse",
    color: "#b67a58",
    icon: "🐦",
  },
];
export const furniturePlacementSchema = z
  .object({
    id: z.string().uuid(), // Purchased instance, never a client-created entitlement.
    itemId: furnitureIdSchema,
    x: z.number().finite().min(-160).max(160),
    z: z.number().finite().min(-135).max(135),
    rotation: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  })
  .strict();
export type FurniturePlacement = z.infer<typeof furniturePlacementSchema>;
export const shopPurchaseSchema = z
  .object({ itemId: furnitureIdSchema, idempotencyKey: z.string().uuid() })
  .strict();
export interface ShopState {
  credits: number;
  items: { id: string; itemId: FurnitureId; worldId: string | null }[];
}
export interface ShopPurchaseResult {
  state: ShopState;
  instanceId: string;
}

export const rechargePackSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{1,30}$/),
    credits: z.number().int().min(1).max(1000000),
    amountFen: z.number().int().min(1).max(1000000),
  })
  .strict();
export type RechargePack = z.infer<typeof rechargePackSchema>;
export const createRechargeSchema = z
  .object({
    packId: z.string().min(1).max(30),
    channel: z.enum(["native", "h5"]),
    idempotencyKey: z.string().uuid(),
  })
  .strict();
export interface RechargeOrder {
  id: string;
  credits: number;
  amountFen: number;
  channel: "native" | "h5";
  status: "PENDING" | "PAID" | "CLOSED";
  payUrl: string | null;
  expiresAt: string;
  createdAt: string;
  paidAt: string | null;
  transactionId: string | null;
}
export interface CreditLedgerEntry {
  id: string;
  kind: "recharge" | "purchase";
  reference: string;
  delta: number;
  balanceAfter: number;
  description: string;
  createdAt: string;
}
export interface ShopPurchase {
  id: string;
  itemId: FurnitureId;
  itemName: string;
  instanceId: string;
  price: number;
  balanceAfter: number;
  createdAt: string;
}
export interface ShopHistory {
  purchases: ShopPurchase[];
  ledger: CreditLedgerEntry[];
  recharges: RechargeOrder[];
  page: number;
  hasMore: boolean;
}
export interface RechargeOptions {
  enabled: boolean;
  h5: boolean;
  packs: RechargePack[];
}
