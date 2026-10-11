// Lab theme choice (redesign M1). The reader's system setting decides until they press the theme toggle;
// the choice is kept in localStorage and set on <html data-theme> by an inline script in <head>, before the
// first paint, so the page never flashes the wrong theme. `?theme=light|dark` on any URL sets and keeps it.
export const THEME_KEY = "spindle-theme";
export type ThemeChoice = "light" | "dark";

export const isThemeChoice = (value: unknown): value is ThemeChoice => value === "light" || value === "dark";

/**
 * The script body run in <head> before paint. Self-contained (no imports): it reads `?theme=`, else the
 * stored choice, and sets data-theme; with neither, CSS follows prefers-color-scheme. Storage may be
 * unavailable (private mode, blocked): the page then follows the system setting.
 */
/** The browser chrome colour (theme-color) for each theme: the theme's canvas. */
export const THEME_COLOR: Record<ThemeChoice, string> = { light: "#f4f5f7", dark: "#0b0d12" };

/** Points every theme-color meta at the chosen theme, so the browser chrome follows the choice, not only the OS. */
export function applyThemeColor(theme: ThemeChoice) {
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", THEME_COLOR[theme]));
}

export const THEME_SCRIPT = `(function(){var k=${JSON.stringify(THEME_KEY)},c=${JSON.stringify(THEME_COLOR)},t=null;try{var q=new URLSearchParams(location.search).get("theme");if(q==="light"||q==="dark"){t=q;try{localStorage.setItem(k,q)}catch(e){}}else{var s=localStorage.getItem(k);if(s==="light"||s==="dark")t=s}}catch(e){}if(t){document.documentElement.dataset.theme=t;var m=function(){document.querySelectorAll('meta[name="theme-color"]').forEach(function(e){e.setAttribute("content",c[t])})};m();document.addEventListener("DOMContentLoaded",m)}})();`;
