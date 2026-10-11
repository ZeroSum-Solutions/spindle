"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ListOrdered } from "lucide-react";
import { openOutlineSheet } from "./outline-sheet";

/**
 * The bottom lesson bar: where you are (the progress readout) and the outline, always in reach. It has
 * automatic height (two rows at 320px or 200% text), honours the safe-area inset, and publishes its
 * measured height as --dock-h, which the page reserves at its end and in scroll padding, so focus near
 * the end is never covered. Chrome only: it never moves lesson text. The named next action stays at
 * the end of the lesson, beside the completion card.
 */
export function LessonDock({ sheetId, children }: { sheetId: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty("--dock-h", `${Math.ceil(el.getBoundingClientRect().height)}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      // The router may already show the next lesson's bar: hand the value to it rather than clearing it.
      const other = [...document.querySelectorAll<HTMLElement>("[data-lesson-dock]")].find((d) => d !== el && d.checkVisibility());
      if (other) root.style.setProperty("--dock-h", `${Math.ceil(other.getBoundingClientRect().height)}px`);
      else root.style.removeProperty("--dock-h");
    };
  }, []);
  return (
    <div
      ref={ref}
      data-lesson-dock
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] shadow-float backdrop-blur"
    >
      <div role="group" aria-label="Lesson progress" className="mx-auto flex w-full max-w-[63rem] flex-wrap items-center gap-x-stack gap-y-tight px-4 py-tight md:px-8">
        <div className="min-w-[12rem] flex-1">{children}</div>
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={(e) => openOutlineSheet(e.currentTarget, sheetId)}
          className="pressable inline-flex min-h-11 items-center gap-tight rounded-control border border-control px-3 text-label font-medium text-text hover:bg-surface-muted lg:hidden"
        >
          <ListOrdered aria-hidden strokeWidth={1.75} className="size-4" />
          Outline
        </button>
      </div>
    </div>
  );
}
