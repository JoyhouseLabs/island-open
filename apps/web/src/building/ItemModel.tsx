import type { GlyphId } from "./itemGlyphs";
import { blockMap } from "./blockTextures";
import { Plants } from "../Plants";

/** Shared by the inspection view, placement ghost and saved scene objects. */
export function ItemModel({
  kind,
  ghost = false,
  occupied = false,
}: {
  kind: GlyphId;
  ghost?: boolean;
  occupied?: boolean;
}) {
  const part = (
    key: string,
    position: [number, number, number],
    size: [number, number, number],
    color: string,
    glass = false,
  ) => (
    <mesh key={key} position={position} castShadow={!ghost} receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={color}
        roughness={glass ? 0.15 : 0.75}
        transparent={ghost || glass}
        opacity={glass ? 0.28 : ghost ? 0.55 : 1}
        depthWrite={!glass && !ghost}
      />
    </mesh>
  );
  if (kind === "stone" || kind === "wood" || kind === "glass")
    return (
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          map={blockMap(kind)}
          transparent={ghost || kind === "glass"}
          opacity={kind === "glass" ? 0.55 : ghost ? 0.55 : 1}
          depthWrite={!ghost && kind !== "glass"}
        />
      </mesh>
    );
  if (kind === "bench" || kind === "flower")
    return (
      <Plants
        entities={[
          { id: "preview-furniture", kind, x: 0, z: 0, seed: 123, growth: 1 },
        ]}
        season="spring"
        low
        height={() => 0}
        wind={0}
      />
    );
  if (kind === "bookshelf")
    return (
      <group>
        {part("back", [0, 1, -0.45], [2, 2, 0.1], "#88623f")}
        {[-0.94, 0.94].map((x) =>
          part(`side${x}`, [x, 1, 0], [0.12, 2, 1], "#b78e58"),
        )}
        {[0.06, 1, 1.94].map((y) =>
          part(`shelf${y}`, [0, y, 0], [2, 0.12, 1], "#c7a572"),
        )}
        {[0.12, 1.06].flatMap((y, row) =>
          Array.from({ length: 6 }, (_, i) => {
            const h = 0.6 + (i % 3) * 0.08;
            return part(
              `book${row}-${i}`,
              [-0.73 + i * 0.29, y + h / 2, 0.08],
              [0.22, h, 0.65],
              ["#b87565", "#789a98", "#c5a15c", "#9985a8"][i % 4]!,
            );
          }),
        )}
      </group>
    );
  if (kind === "sign")
    return (
      <group>
        {part("base", [0, 0.05, 0], [0.55, 0.1, 0.45], "#88623f")}
        {part("post", [0, 0.65, 0], [0.12, 1.3, 0.12], "#a97d4c")}
        {part("board", [0, 1.28, 0], [1, 0.64, 0.2], "#a97d4c")}
        {part("face", [0, 1.28, 0.108], [0.84, 0.48, 0.025], "#f1dfb8")}
        {[1.18, 1.3, 1.42].map((y, i) =>
          part(
            `line${i}`,
            [-0.06, y, 0.126],
            [i === 0 ? 0.4 : 0.6, 0.025, 0.012],
            "#8b7453",
          ),
        )}
      </group>
    );
  if (kind === "nameplate")
    return (
      <group>
        {part("base", [0, 0.04, 0], [0.8, 0.08, 0.5], "#94724a")}
        {[-0.33, 0.33].map((x) =>
          part(`post${x}`, [x, 0.6, 0], [0.08, 1.2, 0.08], "#b28d58"),
        )}
        {part("crossbar", [0, 1.16, 0], [0.8, 0.08, 0.1], "#b28d58")}
        {[-0.22, 0.22].map((x) =>
          part(`chain${x}`, [x, 0.98, 0], [0.025, 0.3, 0.025], "#c9a15c"),
        )}
        {part("plaque", [0, 0.73, 0], [0.66, 0.4, 0.12], "#a47c4f")}
        {part("name", [0, 0.73, 0.07], [0.55, 0.28, 0.025], "#f3e6c8")}
        {part("line", [0, 0.73, 0.09], [0.36, 0.025, 0.01], "#8b7453")}
      </group>
    );
  if (kind === "display")
    return (
      <group>
        {part("plinth", [0, 0.16, 0], [1.5, 0.32, 1.5], "#a78252")}
        {part("top", [0, 1.46, 0], [1.5, 0.08, 1.5], "#c7af7d")}
        {[-0.7, 0.7].flatMap((x) =>
          [-0.7, 0.7].map((z) =>
            part(`frame${x}-${z}`, [x, 0.9, z], [0.06, 1.15, 0.06], "#82998b"),
          ),
        )}
        {[-0.7, 0.7].map((x) =>
          part(`glassX${x}`, [x, 0.88, 0], [0.02, 1.08, 1.35], "#c3e6e5", true),
        )}
        {[-0.7, 0.7].map((z) =>
          part(`glassZ${z}`, [0, 0.88, z], [1.35, 1.08, 0.02], "#c3e6e5", true),
        )}
        {occupied && (
          <mesh position={[0, 0.7, 0]}>
            <octahedronGeometry args={[0.28]} />
            <meshStandardMaterial color="#d9af62" />
          </mesh>
        )}
      </group>
    );
  return null;
}
