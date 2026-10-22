import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import type { PointLight } from "three";
import {
  buildingDiagnostics as probe,
  measuringBuilding,
} from "../building/diagnostics";
import type { ThreeEvent } from "@react-three/fiber";
import {
  creationSize,
  type CreationBlueprint,
  type CreationPlacement,
} from "@island/contracts";
import { groundHeight } from "@island/world-core";
export type CreationEditor = {
  active: boolean;
  preview: CreationPlacement | null;
  invalid: boolean;
  selectedId: string | null;
  onPoint: (x: number, z: number) => void;
  onSelect: (id: string) => void;
};
export function CreationModel({
  blueprint,
  selected,
  onSelect,
  ghost = false,
  invalid = false,
}: {
  blueprint: CreationBlueprint;
  selected?: string;
  onSelect?: (id: string) => void;
  ghost?: boolean;
  invalid?: boolean;
}) {
  return (
    <group>
      {blueprint.parts.map((p) => (
        <mesh
          key={p.id}
          name={`creation-part-${p.id}`}
          position={[p.x, p.y, p.z]}
          rotation={[0, (p.rotation * Math.PI) / 2, 0]}
          scale={[p.width, p.height, p.depth]}
          castShadow={!ghost}
          receiveShadow
          raycast={ghost ? () => null : undefined}
          onClick={
            onSelect
              ? (e: ThreeEvent<MouseEvent>) => {
                  if (e.delta > 5) return;
                  e.stopPropagation();
                  onSelect(p.id);
                }
              : undefined
          }
        >
          {p.shape === "box" ? (
            <boxGeometry />
          ) : p.shape === "sphere" ? (
            <sphereGeometry args={[0.5, 20, 12]} />
          ) : (
            <cylinderGeometry args={[0.5, 0.5, 1, 20]} />
          )}
          <meshStandardMaterial
            color={ghost ? (invalid ? "#df7468" : "#68c9b1") : p.color}
            roughness={0.75}
            emissive={
              !ghost && p.light
                ? p.light.color
                : selected === p.id
                  ? "#365c51"
                  : "#000000"
            }
            emissiveIntensity={!ghost && p.light ? 1.5 : 0.5}
            transparent={ghost}
            opacity={ghost ? 0.55 : 1}
            depthWrite={!ghost}
          />
        </mesh>
      ))}
      {!ghost &&
        blueprint.parts
          .filter((p) => p.light)
          .map((p) => (
            <pointLight
              key={`light-${p.id}`}
              name={`creation-light-${p.id}`}
              position={[p.x, p.y, p.z]}
              color={p.light!.color}
              intensity={p.light!.intensity}
              distance={p.light!.distance}
              decay={2}
              castShadow={false}
            />
          ))}
      {!!selected &&
        blueprint.parts
          .filter((p) => p.seat)
          .map((p) => (
            <group
              key={`seat-${p.id}`}
              position={[p.x, p.y + p.height / 2 + 0.02, p.z]}
              rotation={[0, (p.rotation * Math.PI) / 2, 0]}
            >
              <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
                <ringGeometry args={[0.32, 0.38, 24]} />
                <meshBasicMaterial color="#497eae" />
              </mesh>
              <mesh
                position={[0, 0.02, 0.55]}
                rotation={[Math.PI / 2, 0, 0]}
                raycast={() => null}
              >
                <coneGeometry args={[0.12, 0.3, 3]} />
                <meshBasicMaterial color="#497eae" />
              </mesh>
            </group>
          ))}
    </group>
  );
}
export function CreationLayer({
  items = [],
  editor,
}: {
  items?: CreationPlacement[];
  editor?: CreationEditor;
}) {
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    if (!measuringBuilding) return;
    probe.creationLights = () => {
      const lights: { name: string; intensity: number; distance: number }[] =
        [];
      scene.traverse((o) => {
        if (o.name.startsWith("creation-light-")) {
          const l = o as PointLight;
          lights.push({
            name: l.name,
            intensity: l.intensity,
            distance: l.distance,
          });
        }
      });
      return lights;
    };
    return () => {
      probe.creationLights = null;
    };
  }, [scene]);
  const render = (f: CreationPlacement, ghost = false) => (
    <group
      key={ghost ? "preview" : f.id}
      position={[f.x, groundHeight(f.x, f.z) + 0.05, f.z]}
      rotation={[0, (f.rotation * Math.PI) / 2, 0]}
      onClick={
        !ghost && editor
          ? (e) => {
              if (e.delta > 5) return;
              e.stopPropagation();
              if (editor.active) editor.onPoint(e.point.x, e.point.z);
              else editor.onSelect(f.id);
            }
          : undefined
      }
    >
      <CreationModel
        blueprint={f.blueprint}
        ghost={ghost}
        invalid={ghost && editor?.invalid}
      />
    </group>
  );
  const preview = editor?.preview,
    size = preview ? creationSize(preview) : null;
  return (
    <>
      {items.filter((f) => f.id !== editor?.selectedId).map((f) => render(f))}
      {preview && render(preview, true)}
      {preview && size && (
        <mesh
          position={[
            preview.x,
            groundHeight(preview.x, preview.z) + 0.06,
            preview.z,
          ]}
          rotation={[-Math.PI / 2, 0, 0]}
          raycast={() => null}
        >
          <planeGeometry args={[size.x * 2, size.z * 2]} />
          <meshBasicMaterial
            color={editor?.invalid ? "#ef7867" : "#6cc6ac"}
            transparent
            opacity={0.22}
            depthWrite={false}
          />
        </mesh>
      )}
    </>
  );
}
