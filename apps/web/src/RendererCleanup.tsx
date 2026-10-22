import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Material, Mesh, Texture } from "three";
/**
 * three r186's shared DFG LUT (and cached asset textures) keeps a disposal
 * listener for every renderer that uploaded it. Renderer.dispose alone does
 * not remove these bindings. Release GPU bindings when a canvas unmounts;
 * Texture.dispose preserves source pixels, so cached assets can upload again.
 */
export default function RendererCleanup() {
  const textures = useRef(new Set<Texture>()),
    frames = useRef(0),
    elapsed = useRef(0);
  useFrame(({ gl, scene }, dt) => {
    elapsed.current += dt;
    frames.current++;
    if (frames.current > 3 && elapsed.current < 1) return;
    elapsed.current = 0;
    const collect = (v: unknown) => {
      if (v && typeof v === "object" && "isTexture" in v && v.isTexture)
        textures.current.add(v as Texture);
    };
    scene.traverse((object) => {
      const material = (object as Mesh).material;
      if (!material) return;
      for (const m of (Array.isArray(material)
        ? material
        : [material]) as Material[]) {
        for (const value of Object.values(m)) collect(value);
        const properties = gl.properties.get(m) as {
          uniforms?: Record<string, { value: unknown }>;
        };
        for (const uniform of Object.values(properties.uniforms ?? {}) as {
          value: unknown;
        }[])
          collect(uniform?.value);
      }
    });
  });
  useEffect(
    () => () => {
      for (const texture of textures.current) texture.dispose();
      textures.current.clear();
    },
    [],
  );
  return null;
}
