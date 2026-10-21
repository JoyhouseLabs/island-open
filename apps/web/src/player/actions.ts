import type { AvatarAnim } from "./AvatarModel";

export type PlayerAction = "wave" | "sit" | "spin" | "jump";
type Action = Exclude<AvatarAnim["action"], undefined> | "jump";

/**
 * Small bus for player actions: keyboard, the backpack panel and the mobile
 * jump button all push here; PlayerRig consumes one per frame.
 */
class ActionBus {
  private queue: Action[] = [];
  trigger(action: Action) {
    if (this.queue.length < 3) this.queue.push(action);
  }
  take(): Action | null {
    return this.queue.shift() ?? null;
  }
}
export const playerAction = new ActionBus();
