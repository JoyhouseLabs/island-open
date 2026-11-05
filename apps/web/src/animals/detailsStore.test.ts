import { describe, expect, it } from "vitest";
import { AnimalDetailsStore, type AnimalSelection } from "./detailsStore";
const animal: AnimalSelection = { id: "pond-water", name: "水伊布", species: "vaporeon", scene: "pond", prefer: "water", pet() {} };
const message = { role: "assistant", source: "ai", text: "你好" } as const;
describe("animal details session boundaries", () => {
  it("keeps same-name animals separate by identity", () => {
    const store = new AnimalDetailsStore(); store.bind("account:one");
    store.select(animal); store.append(animal.id, message);
    store.select({ ...animal, id: "pond-other" });
    expect(store.history("pond-other")).toEqual([]);
    expect(store.history(animal.id)).toHaveLength(1);
  });
  it("clears the card and messages on account/world changes and ignores old streams", () => {
    const store = new AnimalDetailsStore(); store.bind("account:one:world:a");
    const token = store.historyToken(); store.select(animal); store.append(animal.id, message);
    store.bind("account:two:world:b");
    store.append(animal.id, message, token);
    expect(store.selected).toBeNull(); expect(store.history(animal.id)).toEqual([]);
  });
  it("does not erase a transcript when reopening the same session", () => {
    const store = new AnimalDetailsStore(); store.bind("one"); store.append(animal.id, message);
    store.close(); store.bind("one"); store.select(animal);
    expect(store.history(animal.id)).toHaveLength(1);
  });
  it("dropping the selected animal removes its callback but keeps the transcript", () => {
    const store = new AnimalDetailsStore(); store.bind("one"); store.select(animal);
    store.append(animal.id, message); store.remove("unrelated"); expect(store.selected).toBe(animal);
    store.remove(animal.id); expect(store.selected).toBeNull(); expect(store.history(animal.id)).toHaveLength(1);
  });
  it("cleared history cannot be repopulated by an already streaming answer", () => {
    const store = new AnimalDetailsStore(); store.bind("one"); const token = store.historyToken();
    store.append(animal.id, message); store.clearHistory(animal.id); store.append(animal.id, message, token);
    expect(store.history(animal.id)).toEqual([]);
    store.append(animal.id, message); expect(store.history(animal.id)).toHaveLength(1);
  });
  it("bounds history and discards empty messages or writes outside a session", () => {
    const store = new AnimalDetailsStore(); store.append("outside", message); expect(store.history("outside")).toEqual([]);
    store.bind("one"); store.append(animal.id, { ...message, text: "  " }); expect(store.history(animal.id)).toEqual([]);
    for (let i = 0; i < 45; i++) store.append(animal.id, { ...message, text: String(i) });
    expect(store.history(animal.id)).toHaveLength(40); expect(store.history(animal.id)[0]?.text).toBe("5");
    store.append("long", { ...message, text: "a".repeat(5000) }); expect(store.history("long")[0]?.text.length).toBe(4000);
    for (let i = 0; i < 25; i++) store.append(String(i), message);
    expect(store.history(animal.id)).toEqual([]);
    store.bind(null); expect(store.history("24")).toEqual([]);
  });
});
