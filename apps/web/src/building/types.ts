import type { Cell, DeviceInstance, Placement } from "@island/contracts";
import type { GlyphId } from "./itemGlyphs";
export type BuildMode = "build" | "remove" | "device";
export type BuildTarget =
  | { cell: Cell; top: boolean; normal?: Cell }
  | { entityId: string }
  | { deviceId: string };
export type BuildingEditor = {
  mode: BuildMode;
  target: BuildTarget | null;
  select: (target: BuildTarget | null) => void;
  place: (target: BuildTarget) => void;
  reportTarget: (point: { x: number; y: number } | null) => void;
  previewError: string | null;
  device: DeviceInstance["definitionId"];
  held: GlyphId;
  rotation: 0 | 1 | 2 | 3;
  cutaway: boolean;
};
