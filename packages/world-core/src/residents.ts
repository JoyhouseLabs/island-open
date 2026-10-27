import type { SubSceneId } from "@island/contracts";
// Species and Interest live in the contracts species registry now; they are
// re-exported so existing "@island/world-core" imports keep working.
import type { Interest, Species } from "@island/contracts";

export type { Interest, Species };

export type Resident = {
  species: Species;
  name: string;
  home: { x: number; z: number; r: number };
  prefer: Interest;
  /** Set when the resident only moves in after a growth unlock. */
  unlockId?: string;
};

/** Who lives where. Homes must sit on walkable ground (see walk.test.ts). */
export const residents: Partial<
  Record<"island" | SubSceneId, Resident[]>
> = {
  island: [
    { species: "panda", name: "团团", home: { x: -58, z: -14, r: 13 }, prefer: "flower" },
    { species: "giraffe", name: "高高", home: { x: 26, z: 60, r: 15 }, prefer: "tree" },
    { species: "wolf", name: "风哨", home: { x: 8, z: -60, r: 12 }, prefer: "grass", unlockId: "resident-wolf" },
    { species: "vaporeon", name: "水伊布", home: { x: 36, z: 0, r: 9 }, prefer: "water" },
  ],
  mountain: [
    { species: "wolf", name: "风哨", home: { x: 12, z: -16, r: 8 }, prefer: "grass", unlockId: "resident-wolf" },
  ],
  forest: [
    { species: "panda", name: "团团", home: { x: -2, z: -6, r: 15 }, prefer: "flower" },
  ],
  meadow: [
    { species: "giraffe", name: "高高", home: { x: 2, z: 6, r: 18 }, prefer: "tree" },
  ],
  pond: [
    { species: "giraffe", name: "高高", home: { x: -24, z: 16, r: 10 }, prefer: "water" },
    { species: "vaporeon", name: "水伊布", home: { x: -26, z: 8, r: 9 }, prefer: "water" },
  ],
  home: [
    { species: "panda", name: "团团", home: { x: 6, z: 8, r: 7 }, prefer: "bench" },
  ],
};
