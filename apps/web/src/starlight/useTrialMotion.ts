import { useEffect, useState } from "react";
const key = "island-trial-motion.v1";
export function useTrialMotion() {
  const [motion, setMotion] = useState(() => {
    try {
      const value = localStorage.getItem(key);
      if (value !== null) return value === "on";
    } catch {
      /* session preference */
    }
    return !matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => {
      try {
        if (localStorage.getItem(key) !== null) return;
      } catch {}
      setMotion(!query.matches);
    };
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  return {
    motion,
    setMotion: (value: boolean) => {
      setMotion(value);
      try {
        localStorage.setItem(key, value ? "on" : "off");
      } catch {}
    },
  };
}
