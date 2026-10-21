import { useEffect, useState } from "react";
import * as T from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { assetBytes } from "../api";

export type FoxModel = {
  scene: T.Group;
  mixer: T.AnimationMixer;
  walk: T.AnimationAction | null;
  run: T.AnimationAction | null;
  survey: T.AnimationAction | null;
};

/** Loads the fox GLB once per scene mount; walk plays immediately. */
export function useFoxModel() {
  const [state, setState] = useState<{
    model: FoxModel | null;
    failed: boolean;
  }>({ model: null, failed: false });
  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    assetBytes("fox")
      .then((bytes) => new GLTFLoader().parseAsync(bytes, ""))
      .then((g) => {
        const dispose = () => {
          g.scene.traverse((o) => {
            if (o instanceof T.Mesh) {
              o.geometry.dispose();
              const mats = Array.isArray(o.material)
                ? o.material
                : [o.material];
              for (const m of mats) {
                for (const value of Object.values(m))
                  if (value instanceof T.Texture) value.dispose();
                m.dispose();
              }
            }
          });
        };
        if (disposed) {
          dispose();
          return;
        }
        const box = new T.Box3().setFromObject(g.scene),
          size = box.getSize(new T.Vector3());
        g.scene.scale.setScalar(3.5 / size.y);
        g.scene.position.y = (-box.min.y * 3.5) / size.y;
        g.scene.traverse((o) => {
          o.castShadow = true;
        });
        const mixer = new T.AnimationMixer(g.scene),
          find = (pattern: RegExp) => {
            const clip = g.animations.find((a) => pattern.test(a.name));
            return clip ? mixer.clipAction(clip) : null;
          };
        const walk = find(/walk/i) ?? find(/survey/i);
        walk?.play();
        const model: FoxModel = {
          scene: g.scene,
          mixer,
          walk,
          run: find(/run/i),
          survey: find(/survey/i),
        };
        cleanup = () => {
          mixer.stopAllAction();
          dispose();
        };
        setState({ model, failed: false });
      })
      .catch(() => {
        if (!disposed) setState((s) => ({ ...s, failed: true }));
      });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);
  return state;
}
