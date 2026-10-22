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
// Native mouse double-clicks and consecutive touch taps share placement validation.
function usePlacementPick(editor?: BuildingEditor) {
  const lastTap = useRef<{ time: number; x: number; y: number } | null>(null);
  useEffect(() => {
    lastTap.current = null;
  }, [editor?.mode, editor?.held]);
  return (target: BuildTarget, e: ThreeEvent<MouseEvent>) => {
    if (!editor) return;
    const native = e.nativeEvent as PointerEvent;
    const touch = native.pointerType === "touch";
    const previous = lastTap.current;
    const doubleTap =
      touch &&
      previous &&
      native.timeStamp - previous.time < 350 &&
      Math.hypot(native.clientX - previous.x, native.clientY - previous.y) < 12;
    const place = touch ? doubleTap : native.detail === 2;
    lastTap.current =
      touch && !place
        ? { time: native.timeStamp, x: native.clientX, y: native.clientY }
        : null;
    editor.select(target);
    if (place && editor.mode !== "remove") editor.place(target);
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
  const groups = new Map<string, { pos: number[]; uv: number[] }>();
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
        data = { pos: [], uv: [] };
        groups.set(key, data);
      }
      for (const index of [0, 1, 2, 0, 2, 3]) {
        const p = f.v[index]!;
        const t = corner[index]!;
        data.pos.push(min.x + p[0]!, min.y + p[1]!, min.z + p[2]!);
        data.uv.push(t[0], t[1]);
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
    const pick = (e: ThreeEvent<MouseEvent>) => {
      if (!editor || e.delta > 5 || !e.face) return;
      e.stopPropagation();
      select(
        {
          cell: hitCell(
            e.point,
            { x: e.face.normal.x, y: e.face.normal.y, z: e.face.normal.z },
            editor.mode === "build",
          ),
          top: e.face.normal.y > 0.5,
        },
        e,
      );
    };
    return (
      <>
        {meshes.map(({ key, geometry }) => {
          const glass = key.includes("glass"),
            fade = (editor?.cutaway ?? true) && key.endsWith("high");
          return (
            <mesh
              key={key}
              geometry={geometry}
              onClick={pick}
              castShadow
              receiveShadow
            >
              <meshStandardMaterial
                map={blockMap(
                  glass ? "glass" : key.includes("wood") ? "wood" : "stone",
                )}
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
    const focus = () => {
      camera.position.set(34, 42, 3);
      controls?.target.set(21, 0, -13);
      controls?.update();
    };
    window.addEventListener("island-focus-building", focus);
    return () => window.removeEventListener("island-focus-building", focus);
  }, [camera, controls, !!editor]);
  const lastProjection = useRef(""),
    projectionElapsed = useRef(0);
  useFrame(({ camera, gl, size }, dt) => {
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
  return (
    <group>
      {editor && (
        <mesh
          position={[0, 0.065, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          onClick={(e) => {
            if (e.delta > 5) return;
            e.stopPropagation();
            select(
              {
                cell: hitCell(
                  { x: e.point.x, y: 0, z: e.point.z },
                  { x: 0, y: 1, z: 0 },
                  true,
                ),
                top: true,
              },
              e,
            );
          }}
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
            opacity={0.78}
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
                else onDevice?.(d.id);
              }}
            >
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
