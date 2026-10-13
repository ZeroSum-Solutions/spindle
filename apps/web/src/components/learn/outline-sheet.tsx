"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { ChevronUp, X } from "lucide-react";

// The course outline on phones and tablets, as a bottom sheet (a native modal <dialog>): Tab cycles inside,
// Esc closes, and focus returns to whichever trigger opened it (or to the top trigger if that one is gone).
// From 1024px the outline is the sidebar instead, so the sheet's triggers are hidden there.

let opener: HTMLElement | null = null;

/**
 * Opens the sheet and remembers the trigger, so closing can return focus to it. The id is per render:
 * the router may keep an earlier lesson's page (and its sheet) hidden for back navigation.
 */
export function openOutlineSheet(trigger: HTMLElement, sheetId: string) {
  const dialog = document.getElementById(sheetId) as HTMLDialogElement | null;
  if (!dialog || dialog.open) return;
  opener = trigger;
  dialog.showModal();
}

/** `progress` is the short count ("2 of 5 done"), shown on the trigger and under the sheet's title. */
export function OutlineSheet({ id, progress, children }: { id: string; progress: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const restore = () => {
      const back = opener?.isConnected ? opener : document.querySelector<HTMLElement>(`[data-outline-trigger="${id}"]`);
      back?.focus();
      opener = null;
    };
    dialog.addEventListener("close", restore);
    return () => dialog.removeEventListener("close", restore);
  }, [id]);
  return (
    <>
      <button
        type="button"
        data-outline-trigger={id}
        aria-haspopup="dialog"
        onClick={(e) => openOutlineSheet(e.currentTarget, id)}
        className="flex min-h-12 w-full items-center justify-between gap-2 rounded-card border border-border bg-surface px-4 text-left font-medium lg:hidden"
      >
        <span>
          Course outline <span className="font-normal text-text-muted">· {progress}</span>
        </span>
        <ChevronUp aria-hidden strokeWidth={1.75} className="size-5 shrink-0" />
      </button>
      <dialog
        ref={ref}
        id={id}
        aria-labelledby={titleId}
        data-outline-sheet
        // A link inside navigates: close first, so the sheet never stays open over the next lesson.
        onClick={(e) => {
          if (e.target === e.currentTarget || (e.target as HTMLElement).closest("a")) ref.current?.close();
        }}
        // A modal dialog makes the page inert, but Tab past the last control would leave for the browser
        // chrome. Keep the cycle inside the sheet: last to first, and Shift+Tab from first to last.
        onKeyDown={(e) => {
          if (e.key !== "Tab") return;
          const items = [...e.currentTarget.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")].filter((el) => el.offsetParent !== null);
          const [first, last] = [items[0], items.at(-1)];
          if (!first || !last) return;
          if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          } else if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        }}
        className="outline-sheet m-0 mt-auto max-h-[85dvh] w-full max-w-none rounded-t-plate border-t border-border bg-surface p-0 text-text shadow-float lg:hidden"
      >
        <div className="flex flex-col gap-tight p-stack pb-[calc(var(--spacing-stack)+env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between gap-attach">
            <h2 id={titleId} className="text-subhead text-text">
              Course outline
            </h2>
            <button type="button" onClick={() => ref.current?.close()} aria-label="Close the outline" className="inline-flex size-11 items-center justify-center rounded-control text-text hover:bg-surface-muted">
              <X aria-hidden strokeWidth={1.75} className="size-5" />
            </button>
          </div>
          <p className="text-label text-text-muted">{progress}</p>
          <nav aria-label="Course outline">{children}</nav>
        </div>
      </dialog>
    </>
  );
}
