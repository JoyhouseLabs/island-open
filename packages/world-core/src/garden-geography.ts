export const gardenPond = { x: 23, z: -10, rx: 9, rz: 7 };
export const gardenGreenhouse = { x: -22, z: -23, w: 18, d: 12 };
export const gardenBeds = [-18, 18].flatMap((x) =>
  [8, 21].map((z) => ({ x, z, w: 19, d: 8 })),
);
export const nurseryFeatures = {
  gate: 30,
  greenhouse: { x: 0, z: -14, w: 30, d: 12 },
  beds: [-30, -18, -6, 6, 18, 30].flatMap((x) => [
    { x, z: 6 },
    { x, z: 14 },
  ]),
  barrel: { x: -36, z: -2 },
} as const;
