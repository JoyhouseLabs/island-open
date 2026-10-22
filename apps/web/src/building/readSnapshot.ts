import {
  worldSchema,
  constructionSchema,
  deviceSchema,
  entityPlacementSchema,
  type WorldSnapshot,
} from "@island/contracts";
/** Read tolerance is separate from strict write schemas. Keep raw data for export. */
export function readSnapshot(raw: WorldSnapshot) {
  const parsed = worldSchema.safeParse(raw);
  if (parsed.success) return { snapshot: parsed.data, supported: true };
  const snapshot = worldSchema.parse({
    ...raw,
    construction: constructionSchema.safeParse(raw.construction).success
      ? raw.construction
      : undefined,
    devices: Array.isArray(raw.devices)
      ? raw.devices.filter((d) => deviceSchema.safeParse(d).success)
      : [],
    entityPlacements: Array.isArray(raw.entityPlacements)
      ? raw.entityPlacements.filter(
          (p) => entityPlacementSchema.safeParse(p).success,
        )
      : [],
  });
  return { snapshot, supported: false };
}
