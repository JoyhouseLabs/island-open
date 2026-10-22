import { useRef, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as T from "three";
import type { AvatarConfig } from "./avatar";

export type AvatarAnim = {
  phase: number;
  moving: boolean;
  /** Optional pose: wave, spin, or sit (driven by the player controller). */
  action?: "wave" | "spin" | "sit";
  creationSeat?: boolean;
  /** Mid-jump: the face makes a little "o" of delight. */
  airborne?: boolean;
};

/** Placement of the shared face, tuned per form's head geometry. */
type FaceSpot = {
  eye: { x: number; y: number; z: number };
  mouth: { y: number; z: number };
  cheek?: { x: number; z: number };
  spread?: number;
};

/**
 * A complete little face: blinking eyes with pupils, brows that lift when
 * waving, a smile that opens into an "o" mid-jump, and soft cheeks. Shared
 * by every form; only the placement changes.
 */
function Face({ anim, spot }: { anim?: AvatarAnim; spot: FaceSpot }) {
  const left = useRef<T.Group>(null),
    right = useRef<T.Group>(null),
    mouth = useRef<T.Group>(null),
    brows = useRef<T.Group>(null);
  const smile = useRef<T.Mesh>(null),
    open = useRef<T.Mesh>(null);
  useFrame(({ clock }) => {
    // A quick blink every few seconds; both eyes together.
    const t = clock.elapsedTime,
      phase = t % 4.3,
      shut = phase < 0.13 ? 1 - Math.abs(phase - 0.065) / 0.065 : 0;
    const lid = Math.max(0.08, 1 - shut * 0.92);
    left.current?.scale.set(1, lid, 1);
    right.current?.scale.set(1, lid, 1);
    const happy = anim?.action === "wave" || anim?.action === "spin";
    if (brows.current) {
      brows.current.position.y = happy ? 0.035 : 0;
      brows.current.rotation.z = happy ? -0.08 : 0;
    }
    const pop = 1 + (happy ? 0.35 : 0);
    if (smile.current) smile.current.scale.setScalar(pop);
    if (open.current) open.current.scale.setScalar(pop);
    const airborne = !!anim?.airborne;
    if (smile.current) smile.current.visible = !airborne;
    if (open.current) open.current.visible = airborne;
  });
  const { x, y, z } = spot.eye,
    spread = spot.spread ?? 1;
  return (
    <group>
      {[-1, 1].map((s) => (
        <group
          key={s}
          ref={s < 0 ? left : right}
          position={[s * x * spread, y, z]}
        >
          <mesh>
            <sphereGeometry args={[0.052, 10, 8]} />
            <meshStandardMaterial color="#ffffff" roughness={0.35} />
          </mesh>
          <mesh position={[0, 0, 0.032]}>
            <sphereGeometry args={[0.027, 8, 8]} />
            <meshStandardMaterial color="#33383f" roughness={0.3} />
          </mesh>
          <mesh position={[0.012, 0.014, 0.05]}>
            <sphereGeometry args={[0.009, 6, 6]} />
            <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.4} />
          </mesh>
        </group>
      ))}
      <group ref={brows}>
        {[-1, 1].map((s) => (
          <mesh
            key={s}
            position={[s * x * spread, y + 0.075, z + 0.01]}
            rotation={[0, 0, s * -0.06]}
          >
            <boxGeometry args={[0.062, 0.014, 0.012]} />
            <meshStandardMaterial color="#4a4038" roughness={1} />
          </mesh>
        ))}
      </group>
      <group ref={mouth} position={[0, spot.mouth.y, spot.mouth.z]}>
        {/* A half-torus arc, flipped opening-up so it reads as a smile;
 *           mid-jump it swaps to a little round "o" of delight. */}
        <mesh ref={smile} rotation={[0, 0, Math.PI]}>
          <torusGeometry args={[0.032, 0.011, 6, 14, Math.PI]} />
          <meshStandardMaterial color="#5c4a42" roughness={1} />
        </mesh>
        <mesh ref={open} visible={false}>
          <torusGeometry args={[0.026, 0.01, 6, 14]} />
          <meshStandardMaterial color="#5c4a42" roughness={1} />
        </mesh>
      </group>
      {spot.cheek &&
        [-1, 1].map((s) => (
          <mesh
            key={s}
            position={[s * spot.cheek!.x, spot.mouth.y + 0.06, spot.cheek!.z]}
          >
            <circleGeometry args={[0.03, 10]} />
            <meshBasicMaterial color="#e89aa4" transparent opacity={0.55} />
          </mesh>
        ))}
    </group>
  );
}

/** Face placement per form (head shapes differ a little). */
const faceSpots: Record<string, FaceSpot> = {
  foxbot: { eye: { x: 0.1, y: 0.085, z: 0.215 }, mouth: { y: 0.0, z: 0.29 }, cheek: { x: 0.155, z: 0.205 } },
  pandabot: { eye: { x: 0.19, y: 0.19, z: 0.1 }, mouth: { y: -0.14, z: 0.235 }, cheek: { x: 0.17, z: 0.175 } },
  bunnybot: { eye: { x: 0.085, y: 0.08, z: 0.215 }, mouth: { y: -0.1, z: 0.225 }, cheek: { x: 0.13, z: 0.195 } },
  catbot: { eye: { x: 0.085, y: 0.06, z: 0.215 }, mouth: { y: -0.075, z: 0.25 }, cheek: { x: 0.14, z: 0.195 } },
  islander: { eye: { x: 0.085, y: 0.07, z: 0.225 }, mouth: { y: -0.06, z: 0.24 }, cheek: { x: 0.14, z: 0.205 } },
};

/** A limb pivots around its top so the swing reads as a step, not a slide. */
function Limb({
  x,
  y,
  w,
  h,
  color,
  anim,
  invert,
  arm,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  anim: AvatarAnim;
  invert?: boolean;
  /** Arms pose for actions; legs are the default. */
  arm?: "left" | "right";
}) {
  const pivot = useRef<T.Group>(null);
  useFrame(() => {
    if (!pivot.current) return;
    const sitting = anim.action === "sit";
    const swing =
      anim.moving && !sitting ? Math.sin(anim.phase * 9) * 0.55 : 0;
    let rx = (invert ? -swing : swing) * (x > 0 ? -1 : 1);
    let rz = 0;
    if (sitting) rx = arm ? 0.12 : 1.2;
    if (anim.action === "wave" && arm === "right") {
      rx = -0.5;
      rz = 2.1 + Math.sin(anim.phase * 10) * 0.45;
    }
    pivot.current.rotation.x = rx;
    pivot.current.rotation.z = rz;
  });
  return (
    <group ref={pivot} position={[x, y, 0]}>
      <mesh position={[0, -h / 2, 0]} castShadow>
        <boxGeometry args={[w, h, w]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
    </group>
  );
}

/** Where each form's hat sits, in head-group local space. */
const hatY: Record<string, number> = {
  foxbot: 0.2,
  pandabot: 0.24,
  islander: 0.3,
  bunnybot: 0.26,
  catbot: 0.2,
};
/** The bamboo copter actually spins while you wear it. */
function Copter({ y }: { y: number }) {
  const rotor = useRef<T.Group>(null);
  useFrame((_, dt) => {
    if (rotor.current) rotor.current.rotation.y += dt * 14;
  });
  return (
    <group position={[0, y + 0.42, 0]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.03, 0.03, 0.34, 6]} />
        <meshStandardMaterial color="#8a6a3a" roughness={1} />
      </mesh>
      <group ref={rotor} position={[0, 0.2, 0]}>
        {[0, Math.PI / 2].map((a) => (
          <mesh key={a} rotation={[0.18, a, 0]} castShadow>
            <boxGeometry args={[0.62, 0.015, 0.07]} />
            <meshStandardMaterial color="#d9c08f" roughness={1} />
          </mesh>
        ))}
        <mesh>
          <sphereGeometry args={[0.035, 8, 6]} />
          <meshStandardMaterial color="#6b4f2a" roughness={1} />
        </mesh>
      </group>
    </group>
  );
}

/** Hats mix and match across every form; the cap follows the accent colour. */
function Hat({ config }: { config: AvatarConfig }) {
  if (config.hat === "straw")
    return (
      <group position={[0, hatY[config.form] ?? 0.2, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.3, 0.32, 0.035, 14]} />
          <meshStandardMaterial color="#d9b56a" roughness={1} />
        </mesh>
        <mesh position={[0, 0.11, 0]} castShadow>
          <coneGeometry args={[0.22, 0.2, 10]} />
          <meshStandardMaterial color="#e3c078" roughness={1} />
        </mesh>
        <mesh position={[0, 0.06, 0]}>
          <cylinderGeometry args={[0.225, 0.225, 0.045, 10]} />
          <meshStandardMaterial color="#b08a4a" roughness={1} />
        </mesh>
      </group>
    );
  if (config.hat === "beret")
    return (
      <group
        position={[0, (hatY[config.form] ?? 0.2) + 0.06, 0]}
        rotation={[0.06, 0, 0.22]}
      >
        <mesh scale={[0.27, 0.1, 0.27]} castShadow>
          <sphereGeometry args={[1, 12, 8]} />
          <meshStandardMaterial color="#b0656f" roughness={1} />
        </mesh>
        <mesh position={[0, 0.1, 0]}>
          <cylinderGeometry args={[0.025, 0.025, 0.07, 6]} />
          <meshStandardMaterial color="#8c4e58" roughness={1} />
        </mesh>
      </group>
    );
  if (config.hat === "crown")
    return (
      <group position={[0, hatY[config.form] ?? 0.2, 0]} rotation={[0.1, 0, 0]}>
        <mesh>
          <torusGeometry args={[0.2, 0.045, 8, 18]} />
          <meshStandardMaterial color="#6f8d63" roughness={1} />
        </mesh>
        {[0, 1, 2, 3, 4].map((i) => {
          const a = (i / 5) * Math.PI * 2;
          return (
            <mesh
              key={i}
              position={[Math.cos(a) * 0.2, 0.05, Math.sin(a) * 0.2]}
            >
              <sphereGeometry args={[0.05, 8, 6]} />
              <meshStandardMaterial
                color={["#e7a8bd", "#f2ead0", "#c9a1d9", "#f2ead0", "#e7a8bd"][i]}
                roughness={0.9}
              />
            </mesh>
          );
        })}
      </group>
    );
  if (config.hat === "cap")
    return (
      <group position={[0, hatY[config.form] ?? 0.2, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[0.24, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={config.accent} roughness={1} />
        </mesh>
        <mesh position={[0, -0.01, 0.26]} castShadow>
          <boxGeometry args={[0.3, 0.04, 0.24]} />
          <meshStandardMaterial color="#f2ead0" roughness={1} />
        </mesh>
      </group>
    );
  if (config.hat === "starcrown")
    return (
      <group position={[0, (hatY[config.form] ?? 0.2) + 0.05, 0]}>
        <mesh>
          <torusGeometry args={[0.19, 0.028, 8, 18]} />
          <meshStandardMaterial
            color="#dcb64e"
            metalness={0.6}
            roughness={0.3}
          />
        </mesh>
        {[-0.14, 0, 0.14].map((x, i) => (
          <mesh key={x} position={[x, 0.11 + (i === 1 ? 0.05 : 0), 0]}>
            <octahedronGeometry args={[i === 1 ? 0.06 : 0.045]} />
            <meshStandardMaterial
              color="#ecc766"
              emissive="#c99a2e"
              emissiveIntensity={0.7}
            />
          </mesh>
        ))}
      </group>
    );
  if (config.hat === "copter")
    return <Copter y={hatY[config.form] ?? 0.2} />;
  return null;
}

function Head({ config, anim }: { config: AvatarConfig; anim?: AvatarAnim }) {
  if (config.form === "foxbot")
    return (
      <group>
        <mesh castShadow>
          <boxGeometry args={[0.44, 0.38, 0.4]} />
          <meshStandardMaterial color="#e8975f" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.06, 0.23]}>
          <boxGeometry args={[0.2, 0.14, 0.1]} />
          <meshStandardMaterial color="#f7e4cf" roughness={0.9} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.15, 0.3, -0.02]} castShadow>
            <coneGeometry args={[0.1, 0.26, 4]} />
            <meshStandardMaterial color="#d97f45" roughness={0.9} />
          </mesh>
        ))}
        <Face anim={anim} spot={faceSpots.foxbot!} />
        <Hat config={config} />
      </group>
    );
  if (config.form === "pandabot")
    return (
      <group>
        <mesh castShadow>
          <sphereGeometry args={[0.26, 14, 12]} />
          <meshStandardMaterial color="#f2f0e8" roughness={0.9} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.19, 0.19, 0]} castShadow>
            <sphereGeometry args={[0.09, 10, 8]} />
            <meshStandardMaterial color="#3d4046" roughness={0.9} />
          </mesh>
        ))}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.1, 0.03, 0.22]} rotation={[0, 0, s * 0.5]}>
            <boxGeometry args={[0.11, 0.07, 0.02]} />
            <meshStandardMaterial color="#3d4046" roughness={1} />
          </mesh>
        ))}
        <mesh position={[0, -0.08, 0.24]}>
          <sphereGeometry args={[0.05, 8, 8]} />
          <meshStandardMaterial color="#3d4046" roughness={1} />
        </mesh>
        <Face anim={anim} spot={faceSpots.pandabot!} />
        <Hat config={config} />
      </group>
    );
  if (config.form === "bunnybot")
    return (
      <group>
        <mesh castShadow>
          <sphereGeometry args={[0.24, 14, 12]} />
          <meshStandardMaterial color="#ece2d2" roughness={0.9} />
        </mesh>
        {[-1, 1].map((s) => (
          <group key={s} position={[s * 0.1, 0.3, -0.02]} rotation={[0.06, 0, s * 0.16]}>
            <mesh position={[0, 0.2, 0]} castShadow>
              <capsuleGeometry args={[0.062, 0.3, 4, 8]} />
              <meshStandardMaterial color="#ece2d2" roughness={0.9} />
            </mesh>
            <mesh position={[0, 0.2, 0.055]}>
              <capsuleGeometry args={[0.032, 0.26, 4, 8]} />
              <meshStandardMaterial
                color={config.accent}
                emissive={config.accent}
                emissiveIntensity={0.9}
              />
            </mesh>
          </group>
        ))}
        <mesh position={[0, -0.05, 0.22]}>
          <sphereGeometry args={[0.045, 8, 8]} />
          <meshStandardMaterial color="#d9a8a0" roughness={1} />
        </mesh>
        <Face anim={anim} spot={faceSpots.bunnybot!} />
        <Hat config={config} />
      </group>
    );
  if (config.form === "catbot")
    return (
      <group>
        <mesh castShadow>
          <boxGeometry args={[0.4, 0.34, 0.38]} />
          <meshStandardMaterial color="#8d9aa8" roughness={0.9} />
        </mesh>
        <mesh position={[0, -0.05, 0.2]}>
          <boxGeometry args={[0.18, 0.12, 0.08]} />
          <meshStandardMaterial color="#e8e6de" roughness={0.9} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.13, 0.26, -0.02]} rotation={[0, 0, s * 0.24]} castShadow>
            <coneGeometry args={[0.09, 0.2, 4]} />
            <meshStandardMaterial color="#7c8a99" roughness={0.9} />
          </mesh>
        ))}
        <Face anim={anim} spot={faceSpots.catbot!} />
        <Hat config={config} />
      </group>
    );
  return (
    <group>
      <mesh castShadow>
        <sphereGeometry args={[0.24, 14, 12]} />
        <meshStandardMaterial color="#f2cfa8" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.08, -0.03]} scale={[0.27, 0.22, 0.27]}>
        <sphereGeometry args={[1, 12, 10]} />
        <meshStandardMaterial color="#4a3c30" roughness={1} />
      </mesh>
      <Face anim={anim} spot={faceSpots.islander!} />
      <Hat config={config} />
    </group>
  );
}

/** The little resident: a soft low-poly body with an accent core. */
export function AvatarMesh({
  config,
  anim,
}: {
  config: AvatarConfig;
  anim: AvatarAnim;
}) {
  const body = useRef<T.Group>(null),
    tail = useRef<T.Group>(null);
  const hop = config.form === "bunnybot";
  useFrame((_, dt) => {
    if (body.current) {
      const sitting = anim.action === "sit";
      body.current.position.y = sitting
        ? (anim.creationSeat ? -0.65 : -0.3)
        : anim.moving
          ? Math.abs(Math.sin(anim.phase * (hop ? 7 : 9))) * (hop ? 0.16 : 0.05)
          : Math.sin(anim.phase * 2) * 0.008;
      // Spin whips the whole body around, then settles facing forward.
      if (anim.action === "spin") body.current.rotation.y += dt * 9;
      else if (body.current.rotation.y !== 0) {
        body.current.rotation.y %= Math.PI * 2;
        if (Math.abs(body.current.rotation.y) < 0.04)
          body.current.rotation.y = 0;
        else body.current.rotation.y *= 0.82;
      }
    }
    if (tail.current)
      tail.current.rotation.y = Math.sin(anim.phase * 3) * 0.3;
  });
  const bodyColor =
    config.form === "foxbot"
      ? "#e8975f"
      : config.form === "pandabot"
        ? "#f2f0e8"
        : config.form === "bunnybot"
          ? "#ece2d2"
          : config.form === "catbot"
            ? "#8d9aa8"
            : "#8fa3b0";
  const legColor =
    config.form === "pandabot"
      ? "#3d4046"
      : config.form === "islander"
        ? "#4f5a66"
        : config.form === "catbot"
          ? "#6f7d8c"
          : config.form === "bunnybot"
            ? "#d8cbb8"
            : "#c9752f";
  return (
    <group>
      <group ref={body}>
        <mesh position={[0, 0.82, 0]} castShadow>
          <boxGeometry args={[0.5, 0.56, 0.34]} />
          <meshStandardMaterial color={bodyColor} roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.86, 0.18]}>
          <boxGeometry args={[0.18, 0.18, 0.04]} />
          <meshStandardMaterial
            color={config.accent}
            emissive={config.accent}
            emissiveIntensity={1.2}
          />
        </mesh>
        <group position={[0, 1.18, 0]}>
          <Head config={config} anim={anim} />
        </group>
        <Limb x={-0.16} y={0.56} w={0.16} h={0.5} color={legColor} anim={anim} />
        <Limb x={0.16} y={0.56} w={0.16} h={0.5} color={legColor} anim={anim} />
        <Limb x={-0.33} y={1.02} w={0.12} h={0.44} color={bodyColor} anim={anim} invert arm="left" />
        <Limb x={0.33} y={1.02} w={0.12} h={0.44} color={bodyColor} anim={anim} invert arm="right" />
        {config.form === "foxbot" && (
          <group ref={tail} position={[0, 0.78, -0.2]}>
            <mesh rotation={[0.9, 0, 0]} castShadow>
              <coneGeometry args={[0.13, 0.6, 6]} />
              <meshStandardMaterial color="#e8975f" roughness={0.9} />
            </mesh>
            <mesh position={[0, 0.3, -0.24]}>
              <sphereGeometry args={[0.09, 8, 8]} />
              <meshStandardMaterial
                color={config.accent}
                emissive={config.accent}
                emissiveIntensity={1.6}
              />
            </mesh>
          </group>
        )}
        {config.form === "catbot" && (
          <group ref={tail} position={[0, 0.8, -0.18]}>
            <mesh rotation={[-0.5, 0, 0]} castShadow>
              <capsuleGeometry args={[0.055, 0.5, 4, 8]} />
              <meshStandardMaterial color="#8d9aa8" roughness={0.9} />
            </mesh>
            <mesh position={[0, 0.42, -0.32]}>
              <sphereGeometry args={[0.075, 8, 8]} />
              <meshStandardMaterial
                color={config.accent}
                emissive={config.accent}
                emissiveIntensity={1.6}
              />
            </mesh>
          </group>
        )}
        {config.form === "bunnybot" && (
          <mesh position={[0, 0.72, -0.22]} castShadow>
            <sphereGeometry args={[0.11, 10, 8]} />
            <meshStandardMaterial color="#f7f1e6" roughness={1} />
          </mesh>
        )}
        {config.form === "pandabot" && (
          <mesh position={[0, 0.82, -0.24]} castShadow>
            <boxGeometry args={[0.34, 0.4, 0.18]} />
            <meshStandardMaterial color="#3d4046" roughness={0.9} />
          </mesh>
        )}
        {config.form === "islander" && (
          <mesh position={[0, 1.04, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.2, 0.07, 8, 16]} />
            <meshStandardMaterial color={config.accent} roughness={0.95} />
          </mesh>
        )}
      </group>
    </group>
  );
}

/** Keeps the preview camera pinned: some environments ignore the camera
 *  prop's aim, so we set position + lookAt explicitly every frame. */
function PreviewCamera() {
  const camera = useThree((s) => s.camera);
  useFrame(() => {
    camera.position.set(0, 0.4, 2.9);
    camera.lookAt(0, 0.3, 0);
  });
  return null;
}

export function AvatarPreview({
  config,
  children,
}: {
  config: AvatarConfig;
  children?: ReactNode;
}) {
  return (
    <>
      <PreviewCamera />
      <group rotation={[0, -0.5, 0]} scale={1.1} position={[0, -0.65, 0]}>
        <AvatarMesh config={config} anim={{ phase: 0, moving: false }} />
        {children}
      </group>
    </>
  );
}
