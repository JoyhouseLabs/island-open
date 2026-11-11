import { starlightTrialStage } from "@island/world-core";
/** Leave room for the desktop side panel or the portrait decision sheet. */
export function trialFraming(width: number, height: number) {
  const narrow = width < 700;
  const x = starlightTrialStage.x + (narrow ? 0 : 1.8);
  return {
    position: [
      x,
      narrow ? 5.4 : 4.6,
      starlightTrialStage.z +
        (narrow ? Math.max(11.8, (height / Math.max(1, width)) * 6.2) : 8.7),
    ] as [number, number, number],
    target: [x, narrow ? -0.05 : 1.2, starlightTrialStage.z] as [
      number,
      number,
      number,
    ],
  };
}
