import type { Cell, DeviceInstance, Placement } from "@island/contracts";
import type { GlyphId } from "./itemGlyphs";
export type BuildMode = "build" | "remove" | "device";
export type BuildTarget =
  { cell: Cell; top: boolean } | { entityId: string } | { deviceId: string };
export type BuildingEditor = {
  mode: BuildMode;
  target: BuildTarget | null;
  select: (target: BuildTarget) => void;
  place: (target: BuildTarget) => void;
  previewError: string | null;
  device: DeviceInstance["definitionId"];
  held: GlyphId;
  rotation: 0 | 1 | 2 | 3;
  cutaway: boolean;
};
