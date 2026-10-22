import { describe, it, expect } from "vitest";
import {
  wildIdentity,
  wildEncounters,
  chunkKey,
  type WildSpecies,
} from "./src/wilderness";
import {
  ExplorationJournal,
  blankExploration,
  packPosition,
  unpackPosition,
} from "../../apps/web/src/wilderness/journal";
import {
  explorationStateSchema,
  type ExplorationRecord,
  type SaveExploration,
} from "@island/contracts";
function storage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
  };
}
function server() {
  let record: ExplorationRecord = {
    revision: 0,
    state: null,
    mutationId: null,
  };
  return {
    read: async () => structuredClone(record),
    save: async (r: SaveExploration) => {
      if (r.mutationId === record.mutationId) return structuredClone(record);
      if (r.revision !== record.revision) throw { status: 409 };
      record = {
        revision: record.revision + 1,
        state: structuredClone(r.state),
        mutationId: r.mutationId,
      };
      return structuredClone(record);
    },
  };
}
describe("wildlife and exploration journal", () => {
  it("generates sparse stable identities and all encounter kinds", () => {
    const kinds = new Set<WildSpecies>(),
      ids = new Set<string>();
    for (let x = -10; x <= 10; x++)
      for (let z = -10; z <= 10; z++) {
        const a = wildEncounters(717, { x, z });
        expect(a).toEqual(wildEncounters(717, { x, z }));
        expect(a.length).toBeLessThanOrEqual(3);
        for (const e of a) {
          expect(ids.has(e.id)).toBe(false);
          ids.add(e.id);
          kinds.add(e.kind);
          expect(chunkKey(e.chunk)).toBe(`${x},${z}`);
        }
      }
    expect([...kinds].sort()).toEqual([
      "nest",
      "peacock",
      "pterosaur",
      "raptor",
    ]);
    expect(wildEncounters(717, { x: 0, z: 0 })).not.toEqual(
      wildEncounters(718, { x: 0, z: 0 }),
    );
  });
  it("roundtrips negative positions and rejects unknown versions and oversized records", () => {
    const state = blankExploration(717);
    state.position = packPosition(-96.5, 201.2);
    expect(unpackPosition(state)).toEqual({ x: -96.5, z: 201.2 });
    expect(
      explorationStateSchema.safeParse({ ...state, generatorVersion: 100 })
        .success,
    ).toBe(false);
    expect(
      explorationStateSchema.safeParse({
        ...state,
        explored: Array(257).fill({ x: 0, z: 0 }),
      }).success,
    ).toBe(false);
  });
  it("restores local position and discoveries without crossing account/world keys", async () => {
    const disk = storage(),
      a = new ExplorationJournal("alice:one", 717, disk);
    await a.load();
    a.update({
      ...a.state,
      position: packPosition(-123, 55),
      discoveries: ["wild2:0:0:0:raptor"],
    });
    const restored = new ExplorationJournal("alice:one", 717, disk);
    await restored.load();
    expect(restored.state).toEqual(a.state);
    expect(
      new ExplorationJournal("bob:one", 717, disk).state.discoveries,
    ).toEqual([]);
    expect(
      new ExplorationJournal("alice:two", 717, disk).state.discoveries,
    ).toEqual([]);
  });
  it("recovers a lost response and preserves edits made during the request", async () => {
    const disk = storage(),
      remote = server();
    let lose = true;
    const transport = {
      read: remote.read,
      save: async (r: SaveExploration) => {
        const result = await remote.save(r);
        if (lose) {
          lose = false;
          throw Error("lost response");
        }
        return result;
      },
    };
    const a = new ExplorationJournal("one", 717, disk, transport);
    await a.load();
    a.update({ ...a.state, position: packPosition(5, 6) });
    await a.flush();
    expect(a.status).toBe("offline");
    a.update({ ...a.state, position: packPosition(7, 8) });
    const restored = new ExplorationJournal("one", 717, disk, transport);
    await restored.load();
    expect(restored.status).toBe("dirty");
    await restored.flush();
    expect((await remote.read()).state?.position).toEqual(packPosition(7, 8));
  });
  it("detects concurrent edits and keeps a backup before explicit resolution", async () => {
    const remote = server(),
      disk = storage();
    const a = new ExplorationJournal("a", 717, disk, remote),
      b = new ExplorationJournal("b", 717, disk, remote);
    await a.load();
    await b.load();
    a.update({ ...a.state, position: packPosition(1, 2) });
    await a.flush();
    b.update({ ...b.state, position: packPosition(3, 4) });
    await b.flush();
    expect(b.status).toBe("conflict");
    expect(unpackPosition(b.state)).toEqual({ x: 3, z: 4 });
    await b.resolve("cloud");
    expect(unpackPosition(b.state)).toEqual({ x: 1, z: 2 });
    expect(disk.getItem("b:backup")).toContain('"x":3');
  });
  it("reports local storage failure without stopping play", async () => {
    const a = new ExplorationJournal("a", 717, {
      getItem: () => null,
      setItem: () => {
        throw Error("quota");
      },
    });
    await a.load();
    a.update({ ...a.state, position: packPosition(5, 6) });
    expect(a.storageFailed).toBe(true);
  });
  it("loads once and flushes newer movement after an in-flight save", async () => {
    const remote = server(),
      disk = storage();
    let reads = 0,
      release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let first = true;
    const a = new ExplorationJournal("one", 717, disk, {
      read: async () => {
        reads++;
        return remote.read();
      },
      save: async (r) => {
        if (first) {
          first = false;
          await gate;
        }
        return remote.save(r);
      },
    });
    await Promise.all([a.load(), a.load()]);
    expect(reads).toBe(1);
    a.update({ ...a.state, position: packPosition(1, 2) });
    const saving = a.flush();
    a.update({ ...a.state, position: packPosition(3, 4) });
    release();
    await saving;
    expect((await remote.read()).state?.position).toEqual(packPosition(3, 4));
    expect(a.status).toBe("synced");
  });
  it("keeps the local choice when resolving a competing cloud update", async () => {
    const remote = server(),
      disk = storage(),
      a = new ExplorationJournal("a", 717, disk, remote),
      b = new ExplorationJournal("b", 717, disk, remote);
    await Promise.all([a.load(), b.load()]);
    a.update({ ...a.state, position: packPosition(1, 2) });
    await a.flush();
    b.update({ ...b.state, position: packPosition(9, 10) });
    await b.flush();
    await b.resolve("local");
    expect((await remote.read()).state?.position).toEqual(packPosition(9, 10));
    expect(b.status).toBe("synced");
  });
  it("keeps display numbers unique for generated individuals and reads existing saved ids", () => {
    const numbers = new Set<string>();
    for (let x = -4; x <= 4; x++)
      for (let z = -4; z <= 4; z++)
        for (const e of wildEncounters(717, { x, z })) {
          const identity = wildIdentity(e.id)!;
          expect(identity.id).toBe(e.id);
          expect(identity.kind).toBe(e.kind);
          expect(numbers.has(identity.number)).toBe(false);
          numbers.add(identity.number);
        }
    expect(wildIdentity("wild2:-2:3:1:raptor")?.number).toBe("RAP-2-W2-S3-02");
    expect(wildIdentity("wild2:0:0:2:nest")?.number).toBe("NEST-2-E0-N0-03");
    expect(wildIdentity("unknown")).toBeNull();
  });
});

it("keeps departure blocked through a lost save response and resolves device conflicts explicitly", async () => {
  const remote = server(),
    disk = storage();
  let lose = true;
  const journal = new ExplorationJournal("departure", 717, disk, {
    read: remote.read,
    save: async (request) => {
      const result = await remote.save(request);
      if (lose) {
        lose = false;
        throw Error("lost response");
      }
      return result;
    },
  });
  await journal.load();
  journal.update({ ...journal.state, position: packPosition(50, 40) });
  await expect(journal.saveBeforeLeave()).rejects.toThrow("尚未同步");
  await journal.saveBeforeLeave();
  expect((await remote.read()).revision).toBe(1);
  const other = new ExplorationJournal("other", 717, storage(), remote);
  await other.load();
  other.update({ ...other.state, position: packPosition(51, 40) });
  await other.saveBeforeLeave();
  journal.update({ ...journal.state, position: packPosition(52, 40) });
  await expect(journal.saveBeforeLeave()).rejects.toThrow("另一台设备");
  await journal.resolve("cloud");
  await journal.saveBeforeLeave();
  expect(unpackPosition(journal.state)).toEqual({ x: 51, z: 40 });
  expect(disk.getItem("departure:backup")).toContain('"x":52');
});
