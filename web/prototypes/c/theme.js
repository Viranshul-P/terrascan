// Light/dark switch. The page starts in the system theme (set by a tiny inline script in <head> so there is no
// flash); pressing the switch picks a theme and remembers it in localStorage.

const root = document.documentElement;
const systemDark = matchMedia("(prefers-color-scheme: dark)");

function saved() {
  try {
    return localStorage.getItem("theme");
  } catch {
    return null;
  }
}

export function currentTheme() {
  return root.dataset.theme;
}

export function initTheme(button, onChange = () => {}) {
  const label = () =>
    button.setAttribute("aria-label", currentTheme() === "dark" ? "Switch to light mode" : "Switch to dark mode");
  label();
  button.addEventListener("click", () => {
    root.dataset.theme = currentTheme() === "dark" ? "light" : "dark";
    try {
      localStorage.setItem("theme", root.dataset.theme);
    } catch {
      /* private mode: the choice just isn't remembered */
    }
    label();
    onChange(currentTheme());
  });
  // Follow the system setting live, until the visitor picks a theme themselves.
  systemDark.addEventListener("change", (e) => {
    if (saved()) return;
    root.dataset.theme = e.matches ? "dark" : "light";
    label();
    onChange(currentTheme());
  });
}
