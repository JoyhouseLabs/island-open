import { useEffect, useMemo, useRef } from "react";
import * as T from "three";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { forestTrail, random, type Point } from "@island/world-core";
import { Plants, Box, palettes } from "../Plants";
import { PlayerRig } from "../player/Player";
import { Residents } from "../animals";
import Collectibles from "../collect/Collectibles";
import { reportAgent, dropAgent, playerAgent } from "../animals/registry";
import { dialogue } from "../dialogue/store";
import { FoxEyes, useFoxPet } from "../animals/FoxDressing";
import {
  SceneCanvas,
  SceneFrame,
  SkyRig,
  exitClick,
  usePlacer,
  weatherWind,
  type SceneProps,
  GrassField,
  grassTint,
} from "./shared";
import { useFoxModel } from "./useFox";

/** Walk a closed polyline at a steady pace; used by the fox's patrol. */
function walkTrail(trail: Point[], distance: number): { p: Point; yaw: number } {
  const legs = trail.map((p, i) => {
    const q = trail[(i + 1) % trail.length]!;
    return { a: p, b: q, len: Math.hypot(q.x - p.x, q.z - p.z) };
  });
  const total = legs.reduce((sum, l) => sum + l.len, 0);
  let d = ((distance % total) + total) % total;
  for (const leg of legs) {
    if (d <= leg.len) {
      const t = d / leg.len;
      return {
        p: {
          x: leg.a.x + (leg.b.x - leg.a.x) * t,
          z: leg.a.z + (leg.b.z - leg.a.z) * t,
        },
        yaw: Math.atan2(leg.b.x - leg.a.x, leg.b.z - leg.a.z),
      };
    }
    d -= leg.len;
  }
  return { p: trail[0]!, yaw: 0 };
}
/** Flat stepping stones laid along the fox trail. */
function TrailStones() {
  const stones = useMemo(() => {
    const rng = random(31),
      list: { x: number; z: number; r: number }[] = [];
    for (let i = 0; i < forestTrail.length; i++) {
      const a = forestTrail[i]!,
        b = forestTrail[(i + 1) % forestTrail.length]!,
        len = Math.hypot(b.x - a.x, b.z - a.z);
      for (let d = rng() * 1.8; d < len; d += 2.1 + rng() * 0.8) {
        const t = d / len;
        list.push({
          x: a.x + (b.x - a.x) * t + (rng() - 0.5) * 0.7,
          z: a.z + (b.z - a.z) * t + (rng() - 0.5) * 0.7,
          r: 0.88 + rng() * 0.4,
        });
      }
    }
    return list;
  }, []);
  return (
    <>
      {stones.map((s, i) => (
        <mesh key={i} position={[s.x, 0.09, s.z]} receiveShadow>
          <cylinderGeometry args={[s.r, s.r * 1.06, 0.18, 7]} />
          <meshStandardMaterial color={i % 3 ? "#b5b39e" : "#a9a791"} roughness={1} />
        </mesh>
      ))}
    </>
  );
}
function Mushrooms() {
  const clusters = useMemo(() => {
    const rng = random(57),
      list: { x: number; z: number; s: number; glow: boolean }[] = [];
    for (let i = 0; i < 14; i++) {
      const bend = forestTrail[Math.floor(rng() * forestTrail.length)]!,
        a = rng() * Math.PI * 2,
        d = 3 + rng() * 4;
      if (!bend) continue;
      list.push({
        x: bend.x + Math.cos(a) * d,
        z: bend.z + Math.sin(a) * d,
        s: 0.6 + rng() * 0.8,
        glow: rng() < 0.3,
      });
    }
    return list;
  }, []);
  return (
    <>
      {clusters.map((m, i) => (
        <group key={i} position={[m.x, 0, m.z]} scale={m.s}>
          <mesh position={[0, 0.3, 0]} castShadow>
            <cylinderGeometry args={[0.14, 0.2, 0.6, 6]} />
            <meshStandardMaterial color="#e8ddc7" roughness={1} />
          </mesh>
          <mesh position={[0, 0.62, 0]} castShadow>
            <sphereGeometry args={[0.46, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial
              color={m.glow ? "#8f7fc0" : "#c05656"}
              roughness={0.9}
              emissive={m.glow ? "#6a58a8" : "#000000"}
              emissiveIntensity={m.glow ? 0.5 : 0}
            />
          </mesh>
          {m.glow && (
            <mesh position={[0, 0.62, 0]}>
              <sphereGeometry args={[0.52, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshStandardMaterial
                color="#a893d8"
                transparent
                opacity={0.22}
                emissive="#7d6ac0"
                emissiveIntensity={0.6}
                depthWrite={false}
              />
            </mesh>
          )}
        </group>
      ))}
    </>
  );
}
function Stumps() {
  return (
    <>
      {(
        [
          [-19, 14],
          [16, 10],
          [21, 17],
        ] as [number, number][]
      ).map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 0.45, 0]} castShadow>
            <cylinderGeometry args={[0.75, 0.9, 0.9, 9]} />
            <meshStandardMaterial color="#8c7254" roughness={1} />
          </mesh>
          <mesh position={[0, 0.92, 0]}>
            <cylinderGeometry args={[0.72, 0.72, 0.08, 9]} />
            <meshStandardMaterial color="#c0a67e" roughness={1} />
          </mesh>
        </group>
      ))}
    </>
  );
}
/** Fox loop distance from the wall clock — identical on every client. */
const FOREST_FOX_SPEED = 1.5;
function clockTrot() {
  const loop = forestTrail.reduce(
    (sum, p, i) =>
      sum +
      Math.hypot(
        p.x - forestTrail[(i + 1) % forestTrail.length]!.x,
        p.z - forestTrail[(i + 1) % forestTrail.length]!.z,
      ),
    0,
  );
  return (
    (((Date.now() / 1000) * FOREST_FOX_SPEED) % loop + loop) % loop
  );
}
function FoxPatrol({ onNotice }: { onNotice?: () => void }) {
  const { model } = useFoxModel();
  const group = useRef<T.Group>(null),
    surveying = useRef(0),
    mode = useRef<"walk" | "survey">("walk"),
    trot = useRef(clockTrot()),
    foxPet = useFoxPet();
  const click = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 5) return;
    e.stopPropagation();
    if (!model?.survey) return;
    model.walk?.fadeOut(0.2);
    model.survey.reset().fadeIn(0.2).play();
    mode.current = "survey";
    surveying.current = 2.6;
    if (foxPet.pet(e)) foxPet.emoteAge.current = 0;
    onNotice?.();
  };
  useFrame(({ clock }, rawDt) => {
    if (!group.current) return;
    const dt = Math.min(rawDt, 0.05);
    foxPet.emoteAge.current += dt;
    const surveyingNow = mode.current === "survey";
    if (surveyingNow) {
      surveying.current -= dt;
      if (surveying.current <= 0 && model?.survey) {
        model.survey.fadeOut(0.25);
        model.walk?.reset().fadeIn(0.25).play();
        mode.current = "walk";
      }
    }
    // Being talked to, or simply met: stand still, face the player.
    const talking = dialogue.talkingWith("fox");
    const met = playerAgent();
    const meeting =
      !talking &&
      !surveyingNow &&
      !!met &&
      Math.hypot(
        met.x - group.current.position.x,
        met.z - group.current.position.z,
      ) < 4;
    if (talking || meeting) {
      if (mode.current !== "survey" && model?.survey) {
        model.walk?.fadeOut(0.2);
        model.survey.reset().fadeIn(0.2).play();
        mode.current = "survey";
      }
      surveying.current = 1; // keep refreshing while the chat lasts
      const p = playerAgent();
      if (p)
        group.current.rotation.y = Math.atan2(
          p.x - group.current.position.x,
          p.z - group.current.position.z,
        );
    } else {
      // Catch up to the wall-clock position after any pause instead of
      // teleporting ahead (a short faster trot closes the gap).
      const clockAt = clockTrot(),
        loop = forestTrail.reduce(
          (sum, pt, i) =>
            sum +
            Math.hypot(
              pt.x - forestTrail[(i + 1) % forestTrail.length]!.x,
              pt.z - forestTrail[(i + 1) % forestTrail.length]!.z,
            ),
          0,
        );
      let deficit = (clockAt - trot.current) % loop;
      if (deficit < -loop / 2) deficit += loop;
      if (deficit > loop / 2) deficit -= loop;
      const speed =
        FOREST_FOX_SPEED * (1 + Math.min(Math.max(deficit, 0) / 4, 2.5));
      trot.current = (trot.current + speed * dt) % loop;
      const here = walkTrail(forestTrail, trot.current);
      group.current.position.set(here.p.x, 0.15, here.p.z);
      if (!surveyingNow) {
        const next = walkTrail(forestTrail, trot.current + 0.6);
        group.current.rotation.y = Math.atan2(
          next.p.x - here.p.x,
          next.p.z - here.p.z,
        );
      }
    }
    reportAgent("fox", {
      kind: "fox",
      x: group.current.position.x,
      z: group.current.position.z,
      name: "小狐狸",
      yaw: group.current.rotation.y,
      action: mode?.current ?? "",
    });
    model?.mixer.update(Math.min(dt, 0.1));
  });
  useEffect(() => () => dropAgent("fox"), []);
  return (
    <group ref={group} onClick={click}>
      {model ? (
        <>
          <primitive object={model.scene} />
          <FoxEyes model={model.scene} />
          {foxPet.emote}
        </>
      ) : (
        <group>
          <FoxEyes />
          {foxPet.emote}
          <Box position={[0, 1, 0]} scale={[1.1, 1.3, 2.7]} color="#b87944" />
          <Box position={[0, 1.6, 1.6]} scale={[0.9, 0.9, 1.1]} color="#d89456" />
        </group>
      )}
    </group>
  );
}
function Forest(props: SceneProps) {
  const { world, tool, onPlace, onExit, low } = props,
    season = world.environment.season,
    weather = world.environment.weather ?? "sun";
  const place = usePlacer(tool, onPlace);
  const ground = useMemo(() => {
    const c = new T.Color(palettes[season].ground);
    return c.lerp(new T.Color("#657d5f"), 0.4);
  }, [season]);
  return (
    <>
      <SkyRig
        hour={world.environment.hour}
        low={low}
        sky={{ day: "#b9cdb2", night: "#152a2e" }}
        fog={[110, 330]}
        hemi="#54684f"
        stars={1400}
        shadowHalf={52}
        weather={weather}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow onClick={place}>
        <planeGeometry args={[94, 82]} />
        <meshStandardMaterial color={ground} />
      </mesh>
      <Box position={[0, -0.65, 0]} scale={[94, 1.2, 82]} color="#7d8a6e" />
      <TrailStones />
      <Mushrooms />
      <Stumps />
      <GrassField
        low={low}
        tint={grassTint(ground.getStyle())}
        count={60}
        spread={[86, 74]}
        seed={731}
        scale={0.85}
      />
      <Plants
        entities={world.entities}
        season={season}
        low={low}
        height={() => 0}
        wind={weatherWind[weather]}
      />
      <FoxPatrol />
      <group position={[0, 0, 34]} onClick={exitClick(tool, onExit)}>
        {[-2.6, 2.6].map((x) => (
          <Box
            key={x}
            position={[x, 1.6, 0]}
            scale={[0.3, 3.2, 0.3]}
            color="#8c7254"
          />
        ))}
        <Box position={[0, 2.85, 0]} scale={[6, 1, 0.2]} color="#a8814f" />
        <Box position={[0, 3.5, 0]} scale={[6.4, 0.22, 0.5]} color="#7d6a4e" />
      </group>
      <Residents scene="forest" entities={world.entities} />
      <Collectibles scene="forest" seed={world.seed} />
      {props.walk && props.avatar && props.onGate && (
        <PlayerRig scene="forest" avatar={props.avatar} entities={world.entities} onGate={props.onGate} />
      )}
      <SceneFrame reset={props.reset} position={[60, 52, 80]} max={320} />
    </>
  );
}
export default function ForestScene(props: SceneProps) {
  return (
    <SceneCanvas low={props.low} scene="forest" position={[60, 52, 80]}>
      <Forest {...props} />
    </SceneCanvas>
  );
}
