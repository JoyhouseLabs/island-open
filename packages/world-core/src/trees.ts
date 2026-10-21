import { random } from "./random.js";

export type Vec3 = [number, number, number];
export interface TreeBranch {
  start: Vec3;
  end: Vec3;
  radius: number;
  tipRadius: number;
  parent: number | null;
}
export interface TreeLeaf {
  stem: Vec3;
  position: Vec3;
  rotation: Vec3;
  size: number;
  tone: number;
  retention: number;
}
export interface TreeShape {
  branches: TreeBranch[];
  leaves: TreeLeaf[];
}
const unit = ([x, y, z]: Vec3): Vec3 => {
  const d = Math.hypot(x, y, z);
  return [x / d, y / d, z / d];
};
const advance = (p: Vec3, v: Vec3, length: number): Vec3 =>
  p.map((n, i) => n + v[i]! * length) as Vec3;

/** Bounded stochastic branching grammar, independent of rendering and season.
 * Each child inherits its parent's direction, then bends toward the light.
 * Golden-angle crown scaffolds avoid identical, mirror-symmetric forks.
 * Dimensions are mature-tree local coordinates; growth never rerolls topology.
 */
export function generateTree(seed: number): TreeShape {
  const rng = random(seed ^ 0x74ee21);
  const branches: TreeBranch[] = [];
  const leaves: TreeLeaf[] = [];
  const height = 6.4 + rng() * 2.1;
  const breadth = 0.85 + rng() * 0.3;
  const phase = rng() * Math.PI * 2;
  const lean: Vec3 = [(rng() - 0.5) * 0.14, 1, (rng() - 0.5) * 0.14];
  let trunk: Vec3 = [0, 0, 0];
  const joints: { point: Vec3; index: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const end = advance(trunk, unit(lean), height / 6);
    const radius = 0.38 * (1 - i * 0.13);
    branches.push({
      start: trunk,
      end,
      radius,
      tipRadius: 0.38 * (1 - (i + 1) * 0.13),
      parent: i ? i - 1 : null,
    });
    joints.push({ point: end, index: branches.length - 1 });
    trunk = end;
    lean[0] += (rng() - 0.5) * 0.06;
    lean[2] += (rng() - 0.5) * 0.06;
  }
  const grow = (
    start: Vec3,
    direction: Vec3,
    length: number,
    radius: number,
    depth: number,
    parent: number,
  ) => {
    let point = start;
    let heading = direction;
    let lastStart = point;
    for (let i = 0; i < 3; i++) {
      lastStart = point;
      heading = unit([
        heading[0] + (rng() - 0.5) * 0.14,
        heading[1] + 0.1,
        heading[2] + (rng() - 0.5) * 0.14,
      ]);
      const end = advance(point, heading, length / 3);
      branches.push({
        start: point,
        end,
        radius: radius * (1 - i * 0.2),
        tipRadius: radius * (1 - (i + 1) * 0.2),
        parent,
      });
      parent = branches.length - 1;
      point = end;
    }
    if (depth > 0) {
      const azimuth = Math.atan2(heading[2], heading[0]);
      for (const side of [-1, 1]) {
        const angle = azimuth + side * (0.5 + rng() * 0.55);
        const outward = 0.62 + rng() * 0.35;
        const next = unit([
          Math.cos(angle) * outward,
          0.35 + heading[1] * 0.45 + rng() * 0.2,
          Math.sin(angle) * outward,
        ]);
        grow(
          point,
          next,
          length * (0.57 + rng() * 0.12),
          radius * 0.4,
          depth - 1,
          parent,
        );
      }
    } else {
      // Several overlapping sprays of individual curved leaves, with gaps
      // between sprays so the branch silhouette remains visible.
      for (let i = 0; i < 22; i++) {
        const a = i * 2.399963 + rng() * 0.7;
        const r = Math.sqrt(rng()) * 1.15;
        const t = rng();
        const center = lastStart.map((n, k) => n + (point[k]! - n) * t) as Vec3;
        leaves.push({
          stem: center,
          position: [
            center[0] + Math.cos(a) * r,
            center[1] + (rng() - 0.4) * 1.1,
            center[2] + Math.sin(a) * r,
          ],
          rotation: [(rng() - 0.5) * 1.1, a, (rng() - 0.5) * 1.3],
          size: 0.7 + rng() * 0.55,
          tone: rng(),
          retention: rng(),
        });
      }
    }
  };
  for (let i = 0; i < 7; i++) {
    const joint = joints[2 + Math.floor((i * 3) / 7)]!;
    const angle = phase + i * 2.399963;
    grow(
      joint.point,
      unit([
        Math.cos(angle) * breadth,
        0.4 + i * 0.09,
        Math.sin(angle) * breadth,
      ]),
      (3.0 - i * 0.13 + rng() * 0.7) * breadth,
      0.14 - i * 0.008,
      2,
      joint.index,
    );
  }
  grow(trunk, unit([lean[0], 1, lean[2]]), 1.9, 0.07, 1, 5);
  return { branches, leaves };
}
