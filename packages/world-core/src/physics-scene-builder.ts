import {
  identityQuaternion,
  PHYSICS_RULES_VERSION,
  physicsSceneSchema,
  type ObjectDefinition,
  type ObjectPart,
  type PhysicsScene,
  type Vector3,
} from "@island/contracts";

/** Shared construction of canonical scene definitions, without legacy snapshot conversion. */
export class PhysicsSceneBuilder {
  readonly definitions: ObjectDefinition[] = [];
  readonly objects: PhysicsScene["objects"] = [];
  constructor(
    readonly key: string,
    private readonly namespace: string,
  ) {}
  object(
    definition: ObjectDefinition,
    position: Vector3,
    infrastructureKey?: string,
    yaw = 0,
  ) {
    if (
      !this.definitions.some(
        (d) => d.id === definition.id && d.version === definition.version,
      )
    )
      this.definitions.push(definition);
    const object = {
      id: `${this.namespace}-0000-4000-8000-${String(this.objects.length + 1).padStart(12, "0")}`,
      definitionId: definition.id,
      definitionVersion: definition.version,
      position,
      rotation: yaw
        ? { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }
        : identityQuaternion,
      ...(infrastructureKey ? { infrastructureKey } : {}),
    };
    this.objects.push(object);
    return object;
  }
  fixed(
    key: string,
    name: string,
    position: Vector3,
    parts: ObjectPart[],
    extra: Partial<
      Pick<ObjectDefinition, "material" | "abilities" | "seat" | "light">
    > = {},
    yaw = 0,
  ) {
    return this.object(
      {
        id: `core:${this.key}-${key}`,
        version: 1,
        name,
        source: "official",
        bodyType: "fixed",
        material: "wood",
        abilities: [],
        parts,
        ...extra,
      },
      position,
      key,
      yaw,
    );
  }
  build(
    name: string,
    spawn: Vector3,
    bounds: PhysicsScene["bounds"],
    terrain: PhysicsScene["terrain"],
  ): PhysicsScene {
    return physicsSceneSchema.parse({
      schemaVersion: 4,
      physicsVersion: PHYSICS_RULES_VERSION,
      id: `physics-${this.key}`,
      template: { id: `core:${this.key}`, version: 1 },
      name,
      spawn,
      bounds,
      terrain,
      definitions: this.definitions,
      objects: this.objects,
    });
  }
}
