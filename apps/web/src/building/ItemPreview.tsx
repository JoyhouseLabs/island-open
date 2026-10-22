import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import RendererCleanup from "../RendererCleanup";
import { ItemModel } from "./ItemModel";
import type { GlyphId } from "./itemGlyphs";

export default function ItemPreview({
  kind,
  rotation,
}: {
  kind: GlyphId;
  rotation: number;
}) {
  const size = kind === "bench" ? 4 : kind === "bookshelf" ? 2 : 1.6;
  return (
    <div className="item-preview" aria-label="物件三维预览，拖动可旋转">
      <Canvas
        frameloop="demand"
        dpr={1}
        camera={{ position: [3.6, 2.5, 4.4], fov: 35 }}
        gl={{ antialias: true }}
      >
        <ambientLight intensity={1.7} />
        <directionalLight position={[3, 5, 4]} intensity={2.5} />
        <group
          scale={1.8 / size}
          position={[0, -0.65, 0]}
          rotation={[0, (rotation * Math.PI) / 2, 0]}
        >
          <ItemModel kind={kind} />
        </group>
        <OrbitControls
          enableZoom={false}
          enablePan={false}
          enableDamping={false}
        />
        <RendererCleanup />
      </Canvas>
      <span>真实三维预览 · 拖动旋转</span>
    </div>
  );
}
