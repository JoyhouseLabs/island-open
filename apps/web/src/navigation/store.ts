import type { ReactNode } from "react";
import { useLayoutEffect, useRef, useSyncExternalStore } from "react";

export type BagTab = "materials" | "furniture" | "blueprints" | "collection";
export type MenuPanel =
  "map" | "bag" | "build" | "partners" | "more" | "growth" | null;
export type SceneActions = {
  travel?: (path: string) => void | Promise<void>;
  build?: () => void;
  buildReason?: string;
  shop?: () => void;
  furniture?: () => void;
  settings?: () => void;
  save?: () => void;
  dress?: () => void;
  sound?: () => void;
  about?: () => void;
  moreContent?: ReactNode;
  beforeOpen?: () => void;
  blocked?: string;
  playUseReason?: string;
  starlight?: (kind: "blueprint" | "item" | "materials", id?: string) => void;
};
let version = 0;
const listeners = new Set<() => void>();
const emit = () => {
  version++;
  listeners.forEach((l) => l());
};
export const menus = {
  panel: null as MenuPanel,
  tab: "materials" as BagTab,
  actions: null as (() => SceneActions) | null,
  open(panel: MenuPanel, tab?: BagTab) {
    if (panel && !this.panel) {
      // Clear held movement keys without changing the player's saved walk/edit mode.
      window.dispatchEvent(new Event("blur"));
      this.actions?.().beforeOpen?.();
    }
    this.panel = panel;
    if (tab) this.tab = tab;
    emit();
  },
  toggle(panel: MenuPanel) {
    this.open(this.panel === panel ? null : panel);
  },
};
export function useMenuPanel() {
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => version,
  );
  return menus.panel;
}
/** Page owns its save/preview rules; the shared shell only invokes these adapters. */
export function useSceneActions(actions: SceneActions) {
  const ref = useRef(actions);
  ref.current = actions;
  useLayoutEffect(() => {
    emit();
  }, [actions.blocked, actions.buildReason]);
  useLayoutEffect(() => {
    const get = () => ref.current;
    menus.actions = get;
    emit();
    return () => {
      if (menus.actions === get) {
        menus.actions = null;
        emit();
      }
    };
  }, []);
}
