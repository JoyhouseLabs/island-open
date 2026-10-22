/** Local development measurements; production builds never populate this probe. */
export const buildingDiagnostics = {
  player: null as { x: number; y: number; z: number } | null,
  frameMs: [] as number[],
  memory: { geometries: 0, textures: 0, programs: 0, calls: 0, triangles: 0 },
  project: null as
    null | ((x: number, y: number, z: number) => { x: number; y: number }),
};
export const measuringBuilding =
  import.meta.env.DEV &&
  new URLSearchParams(location.search).has("buildingCheck");
