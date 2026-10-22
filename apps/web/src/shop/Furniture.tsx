import type {
  FurnitureDefinition,
  FurniturePlacement,
} from "@island/contracts";
import { furnitureCatalog } from "@island/contracts";
import { groundHeight } from "@island/world-core";
import type { ThreeEvent } from "@react-three/fiber";
export type FurnitureEditor = {
  active: boolean;
  preview: FurniturePlacement | null;
  invalid: boolean;
  selectedId: string | null;
  onPoint: (x: number, z: number) => void;
  onSelect: (id: string) => void;
};

export function FurnitureModel({
  item: d,
  ghost = false,
  invalid = false,
}: {
  item: FurnitureDefinition;
  ghost?: boolean;
  invalid?: boolean;
}) {
  const mat = (color: string, glow = false) => (
    <meshStandardMaterial
      color={invalid ? "#d96c67" : color}
      transparent={ghost}
      opacity={ghost ? 0.55 : 1}
      depthWrite={!ghost}
      roughness={0.85}
      emissive={glow ? "#ffdb8d" : "#000000"}
      emissiveIntensity={glow ? 0.8 : 0}
    />
  );
  const box = (
    key: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    depth: number,
    color = d.color,
  ) => (
    <mesh key={key} position={[x, y, z]} castShadow={!ghost} receiveShadow>
      <boxGeometry args={[w, h, depth]} />
      {mat(color)}
    </mesh>
  );
  const leg = (x: number, z: number) =>
    box(`${x}:${z}`, x, d.height / 2, z, 0.18, d.height, 0.18, "#765a43");
  const w = d.width,
    dep = d.depth,
    h = d.height;
  return (
    <group>
      {d.shape === "table" && (
        <>
          {box("top", 0, h - 0.12, 0, w, 0.24, dep)}
          {[-1, 1].flatMap((x) =>
            [-1, 1].map((z) => leg(x * (w / 2 - 0.25), z * (dep / 2 - 0.25))),
          )}
        </>
      )}
      {d.shape === "chair" && (
        <>
          {box("seat", 0, 1, 0, w, 0.25, dep)}
          {box("back", 0, 1.9, -dep / 2 + 0.15, w, 1.4, 0.25)}
          {[-1, 1].flatMap((x) =>
            [-1, 1].map((z) =>
              box(`${x}${z}`, x * 0.6, 0.5, z * 0.6, 0.2, 1, 0.2),
            ),
          )}
        </>
      )}
      {d.shape === "sofa" && (
        <>
          {box("base", 0, 0.6, 0, w, 0.9, dep, "#668577")}
          {box("cushion", 0, 1.12, 0.2, w - 0.6, 0.4, dep - 0.5)}
          {box("back", 0, 1.6, -dep / 2 + 0.2, w, 1.4, 0.45)}
          {[-1, 1].map((x) =>
            box(String(x), x * (w / 2 - 0.2), 1.2, 0, 0.4, 1, dep),
          )}
        </>
      )}
      {d.shape === "stool" && (
        <>
          <mesh position={[0, h - 0.15, 0]} castShadow>
            <cylinderGeometry args={[w / 2, w / 2, 0.3, 20]} />
            {mat(d.color)}
          </mesh>
          {[-1, 1].flatMap((x) =>
            [-1, 1].map((z) =>
              box(`${x}${z}`, x * 0.4, 0.5, z * 0.4, 0.15, 1, 0.15, "#ad875e"),
            ),
          )}
        </>
      )}
      {d.shape === "rug" && (
        <>
          {box("rug", 0, 0.05, 0, w, 0.1, dep)}
          {[-1, 1].map((x) =>
            box(
              String(x),
              x * (w / 2 - 0.22),
              0.11,
              0,
              0.12,
              0.015,
              dep - 0.3,
              "#f6e9cb",
            ),
          )}
        </>
      )}
      {d.shape === "lamp" && (
        <>
          {box("base", 0, 0.12, 0, w, 0.24, dep)}
          {box("stem", 0, 1.4, 0, 0.18, 2.8, 0.18)}
          <mesh position={[0, 2.95, 0]}>
            <sphereGeometry args={[0.42, 12, 8]} />
            {mat("#ffe6af", true)}
          </mesh>
          {box("cap", 0, 3.35, 0, 0.9, 0.1, 0.9)}
        </>
      )}
      {d.shape === "pot" && (
        <>
          <mesh position={[0, 0.45, 0]} castShadow>
            <cylinderGeometry args={[w * 0.35, w * 0.25, 0.9, 10]} />
            {mat("#bd8362")}
          </mesh>
          {box("stem", 0, h * 0.6, 0, 0.1, h * 0.6, 0.1, "#628553")}
          {[-1, 0, 1].map((x, i) => (
            <mesh
              key={x}
              position={[x * 0.3, h - 0.25 - (i % 2) * 0.25, x * 0.13]}
              scale={[1, 0.8, 1]}
              castShadow
            >
              <icosahedronGeometry args={[w * 0.25, 1]} />
              {mat(d.color)}
            </mesh>
          ))}
        </>
      )}
      {d.shape === "fence" && (
        <>
          {[-1, 1].map((y) =>
            box(String(y), 0, 0.9 + y * 0.35, 0, w, 0.18, 0.22),
          )}
          {[-2, -1, 0, 1, 2].map((x) =>
            box(String(x), x * 0.72, h / 2, 0, 0.3, h, 0.3),
          )}
        </>
      )}
      {d.shape === "birdhouse" && (
        <>
          {box("post", 0, 1, 0, 0.2, 2, 0.2, "#87684e")}
          {box("house", 0, 2.35, 0, 1.15, 0.85, 1.1)}
          <mesh
            position={[0, 2.92, 0]}
            rotation={[0, Math.PI / 4, 0]}
            castShadow
          >
            <coneGeometry args={[0.98, 0.5, 4]} />
            {mat("#739281")}
          </mesh>
          <mesh position={[0, 2.4, 0.56]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.19, 0.19, 0.02, 16]} />
            {mat("#57483b")}
          </mesh>
        </>
      )}
    </group>
  );
}
export function FurnitureLayer({
  items = [],
  editor,
}: {
  items?: FurniturePlacement[];
  editor?: FurnitureEditor;
}) {
  const render = (f: FurniturePlacement, ghost = false) => (
    <group
      key={ghost ? "preview" : f.id}
      position={[f.x, groundHeight(f.x, f.z) + 0.05, f.z]}
      rotation={[0, (f.rotation * Math.PI) / 2, 0]}
      onClick={
        ghost || !editor
          ? undefined
          : (e: ThreeEvent<MouseEvent>) => {
              if (e.delta > 5) return;
              e.stopPropagation();
              editor.onSelect(f.id);
            }
      }
    >
      <FurnitureModel
        item={furnitureCatalog.find((d) => d.id === f.itemId)!}
        ghost={ghost}
        invalid={ghost && editor?.invalid}
      />
    </group>
  );
  return (
    <>
      {items.filter((f) => f.id !== editor?.selectedId).map((f) => render(f))}
      {editor?.preview && render(editor.preview, true)}
    </>
  );
}
