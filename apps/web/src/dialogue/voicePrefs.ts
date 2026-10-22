import { useSyncExternalStore } from "react";

/** The automation switches for voice dialogue. All on by default so a
 *  child who never finds the checkboxes still gets speech in, speech out. */
export type VoicePrefs = {
  autoSend: boolean;
  autoListen: boolean;
  autoTts: boolean;
  scriptTts: boolean;
};

const KEY = "island-voice-prefs-v1";
const DEFAULTS: VoicePrefs = {
  autoSend: true,
  autoListen: true,
  autoTts: true,
  scriptTts: true,
};

let prefs: VoicePrefs = { ...DEFAULTS };
try {
  prefs = {
    ...DEFAULTS,
    ...JSON.parse(localStorage.getItem(KEY) ?? "null"),
  };
} catch {
  /* Private browsing keeps the defaults. */
}
const listeners = new Set<() => void>();

export function getVoicePrefs() {
  return prefs;
}
export function setVoicePref(key: keyof VoicePrefs, value: boolean) {
  prefs = { ...prefs, [key]: value };
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* Keep the choice for this visit only. */
  }
  for (const l of listeners) l();
}
export function onVoicePrefsChanged(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useVoicePrefs(): VoicePrefs {
  return useSyncExternalStore(onVoicePrefsChanged, getVoicePrefs);
}
