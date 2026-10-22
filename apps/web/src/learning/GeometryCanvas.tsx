import { OrthographicCamera } from "three";
import {
  Component,
  Suspense,
  useLayoutEffect,
  useMemo,
  type ReactNode,
} from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Line, Edges } from "@react-three/drei";
import { type GeometryWork, solidFacts } from "@island/contracts";
export type Highlight = "none" | "all" | "base" | "sides" | "vertices" | "height";
class VisualBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <p className="learn-error">
        这台设备暂时无法绘制三维模型，仍可阅读下方特征并记录发现。
      </p>
    ) : (
      this.props.children
    );
  }
}
function Solid({
  work,
  progress,
  highlight,
}: {
  work: GeometryWork;
  progress: number;
  highlight: Highlight;
}) {
  const round = work.solid === "cone" || work.solid === "cylinder";
  const n = round ? 64 : work.solid === "triangular-pyramid" ? 3 : 4;
  const radius = round ? work.size : work.size / (2 * Math.sin(Math.PI / n));
  const h = Math.max(0.002, work.height * progress);
  const cylinder = work.solid === "cylinder";
  const vertices = useMemo(
    () =>
      Array.from({ length: round ? 64 : n }, (_, i) => {
        const a = (i / (round ? 64 : n)) * Math.PI * 2;
        return [Math.sin(a) * radius, 0, Math.cos(a) * radius] as [
          number,
          number,
          number,
        ];
      }),
    [n, radius, round],
  );
  const loop = [...vertices, vertices[0]!];
  const sideColor = highlight === "sides" ? "#f2b45e" : "#73aaba";
  return (
    <group>
      <mesh position={[0, h / 2, 0]}>
        <cylinderGeometry args={[cylinder ? radius : 0, radius, h, n, 1]} />
        <meshStandardMaterial
          attach="material-0"
          color={sideColor}
          transparent
          opacity={
            highlight === "base" ||
            highlight === "vertices" ||
            highlight === "height"
              ? 0.25
              : 0.84
          }
          roughness={0.7}
          depthWrite={false}
        />
        <meshStandardMaterial
          attach="material-1"
          color={highlight === "base" ? "#f2b45e" : "#b1c582"}
          transparent
          opacity={0.85}
        />
        <meshStandardMaterial
          attach="material-2"
          color={highlight === "base" ? "#f2b45e" : "#b1c582"}
          transparent
          opacity={0.85}
          side={2}
        />
        {!round && <Edges color="#315a64" />}
      </mesh>
      <Line
        points={loop}
        color={highlight === "base" ? "#bf7e22" : "#426660"}
        lineWidth={2}
      />
      {cylinder && (
        <group position={[0, h, 0]}>
          <Line points={loop} color="#426660" lineWidth={2} />
        </group>
      )}
      {(highlight === "height" || highlight === "all") && (
        <>
          <Line
            points={[
              [0, 0.01, 0],
              [0, h, 0],
            ]}
            dashed
            dashSize={0.1}
            gapSize={0.06}
            color="#a64b62"
            lineWidth={2}
          />
          <Line
            points={[
              [0.15, 0, 0],
              [0.15, 0.15, 0],
              [0, 0.15, 0],
            ]}
            color="#a64b62"
          />
        </>
      )}
      {highlight === "vertices" &&
        !cylinder &&
        [...(round ? [] : vertices), [0, h, 0] as [number, number, number]].map(
          (p, i) => (
            <mesh key={i} position={p}>
              <sphereGeometry args={[0.055, 12, 8]} />
              <meshBasicMaterial color="#c15165" />
            </mesh>
          ),
        )}
    </group>
  );
}
function FitCamera({ comparison }: { comparison: boolean }) {
  const { camera, size, invalidate } = useThree();
  useLayoutEffect(() => {
    if (camera instanceof OrthographicCamera) {
      camera.zoom = Math.min(
        size.height / 5.8,
        size.width / (comparison ? 8 : 5.4),
      );
      camera.updateProjectionMatrix();
      invalidate();
    }
  }, [camera, size.width, size.height, comparison, invalidate]);
  return null;
}
export default function GeometryCanvas({
  work,
  progress,
  highlight,
  target,
  label,
  support,
}: {
  work: GeometryWork;
  progress: number;
  highlight: Highlight;
  target?: Pick<GeometryWork, "solid" | "height" | "size">;
  label?: string;
  support?: GeometryWork["solid"];
}) {
  // A course owns one small scene; leaving the activity unmounts the Canvas.
  return (
    <VisualBoundary>
      <div
        className="geometry-canvas"
        aria-label={label ?? `${solidFacts[work.solid].name}三维模型`}
      >
        <Canvas
          frameloop="demand"
          orthographic
          dpr={[1, 1.5]}
          camera={{ position: [5, 4, 6], zoom: 60 }}
          gl={{ antialias: true }}
        >
          <FitCamera comparison={!!target} />
          <color attach="background" args={["#edf2e9"]} />
          <ambientLight intensity={1.5} />
          <directionalLight position={[4, 8, 5]} intensity={2.4} />
          <Suspense fallback={null}>
            {support && <Solid work={{ ...work, solid: support, height: 1.2, size: 0.65 }} progress={1} highlight="none" />}
            <group position={[0, support ? 1.2 : 0, 0]}><Solid work={work} progress={progress} highlight={highlight} /></group>
            {target && (
              <group position={[3.5, 0, 0]}>
                <Solid
                  work={{ ...work, ...target }}
                  progress={1}
                  highlight="all"
                />
              </group>
            )}
          </Suspense>
          <gridHelper
            args={[12, 12, "#bdcbbb", "#d8e1d3"]}
            position={[0, -0.02, 0]}
          />
          <OrbitControls
            target={target ? [1.7, 1, 0] : [0, 1, 0]}
            minDistance={3}
            maxDistance={14}
            enablePan={false}
            minPolarAngle={0.1}
            maxPolarAngle={Math.PI * 0.85}
          />
        </Canvas>
      </div>
    </VisualBoundary>
  );
}
