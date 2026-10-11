"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { THEME_KEY, applyThemeColor, isThemeChoice, type ThemeChoice } from "./theme";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** The theme in effect: the reader's stored choice on <html data-theme>, else the system setting. */
function current(): ThemeChoice {
  const chosen = document.documentElement.dataset.theme;
  if (isThemeChoice(chosen)) return chosen;
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function subscribe(onChange: () => void) {
  const media = window.matchMedia(DARK_QUERY);
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  media.addEventListener("change", onChange);
  return () => {
    observer.disconnect();
    media.removeEventListener("change", onChange);
  };
}

/**
 * Switches between Lab Light and Lab Dark and keeps the choice. The label names the action, not the state;
 * the icon shows the theme you will get. Before hydration it renders the same accessible button.
 */
/** `tone="band"` draws the toggle in on-band colours, for a gym's header band (all pairs checked by brandChecks). */
const TONE = {
  page: "border-control text-text hover:bg-surface-muted",
  band: "border-on-band text-on-band hover:bg-band-tint",
} as const;

export function ThemeToggle({ className = "", tone = "page" }: { className?: string; tone?: keyof typeof TONE }) {
  const theme = useSyncExternalStore(subscribe, current, () => null);
  const next: ThemeChoice = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      aria-label="Switch light or dark theme"
      data-theme-toggle
      data-theme-current={theme ?? undefined}
      onClick={() => {
        document.documentElement.dataset.theme = next;
        applyThemeColor(next);
        try {
          localStorage.setItem(THEME_KEY, next);
        } catch {
          // Storage blocked: the choice holds for this page only.
        }
      }}
      className={`pressable inline-flex size-11 shrink-0 items-center justify-center rounded-control border ${TONE[tone]} ${className}`}
    >
      {next === "light" ? <Sun aria-hidden className="size-5" /> : <Moon aria-hidden className="size-5" />}
    </button>
  );
}
