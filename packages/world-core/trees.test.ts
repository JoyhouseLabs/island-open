import { expect, test } from "vitest";
import { generateTree } from "./src/trees";

test("branching is seeded, bounded and connected to progressively thinner parents", () => {
  for (let seed = 0; seed < 30; seed++) {
    const tree = generateTree(seed);
    expect(tree).toEqual(generateTree(seed));
    expect(tree.branches.length).toBeLessThan(170);
    expect(tree.leaves.length).toBeLessThan(700);
    tree.branches.forEach((branch, index) => {
      expect(branch.radius).toBeGreaterThan(branch.tipRadius);
      expect(branch.tipRadius).toBeGreaterThan(0);
      if (branch.parent !== null) {
        expect(branch.parent).toBeLessThan(index);
        const parent = tree.branches[branch.parent]!;
        expect(branch.start).toEqual(parent.end);
        expect(branch.radius).toBeLessThanOrEqual(parent.tipRadius + 1e-9);
      }
      expect([...branch.start, ...branch.end].every(Number.isFinite)).toBe(
        true,
      );
    });
    for (const leaf of tree.leaves) {
      expect(Math.hypot(leaf.position[0], leaf.position[2])).toBeLessThan(9);
      expect(leaf.position[1]).toBeGreaterThan(0);
    }
  }
  expect(generateTree(1)).not.toEqual(generateTree(2));
});
