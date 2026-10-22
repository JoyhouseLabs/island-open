import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as T from "three";
import {
  buildingDiagnostics as probe,
  measuringBuilding,
} from "../building/diagnostics";
import { playerBody } from "@island/contracts";
import type {
  IslandEntity,
  PlaceConfig,
  SubSceneId,
  WorldSnapshot,
} from "@island/contracts";
import {
  readCells,
  deviceBox,
  entityCollisionBoxes,
  moveBody,
  safeBody,
  voxelBoxes,
  bodyBox,
  landingY,
  mantleBoost,
  pushOut,
  supportY,
  type Obstacle,
} from "@island/world-core";
import { specFor } from "../places/specs";
import { AvatarMesh, type AvatarAnim } from "./AvatarModel";
import {
  moveBus,
  cameraMode,
  useFirstPerson,
  playerIntent,
  type AvatarConfig,
} from "./avatar";
import { gatePrompt } from "./gatePrompt";
import { gateLabel, sceneTransition } from "./SceneTransition";
import { playerAction } from "./actions";
import { obstaclesFor } from "./obstacles";
import { reportAgent, dropAgent, nearestAgent } from "../animals/registry";
import { emitGrowth } from "../progress/store";
import { proximity } from "../dialogue/proximity";
import { presence } from "../presence/client";

const WALK_SPEED = 6;
const SPRINT_MULT = 1.7;
const GRAVITY = -22;
const JUMP_V = 7.2;
const PLAYER_R = playerBody.radius;
const walkKeys = new Set([
  "w",
  "a",
  "s",
  "d",
  "arrowup",
  "arrowdown",
  "arrowleft",
  "arrowright",
  "shift",
]);

function lerpAngle(from: number, to: number, t: number) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return from + d * t;
}

/**
 * The walkable resident: WASD or tap-to-move inside one scene, a follow
 * camera, and gates that carry the walk between island and rooms.
 */
export function PlayerRig({
  scene,
  avatar,
  entities,
  place,
  onGate,
  world,
}: {
  /** Built-in scene, or "place-<id>" for a published place. */
  scene: "island" | SubSceneId | (string & {});
  avatar: AvatarConfig;
  world?: WorldSnapshot;
  entities: IslandEntity[];
  /** Present when the scene is a published place (props collide too). */
  place?: PlaceConfig;
  onGate: (dest: "island" | SubSceneId) => void;
}) {
  const spec = specFor(scene);
  const obstacles = useMemo<Obstacle[]>(
    () =>
      obstaclesFor(
        scene,
        entities.filter(
          (e) => !world?.entityPlacements?.some((p) => p.entityId === e.id),
        ),
        place,
      ),
    [scene, entities, place, world?.entityPlacements],
  );
  const cells = useMemo(
    () => readCells(world?.construction),
    [world?.construction],
  );
  const boxes = useMemo(
    () => [
      ...(world?.devices ?? []).flatMap((d) => {
        const b = deviceBox(d);
        return b ? [b] : [];
      }),
      ...(world?.entityPlacements ?? []).flatMap((p) => {
        const e = entities.find((e) => e.id === p.entityId);
        return e ? entityCollisionBoxes(e, p.y) : [];
      }),
    ],
    [world?.devices, world?.entityPlacements, entities],
  );
  const raisedSeats = useMemo(
    () =>
      (world?.entityPlacements ?? []).flatMap((p) => {
        const e = entities.find(
          (e) => e.id === p.entityId && e.kind === "bench",
        );
        return e ? [{ x: e.x, z: e.z, standY: p.y + 1.575 }] : [];
      }),
    [world?.entityPlacements, entities],
  );
  const group = useRef<T.Group>(null),
    marker = useRef<T.Mesh>(null),
    gateRing = useRef<T.Mesh>(null);
  const camera = useThree((s) => s.camera),
    gl = useThree((s) => s.gl),
    controls = useThree((s) => s.controls) as
      | (T.EventDispatcher & {
          target: T.Vector3;
          update: () => void;
          enabled?: boolean;
        })
      | null;
  const firstPerson = useFirstPerson();
  // The prompt chip and the Space key share this entry point.
  gatePrompt.onEnter = () => {
    const near = gatePrompt.near;
    if (!near || proximity.speaker) return;
    emitGrowth({ type: "walk.gate_crossed", detail: String(near.dest) });
    sceneTransition.go(gateLabel(near.dest), () => onGate(near.dest));
  };
  const pos = useRef(
      new T.Vector3(
        spec.spawn.x,
        spec.height(spec.spawn.x, spec.spawn.z),
        spec.spawn.z,
      ),
    ),
    yaw = useRef(Math.PI),
    target = useRef<{ x: number; z: number } | null>(null),
    keys = useRef(new Set<string>()),
    anim = useRef<AvatarAnim>({ phase: 0, moving: false }),
    vy = useRef(0),
    grounded = useRef(true),
    wantJump = useRef(false),
    mantled = useRef(false),
    pose = useRef<{ kind: "wave" | "spin"; until: number } | null>(null),
    sitting = useRef(false),
    fpYaw = useRef(Math.PI),
    fpPitch = useRef(-0.04);
  const scratch = useMemo(
    () => ({
      dir: new T.Vector3(),
      fwd: new T.Vector3(),
      right: new T.Vector3(),
      up: new T.Vector3(0, 1, 0),
      desired: new T.Vector3(),
      prevTarget: new T.Vector3(),
      delta: new T.Vector3(),
      introDir: new T.Vector3(),
      eye: new T.Euler(0, 0, 0, "YXZ"),
    }),
    [],
  );
  const intro = useRef({ start: -1, from: 0 });
  useEffect(() => {
    const p = safeBody(pos.current, cells, boxes);
    pos.current.set(p.x, p.y, p.z);
  }, [cells, boxes]);
  useEffect(() => {
    const reset = () => {
      pos.current.set(
        spec.spawn.x,
        spec.height(spec.spawn.x, spec.spawn.z),
        spec.spawn.z,
      );
      target.current = null;
      vy.current = 0;
    };
    window.addEventListener("island-safe-entry", reset);
    return () => window.removeEventListener("island-safe-entry", reset);
  }, [spec]);

  // First person: entering syncs the view with where the avatar faces;
  // leaving re-centres the orbit controls on the player so the follow
  // camera resumes gracefully.
  useEffect(() => {
    if (firstPerson) {
      fpYaw.current = yaw.current;
      fpPitch.current = -0.04;
    } else if (controls?.target) {
      controls.target.set(pos.current.x, pos.current.y + 1.3, pos.current.z);
      if (controls.enabled === false) controls.enabled = true;
    }
  }, [firstPerson, controls]);

  // Drag anywhere on the canvas to look around while in first person
  // (the orbit controls are disabled, so the drag is all ours).
  useEffect(() => {
    if (!firstPerson) return;
    const el = gl.domElement;
    let dragging = false,
      lastX = 0,
      lastY = 0;
    const down = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      fpYaw.current -= (e.clientX - lastX) * 0.0045;
      fpPitch.current = T.MathUtils.clamp(
        fpPitch.current - (e.clientY - lastY) * 0.0035,
        -0.7,
        0.6,
      );
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const up = () => {
      dragging = false;
    };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (controls && controls.enabled === false) controls.enabled = true;
    };
  }, [firstPerson, gl, controls]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      const k = e.key.toLowerCase();
      if (walkKeys.has(k)) {
        keys.current.add(k);
        if (e.key.startsWith("Arrow")) e.preventDefault();
        return;
      }
      // Space jumps — unless someone nearby wants to talk (TalkPrompt wins).
      if (k === " ") {
        if (!e.repeat) wantJump.current = true;
        return;
      }
      if (k === "1") playerAction.trigger("wave");
      else if (k === "2") playerAction.trigger("sit");
      else if (k === "3") playerAction.trigger("spin");
      else if (k === "v" && !e.repeat && playerIntent.active)
        cameraMode.toggle();
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const clear = () => keys.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
      dropAgent("player");
      proximity.setSpeaker(null);
      // One final standing frame: visitors keep seeing the avatar at rest
      // instead of it blinking out when walk mode toggles off.
      presence.pose(pos.current.x, pos.current.z, yaw.current, false);
    };
  }, []);

  useFrame(({ clock }, rawDt) => {
    if (!group.current) return;
    const dt = Math.min(rawDt, 0.05);
    const frameStart = { x: pos.current.x, y: pos.current.y, z: pos.current.z };

    const clicked = moveBus.take();
    if (clicked && spec.walkable(clicked.x, clicked.z))
      target.current = clicked;

    // Gates never teleport on their own: standing in a doorway only shows
    // the entry prompt (and Space steps through, handled further down).
    let gateNear: (typeof spec.gates)[number] | null = null;
    for (const gate of spec.gates)
      if (
        Math.hypot(pos.current.x - gate.x, pos.current.z - gate.z) < gate.radius
      ) {
        gateNear = gate;
        break;
      }

    // Keyboard direction is relative to where the camera looks.
    let vx = 0,
      vz = 0;
    const k = keys.current;
    const kx =
      (k.has("d") || k.has("arrowright") ? 1 : 0) -
      (k.has("a") || k.has("arrowleft") ? 1 : 0);
    const kz =
      (k.has("s") || k.has("arrowdown") ? 1 : 0) -
      (k.has("w") || k.has("arrowup") ? 1 : 0);
    if (kx || kz) {
      target.current = null;
      camera.getWorldDirection(scratch.fwd);
      scratch.fwd.y = 0;
      scratch.fwd.normalize();
      // fwd x up points to the camera's screen-right.
      scratch.right.crossVectors(scratch.fwd, scratch.up);
      scratch.dir
        .set(0, 0, 0)
        .addScaledVector(scratch.fwd, -kz)
        .addScaledVector(scratch.right, kx);
      scratch.dir.normalize();
      vx = scratch.dir.x;
      vz = scratch.dir.z;
    } else if (target.current) {
      const dx = target.current.x - pos.current.x,
        dz = target.current.z - pos.current.z,
        dist = Math.hypot(dx, dz);
      if (dist < 0.3) {
        target.current = null;
      } else {
        vx = dx / dist;
        vz = dz / dist;
      }
    }

    // Actions from the bus: panel buttons, number keys, the mobile jump.
    for (;;) {
      const action = playerAction.take();
      if (!action) break;
      if (action === "jump") wantJump.current = true;
      else if (action === "sit") {
        if (sitting.current) sitting.current = false;
        else {
          const seat = raisedSeats.find(
            (s) =>
              Math.hypot(s.x - pos.current.x, s.z - pos.current.z) < 1.8 &&
              pos.current.z >= s.z &&
              Math.abs(s.standY - pos.current.y) <= 1.8,
          );
          if (seat) {
            // Lift then approach, checking both segments; never sit through a
            // wall, a backrest or a low ceiling, or teleport up a tall platform.
            const lift = moveBody(
              pos.current,
              { x: 0, y: seat.standY - pos.current.y, z: 0 },
              cells,
              boxes,
            );
            const approach = moveBody(
              lift.position,
              {
                x: seat.x - lift.position.x,
                y: 0,
                z: seat.z - lift.position.z,
              },
              cells,
              boxes,
            );
            if (
              Math.abs(approach.position.x - seat.x) < 0.01 &&
              Math.abs(approach.position.z - seat.z) < 0.01 &&
              Math.abs(approach.position.y - seat.standY) < 0.01
            ) {
              pos.current.set(seat.x, seat.standY, seat.z);
              Object.assign(frameStart, approach.position);
              target.current = null;
              sitting.current = true;
              grounded.current = true;
              vy.current = 0;
              yaw.current = 0;
            }
            continue;
          }
          // Sit on the nearest bench when one is close enough.
          let best: Obstacle | null = null,
            bestD = Infinity;
          for (const o of obstacles)
            if (o.standY !== undefined) {
              const d = Math.hypot(o.x - pos.current.x, o.z - pos.current.z);
              if (d < 1.8 && d < bestD) {
                best = o;
                bestD = d;
              }
            }
          if (best) {
            pos.current.x = best.x;
            pos.current.z = best.z;
            pos.current.y = best.standY ?? 0.45;
          }
          sitting.current = true;
          grounded.current = true;
          vy.current = 0;
        }
      } else
        pose.current = {
          kind: action,
          until: clock.elapsedTime + (action === "wave" ? 2.4 : 1.6),
        };
    }
    // Any move input stands you back up.
    if (sitting.current && (kx || kz || target.current))
      sitting.current = false;
    if (sitting.current) {
      vx = 0;
      vz = 0;
      target.current = null;
    }

    const speed = WALK_SPEED * (k.has("shift") ? SPRINT_MULT : 1);
    let moved = false;
    if (vx || vz) {
      const prevX = pos.current.x,
        prevZ = pos.current.z;
      const nx = pos.current.x + vx * speed * dt,
        nz = pos.current.z + vz * speed * dt;
      if (spec.walkable(nx, nz)) {
        pos.current.x = nx;
        pos.current.z = nz;
        moved = true;
      } else if (spec.walkable(nx, pos.current.z)) {
        pos.current.x = nx;
        moved = true;
      } else if (spec.walkable(pos.current.x, nz)) {
        pos.current.z = nz;
        moved = true;
      } else target.current = null;
      if (moved) {
        // Push out of solid things; standable tops stop blocking once the
        // player is at their surface, so a fall can land on a bench.
        const pushed = pushOut(
          pos.current.x,
          pos.current.z,
          pos.current.y,
          obstacles,
          PLAYER_R,
        );
        pos.current.x = pushed.x;
        pos.current.z = pushed.z;
        if (!spec.walkable(pos.current.x, pos.current.z)) {
          pos.current.x = prevX;
          pos.current.z = prevZ;
        }
        yaw.current = lerpAngle(
          yaw.current,
          Math.atan2(vx, vz),
          1 - Math.exp(-dt * 12),
        );
      }
    }
    if (!moved) target.current = null;

    // Vertical: jump, gravity, standing on things, and a climb assist.
    const landAt = () =>
      supportY(
        pos.current.x,
        pos.current.z,
        spec.height(pos.current.x, pos.current.z),
        obstacles,
        pos.current.y,
      );
    if (wantJump.current) {
      wantJump.current = false;
      // Standing in a doorway: Space steps through it (a conversation
      // partner nearby still takes priority). gatePrompt.enter() counts
      // the deed and runs the veil transition, same as the chip.
      if (gateNear && !proximity.speaker) {
        gatePrompt.enter();
      } else if (grounded.current && !proximity.speaker && !sitting.current) {
        vy.current = JUMP_V;
        grounded.current = false;
        mantled.current = false;
      }
    }
    const foot = bodyBox(pos.current);
    foot.min.y = pos.current.y - 0.2;
    foot.max.y = pos.current.y + 0.05;
    const tops = voxelBoxes(cells, foot)
      .concat(boxes)
      .filter(
        (b) =>
          b.max.y <= pos.current.y + 0.05 &&
          b.max.x > foot.min.x &&
          b.min.x < foot.max.x &&
          b.max.z > foot.min.z &&
          b.min.z < foot.max.z,
      );
    const ground = Math.max(landAt(), ...tops.map((b) => b.max.y));
    if (grounded.current) {
      mantled.current = false;
      if (ground < pos.current.y - 0.25) {
        // Walked off an edge: let gravity take over.
        grounded.current = false;
        vy.current = 0;
      } else pos.current.y = ground;
    }
    if (!grounded.current) {
      // Almost reaching a crate or platform edge gives one helping push.
      const boost = mantleBoost(
        vy.current,
        pos.current.x,
        pos.current.z,
        pos.current.y,
        obstacles,
        mantled.current,
      );
      vy.current = boost.vy;
      mantled.current = boost.mantled;
      vy.current += GRAVITY * dt;
      pos.current.y += vy.current * dt;
      // Falling uses the generous rim: near the seat still settles on it.
      const land = landingY(
        pos.current.x,
        pos.current.z,
        spec.height(pos.current.x, pos.current.z),
        obstacles,
        pos.current.y,
      );
      if (vy.current <= 0 && pos.current.y <= land) {
        pos.current.y = land;
        vy.current = 0;
        grounded.current = true;
      }
    }

    const motion = moveBody(
      frameStart,
      {
        x: pos.current.x - frameStart.x,
        y: pos.current.y - frameStart.y,
        z: pos.current.z - frameStart.z,
      },
      cells,
      boxes,
    );
    if (motion.blocked.y) {
      if (pos.current.y < frameStart.y) grounded.current = true;
      vy.current = 0;
    }
    pos.current.set(motion.position.x, motion.position.y, motion.position.z);
    if (measuringBuilding)
      probe.player = { x: pos.current.x, y: pos.current.y, z: pos.current.z };
    anim.current.moving = moved && !sitting.current;
    anim.current.airborne = !grounded.current;
    anim.current.phase += dt * (moved ? (k.has("shift") ? 2 : 1.2) : 1);
    if (pose.current && clock.elapsedTime > pose.current.until)
      pose.current = null;
    anim.current.action = sitting.current
      ? "sit"
      : (pose.current?.kind ?? undefined);
    group.current.position.copy(pos.current);
    group.current.rotation.y = yaw.current;
    reportAgent("player", {
      kind: "player",
      x: pos.current.x,
      z: pos.current.z,
    });
    // Same-room players ride along whenever walking is on (the presence
    // singleton drops the update when nobody is connected).
    presence.pose(pos.current.x, pos.current.z, yaw.current, moved);
    // The island is a big place with a big fox — talk range widens there.
    const near = nearestAgent(
      pos.current.x,
      pos.current.z,
      scene === "island" ? 7 : 4.6,
      "player",
    );
    proximity.setSpeaker(near);

    if (marker.current) {
      marker.current.visible = !!target.current;
      if (target.current) {
        marker.current.position.set(
          target.current.x,
          spec.height(target.current.x, target.current.z) + 0.15,
          target.current.z,
        );
        marker.current.rotation.z += dt * 2;
      }
    }

    // Camera: first person rides the avatar's eyes; otherwise the follow
    // rig drags the orbit target along with the resident.
    if (firstPerson) {
      group.current.visible = false;
      if (controls && controls.enabled !== false) controls.enabled = false;
      camera.position.set(pos.current.x, pos.current.y + 1.55, pos.current.z);
      scratch.eye.set(fpPitch.current, fpYaw.current, 0);
      camera.quaternion.setFromEuler(scratch.eye);
    } else if (controls?.target) {
      group.current.visible = true;
      if (controls && controls.enabled !== true) controls.enabled = true;
      scratch.desired.set(pos.current.x, pos.current.y + 1.3, pos.current.z);
      scratch.prevTarget.copy(controls.target);
      controls.target.lerp(scratch.desired, 1 - Math.exp(-dt * 5));
      camera.position.add(
        scratch.delta.copy(controls.target).sub(scratch.prevTarget),
      );
      // Starting to walk eases the camera in from overview to shoulder view.
      const min =
        (controls as unknown as { minDistance?: number }).minDistance ?? 8;
      const want = Math.max(14, min);
      if (intro.current.start < 0) {
        intro.current.start = clock.elapsedTime;
        intro.current.from = camera.position.distanceTo(controls.target);
      }
      const k = Math.min(1, (clock.elapsedTime - intro.current.start) / 1.1);
      if (k < 1 && intro.current.from > want * 1.05) {
        const eased = 1 - Math.pow(1 - k, 3);
        const dist = intro.current.from + (want - intro.current.from) * eased;
        scratch.introDir.copy(camera.position).sub(controls.target);
        const len = scratch.introDir.length() || 1;
        camera.position
          .copy(controls.target)
          .addScaledVector(scratch.introDir.multiplyScalar(dist / len), 1);
      }
      controls.update();
    }

    // Report the doorway and mark it with a soft spinning ring.
    gatePrompt.report(
      gateNear
        ? {
            dest: gateNear.dest,
            label: gateLabel(gateNear.dest),
            x: gateNear.x,
            z: gateNear.z,
          }
        : null,
    );
    if (gateRing.current) {
      gateRing.current.visible = !!gateNear;
      if (gateNear) {
        gateRing.current.position.set(
          gateNear.x,
          spec.height(gateNear.x, gateNear.z) + 0.12,
          gateNear.z,
        );
        gateRing.current.rotation.z += dt * 1.6;
      }
    }
  });

  return (
    <>
      <group ref={group}>
        <AvatarMesh config={avatar} anim={anim.current} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
          <circleGeometry args={[0.55, 20]} />
          <meshBasicMaterial
            color={avatar.accent}
            transparent
            opacity={0.35}
            depthWrite={false}
          />
        </mesh>
      </group>
      <mesh ref={marker} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.5, 0.65, 24]} />
        <meshBasicMaterial
          color="#f2ead0"
          transparent
          opacity={0.8}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={gateRing} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[1.1, 1.35, 28]} />
        <meshBasicMaterial
          color="#e9c86a"
          transparent
          opacity={0.85}
          depthWrite={false}
        />
      </mesh>
    </>
  );
}
