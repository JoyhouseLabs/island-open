/**
 * One shared lightning clock: the visible flash and the thunder clap both
 * subscribe, so thunder can trail each flash the way it does in a real storm.
 * Consumers acquire the storm while thunder weather (or its sound) is active.
 */
type FlashListener = () => void;
const listeners = new Set<FlashListener>();
let users = 0,
  timer: ReturnType<typeof setTimeout> | null = null;
const schedule = () => {
  timer = setTimeout(fire, 5000 + Math.random() * 7000);
};
const fire = () => {
  for (const listener of listeners) listener();
  if (users > 0) schedule();
};
export function acquireStorm() {
  users++;
  if (users === 1) schedule();
  return () => {
    users = Math.max(0, users - 1);
    if (users === 0 && timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
}
export function onStormFlash(listener: FlashListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
