import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3, type Group } from "three";

/** Plain-text overlays owned by this canvas, without nested React DOM roots. */
export default function PresenceLabel({
  name,
  phrase,
  stamp,
  self = false,
  position = [0, 0, 0],
  maxDistance = Infinity,
}: {
  name?: string;
  phrase?: string;
  stamp?: number;
  self?: boolean;
  position?: [number, number, number];
  maxDistance?: number;
}) {
  const gl = useThree((s) => s.gl);
  const anchor = useRef<Group>(null);
  const element = useRef<HTMLDivElement | null>(null);
  const point = useMemo(() => new Vector3(), []);
  useEffect(() => {
    const node = document.createElement("div");
    node.className = "presence-label";
    Object.assign(node.style, {
      position: "absolute",
      top: "0",
      left: "0",
      width: "max-content",
      pointerEvents: "none",
      zIndex: "20",
      display: "none",
    });
    gl.domElement.parentElement?.appendChild(node);
    element.current = node;
    return () => {
      element.current = null;
      // remove() is safe even when the canvas parent has already detached.
      node.remove();
    };
  }, [gl]);
  useEffect(() => {
    const node = element.current;
    if (!node) return;
    node.replaceChildren();
    const append = (text: string, className: string) => {
      const child = document.createElement("div");
      child.className = className;
      child.textContent = text;
      node.appendChild(child);
    };
    if (name) append(name, "name-tag");
    if (phrase) append(phrase, self ? "bubble-chip self" : "bubble-chip");
    // A repeated phrase starts its animation again when its timestamp changes.
  }, [gl, name, phrase, self, stamp]);
  useFrame(({ camera, size }) => {
    const node = element.current;
    if (!node || !anchor.current) return;
    camera.updateMatrixWorld();
    anchor.current.getWorldPosition(point);
    const nearby = point.distanceTo(camera.position) <= maxDistance;
    point.project(camera);
    const visible = nearby && point.z >= -1 && point.z <= 1;
    node.style.display = visible ? "block" : "none";
    if (visible)
      node.style.transform = `translate3d(${((point.x + 1) * size.width) / 2}px,${((1 - point.y) * size.height) / 2}px,0) translate(-50%,-50%)`;
  });
  return <group ref={anchor} position={position} />;
}
