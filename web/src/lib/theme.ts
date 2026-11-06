// Light / dark theme. index.html sets data-theme on <html> before the first paint; this hook reads and changes it.
import { useEffect, useState } from "react";

export type Theme = "light" | "dark";
const current = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(current);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  // Follow the system setting, unless the visitor picked a theme with the switch.
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const follow = (e: MediaQueryListEvent) => {
      let saved = null;
      try { saved = localStorage.getItem("theme"); } catch { /* private mode */ }
      if (!saved) setTheme(e.matches ? "dark" : "light");
    };
    mq.addEventListener("change", follow);
    return () => mq.removeEventListener("change", follow);
  }, []);
  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    try { localStorage.setItem("theme", next); } catch { /* not remembered in private mode */ }
    setTheme(next);
  };
  return { theme, toggle };
}
