/* Theme — body.dark toggle, ported from app.js:299-309. pref ∈ system|light|dark,
   persisted to localStorage["lm-theme"]; "system" follows prefers-color-scheme. */

export type ThemePref = "system" | "light" | "dark";

export function applyTheme(pref: ThemePref): void {
  const dark =
    pref === "dark" ||
    (pref !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.body.classList.toggle("dark", dark);
  try {
    localStorage.setItem("lm-theme", pref);
  } catch {
    /* ok */
  }
}

export function currentThemePref(): ThemePref {
  const v = (localStorage.getItem("lm-theme") || "system") as ThemePref;
  return v === "light" || v === "dark" ? v : "system";
}

/** Apply the saved theme and keep following the OS when pref is "system". */
export function initTheme(): void {
  applyTheme(currentThemePref());
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    applyTheme(currentThemePref());
  });
}
