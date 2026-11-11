import { expect, test } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import { trialFraming } from "./trialFraming";

test.each([
  [375, 812],
  [390, 667],
  [1280, 800],
  [768, 600],
])("combatant bounds fit the visible area at %i × %i", (width, height) => {
  const pose = trialFraming(width, height);
  const camera = new PerspectiveCamera(42, width / height, 0.3, 2000);
  camera.position.set(...pose.position);
  camera.lookAt(...pose.target);
  camera.updateMatrixWorld();
  // Includes the ears, feet and the target's halo and head-top turn label, rather than only testing the camera target.
  for (const x of [-1.6, 1.65])
    for (const y of [1.08, 3.7]) {
      const v = new Vector3(x, y, 0).project(camera);
      const px = ((v.x + 1) * width) / 2,
        py = ((1 - v.y) * height) / 2;
      expect(px).toBeGreaterThan(8);
      expect(px).toBeLessThan(width < 700 ? width - 8 : width - 385);
      expect(py).toBeGreaterThan(65);
      expect(py).toBeLessThan(width < 700 ? height * 0.56 - 88 : height - 100);
    }
});
