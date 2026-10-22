import { memo, useEffect, useMemo, useRef } from "react";
import * as T from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { buildingDiagnostics as probe, measuringBuilding } from "./diagnostics";
import type { ThreeEvent } from "@react-three/fiber";
import type { DeviceScreenPoint } from "./DeviceLabels";
import {
  deviceDefinitions,
  type WorldSnapshot,
  type BlockValue,
} from "@island/contracts";
import {
  readCells,
  cellKey,
  parseCell,
  cellMin,
  hitCell,
  chunkCell,
  entityBox,
} from "@island/world-core";
import type { BuildingEditor, BuildTarget } from "./types";
import { glyphForDevice } from "./itemGlyphs";
import { blockMap } from "./blockTextures";
import { ItemModel } from "./ItemModel";
// Touch selects a stable target; the on-screen action commits it. Mouse clicks
// commit directly, but camera drags and the second click of a double-click do not.
function usePlacementPick(editor?: BuildingEditor) {
  return (target: BuildTarget, e: ThreeEvent<MouseEvent>) => {
    if (!editor) return;
    editor.select(target);
    const native = e.nativeEvent as PointerEvent;
    if (
      native.pointerType !== "touch" &&
      native.detail <= 1 &&
      editor.mode !== "remove"
    )
      editor.place(target);
  };
}
const faceData = [
  {
    n: [1, 0, 0],
    v: [
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
      [1, 0, 1],
    ],
  },
  {
    n: [-1, 0, 0],
    v: [
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
      [0, 0, 0],
    ],
  },
  {
    n: [0, 1, 0],
    v: [
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
      [0, 1, 0],
    ],
  },
  {
    n: [0, -1, 0],
    v: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
  },
  {
    n: [0, 0, 1],
    v: [
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
      [0, 0, 1],
    ],
  },
  {
    n: [0, 0, -1],
    v: [
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
      [1, 0, 0],
    ],
  },
];
function geometries(
  entries: [string, BlockValue][],
  all: Map<string, BlockValue>,
) {
  const groups = new Map<
    string,
    { pos: number[]; uv: number[]; color: number[] }
  >();
  const corner: [number, number][] = [
    [0, 0],
    [0, 1],
    [1, 1],
    [1, 0],
  ];
  for (const [k, v] of entries) {
    const c = parseCell(k),
      min = cellMin(c);
    for (const f of faceData) {
      const [dx, dy, dz] = f.n,
        neighbor = all.get(
          cellKey({ x: c.x + dx!, y: c.y + dy!, z: c.z + dz! }),
        );
      if (
        neighbor &&
        neighbor.definitionId !== "island:glass" &&
        v.definitionId !== "island:glass"
      )
        continue;
      if (
        neighbor?.definitionId === v.definitionId &&
        v.definitionId === "island:glass"
      )
        continue;
      const key = `${v.definitionId}:${c.y >= 4 ? "high" : "low"}`;
      let data = groups.get(key);
      if (!data) {
        data = { pos: [], uv: [], color: [] };
        groups.set(key, data);
      }
      for (const index of [0, 1, 2, 0, 2, 3]) {
        const p = f.v[index]!;
        const t = corner[index]!;
        data.pos.push(min.x + p[0]!, min.y + p[1]!, min.z + p[2]!);
        data.uv.push(t[0], t[1]);
        // Subtle face contrast keeps volumes legible in the island's soft light.
        const shade =
          f.n[1] === 1 ? 1 : f.n[1] === -1 ? 0.65 : f.n[0] ? 0.86 : 0.94;
        data.color.push(shade, shade, shade);
      }
    }
  }
  return [...groups].map(([key, data]) => {
    const geometry = new T.BufferGeometry();
    geometry.setAttribute(
      "position",
      new T.Float32BufferAttribute(data.pos, 3),
    );
    geometry.setAttribute("uv", new T.Float32BufferAttribute(data.uv, 2));
    geometry.setAttribute("color", new T.Float32BufferAttribute(data.color, 3));
    geometry.computeVertexNormals();
    return { key, geometry };
  });
}
const Chunk = memo(
  function Chunk({
    entries,
    all,
    signature,
    editor,
  }: {
    entries: [string, BlockValue][];
    all: Map<string, BlockValue>;
    signature: string;
    editor?: BuildingEditor;
  }) {
    const meshes = useMemo(() => geometries(entries, all), [signature]);
    useEffect(
      () => () => meshes.forEach((m) => m.geometry.dispose()),
      [meshes],
    );
    const select = usePlacementPick(editor);
    const pick = (e: ThreeEvent<MouseEvent | PointerEvent>, hover = false) => {
      if (!editor || (!hover && e.delta > 5) || !e.face) return;
      if (hover && (e.nativeEvent as PointerEvent).pointerType === "touch")
        return;
      if (hover && (e.nativeEvent.buttons || editor.mode === "remove")) return;
      e.stopPropagation();
      const target: BuildTarget = {
        cell: hitCell(
          e.point,
          { x: e.face.normal.x, y: e.face.normal.y, z: e.face.normal.z },
          editor.mode === "build",
        ),
        top: e.face.normal.y > 0.5,
        normal: { x: e.face.normal.x, y: e.face.normal.y, z: e.face.normal.z },
      };
      if (hover) editor.select(target);
      else select(target, e as ThreeEvent<MouseEvent>);
    };
    return (
      <>
        {meshes.map(({ key, geometry }) => {
          const glass = key.includes("glass"),
            fade = (editor?.cutaway ?? false) && key.endsWith("high");
          return (
            <mesh
              key={key}
              geometry={geometry}
              name={`building:${key}`}
              onClick={(e) => pick(e)}
              onPointerMove={(e) => pick(e, true)}
              castShadow
              receiveShadow
            >
              <meshStandardMaterial
                map={blockMap(
                  glass ? "glass" : key.includes("wood") ? "wood" : "stone",
                )}
                vertexColors
                roughness={glass ? 0.18 : 0.85}
                transparent={glass || !!fade}
                opacity={fade ? 0.14 : glass ? 0.55 : 1}
                depthWrite={!glass && !fade}
              />
            </mesh>
          );
        })}
      </>
    );
  },
  (a, b) => a.signature === b.signature && a.editor === b.editor,
);
export default function BuildingLayer({
  world,
  editor,
  onDevice,
  onDevicePositions,
}: {
  world: WorldSnapshot;
  editor?: BuildingEditor;
  onDevice?: (id: string) => void;
  onDevicePositions?: (points: DeviceScreenPoint[]) => void;
}) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as
    { target: T.Vector3; update: () => void } | undefined;
  useEffect(() => {
    if (!editor) return;
    const focus = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          point?: { x: number; y: number; z: number };
          view?: "near" | "top";
        }>
      ).detail;
      const p = detail?.point ?? { x: 21, y: 0, z: -13 };
      if (detail?.view === "top") camera.position.set(p.x, p.y + 30, p.z + 0.1);
      else if (detail?.view === "near")
        camera.position.set(p.x + 8, p.y + 9, p.z + 11);
      else camera.position.set(p.x + 13, p.y + 30, p.z + 20);
      camera.lookAt(p.x, p.y, p.z);
      controls?.target.set(p.x, p.y, p.z);
      controls?.update();
    };
    focus(new Event("island-focus-building"));
    window.addEventListener("island-focus-building", focus);
    return () => window.removeEventListener("island-focus-building", focus);
  }, [camera, controls, !!editor]);
  const lastProjection = useRef(""),
    projectionElapsed = useRef(0),
    targetProjectionElapsed = useRef(0);
  useFrame(({ camera, gl, size, scene }, dt) => {
    targetProjectionElapsed.current += dt;
    if (editor && targetProjectionElapsed.current > 0.1) {
      targetProjectionElapsed.current = 0;
      const v = removalPoint
        ? new T.Vector3(...removalPoint).project(camera)
        : null;
      editor.reportTarget(
        v && v.z >= -1 && v.z <= 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1
          ? {
              x: Math.round(((v.x + 1) * size.width) / 2),
              y: Math.round(((1 - v.y) * size.height) / 2),
            }
          : null,
      );
    }
    projectionElapsed.current += dt;
    if (onDevicePositions && projectionElapsed.current > 0.1) {
      projectionElapsed.current = 0;
      const points = (world.devices ?? []).flatMap((d) => {
        const p = d.placement;
        if (p.state !== "placed") return [];
        const v = new T.Vector3(
          p.x,
          p.y + deviceDefinitions[d.definitionId].height + 0.35,
          p.z,
        ).project(camera);
        if (v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1)
          return [];
        return [
          {
            id: d.id,
            x: Math.round(((v.x + 1) * size.width) / 2),
            y: Math.round(((1 - v.y) * size.height) / 2),
          },
        ];
      });
      const signature = JSON.stringify(points);
      if (signature !== lastProjection.current) {
        lastProjection.current = signature;
        onDevicePositions(points);
      }
    }
    if (!measuringBuilding) return;
    probe.frameMs.push(dt * 1000);
    if (probe.frameMs.length > 3000) probe.frameMs.shift();
    probe.memory = {
      ...gl.info.memory,
      programs: gl.info.programs?.length ?? 0,
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
    };
    probe.inspectBlocks = () => {
      const values: { name: string; opacity: number; transparent: boolean }[] =
        [];
      scene.traverse((object) => {
        if (object instanceof T.Mesh && object.name.startsWith("building:")) {
          const material = object.material as T.MeshStandardMaterial;
          values.push({
            name: object.name,
            opacity: material.opacity,
            transparent: material.transparent,
          });
        }
      });
      return values;
    };
    probe.project = (x, y, z) => {
      const p = new T.Vector3(x, y, z).project(camera);
      return {
        x: ((p.x + 1) * size.width) / 2,
        y: ((1 - p.y) * size.height) / 2,
      };
    };
  });
  const cells = useMemo(
    () => readCells(world.construction),
    [world.construction],
  );
  const chunks = useMemo(() => {
    const groups = new Map<string, [string, BlockValue][]>();
    for (const item of cells) {
      const c = chunkCell(parseCell(item[0])),
        k = `${c.cx},${c.cy},${c.cz}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(item);
    }
    return [...groups].map(([key, entries]) => {
      const [x, y, z] = key.split(",").map(Number);
      const adjacent = [...cells].filter(([k]) => {
        const c = chunkCell(parseCell(k));
        return (
          Math.abs(c.cx - x!) + Math.abs(c.cy - y!) + Math.abs(c.cz - z!) <= 1
        );
      });
      return { key, entries, signature: JSON.stringify(adjacent) };
    });
  }, [cells]);
  const select = usePlacementPick(editor);
  const target = editor?.target;
  const preview = target && "cell" in target ? cellMin(target.cell) : null;
  const previewY =
    preview && target && "cell" in target && cells.has(cellKey(target.cell))
      ? preview.y + 1
      : 0;
  const groundPick = (
    e: ThreeEvent<MouseEvent | PointerEvent>,
    hover = false,
  ) => {
    if (!editor || (!hover && e.delta > 5)) return;
    if (
      hover &&
      ((e.nativeEvent as PointerEvent).pointerType === "touch" ||
        e.nativeEvent.buttons ||
        editor.mode === "remove")
    )
      return;
    e.stopPropagation();
    const target: BuildTarget = {
      cell: hitCell(
        { x: e.point.x, y: 0, z: e.point.z },
        { x: 0, y: 1, z: 0 },
        true,
      ),
      top: true,
      normal: { x: 0, y: 1, z: 0 },
    };
    if (hover) editor.select(target);
    else select(target, e as ThreeEvent<MouseEvent>);
  };
  let removalPoint: [number, number, number] | null = null;
  if (editor?.mode === "remove" && target) {
    if (preview)
      removalPoint = [preview.x + 0.5, preview.y + 1.2, preview.z + 0.5];
    else if ("entityId" in target) {
      const entity = world.entities.find((e) => e.id === target.entityId);
      if (entity) {
        const box = entityBox(
          entity,
          world.entityPlacements?.find((p) => p.entityId === entity.id)?.y ?? 0,
        );
        removalPoint = [entity.x, box.max.y + 0.2, entity.z];
      }
    } else if ("deviceId" in target) {
      const d = world.devices?.find((d) => d.id === target.deviceId);
      if (d?.placement.state === "placed")
        removalPoint = [
          d.placement.x,
          d.placement.y + deviceDefinitions[d.definitionId].height + 0.2,
          d.placement.z,
        ];
    }
  }
  const normal = target && "cell" in target ? target.normal : undefined;
  const faceRotation = normal
    ? new T.Quaternion().setFromUnitVectors(
        new T.Vector3(0, 0, 1),
        new T.Vector3(normal.x, normal.y, normal.z),
      )
    : undefined;
  return (
    <group>
      {editor && (
        <mesh
          position={[0, 0.065, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          onClick={(e) => groundPick(e)}
          onPointerMove={(e) => groundPick(e, true)}
        >
          <planeGeometry args={[78, 66]} />
          <meshBasicMaterial
            color="#b4c595"
            transparent
            opacity={0}
            depthWrite={false}
          />
        </mesh>
      )}
      {editor && (
        <group>
          <mesh
            position={[21, 0.07, -13]}
            rotation={[-Math.PI / 2, 0, 0]}
            raycast={() => null}
          >
            <planeGeometry args={[18, 18]} />
            <meshBasicMaterial
              color="#94be86"
              transparent
              opacity={0.22}
              depthWrite={false}
            />
          </mesh>
          <gridHelper
            args={[18, 18, "#356f48", "#749365"]}
            position={[21, 0.075, -13]}
            raycast={() => null}
          />
        </group>
      )}
      {chunks.map((c) => (
        <Chunk
          key={c.key}
          entries={c.entries}
          signature={c.signature}
          all={cells}
          editor={editor}
        />
      ))}
      {preview && editor && editor.mode === "build" && (
        <mesh
          position={[preview.x + 0.5, preview.y + 0.5, preview.z + 0.5]}
          raycast={() => null}
        >
          <boxGeometry args={[0.98, 0.98, 0.98]} />
          <meshStandardMaterial
            map={blockMap(
              editor.held === "wood"
                ? "wood"
                : editor.held === "glass"
                  ? "glass"
                  : "stone",
            )}
            transparent
            opacity={0.45}
            color={editor.previewError ? "#e77c70" : "#b8efd2"}
            depthWrite={false}
          />
        </mesh>
      )}
      {preview && editor && editor.mode === "device" && (
        <group
          position={[preview.x + 0.5, previewY, preview.z + 0.5]}
          rotation={[0, (editor.rotation * Math.PI) / 2, 0]}
          onUpdate={(group) =>
            group.traverse((obj) => {
              obj.raycast = () => {};
            })
          }
        >
          <ItemModel kind={editor.held} ghost />
        </group>
      )}
      {preview && (
        <mesh
          position={[preview.x + 0.5, preview.y + 0.5, preview.z + 0.5]}
          raycast={() => null}
        >
          <boxGeometry args={[1.02, 1.02, 1.02]} />
          <meshBasicMaterial
            wireframe
            color={editor?.previewError ? "#b34435" : "#39795d"}
          />
        </mesh>
      )}
      {preview && normal && (
        <mesh
          position={[
            preview.x +
              0.5 +
              normal.x * (editor?.mode === "build" ? -0.495 : 0.505),
            preview.y === 0 && normal.y === 1 && editor?.mode === "build"
              ? 0.08
              : preview.y +
                0.5 +
                normal.y * (editor?.mode === "build" ? -0.495 : 0.505),
            preview.z +
              0.5 +
              normal.z * (editor?.mode === "build" ? -0.495 : 0.505),
          ]}
          quaternion={faceRotation}
          raycast={() => null}
          renderOrder={2}
        >
          <planeGeometry args={[0.96, 0.96]} />
          <meshBasicMaterial
            color={editor?.previewError ? "#dc584b" : "#36b88b"}
            side={T.DoubleSide}
            transparent
            opacity={0.5}
            depthWrite={false}
          />
        </mesh>
      )}
      {preview && preview.y > 0 && (
        <mesh
          position={[preview.x + 0.5, preview.y / 2, preview.z + 0.5]}
          raycast={() => null}
        >
          <boxGeometry args={[0.035, preview.y, 0.035]} />
          <meshBasicMaterial
            color="#39795d"
            transparent
            opacity={0.7}
            depthWrite={false}
          />
        </mesh>
      )}
      {editor?.mode === "remove" &&
        world.entities.map((e) => {
          const box = entityBox(
            e,
            world.entityPlacements?.find((p) => p.entityId === e.id)?.y ?? 0,
          );
          return (
            <mesh
              key={e.id}
              position={[
                (box.min.x + box.max.x) / 2,
                (box.min.y + box.max.y) / 2,
                (box.min.z + box.max.z) / 2,
              ]}
              onClick={(ev) => {
                if (ev.delta > 5) return;
                ev.stopPropagation();
                editor.select({ entityId: e.id });
              }}
            >
              <boxGeometry
                args={[
                  box.max.x - box.min.x,
                  box.max.y - box.min.y,
                  box.max.z - box.min.z,
                ]}
              />
              <meshBasicMaterial
                wireframe
                transparent
                opacity={
                  target && "entityId" in target && target.entityId === e.id
                    ? 0.9
                    : 0.08
                }
                color="#ba6e4b"
                depthWrite={false}
              />
            </mesh>
          );
        })}
      {(world.devices ?? [])
        .filter((d) => d.placement.state === "placed")
        .map((d) => {
          const p = d.placement;
          if (p.state !== "placed") return null;
          return (
            <group
              key={d.id}
              position={[p.x, p.y, p.z]}
              rotation={[0, (p.rotation * Math.PI) / 2, 0]}
              onClick={(e) => {
                if (e.delta > 5) return;
                e.stopPropagation();
                if (editor?.mode === "remove")
                  editor.select({ deviceId: d.id });
                else if (!editor) onDevice?.(d.id);
              }}
            >
              {editor?.mode === "remove" &&
                target &&
                "deviceId" in target &&
                target.deviceId === d.id && (
                  <mesh
                    position={[
                      0,
                      deviceDefinitions[d.definitionId].height / 2,
                      0,
                    ]}
                    raycast={() => null}
                  >
                    <boxGeometry
                      args={[
                        deviceDefinitions[d.definitionId].width + 0.04,
                        deviceDefinitions[d.definitionId].height + 0.04,
                        deviceDefinitions[d.definitionId].depth + 0.04,
                      ]}
                    />
                    <meshBasicMaterial
                      wireframe
                      color="#ba6e4b"
                      depthTest={false}
                    />
                  </mesh>
                )}
              <ItemModel
                kind={glyphForDevice(d.definitionId)}
                occupied={
                  d.payload.kind === "displayCase" && !!d.payload.itemRef
                }
              />
            </group>
          );
        })}
    </group>
  );
}
