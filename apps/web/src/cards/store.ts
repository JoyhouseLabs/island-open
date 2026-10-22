import { useSyncExternalStore } from "react";
import type { SubjectId } from "@island/contracts";

/**
 * Which knowledge card is open right now. The 3D scene (forage clicks) and
 * the backpack grid call openCard(); <CardModal>, mounted once per session
 * wrapper, renders the card.
 */
let subject: SubjectId | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function openCard(next: SubjectId) {
  subject = next;
  emit();
}
export function closeCard() {
  subject = null;
  emit();
}
export function useOpenCardSubject() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => subject,
    () => null,
  );
}
