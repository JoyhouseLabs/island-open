import { useEffect, useMemo, useRef, useState } from "react";

import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as T from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { AnimalConfig } from "@island/contracts";
import { contentAssetBytes } from "../api";
import { specFor } from "../places/specs";
import { playVoice } from "./voices";
import { dropAgent, playerAgent, reportAgent } from "./registry";
import { Emote } from "./Emote";
import { emitGrowth } from "../progress/store";
import { dialogue } from "../dialogue/store";

type GlbModel = { scene: T.Group; mixer: T.AnimationMixer };

/** Loads an admin-uploaded GLB once, normalized to child-eye height. */
export function useGlbModel(assetId: string | undefined) {
  const [state, setState] = useState<{ model: GlbModel | null; failed: boolean }>(
    { model: null, failed: false },
  );
  useEffect(() => {
    if (!assetId) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;
    contentAssetBytes(assetId)
      .then((bytes) => new GLTFLoader().parseAsync(bytes, ""))
      .then((g) => {
        const dispose = () => {
          g.scene.traverse((o) => {
            if (o instanceof T.Mesh) {
              o.geometry.dispose();
              const mats = Array.isArray(o.material) ? o.material : [o.material];
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
        // Fit any uploaded model to roughly resident height.
        const box = new T.Box3().setFromObject(g.scene),
          size = box.getSize(new T.Vector3()),
          scale = 1.6 / (size.y || 1);
        g.scene.scale.setScalar(scale);
        g.scene.position.y = -box.min.y * scale;
        g.scene.traverse((o) => {
          o.castShadow = true;
        });
        const mixer = new T.AnimationMixer(g.scene);
        // Play the first clip if the artist bundled one (idle/walk alike).
        if (g.animations[0]) mixer.clipAction(g.animations[0]).play();
        cleanup = () => {
          mixer.stopAllAction();
          dispose();
        };
        setState({ model: { scene: g.scene, mixer }, failed: false });
      })
      .catch(() => {
        if (!disposed) setState({ model: null, failed: true });
      });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [assetId]);
  return state;
}

/**
 * An admin-configured animal with a custom GLB: a gentle wander around its
 * placement point, registered for talk prompts just like built-in residents;
 * it stands still while being talked to.
 */
export function CustomAnimal({
  id,
  config,
  scene,
}: {
  id: string;
  config: AnimalConfig;
  /** Built-in scene, or "place-<id>" for a published place. */
  scene: "island" | (string & {});
}) {
  const spec = specFor(scene),
    root = useRef<T.Group>(null),
    model = useGlbModel(config.assetId),
    emoteAge = useRef(0);
  const rng = useMemo(
    () => (() => {
      let s = 2166136261;
      for (const c of config.id) {
        s ^= c.charCodeAt(0);
        s = Math.imul(s, 16777619);
      }
      return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
      };
    })(),
    [config.id],
  );
  const st = useRef({
    x: config.placement.x,
    z: config.placement.z,
    y: 0,
    yaw: 0,
    target: null as { x: number; z: number } | null,
    until: 2,
    // A soft call now and then while wandering; taps always sound.
    voiceAt: 6 + rng() * 8,
  });
  useEffect(() => () => dropAgent(id), [id]);
  const pet = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 5) return;
    e.stopPropagation();
    emoteAge.current = 0;
    playVoice("custom", st.current.x, st.current.z);
    emitGrowth({ type: "animal.petted", detail: config.name });
  };
  useFrame(({ clock }, rawDt) => {
    const s = st.current,
      dt = Math.min(rawDt, 0.05);
    emoteAge.current += dt;
    // While talked to, stand still and face the player; wander resumes later.
    const talking = dialogue.talkingWith(id);
    if (talking) s.voiceAt = Math.max(s.voiceAt, clock.elapsedTime + 1.5);
    else if (clock.elapsedTime > s.voiceAt) {
      s.voiceAt = clock.elapsedTime + 8 + rng() * 8;
      playVoice("custom", s.x, s.z);
    }
    if (model.model) model.model.mixer.update(dt);
    s.until -= dt;
    if (talking) {
      s.target = null;
      const p = playerAgent();
      if (p) {
        const want = Math.atan2(p.x - s.x, p.z - s.z);
        let d = want - s.yaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        s.yaw += d * Math.min(1, dt * 6);
      }
    } else if (!s.target && s.until <= 0) {
      const a = rng() * Math.PI * 2,
        r = rng() * config.placement.wander;
      const next = {
        x: config.placement.x + Math.cos(a) * r,
        z: config.placement.z + Math.sin(a) * r,
      };
      if (spec.walkable(next.x, next.z)) s.target = next;
      s.until = 2 + rng() * 5;
    }
    if (s.target) {
      const dx = s.target.x - s.x,
        dz = s.target.z - s.z,
        dist = Math.hypot(dx, dz);
      if (dist < 0.6) {
        s.target = null;
        s.until = 2 + rng() * 6;
      } else {
        const speed = 1.1;
        s.x += (dx / dist) * speed * dt;
        s.z += (dz / dist) * speed * dt;
        s.yaw = Math.atan2(dx, dz);
      }
    }
    const ground = spec.height(s.x, s.z);
    s.y += (ground - s.y) * Math.min(1, dt * 10);
    if (root.current) {
      root.current.position.set(s.x, s.y, s.z);
      root.current.rotation.y = s.yaw;
    }
    reportAgent(id, {
      kind: "custom",
      x: s.x,
      z: s.z,
      name: config.name,
      yaw: s.yaw,
    });
  });
  if (model.failed) return null;
  return (
    <group ref={root} onClick={pet}>
      {model.model && <primitive object={model.model.scene} />}
      <Emote kind="heart" ageRef={emoteAge} y={1.8} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <circleGeometry args={[0.7, 20]} />
        <meshBasicMaterial
          color="#c9b184"
          transparent
          opacity={0.28}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
