import { memo } from "react";
import {
  CHUNK_SIZE,
  wildHeight,
  type ChunkCoord,
  type WildEncounter,
  type WildSpecies,
} from "@island/world-core";
import { Pterosaur, Raptor, Peacock } from "../scenes/DinosaurAnimals";
export const wildlifeNames: Record<WildSpecies, string> = {
  raptor: "迅猛龙",
  pterosaur: "翼龙",
  peacock: "现代孔雀",
  nest: "蛋巢",
};
export const wildlifeNotes: Record<WildSpecies, string> = {
  raptor:
    "这位有羽毛的邻居正在林间巡游。停一停，观察它什么时候抬头、什么时候迈步。",
  pterosaur: "抬头看看盘旋的翼龙。试着沿着它的飞行路线，用手指画一个大圆。",
  peacock:
    "现代孔雀也来到了这座想象中的岛。观察它的羽屏，找一找像眼睛一样的花纹。",
  nest: "你发现了一处蛋巢。留一点距离，数一数巢里的蛋，把这个发现记在手记中。",
};
export const Wildlife = memo(function Wildlife({
  encounter: e,
  seed,
  origin,
  inspect,
}: {
  encounter: WildEncounter;
  seed: number;
  origin: ChunkCoord;
  inspect(e: WildEncounter): void;
}) {
  const habitat = {
    x: e.x,
    z: e.z,
    radius: e.kind === "pterosaur" ? 9 : 1.6,
    phase: e.phase,
    ground: (x: number, z: number) => wildHeight(seed, x, z),
  };
  const props = {
    index: 0,
    habitat,
    interactive: true,
    onInspect: () => inspect(e),
  };
  return (
    <group position={[-origin.x * CHUNK_SIZE, 0, -origin.z * CHUNK_SIZE]}>
      {e.kind === "raptor" ? (
        <Raptor {...props} />
      ) : e.kind === "pterosaur" ? (
        <Pterosaur {...props} />
      ) : e.kind === "peacock" ? (
        <Peacock {...props} />
      ) : (
        <group
          position={[e.x, wildHeight(seed, e.x, e.z), e.z]}
          onClick={(event) => {
            if (event.delta > 5) return;
            event.stopPropagation();
            inspect(e);
          }}
        >
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.25, 0]}>
            <torusGeometry args={[1.6, 0.32, 6, 14]} />
            <meshStandardMaterial color="#9b794d" />
          </mesh>
          {[0, 1, 2].map((i) => (
            <mesh
              key={i}
              position={[
                Math.cos(i * 2.1) * 0.65,
                0.65,
                Math.sin(i * 2.1) * 0.65,
              ]}
              scale={[0.45, 0.65, 0.45]}
            >
              <sphereGeometry args={[1, 10, 8]} />
              <meshStandardMaterial color="#e7ddbb" />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
});
