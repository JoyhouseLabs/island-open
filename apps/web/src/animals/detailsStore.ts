import type { Interest, Species } from "@island/contracts";

export type AnimalSelection = {
  id: string;
  name: string;
  species: Species;
  scene: string;
  prefer: Interest;
  pet: () => void;
};
export type AnimalMessage = {
  role: "user" | "assistant";
  text: string;
  source: "script" | "ai";
};

/** Session-only history. It never enters localStorage, an export or another account. */
export class AnimalDetailsStore {
  selected: AnimalSelection | null = null;
  scope: string | null = null;
  private version = 0;
  private generation = 0;
  private logs = new Map<string, AnimalMessage[]>();
  private listeners = new Set<() => void>();
  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  };
  getVersion = () => this.version;
  private emit() {
    this.version++;
    for (const listener of this.listeners) listener();
  }
  bind(scope: string | null) {
    if (this.scope === scope) return;
    this.scope = scope;
    this.selected = null;
    this.logs.clear();
    this.generation++;
    this.emit();
  }
  select(animal: AnimalSelection) {
    this.selected = animal;
    this.emit();
  }
  close = () => {
    if (!this.selected) return;
    this.selected = null;
    this.emit();
  };
  remove(id: string) {
    if (this.selected?.id === id) this.close();
  }
  historyToken() { return this.generation; }
  history(id: string): readonly AnimalMessage[] { return this.logs.get(id) ?? []; }
  append(id: string, message: AnimalMessage, token = this.generation) {
    if (this.scope === null || token !== this.generation || !message.text.trim()) return;
    const messages = [...(this.logs.get(id) ?? []), { ...message, text: message.text.slice(0, 4000) }].slice(-40);
    this.logs.delete(id);
    this.logs.set(id, messages);
    while (this.logs.size > 24) this.logs.delete(this.logs.keys().next().value!);
    this.emit();
  }
  clearHistory(id: string) {
    this.logs.delete(id);
    // An already-streaming answer must not bring back a cleared transcript.
    this.generation++;
    this.emit();
  }
}
export const animalDetails = new AnimalDetailsStore();
