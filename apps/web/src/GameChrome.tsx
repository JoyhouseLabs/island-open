import PlayerChat from "./dialogue/PlayerChat";
import GatePrompt, { SceneTransitionVeil } from "./player/SceneTransition";
/** Game overlays stay outside the lightweight learning route bundle. */
export default function GameChrome() {
  return (
    <>
      <PlayerChat />
      <GatePrompt />
      <SceneTransitionVeil />
    </>
  );
}
