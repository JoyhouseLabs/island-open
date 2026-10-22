import { useNavigate } from "react-router";
import { useHomeSession } from "../HomeSession";
import Wilderness from "../wilderness/Wilderness";
import { paths } from "../routes";
export default function WildernessPage() {
  const { world, quality, avatar } = useHomeSession(),
    navigate = useNavigate();
  return (
    <Wilderness
      key={world.snapshot.seed}
      seed={world.snapshot.seed}
      low={quality !== "high"}
      avatar={avatar}
      onExit={() => void navigate(paths.dinosaur)}
    />
  );
}
