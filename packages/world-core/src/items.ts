import type { ItemDefinition } from "@island/contracts";
import { forageCatalog } from "./collectibles.js";
import { unlocks } from "./growth.js";

/** How many of one treasure fit in the backpack. */
export const FORAGE_STACK = 99;

/** Forage and star-shop unlocks. Published books, animals and places are added by the API. */
export function builtinItems(): ItemDefinition[] {
  return [
    ...forageCatalog.map((item) => ({
      id: item.kind,
      kind: "forage" as const,
      name: item.name,
      stack: FORAGE_STACK,
    })),
    ...unlocks.map((item) => ({
      id: item.id,
      kind: "unlock" as const,
      name: item.name,
      stack: null,
    })),
  ];
}
