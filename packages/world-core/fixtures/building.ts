import { type BlockValue } from "@island/contracts";
import { cellKey, packCells } from "../src/building.js";
/** 7×7 floor, three-high walls, two-wide door, glass window and solid roof. */
export function houseFixture() {
  const cells = new Map<string, BlockValue>();
  const put = (
    x: number,
    y: number,
    z: number,
    id: BlockValue["definitionId"],
  ) =>
    cells.set(cellKey({ x: x + 3, y, z: z + 3 }), {
      definitionId: id,
      definitionVersion: 1,
      rotation: 0,
    });
  for (let x = 0; x < 7; x++)
    for (let z = 0; z < 7; z++) {
      put(x, 0, z, "island:wood");
      put(x, 4, z, "island:wood");
      if (x === 0 || x === 6 || z === 0 || z === 6)
        for (let y = 1; y <= 3; y++) {
          if (z === 0 && (x === 2 || x === 3)) continue;
          put(
            x,
            y,
            z,
            x === 6 && z === 3 && y <= 2 ? "island:glass" : "island:stone",
          );
        }
    }
  return packCells(cells);
}
