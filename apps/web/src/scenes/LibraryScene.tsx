import { useEffect, useMemo, useRef, useState } from "react";
import * as T from "three";
import { useFrame } from "@react-three/fiber";
import { libraryFeatures, random } from "@island/world-core";
import { books as shelfBooks } from "@island/contracts";
import { Plants, Box, palettes } from "../Plants";
import { PlayerRig } from "../player/Player";
import { TutorMesh } from "../tutor/TutorMesh";
import {
  SceneCanvas,
  SceneFrame,
  SkyRig,
  exitClick,
  isNight,
  usePlacer,
  weatherWind,
  type SceneProps,
} from "./shared";

const bookColors = ["#b56a5a", "#7d8ea6", "#c9a15c", "#86a08a", "#a67cae"];
/** Where the real, tappable books stand on the shelf wall (world coords —
 *  the wall's room-side face is x≈-25.2, spines sit just proud of it). */
const REAL_SHELF = 2.9,
  REAL_BOOK_Z = [-14.6, -12.2, -9.8];

/** Rows of coloured spines on the pavilion's shelf wall. Lives at the
 *  scene root: its matrices are world coordinates. */
function BookWall() {
  const books = useRef<T.InstancedMesh>(null);
  const data = useMemo(() => {
    const rng = random(19),
      dummy = new T.Object3D(),
      items: { matrix: T.Matrix4; color: T.Color; w: number }[] = [];
    for (const shelf of [1.6, 2.9, 4.2, 5.5]) {
      let z = -16.4;
      while (z < -4.2) {
        const w = 0.24 + rng() * 0.2,
          h = 1.05 + rng() * 0.12,
          center = z + w / 2;
        // Leave gaps where the real books stand out from the wall.
        if (
          shelf === REAL_SHELF &&
          REAL_BOOK_Z.some((rz) => Math.abs(center - rz) < 1.0)
        ) {
          z += w + 0.05 + rng() * 0.1;
          continue;
        }
        dummy.position.set(-24.9, shelf + h / 2, center);
        dummy.rotation.set(0, rng() < 0.08 ? 0.28 : 0, 0);
        dummy.scale.set(1, h, w);
        dummy.updateMatrix();
        items.push({
          matrix: dummy.matrix.clone(),
          color: new T.Color(bookColors[Math.floor(rng() * bookColors.length)]!),
          w,
        });
        z += w + 0.05 + rng() * 0.1;
      }
    }
    return items;
  }, []);
  useEffect(() => {
    if (!books.current) return;
    data.forEach((d, i) => {
      books.current!.setMatrixAt(i, d.matrix);
      books.current!.setColorAt(i, d.color);
    });
    books.current.instanceMatrix.needsUpdate = true;
    if (books.current.instanceColor) books.current.instanceColor.needsUpdate = true;
    books.current.computeBoundingSphere();
  }, [data]);
  return (
    <instancedMesh ref={books} args={[undefined, undefined, data.length]}>
      <boxGeometry args={[0.55, 1, 1]} />
      <meshStandardMaterial roughness={0.95} />
    </instancedMesh>
  );
}
/** One tappable book standing out from the shelf wall. */
function RealBook({
  bookId,
  z,
  color,
  onOpenBook,
}: {
  bookId: string;
  z: number;
  color: string;
  onOpenBook?: (bookId: string) => void;
}) {
  const group = useRef<T.Group>(null);
  const [hover, setHover] = useState(false);
  useEffect(
    () => () => {
      document.body.style.cursor = "auto";
    },
    [],
  );
  useFrame((_, rawDt) => {
    if (!group.current) return;
    // Hover eases the book a little way off the shelf.
    group.current.position.x = T.MathUtils.damp(
      group.current.position.x,
      hover ? -24.25 : -24.6,
      8,
      Math.min(rawDt, 0.1),
    );
  });
  return (
    <group
      ref={group}
      position={[-24.6, REAL_SHELF + 1, z]}
      rotation={[0, -0.28, 0]}
      onClick={(e) => {
        if (e.delta > 5) return;
        e.stopPropagation();
        onOpenBook?.(bookId);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHover(false);
        document.body.style.cursor = "auto";
      }}
    >
      {/* A generous, invisible hit pad: the books are small on screen, and
       *  the hover pull-out shifts them a few pixels — taps should still land. */}
      <mesh scale={[2.2, 2.6, 2.4]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh castShadow>
        <boxGeometry args={[0.8, 2.0, 0.9]} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
      <mesh position={[0.41, 0, 0]}>
        <boxGeometry args={[0.04, 1.6, 0.6]} />
        <meshStandardMaterial
          color="#f0e6d2"
          emissive="#f0c264"
          emissiveIntensity={hover ? 0.55 : 0}
          roughness={0.9}
        />
      </mesh>
      <mesh position={[0, 1.01, 0]}>
        <boxGeometry args={[0.78, 0.05, 0.84]} />
        <meshStandardMaterial color="#f0e6d2" roughness={0.9} />
      </mesh>
    </group>
  );
}
/** The lesson books of the house: tap one to open it in the reader. */
function RealBooks({ onOpenBook }: { onOpenBook?: (id: string) => void }) {
  return (
    <group>
      {shelfBooks.map((b, i) => (
        <RealBook
          key={b.id}
          bookId={b.id}
          z={REAL_BOOK_Z[i % REAL_BOOK_Z.length] ?? 0}
          color={["#b56a5a", "#7d8ea6", "#86a08a"][i % 3]!}
          onOpenBook={onOpenBook}
        />
      ))}
    </group>
  );
}
/** The reading pavilion: shelf wall, roof and lamp-lit porch. The roof
 *  planes stay OUTSIDE the clickable group — from the overview camera,
 *  every ray at the book wall passes through the roof first, so a
 *  clickable roof would swallow the real books' taps. */
function Pavilion({
  night,
  onRead,
}: {
  night: boolean;
  onRead?: () => void;
}) {
  const { x, z } = libraryFeatures.pavilion;
  return (
    <group position={[x, 0, z]}>
      <group
        onClick={(e) => {
          if (e.delta > 5) return;
          e.stopPropagation();
          onRead?.();
        }}
      >
        <Box position={[-8, 3.5, 0]} scale={[1.6, 7, 14]} color="#8c7254" />
        {[-4.5, 4.5].map((dz) => (
          <Box
            key={dz}
            position={[-5.5, 3.4, dz]}
            scale={[5, 0.3, 0.34]}
            color="#a8814f"
          />
        ))}
        <Box position={[0, 0.05, 0]} scale={[10, 0.12, 14]} color="#c9a777" />
      </group>
      <mesh position={[-2.4, 7.2, 0]} rotation={[0, 0, 0.16]} castShadow>
        <boxGeometry args={[13, 0.4, 15]} />
        <meshStandardMaterial color="#7a6a4d" roughness={0.95} />
      </mesh>
      <mesh position={[0.6, 8, 0]} rotation={[0, 0, 0.16]}>
        <boxGeometry args={[13, 0.16, 15.4]} />
        <meshStandardMaterial color="#93805f" roughness={0.95} />
      </mesh>
    </group>
  );
}
function Lamp({ x, z, night }: { x: number; z: number; night: boolean }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.18, 0]}>
        <cylinderGeometry args={[0.55, 0.7, 0.36, 10]} />
        <meshStandardMaterial color="#8c7254" roughness={1} />
      </mesh>
      <mesh position={[0, 1.8, 0]} castShadow>
        <cylinderGeometry args={[0.09, 0.13, 3.4, 8]} />
        <meshStandardMaterial color="#6b6350" roughness={1} />
      </mesh>
      <mesh position={[0, 3.75, 0]}>
        <sphereGeometry args={[0.52, 12, 10]} />
        <meshStandardMaterial
          color="#f4dfae"
          emissive="#f0c264"
          emissiveIntensity={night ? 1.5 : 0.25}
          roughness={0.7}
        />
      </mesh>
      <mesh position={[0, 4.35, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.75, 0.5, 10]} />
        <meshStandardMaterial color="#8c7254" roughness={1} />
      </mesh>
    </group>
  );
}
/** A low table with cushions and one book that never quite lands. */
function ReadingNook() {
  const { table } = libraryFeatures;
  const book = useRef<T.Group>(null);
  useFrame(({ clock }) => {
    if (book.current) {
      book.current.position.y = 3.1 + Math.sin(clock.elapsedTime * 0.9) * 0.35;
      book.current.rotation.y = clock.elapsedTime * 0.35;
      book.current.rotation.z = Math.sin(clock.elapsedTime * 0.6) * 0.08;
    }
  });
  return (
    <group>
      <mesh position={[table.x, 0.05, table.z]} rotation={[-Math.PI / 2, 0, 0.3]} receiveShadow>
        <circleGeometry args={[3.6, 30]} />
        <meshStandardMaterial color="#c58f7a" roughness={1} />
      </mesh>
      <Box position={[table.x, 0.75, table.z]} scale={[2.6, 0.18, 1.6]} color="#a8814f" />
      {[
        [-3.1, 0.5, "#8fb3c7"],
        [2.9, -0.7, "#c9a15c"],
        [0.7, 3, "#a67cae"],
      ].map(([dx, dz, color], i) => (
        <mesh
          key={i}
          position={[table.x + (dx as number) * 0.85, 0.28, table.z + (dz as number) * 0.85]}
          castShadow
        >
          <cylinderGeometry args={[0.8, 0.9, 0.3, 14]} />
          <meshStandardMaterial color={color as string} roughness={1} />
        </mesh>
      ))}
      <group ref={book} position={[table.x, 3.1, table.z]}>
        {[-0.05, 0.05].map((side, i) => (
          <mesh key={side} rotation={[side * 0.6, 0, 0]} castShadow>
            <boxGeometry args={[1.15, 0.05, 0.85]} />
            <meshStandardMaterial
              color={i ? "#f0e6d2" : "#b56a5a"}
              roughness={0.9}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}
import { ContentAnimals } from "../animals";
import Collectibles from "../collect/Collectibles";

function Library(props: SceneProps) {
  const { world, tool, onPlace, onExit, low } = props,
    season = world.environment.season,
    weather = world.environment.weather ?? "sun",
    night = isNight(world.environment.hour);
  const place = usePlacer(tool, onPlace);
  return (
    <>
      <SkyRig
        hour={world.environment.hour}
        low={low}
        sky={{ day: "#c6d4bb", night: "#1d2e2a" }}
        fog={[150, 470]}
        stars={1500}
        shadowHalf={44}
        weather={weather}
      />
      {/* The library lives on a wooden deck among the trees. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow onClick={place}>
        <planeGeometry args={[78, 66]} />
        <meshStandardMaterial color="#b89a72" roughness={1} />
      </mesh>
      <Box position={[0, -0.65, 0]} scale={[78, 1.2, 66]} color="#93765a" />
      {Array.from({ length: 16 }, (_, i) => (
        <mesh key={i} position={[0, 0.02, -30 + i * 4]} receiveShadow>
          <boxGeometry args={[77, 0.05, 0.28]} />
          <meshStandardMaterial color="#a3865f" roughness={1} />
        </mesh>
      ))}
      <Pavilion night={night} onRead={props.onRead} />
      <BookWall />
      <RealBooks onOpenBook={props.onOpenBook} />
      {libraryFeatures.lamps.map((l) => (
        <Lamp key={`${l.x}-${l.z}`} x={l.x} z={l.z} night={night} />
      ))}
      <ReadingNook />
      <TutorMesh onClick={props.onTutor} />
      <Plants
        entities={world.entities}
        season={season}
        low={low}
        height={() => 0}
        wind={weatherWind[weather]}
      />
      <ContentAnimals scene="library" entities={world.entities} />
      <Collectibles scene="library" seed={world.seed} />
      <group
        position={[0, 0, libraryFeatures.gate]}
        onClick={exitClick(tool, onExit)}
      >
        {[-2.8, 2.8].map((x) => (
          <Box
            key={x}
            position={[x, 2.2, 0]}
            scale={[0.36, 4.4, 0.36]}
            color="#8c7254"
          />
        ))}
        <Box position={[0, 4.5, 0]} scale={[6.4, 0.4, 0.4]} color="#a8814f" />
        {[-1.4, 0, 1.4].map((x) => (
          <mesh key={x} position={[x, 3.4, 0]} rotation={[0, 0, 0.4]}>
            <boxGeometry args={[0.14, 1.3, 0.9]} />
            <meshStandardMaterial
              color={x ? "#7d8ea6" : "#c9a15c"}
              roughness={0.95}
            />
          </mesh>
        ))}
      </group>
      {props.walk && props.avatar && props.onGate && (
        <PlayerRig scene="library" avatar={props.avatar} entities={world.entities} onGate={props.onGate} />
      )}
      <SceneFrame reset={props.reset} position={[64, 60, 86]} max={300} />
    </>
  );
}
export default function LibraryScene(props: SceneProps) {
  return (
    <SceneCanvas low={props.low} scene="library" position={[64, 60, 86]}>
      <Library {...props} />
    </SceneCanvas>
  );
}
