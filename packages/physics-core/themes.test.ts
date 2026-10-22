import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { terrainHeightAt } from "@island/contracts";
import {
  physicalThemeSpecs,
  labTableTop,
  forestTrail,
} from "@island/world-core";
import {
  PhysicsRuntime,
  RAPIER,
  PhysicsGrab,
  createPhysicsScene,
  assertSceneTemplate,
} from "./src/index.js";
import { PhysicsRoom } from "./src/room.js";
import { sitCharacter, standCharacter } from "./src/seats.js";

describe("shared thematic scenes", () => {
  for (const spec of physicalThemeSpecs)
    it(`${spec.key} has walkable entrances, legal starter objects and immutable infrastructure`, async () => {
      const scene = createPhysicsScene(spec.key),
        runtime = await PhysicsRuntime.create(scene),
        player = runtime.createCharacter("walker");
      try {
        for (let i = 0; i < 40; i++)
          runtime.step((dt) => player.step({ x: 0, z: 0, jump: false }, dt));
        expect(player.grounded).toBe(true);
        expect(player.position().y).toBeCloseTo(0.87, 1);
        player.teleport({ x: 0, y: 0.87, z: spec.gate + 2 });
        for (let i = 0; i < 100; i++)
          runtime.step((dt) => player.step({ x: 0, z: -1, jump: false }, dt));
        expect(player.position().z).toBeLessThan(spec.gate - 3);
        for (const object of scene.objects.filter(
          (o) => !o.infrastructureKey,
        )) {
          const definition = scene.definitions.find(
            (d) => d.id === object.definitionId,
          )!;
          expect(
            () => runtime.validatePlacement(object, definition, object.id),
            `${spec.key} ${object.id}`,
          ).not.toThrow();
        }
        for (const object of scene.objects.filter(
          (o) => scene.definitions.find((d) => d.id === o.definitionId)?.seat,
        )) {
          player.teleport({
            x: object.position.x,
            y: 3,
            z: object.position.z + 1.9,
          });
          for (let i = 0; i < 90; i++)
            runtime.step((dt) => player.step({ x: 0, z: 0, jump: false }, dt));
          const claim = sitCharacter(runtime, player, object.id);
          expect(claim.objectId).toBe(object.id);
          standCharacter(runtime, player, claim);
          expect(player.position().y).toBeGreaterThan(0.8);
        }
        expect(runtime.world.colliders.len()).toBeLessThan(600);
        expect(() => assertSceneTemplate(scene)).not.toThrow();
        const invalid = structuredClone(scene);
        invalid.objects.find((o) => o.infrastructureKey)!.position.x++;
        expect(() => assertSceneTemplate(invalid)).toThrow("基础设施");
        const copy = await PhysicsRuntime.create(scene);
        copy.dispose();
      } finally {
        runtime.dispose();
      }
    });
  it("walks across the pond arch, onto the beach dock and up laboratory steps using shared character limits", async () => {
    for (const key of ["pond", "beach", "lab"] as const) {
      const runtime = await PhysicsRuntime.create(createPhysicsScene(key)),
        player = runtime.createCharacter("walker");
      const walk = (x: number, z: number, steps: number) => {
        for (let i = 0; i < steps; i++) {
          const at = player.position(),
            l = Math.hypot(x - at.x, z - at.z);
          if (l < 0.15) return;
          runtime.step((dt) =>
            player.step(
              { x: (x - at.x) / l, z: (z - at.z) / l, jump: false },
              dt,
            ),
          );
        }
      };
      try {
        if (key === "pond") {
          player.teleport({ x: -26, y: 0.87, z: -6 });
          walk(0, -6, 430);
          expect(player.position().x).toBeGreaterThan(-0.2);
          expect(player.position().y).toBeGreaterThan(2.3);
          walk(26, -6, 430);
          expect(player.position().x).toBeGreaterThan(25.8);
          expect(player.position().y).toBeCloseTo(0.87, 1);
        } else if (key === "beach") {
          player.teleport({ x: 3, y: 0.87, z: -4 });
          walk(3, -27, 400);
          expect(player.position().z).toBeLessThan(-26.8);
          expect(player.position().y).toBeCloseTo(0.93 + 0.87, 1);
          expect(
            terrainHeightAt(runtime.scene.terrain[0]!, 0, -30),
          ).toBeUndefined();
          expect(
            runtime.world.castRay(
              new RAPIER.Ray({ x: 0, y: 5, z: -30 }, { x: 0, y: -1, z: 0 }),
              20,
              true,
            ),
          ).toBeNull();
        } else {
          player.teleport({ x: 0, y: 0.87, z: -16 });
          walk(0, -21, 170);
          expect(player.position().z).toBeLessThan(-20.8);
          expect(player.position().y).toBeCloseTo(labTableTop + 0.87, 1);
        }
      } finally {
        runtime.dispose();
      }
    }
  });
  it("keeps the forest loop passable through the actual trees", async () => {
    const runtime = await PhysicsRuntime.create(createPhysicsScene("forest")),
      player = runtime.createCharacter("hiker");
    try {
      player.teleport({ ...forestTrail[0]!, y: 0.87 });
      for (const target of [...forestTrail.slice(1), forestTrail[0]!]) {
        for (let i = 0; i < 500; i++) {
          const at = player.position(),
            l = Math.hypot(at.x - target.x, at.z - target.z);
          if (l < 0.2) break;
          runtime.step((dt) =>
            player.step(
              {
                x: (target.x - at.x) / l,
                z: (target.z - at.z) / l,
                jump: false,
              },
              dt,
            ),
          );
        }
        expect(
          Math.hypot(
            player.position().x - target.x,
            player.position().z - target.z,
          ),
        ).toBeLessThan(0.3);
      }
    } finally {
      runtime.dispose();
    }
  });
  it("supports laboratory bottles, allows them to fall and restores the settled checkpoint", async () => {
    const scene = createPhysicsScene("lab", randomUUID),
      room = await PhysicsRoom.create(scene, randomUUID()),
      bottles = scene.objects.filter((o) =>
        o.definitionId.startsWith("core:sample-bottle"),
      );
    try {
      for (let i = 0; i < 180; i++) room.step();
      for (const bottle of bottles)
        expect(room.runtime.state(bottle.id).position.y).toBeCloseTo(
          labTableTop,
          1,
        );
      const bottle = bottles[0]!;
      const player = room.runtime.createCharacter("scientist");
      player.teleport({
        x: bottle.position.x,
        y: labTableTop + 0.87,
        z: bottle.position.z + 1,
      });
      for (let i = 0; i < 30; i++)
        room.runtime.step((dt) => player.step({ x: 0, z: 0, jump: false }, dt));
      const grab = new PhysicsGrab(room.runtime.world, player);
      grab.take(room.runtime.bodies.get(bottle.id)!);
      expect(grab.body?.handle).toBe(
        room.runtime.bodies.get(bottle.id)!.handle,
      );
      grab.release();
      room.runtime.bodies
        .get(bottle.id)!
        .setTranslation({ x: -26, y: 4, z: 0 }, true);
      for (let i = 0; i < 900; i++) room.step();
      // The tall bottle may tip naturally; its origin need not remain at its original bottom.
      expect(room.runtime.state(bottle.id).position.y).toBeGreaterThan(-0.05);
      expect(room.runtime.state(bottle.id).position.y).toBeLessThan(0.6);
      expect(
        Math.hypot(
          ...Object.values(room.runtime.bodies.get(bottle.id)!.linvel()),
        ),
      ).toBeLessThan(0.05);
      const restored = await PhysicsRoom.create(
        scene,
        randomUUID(),
        1,
        room.checkpoint(1),
      );
      try {
        expect(restored.runtime.state(bottle.id).position).toEqual(
          room.runtime.state(bottle.id).position,
        );
      } finally {
        restored.dispose();
      }
    } finally {
      room.dispose();
    }
  });
});
