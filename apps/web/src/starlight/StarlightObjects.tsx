import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as T from "three";
import type { PlayStructure } from "@island/contracts";
import { playResourceNodes, resourceStage } from "@island/world-core";
import type { PlaySceneBindings } from "./StarlightPlay";
const colors = {
  gold: "#ffe395",
  mint: "#9be6c4",
  violet: "#c3a6f2",
  star: "#ddeaff",
};
export function PlayModel({
  item,
  ghost = false,
  invalid = false,
  low = false,
}: {
  item: PlayStructure;
  ghost?: boolean;
  invalid?: boolean;
  low?: boolean;
}) {
  const color = invalid ? "#e3938f" : colors[item.placement?.color ?? "gold"];
  const mat = {
    color: ghost ? color : "#77624f",
    transparent: ghost,
    opacity: ghost ? 0.5 : 1,
  };
  if (item.blueprint === "lantern")
    return (
      <group>
        <mesh position={[0, 0.12, 0]} castShadow>
          <cylinderGeometry args={[0.32, 0.36, 0.24, 8]} />
          <meshStandardMaterial {...mat} />
        </mesh>
        <mesh position={[0, 0.85, 0]} castShadow>
          <cylinderGeometry args={[0.06, 0.08, 1.4, 8]} />
          <meshStandardMaterial {...mat} />
        </mesh>
        <mesh position={[0, 1.72, 0]}>
          <icosahedronGeometry args={[0.38, 0]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={ghost ? 0.2 : 1.5}
            transparent={ghost}
            opacity={ghost ? 0.5 : 1}
          />
        </mesh>
        <mesh position={[0, 2.08, 0]}>
          <coneGeometry args={[0.45, 0.22, 6]} />
          <meshStandardMaterial {...mat} />
        </mesh>
        {!ghost && (
          <>
            <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[1.7, 32]} />
              <meshBasicMaterial
                color={color}
                transparent
                opacity={0.12}
                depthWrite={false}
              />
            </mesh>
            {!low && (
              <pointLight
                position={[0, 1.7, 0]}
                color={color}
                intensity={2}
                distance={5}
                decay={2}
              />
            )}
          </>
        )}
        {item.placement?.color === "star" && (
          <mesh position={[0, 2.35, 0]}>
            <octahedronGeometry args={[0.13]} />
            <meshBasicMaterial color="#f6f1d7" />
          </mesh>
        )}
      </group>
    );
  if (item.blueprint === "basket")
    return (
      <group>
        <mesh position={[0, 0.3, 0]} castShadow>
          <cylinderGeometry args={[0.5, 0.4, 0.55, 10, 1, true]} />
          <meshStandardMaterial {...mat} side={T.DoubleSide} />
        </mesh>
        <mesh position={[0, 0.05, 0]}>
          <cylinderGeometry args={[0.4, 0.4, 0.08, 10]} />
          <meshStandardMaterial {...mat} />
        </mesh>
        {[0.12, 0.27, 0.43, 0.58].map((y) => (
          <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.4 + y * 0.16, 0.035, 5, 16]} />
            <meshStandardMaterial
              color={color}
              transparent={ghost}
              opacity={ghost ? 0.5 : 1}
            />
          </mesh>
        ))}
        <mesh position={[0, 0.59, 0]}>
          <torusGeometry args={[0.38, 0.045, 6, 16, Math.PI]} />
          <meshStandardMaterial {...mat} />
        </mesh>
      </group>
    );
  return (
    <group>
      <mesh
        position={[0, 0.045, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[1, 0.78, 1]}
      >
        <circleGeometry args={[0.9, 24]} />
        <meshStandardMaterial
          color={color}
          transparent={ghost}
          opacity={ghost ? 0.45 : 1}
        />
      </mesh>
      <mesh
        position={[0, 0.065, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[1, 0.78, 1]}
      >
        <ringGeometry args={[0.66, 0.72, 24]} />
        <meshStandardMaterial
          color="#586b80"
          transparent={ghost}
          opacity={ghost ? 0.45 : 1}
        />
      </mesh>
    </group>
  );
}
function Resource({
  node,
  play,
}: {
  node: (typeof playResourceNodes)[number];
  play: PlaySceneBindings;
}) {
  const fruit = node.material === "moonfruit",
    branch = node.material === "branch";
  const stage = resourceStage(play.state, node.id, play.now);
  const harvested = play.state.harvested[node.id];
  const glow = useRef<T.Group>(null),
    burst = useRef(-10),
    seen = useRef(harvested);
  const reduced = useMemo(
    () => window.matchMedia("(prefers-reduced-motion: reduce)"),
    [],
  );
  useEffect(() => {
    if (seen.current !== harvested) burst.current = 0;
    seen.current = harvested;
  }, [harvested]);
  useFrame((_, dt) => {
    burst.current += dt;
    if (glow.current) {
      glow.current.visible = !reduced.matches && burst.current < 0.85;
      glow.current.position.y = 0.7 + burst.current * 1.5;
      glow.current.scale.setScalar(Math.max(0.01, 1 - burst.current));
    }
  });
  const mature = stage.remaining === 0;
  return (
    <group
      position={[node.x, 0, node.z]}
      onClick={(e) => {
        if (e.delta > 5) return;
        e.stopPropagation();
        if (play.preview) play.onGround(e.point.x, e.point.z);
        else if (play.enabled) play.onNode(node.id);
      }}
    >
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]}>
        <ringGeometry args={[0.7, 0.78, 24]} />
        <meshBasicMaterial
          color={
            play.selectedNode === node.id
              ? "#ffe8a2"
              : mature
                ? "#d6dfab"
                : "#718985"
          }
        />
      </mesh>
      {fruit ? (
        <group
          scale={
            mature
              ? 1
              : stage.label === "刚采过"
                ? 0.45
                : stage.label === "幼苗"
                  ? 0.6
                  : 0.8
          }
        >
          <mesh position={[0, 0.4, 0]}>
            <dodecahedronGeometry args={[0.6, 0]} />
            <meshStandardMaterial color="#4b8275" />
          </mesh>
          {mature &&
            [-1, 0, 1].map((x, i) => (
              <mesh key={x} position={[x * 0.33, 0.7 + i * 0.06, 0.25]}>
                <sphereGeometry args={[0.16, 10, 8]} />
                <meshStandardMaterial
                  color="#e5d995"
                  emissive="#dec87d"
                  emissiveIntensity={0.65}
                />
              </mesh>
            ))}
        </group>
      ) : mature ? (
        <group>
          {[-1, 0, 1].map((x, i) => (
            <mesh
              key={x}
              position={[x * 0.25, 0.12 + i * 0.035, 0]}
              rotation={branch ? [0, i * 0.6, 1.45] : [0, i, 0.3]}
              scale={branch ? 1 : [1, 0.65, 0.8]}
            >
              {branch ? (
                <cylinderGeometry args={[0.055, 0.07, 0.85, 6]} />
              ) : (
                <dodecahedronGeometry args={[0.23, 0]} />
              )}
              <meshStandardMaterial color={branch ? "#a08b70" : "#8cabb8"} />
            </mesh>
          ))}
        </group>
      ) : (
        <mesh position={[0, 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.38, 16]} />
          <meshBasicMaterial color="#526b63" />
        </mesh>
      )}
      <group ref={glow} visible={false}>
        {[-1, 0, 1].map((i) => (
          <mesh key={i} position={[i * 0.25, Math.abs(i) * 0.1, 0]}>
            <octahedronGeometry args={[0.13]} />
            <meshBasicMaterial color="#ffe4a1" />
          </mesh>
        ))}
      </group>
    </group>
  );
}
export default function StarlightObjects({
  play,
  low,
}: {
  play: PlaySceneBindings;
  low: boolean;
}) {
  let lamps = 0;
  return (
    <group>
      {playResourceNodes.map((n) => (
        <Resource key={n.id} node={n} play={play} />
      ))}
      {play.state.structures
        .filter((s) => s.placement)
        .map((item) => (
          <group
            key={item.id}
            position={[item.placement!.x, 0, item.placement!.z]}
            rotation={[0, (item.placement!.rotation * Math.PI) / 2, 0]}
            onClick={(e) => {
              if (e.delta > 5) return;
              e.stopPropagation();
              if (play.preview) play.onGround(e.point.x, e.point.z);
              else if (play.enabled) play.onItem(item.id);
            }}
          >
            <PlayModel
              item={item}
              low={low || (item.blueprint === "lantern" && ++lamps > 3)}
            />
          </group>
        ))}
      {play.preview && (
        <group
          position={[play.preview.placement.x, 0, play.preview.placement.z]}
          rotation={[0, (play.preview.placement.rotation * Math.PI) / 2, 0]}
        >
          <PlayModel
            item={{ ...play.preview.item, placement: play.preview.placement }}
            ghost
            invalid={!!play.preview.error}
          />
        </group>
      )}
    </group>
  );
}
