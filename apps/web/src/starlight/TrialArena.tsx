import { Html } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as T from "three";
import { starlightTrialStage } from "@island/world-core";
import { AnimalMesh, type AnimalAnim } from "../animals/AnimalMesh";
import type { PlaySceneBindings } from "./StarlightPlay";
import { trialEffectFrame, TRIAL_EFFECT_SECONDS } from "./trialEffects";

/** The old central basin becomes a projection stage, in its original footprint.
 * The friendly training projection doesn't relocate the roaming resident. */
export default function TrialArena({
  play,
  low,
}: {
  play?: PlaySceneBindings;
  low: boolean;
}) {
  const stage = starlightTrialStage;
  const focused = !!play?.trialView;
  const trial = focused ? play?.state.trial : null;
  const anim = useRef<AnimalAnim>({
    phase: 0,
    moving: false,
    action: "none",
    mouth: 0,
  });
  const actor = useRef<T.Group>(null),
    shadow = useRef<T.Group>(null),
    orb = useRef<T.Group>(null);
  const charge = useRef<T.Mesh>(null),
    beam = useRef<T.Mesh>(null),
    counter = useRef<T.Mesh>(null);
  const shield = useRef<T.Mesh>(null),
    halo = useRef<T.Mesh>(null),
    impact = useRef<T.Mesh>(null),
    receive = useRef<T.Mesh>(null);
  const firstRing = useRef<T.Mesh>(null),
    secondRing = useRef<T.Mesh>(null),
    healing = useRef<T.Mesh>(null);
  const arrow = useRef<T.Group>(null),
    trail = useRef<T.Group>(null);
  const sparks = useRef<T.Group>(null),
    localLight = useRef<T.PointLight>(null);
  const elapsed = useRef(TRIAL_EFFECT_SECONDS),
    clock = useRef(0);
  const particlePaths = useMemo(
    () =>
      Array.from({ length: low ? 6 : 18 }, (_, i) => ({
        a: i * 2.39996,
        r: 0.4 + (i % 4) * 0.17,
        y: 0.15 + (i % 5) * 0.1,
      })),
    [low],
  );
  useEffect(() => {
    elapsed.current = 0;
  }, [play?.effect?.id]);
  useFrame((_, rawDt) => {
    const still = !play?.motion;
    const paused = !!play?.effectsPaused || document.hidden;
    const dt = Math.min(rawDt, 0.05);
    if (!paused && !still) {
      clock.current += dt;
      elapsed.current = play?.effect
        ? Math.max(0, (performance.now() - play.effectStarted) / 1000)
        : TRIAL_EFFECT_SECONDS;
      anim.current.phase += dt;
    }
    const f = trialEffectFrame(
      focused ? (play?.effect ?? null) : null,
      elapsed.current,
      still,
    );
    anim.current.action =
      trial?.phase === "won"
        ? "greet"
        : trial?.phase === "rest"
          ? "rest"
          : "none";
    anim.current.mouth = f.charge * 0.3;
    anim.current.moving = f.dash > 0.1;
    if (actor.current) {
      actor.current.position.x =
        -1.08 +
        f.charge * 0.12 +
        f.dash * 1.3 -
        (play?.effect?.received ? f.receive * 0.08 : 0);
      actor.current.position.y = stage.top + f.celebrate * 0.12 + f.dash * 0.18;
    }
    if (shadow.current) {
      shadow.current.rotation.y = still ? 0 : clock.current * 0.3;
      shadow.current.position.y =
        stage.top + 0.8 + (still ? 0 : Math.sin(clock.current * 1.8) * 0.045);
      shadow.current.scale.setScalar(
        trial?.phase === "won" ? 0.55 : 1 - f.impact * 0.12,
      );
    }
    if (orb.current) {
      orb.current.rotation.y = still ? 0 : clock.current * 0.25;
      orb.current.position.y =
        2.35 + (still ? 0 : Math.sin(clock.current) * 0.08);
    }
    const set = (mesh: T.Mesh | null, strength: number, radius = 1) => {
      if (!mesh) return;
      mesh.visible = strength > 0.001;
      mesh.scale.setScalar(radius);
      (mesh.material as T.MeshBasicMaterial).opacity = Math.min(
        0.65,
        strength * 0.6,
      );
    };
    set(charge.current, f.charge, 0.1 + 0.26 * f.charge);
    if (beam.current) {
      beam.current.visible = f.beam !== null;
      beam.current.position.x = -0.6 + (f.beam ?? 0) * 1.8;
    }
    if (counter.current) {
      counter.current.visible = f.counter !== null;
      counter.current.position.x = 1.1 - (f.counter ?? 0) * 1.7;
    }
    for (const [mesh, progress, y] of [
      [firstRing.current, f.firstRing, 0.72],
      [secondRing.current, f.secondRing, 0.9],
    ] as const) {
      if (mesh) {
        mesh.visible = progress !== null;
        mesh.position.set(-0.65 + (progress ?? 0) * 1.8, stage.top + y, 0);
      }
    }
    set(healing.current, f.heal, 0.8 + f.heal * 0.3);
    if (trail.current) {
      trail.current.visible = f.dash > 0.05;
      trail.current.position.x = (actor.current?.position.x ?? -1.08) - 0.3;
    }
    if (arrow.current && play?.cue.actor) {
      arrow.current.position.set(
        play.cue.actor === "ally" ? (actor.current?.position.x ?? -1.08) : 1.1,
        stage.top +
          (play.cue.actor === "ally" ? 2.05 : 1.65) +
          (still || paused ? 0 : Math.sin(clock.current * 3) * 0.05),
        0,
      );
    }
    set(shield.current, f.shield, 1 + f.receive * 0.08);
    set(
      halo.current,
      f.observe || (trial?.focused ? 0.65 : 0),
      1 + f.observe * 0.12,
    );
    set(impact.current, f.impact, 0.45 + f.impact * 0.4);
    set(receive.current, f.receive, 0.4 + f.receive * 0.3);
    if (sparks.current) {
      sparks.current.visible =
        !still && (f.impact > 0 || f.celebrate > 0 || f.heal > 0);
      const burst = f.heal || f.celebrate || f.impact;
      sparks.current.children.forEach((child, i) => {
        const p = particlePaths[i]!;
        child.position.set(
          (f.heal ? -1.08 : 1.1) + Math.cos(p.a) * p.r * (1 + burst),
          stage.top + 0.8 + p.y + burst * 0.7,
          Math.sin(p.a) * p.r,
        );
        child.scale.setScalar(0.6 + burst * 0.7);
      });
    }
    if (localLight.current)
      localLight.current.intensity = focused ? 2.2 + f.charge * 0.8 : 0.7;
  });
  const enter = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 5) return;
    e.stopPropagation();
    play?.onTrial();
  };
  return (
    <group position={[stage.x, 0, stage.z]}>
      <group onClick={enter}>
        <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[1.9, stage.radius, 1, 12]} />
          <meshStandardMaterial color="#46596d" roughness={1} flatShading />
        </mesh>
        <mesh position={[0, 1.025, 0]} receiveShadow>
          <cylinderGeometry args={[1.85, 1.85, 0.05, 32]} />
          <meshStandardMaterial
            color={focused ? "#304959" : "#283b48"}
            roughness={0.9}
          />
        </mesh>
        {[1.5, 1.77].map((r, i) => (
          <mesh
            key={r}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, stage.top + i * 0.025, 0]}
          >
            <torusGeometry args={[r, 0.025, 6, 48]} />
            <meshStandardMaterial
              color={trial?.phase === "won" ? "#f6df9b" : "#a2d9d9"}
              emissive={trial?.phase === "won" ? "#e7c373" : "#77bfc1"}
              emissiveIntensity={focused ? 0.9 : 0.35}
            />
          </mesh>
        ))}
        {Array.from({ length: 8 }, (_, i) => (
          <mesh
            key={i}
            position={[
              Math.cos((i * Math.PI) / 4) * 1.62,
              stage.top + 0.02,
              Math.sin((i * Math.PI) / 4) * 1.62,
            ]}
            rotation={[-Math.PI / 2, 0, (i * Math.PI) / 4]}
          >
            <circleGeometry args={[0.075, 4]} />
            <meshBasicMaterial color="#d8d4ad" />
          </mesh>
        ))}
      </group>
      {!focused && (
        <group ref={orb} position={[0, 2.35, 0]} onClick={enter}>
          <mesh>
            <octahedronGeometry args={[0.44]} />
            <meshStandardMaterial
              color="#c9e9e4"
              emissive="#82bfc5"
              emissiveIntensity={0.7}
            />
          </mesh>
          <mesh rotation={[0.3, 0, 0.4]}>
            <torusGeometry args={[0.72, 0.025, 6, 40]} />
            <meshBasicMaterial color="#cde7de" />
          </mesh>
        </group>
      )}
      {focused && trial && (
        <>
          {play?.cue.actor && !play.effectsPaused && (
            <group
              ref={arrow}
              position={[
                play.cue.actor === "ally" ? -1.08 : 1.1,
                stage.top + 2.05,
                0,
              ]}
            >
              <mesh rotation={[0, 0, Math.PI]}>
                <coneGeometry args={[0.17, 0.24, 4]} />
                <meshBasicMaterial
                  color={play.cue.actor === "ally" ? "#ffe59b" : "#ddd0ff"}
                />
              </mesh>
              <mesh position={[0, 0.18, 0]}>
                <boxGeometry args={[0.13, 0.22, 0.13]} />
                <meshBasicMaterial color="#fff5d6" />
              </mesh>
              <Html
                center
                position={[0, 0.47, 0]}
                zIndexRange={[30, 20]}
                style={{ pointerEvents: "none" }}
              >
                <span className="trial-head-label" aria-hidden="true">
                  {play.cue.label}
                </span>
              </Html>
            </group>
          )}
          <mesh ref={firstRing} visible={false}>
            <torusGeometry args={[0.18, 0.035, 6, 20]} />
            <meshBasicMaterial color="#f8d78e" />
          </mesh>
          <mesh ref={secondRing} visible={false}>
            <torusGeometry args={[0.18, 0.035, 6, 20]} />
            <meshBasicMaterial color="#c4e1ee" />
          </mesh>
          <mesh
            ref={healing}
            visible={false}
            position={[-1.08, stage.top + 0.05, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <ringGeometry args={[0.42, 0.61, 24]} />
            <meshBasicMaterial
              color="#a3f1cb"
              transparent
              opacity={0}
              depthWrite={false}
            />
          </mesh>
          <group
            ref={trail}
            position={[-1.3, stage.top + 0.6, 0]}
            visible={false}
          >
            {[0, 1, 2].map((i) => (
              <mesh
                key={i}
                position={[-i * 0.22, -0.03 * i, 0]}
                scale={[0.34 - i * 0.07, 0.13, 0.13]}
              >
                <octahedronGeometry args={[1]} />
                <meshBasicMaterial
                  color="#bca8e9"
                  transparent
                  opacity={0.38 - i * 0.08}
                  depthWrite={false}
                />
              </mesh>
            ))}
          </group>

          <group
            ref={actor}
            position={[-1.08, stage.top, 0]}
            rotation={[0, Math.PI / 2, 0]}
            scale={0.62}
          >
            <AnimalMesh species="umbreon" anim={anim.current} />
          </group>
          <group ref={shadow} position={[1.1, stage.top + 0.8, 0]}>
            <mesh castShadow>
              <octahedronGeometry args={[0.39]} />
              <meshStandardMaterial
                color={trial.phase === "won" ? "#b0e3c8" : "#baabdf"}
                emissive="#6e619b"
                emissiveIntensity={0.4}
              />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.53, 0.025, 6, 32]} />
              <meshBasicMaterial color="#dacdf3" />
            </mesh>
          </group>
          <mesh
            ref={charge}
            position={[-0.6, stage.top + 0.7, 0]}
            visible={false}
          >
            <sphereGeometry args={[1, 12, 8]} />
            <meshBasicMaterial
              color="#fff1b8"
              transparent
              opacity={0}
              depthWrite={false}
            />
          </mesh>
          <mesh
            ref={beam}
            position={[0, stage.top + 0.7, 0]}
            visible={false}
            scale={[1.7, 0.7, 0.7]}
          >
            <sphereGeometry args={[0.15, 12, 8]} />
            <meshBasicMaterial color="#ffe6a0" />
          </mesh>
          <mesh
            ref={counter}
            position={[0, stage.top + 0.7, 0]}
            visible={false}
            scale={[1.4, 0.7, 0.7]}
          >
            <octahedronGeometry args={[0.12]} />
            <meshBasicMaterial color="#bdadef" />
          </mesh>
          <mesh
            ref={shield}
            position={[-0.72, stage.top + 0.65, 0]}
            rotation={[0, Math.PI / 2, 0]}
            visible={false}
          >
            <circleGeometry args={[0.66, low ? 12 : 32]} />
            <meshBasicMaterial
              color="#9cdded"
              transparent
              opacity={0.3}
              side={T.DoubleSide}
              depthWrite={false}
            />
          </mesh>
          <mesh
            ref={halo}
            position={[-1.08, stage.top + 0.035, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            visible={false}
          >
            <ringGeometry args={[0.47, 0.54, 32]} />
            <meshBasicMaterial
              color="#a4edda"
              transparent
              opacity={0}
              depthWrite={false}
            />
          </mesh>
          <mesh
            ref={impact}
            position={[1.1, stage.top + 0.8, 0.08]}
            visible={false}
          >
            <ringGeometry args={[0.52, 0.6, 24]} />
            <meshBasicMaterial
              color="#ffe2a2"
              transparent
              opacity={0}
              side={T.DoubleSide}
              depthWrite={false}
            />
          </mesh>
          <mesh
            ref={receive}
            position={[-0.72, stage.top + 0.65, 0.1]}
            visible={false}
          >
            <ringGeometry args={[0.5, 0.58, 24]} />
            <meshBasicMaterial
              color={play?.effect?.skill === "guard" ? "#b4edff" : "#e4c4f2"}
              transparent
              opacity={0}
              side={T.DoubleSide}
              depthWrite={false}
            />
          </mesh>
          <group ref={sparks} visible={false}>
            {particlePaths.map((_, i) => (
              <mesh key={i}>
                <octahedronGeometry args={[0.045]} />
                <meshBasicMaterial color={i % 2 ? "#e9dbab" : "#b4dfce"} />
              </mesh>
            ))}
          </group>
        </>
      )}
      {!low && (
        <pointLight
          ref={localLight}
          position={[0, stage.top + 2.6, 0]}
          color="#c7e6ec"
          intensity={focused ? 2.2 : 0.7}
          distance={9}
          decay={2}
        />
      )}
    </group>
  );
}
