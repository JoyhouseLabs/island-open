import { useSyncExternalStore } from "react";

import type { AvatarConfig } from "@island/contracts";
export type { AvatarConfig } from "@island/contracts";
export type AvatarForm = AvatarConfig["form"];
export type AvatarHat = AvatarConfig["hat"];

export const avatarForms: { id: AvatarForm; name: string; note: string }[] = [
  { id: "foxbot", name: "小狐灵", note: "灵敏爱跑，尾巴亮着微光" },
  { id: "pandabot", name: "熊猫仔", note: "慢慢走，稳稳看路" },
  { id: "islander", name: "小岛民", note: "戴着围巾的小小岛民" },
  { id: "bunnybot", name: "兔宝", note: "蹦蹦跳跳，耳朵很长" },
  { id: "catbot", name: "猫灵", note: "安安静静，尾巴竖着" },
];
/** `cost` marks star-shop hats; everything else is free from the start. */
export const avatarHats: {
  id: AvatarHat;
  name: string;
  unlockId?: string;
}[] = [
  { id: "none", name: "不戴" },
  { id: "straw", name: "草帽" },
  { id: "beret", name: "贝雷帽" },
  { id: "crown", name: "花冠" },
  { id: "cap", name: "棒球帽" },
  { id: "starcrown", name: "星星冠", unlockId: "hat-starcrown" },
  { id: "copter", name: "竹蜻蜓", unlockId: "hat-copter" },
];
export const avatarAccents = [
  "#e0824f",
  "#5fa382",
  "#6f9fc4",
  "#c989b4",
  "#d9b04f",
  "#8b86c9",
];

/** The saved avatar for this browser, or a friendly default. Shared by the
 *  owner session and the visit session so visitors walk in with a face. */
export const AVATAR_KEY = "island-avatar-v1";
export function loadAvatar(): AvatarConfig {
  try {
    const raw = localStorage.getItem(AVATAR_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<AvatarConfig>) : null;
    if (
      parsed?.form &&
      avatarForms.some((f) => f.id === parsed.form) &&
      typeof parsed.accent === "string" &&
      /^#[0-9a-f]{6}$/i.test(parsed.accent)
    )
      return {
        form: parsed.form,
        accent: parsed.accent,
        // Older saved outfits predate hats. Preserve their form and color.
        hat: avatarHats.some((h) => h.id === parsed.hat) ? parsed.hat! : "none",
      };
  } catch {
    /* fall through to the default */
  }
  return { form: "foxbot", accent: avatarAccents[0]!, hat: "none" };
}

/** Click-to-move bus: room grounds emit targets, the player rig consumes them. */
export const moveBus = {
  target: null as { x: number; z: number } | null,
  send(x: number, z: number) {
    this.target = { x, z };
  },
  take() {
    const t = this.target;
    this.target = null;
    return t;
  },
};

/** Whether ground taps should drive the avatar (walk mode, explore tool). */
export const playerIntent = { active: false };

/** Camera mode for the walking resident: third-person follow (default)
 *  or first-person through the avatar's eyes. Toggled by the view button
 *  or the V key while walking. */
export const cameraMode = {
  firstPerson: false,
  listeners: new Set<() => void>(),
  toggle() {
    cameraMode.firstPerson = !cameraMode.firstPerson;
    for (const notify of cameraMode.listeners) notify();
  },
};
export function useFirstPerson() {
  useSyncExternalStore(
    (notify) => {
      cameraMode.listeners.add(notify);
      return () => cameraMode.listeners.delete(notify);
    },
    () => cameraMode.firstPerson,
  );
  return cameraMode.firstPerson;
}
