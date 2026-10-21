import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { growth, useGrowth } from "./store";

/** Floating "task complete" notes, shown on every page above the toolbar. */
export default function GrowthToasts() {
  useGrowth();
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    if (shown || growth.toasts.length === 0) return;
    const next = growth.toasts[0]!;
    setShown(next);
    growth.dismissToast();
    const t = setTimeout(() => setShown(null), 3400);
    return () => clearTimeout(t);
  }, [shown, growth.toasts.length]);
  if (!shown) return null;
  return (
    <div className="toast growth-toast" role="status">
      <Sparkles size={16} />
      <span>{shown}</span>
    </div>
  );
}
