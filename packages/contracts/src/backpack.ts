import type { InventoryState } from "./items.js";
import type { ShopState } from "./shop.js";
import type { StarlightState } from "./starlight-play.js";

/** Independent ledgers, read together without creating or transferring assets. */
export type BackpackSource<T> =
  | { status: "ready"; data: T; readAt: string }
  | { status: "error"; message: string };
export type BackpackState = {
  userId: string;
  homes: { id: string; name: string }[];
  homeWorldId: string | null;
  collection: BackpackSource<InventoryState>;
  furniture: BackpackSource<ShopState["items"]>;
  starlight: BackpackSource<{
    worldId: string | null;
    updatedAt: string | null;
    state: StarlightState;
  }>;
};
