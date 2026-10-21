"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, ListOrdered } from "lucide-react";
import { openOutlineSheet } from "./outline-sheet";

/**
 * The bottom lesson bar below 1024px: row 1 is where you are (the progress readout) and the outline,
 * row 2 the full-width named next action (the next lesson, or back to the course at the end). It has
 * automatic height (more rows at 320px or 200% text), honours the safe-area inset (globals.css), and publishes its
 * measured height as --dock-h, which the page reserves at its end and in scroll padding, so focus near
 * the end is never covered. From 1024px it is gone (0px): the sidebar and the in-lesson navigation take
 * over. Chrome only: it never moves lesson text.
 */
export function LessonDock({ sheetId, next, children }: { sheetId: string; next: { href: string; title?: string }; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty("--dock-h", `${Math.ceil(el.getBoundingClientRect().height)}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    // Hidden from 1024px: a display change is not always a resize the observer reports.
    const desktop = window.matchMedia("(min-width: 1024px)");
    desktop.addEventListener("change", publish);
    return () => {
      observer.disconnect();
      desktop.removeEventListener("change", publish);
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
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 shadow-float backdrop-blur lg:hidden"
    >
      <div role="group" aria-label="Lesson progress" className="mx-auto flex w-full max-w-[63rem] flex-wrap items-center gap-x-stack gap-y-tight px-4 py-tight md:px-8">
        <div className="min-w-0 grow basis-48">{children}</div>
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={(e) => openOutlineSheet(e.currentTarget, sheetId)}
          className="pressable inline-flex min-h-11 items-center gap-tight rounded-control border border-control px-3 text-label font-medium text-text hover:bg-surface-muted"
        >
          <ListOrdered aria-hidden strokeWidth={1.75} className="size-4" />
          Outline
        </button>
        <Link
          href={next.href}
          className="flex min-h-12 w-full min-w-0 items-center justify-between gap-tight rounded-control border border-control bg-surface px-4 py-2 hover:bg-surface-muted"
        >
          {next.title ? (
            <span className="flex min-w-0 flex-col">
              <span className="text-label text-text-muted">
                Next lesson<span className="sr-only">:</span>
              </span>
              <span data-next-title className="font-medium break-words text-text">{next.title}</span>
            </span>
          ) : (
            <span className="font-medium text-text">Back to the course</span>
          )}
          <ArrowRight aria-hidden strokeWidth={1.75} className="size-4 shrink-0" />
        </Link>
      </div>
    </div>
  );
}
