import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import * as T from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { Emote } from "./Emote";
import { emitGrowth } from "../progress/store";

/**
 * Eye anchors on the GLB fox, in raw model units: the skull flanks at the
 * face band (widest sides, above the snout root, below the ears). Rays cast
 * into the bind-pose head put this band at raw (±10, 60, 50.5); the ridge
 * at y≥64 is the ear base, where the eyes must NOT sit. Each eye then
 * tracks the nearest skinned vertex every frame, so blended bone weights
 * (head + neck) move mesh and eyes as one — parenting to a single bone
 * made them drift onto the ears mid-walk.
 */
const ANCHOR = { x: 10.0, y: 60.0, z: 50.5 };
const EYE = { r: 0.088, glint: 0.03 };
/** Nudge off the surface, raw units: outward, up, forward. */
const PROUD = { x: 0.9, y: 0.6, z: 1.2 };

/** Find the mesh vertex closest to a raw-space target point, staying on
 *  the given side of the model. */
function nearestVertex(mesh: T.SkinnedMesh, side: number) {
  const pos = mesh.geometry.getAttribute("position") as T.BufferAttribute;
  const target = new T.Vector3(side * ANCHOR.x, ANCHOR.y, ANCHOR.z);
  const v = new T.Vector3();
  let best = -1,
    bestD = Infinity;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    if (v.x * side <= 1) continue; // strictly this eye's side
    const d = v.distanceTo(target);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * Cartoon eyes glued to the fox's face through every animation: each frame
 * the anchor vertices are skinned (applyBoneTransform, which honours the
 * blended weights) and the orbs are placed right there, parented to the
 * mesh rather than any single bone.
 */
export function FoxEyes({ model }: { model?: T.Object3D | null }) {
  const [state, setState] = useState<"pending" | "attached" | "nobone">(
    "pending",
  );
  const rig = useRef<{
    mesh: T.SkinnedMesh;
    left: T.Group;
    right: T.Group;
    li: number;
    ri: number;
    bind: T.BufferAttribute;
  } | null>(null);
  const scratch = useRef(new T.Vector3());

  useEffect(() => {
    if (!model) return;
    const mesh = model.getObjectByProperty("type", "SkinnedMesh") as
      | T.SkinnedMesh
      | undefined;
    if (!mesh?.skeleton) {
      setState("nobone");
      return;
    }
    const s = model.scale.x || 1,
      kit = new T.Group();
    const orbMat = new T.MeshStandardMaterial({
      color: "#2d2320",
      roughness: 0.35,
    });
    const glintMat = new T.MeshStandardMaterial({
      color: "#ffffff",
      emissive: "#ffffff",
      emissiveIntensity: 0.55,
    });
    const target = new T.Vector3(ANCHOR.x, ANCHOR.y, ANCHOR.z);
    const bind = mesh.geometry.getAttribute("position") as T.BufferAttribute;
    const make = (side: number) => {
      const eye = new T.Group();
      eye.add(new T.Mesh(new T.SphereGeometry(EYE.r / s, 10, 8), orbMat));
      const glint = new T.Mesh(
        new T.SphereGeometry(EYE.glint / s, 8, 6),
        glintMat,
      );
      glint.position.set((-side * 0.55) / s, 0.7 / s, 1.5 / s);
      eye.add(glint);
      kit.add(eye);
      return { eye, index: nearestVertex(mesh, side) };
    };
    const left = make(-1),
      right = make(1);
    mesh.add(kit);
    rig.current = {
      mesh,
      left: left.eye,
      right: right.eye,
      li: left.index,
      ri: right.index,
      bind,
    };
    setState("attached");
    return () => {
      rig.current = null;
      mesh.remove(kit);
      kit.traverse((o) => {
        if (o instanceof T.Mesh) o.geometry.dispose();
      });
      orbMat.dispose();
      glintMat.dispose();
    };
  }, [model]);

  useFrame(() => {
    const r = rig.current;
    if (!r) return;
    const v = scratch.current;
    // applyBoneTransform skins the vector in place, so seed it with the
    // anchor's bind-pose position first.
    v.fromBufferAttribute(r.bind, r.li);
    r.mesh.applyBoneTransform(r.li, v);
    r.left.position.set(v.x - PROUD.x, v.y + PROUD.y, v.z + PROUD.z);
    v.fromBufferAttribute(r.bind, r.ri);
    r.mesh.applyBoneTransform(r.ri, v);
    r.right.position.set(v.x + PROUD.x, v.y + PROUD.y, v.z + PROUD.z);
  });

  if (!model || state === "attached") return null;
  if (model) {
    // GLB without a skinnable head: pin to the scaled bind-pose face.
    const sc = model.scale.x || 1;
    return (
      <group>
        {[-1, 1].map((side) => (
          <group
            key={side}
            position={[
              side * (ANCHOR.x + PROUD.x) * sc,
              (ANCHOR.y + PROUD.y) * sc,
              (ANCHOR.z + PROUD.z) * sc,
            ]}
          >
            <mesh>
              <sphereGeometry args={[EYE.r, 10, 8]} />
              <meshStandardMaterial color="#2d2320" roughness={0.35} />
            </mesh>
            <mesh position={[side * -0.024, 0.031, 0.066]}>
              <sphereGeometry args={[EYE.glint, 8, 6]} />
              <meshStandardMaterial
                color="#ffffff"
                emissive="#ffffff"
                emissiveIntensity={0.55}
              />
            </mesh>
          </group>
        ))}
      </group>
    );
  }
  // Box fallback fox: eyes on its box head at [0, 1.6, 1.6].
  return (
    <group>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.17, 1.78, 2.02]}>
          <mesh>
            <sphereGeometry args={[0.07, 10, 8]} />
            <meshStandardMaterial color="#2d2320" roughness={0.35} />
          </mesh>
          <mesh position={[s * -0.02, 0.026, 0.05]}>
            <sphereGeometry args={[0.024, 8, 6]} />
            <meshStandardMaterial
              color="#ffffff"
              emissive="#ffffff"
              emissiveIntensity={0.55}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Petting feedback for the GLB foxes: a heart plus a counted deed. */
export function useFoxPet() {
  const emoteAge = useRef(99);
  const [showing, setShowing] = useState(false);
  const pet = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 5) return false;
    e.stopPropagation();
    emoteAge.current = 0;
    setShowing(true);
    emitGrowth({ type: "animal.petted", detail: "小狐狸" });
    return true;
  };
  const emote: ReactNode = showing ? (
    <Emote kind="heart" ageRef={emoteAge} y={2.6} />
  ) : null;
  return { pet, emote, emoteAge };
}
