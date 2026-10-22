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
            emissive={selected === p.id ? "#365c51" : "#000000"}
            emissiveIntensity={0.5}
            transparent={ghost}
            opacity={ghost ? 0.55 : 1}
            depthWrite={!ghost}
          />
        </mesh>
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
