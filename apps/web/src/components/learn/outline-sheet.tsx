"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { ChevronUp, X } from "lucide-react";

// The course outline on phones and tablets, as a bottom sheet (a native modal <dialog>): Tab cycles inside,
// Esc closes, the page behind does not scroll, and focus returns to whichever trigger opened it (or to the
// top trigger if that one is gone). From the lg breakpoint the outline is the sidebar instead: the sheet's
// triggers are hidden there, and an open sheet closes itself when the viewport widens, moving focus to the sidebar.

/** Tailwind's lg breakpoint, in the same unit (rem in a media query follows the browser's default font size). */
export const DESKTOP = "(min-width: 64rem)";

/** checkVisibility() where the browser has it (Safari before 17.4 does not); otherwise "has boxes". */
export function isShown(el: Element): boolean {
  const check = (el as { checkVisibility?: () => boolean }).checkVisibility;
  return check ? check.call(el) : el.getClientRects().length > 0;
}

/** The 3px focus ring plus its 4px offset, which must clear the lesson bar too. */
const RING = 7;

// The trigger that opened a sheet, and that sheet: only that sheet returns focus to it.
let opener: { trigger: HTMLElement; dialog: HTMLDialogElement } | null = null;

/**
 * Opens the sheet and remembers the trigger, so closing can return focus to it. The id is per render:
 * the router may keep an earlier lesson's page (and its sheet) hidden for back navigation.
 */
export function openOutlineSheet(trigger: HTMLElement, sheetId: string) {
  const dialog = document.getElementById(sheetId) as HTMLDialogElement | null;
  if (!dialog || dialog.open) return;
  opener = { trigger, dialog };
  dialog.showModal();
}

/** `progress` is the short count ("2 of 5 done"), shown on the trigger and under the sheet's title. */
export function OutlineSheet({ id, progress, children }: { id: string; progress: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const root = document.documentElement;
    let saved: { overflow: string; paddingRight: string } | null = null;
    // Lock the page behind while open; keep the scrollbar's space so nothing shifts sideways.
    const lock = () => {
      if (saved) return;
      saved = { overflow: root.style.overflow, paddingRight: root.style.paddingRight };
      const bar = window.innerWidth - root.clientWidth;
      root.style.overflow = "hidden";
      if (bar > 0) root.style.paddingRight = `${bar}px`;
    };
    const unlock = () => {
      if (!saved) return;
      root.style.overflow = saved.overflow;
      root.style.paddingRight = saved.paddingRight;
      saved = null;
    };
    // Brings a focus target and its ring into view without moving more than it must. Inside the sidebar's
    // scroll box or the bar (both scroll inside themselves), only that box scrolls, within the part of it on
    // screen, so the window and the reading column never move. Elsewhere the window scrolls the target clear of
    // the top edge and of the bar (scroll padding leaves room for the ring).
    const reveal = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      // The sidebar's box scrolls only from the lg breakpoint; below it the trigger sits in it as a plain wrapper.
      const box = el.closest<HTMLElement>("[data-outline-scroll], [data-lesson-dock]");
      if (box && getComputedStyle(box).overflowY !== "visible") {
        const b = box.getBoundingClientRect();
        const [top, bottom] = [Math.max(b.top, 0) + RING, Math.min(b.bottom, window.innerHeight) - RING];
        if (r.top < top) box.scrollTop -= top - r.top;
        else if (r.bottom > bottom) box.scrollTop += Math.min(r.bottom - bottom, r.top - top);
        return;
      }
      const bar = [...document.querySelectorAll<HTMLElement>("[data-lesson-dock]")].find(isShown);
      if (r.top - RING < 0 || r.bottom + RING > (bar ? bar.getBoundingClientRect().top : window.innerHeight)) el.scrollIntoView({ block: "nearest" });
    };
    const restore = () => {
      unlock();
      const own = opener?.dialog === dialog ? opener.trigger : null;
      if (own) opener = null;
      // Choosing a lesson closed the sheet: the router moves on to that lesson, so focus stays out of this page.
      if (dialog.dataset.leaving) {
        delete dialog.dataset.leaving;
        return;
      }
      const back = window.matchMedia(DESKTOP).matches
        ? [...document.querySelectorAll<HTMLElement>('nav[aria-label="Course outline"] [aria-current="page"]')].find((el) => !el.closest("dialog") && isShown(el))
        : own?.isConnected && isShown(own)
          ? own
          : document.querySelector<HTMLElement>(`[data-outline-trigger="${dialog.id}"]`);
      // Native close may already have focused the opener, so focus() alone would not scroll: reveal it, such as
      // the trigger after a resize grew the bar, the bar's Outline below the bar's own scrollport, or a late
      // lesson in the sidebar after widening.
      if (back) {
        back.focus({ preventScroll: true });
        reveal(back);
      }
    };
    // showModal() happens outside React (openOutlineSheet); watch the open attribute to lock and unlock,
    // starting from the current state.
    const watch = new MutationObserver(() => (dialog.open ? lock() : unlock()));
    watch.observe(dialog, { attributes: true, attributeFilter: ["open"] });
    if (dialog.open) lock();
    const desktop = window.matchMedia(DESKTOP);
    const widen = () => {
      if (desktop.matches && dialog.open) dialog.close();
    };
    dialog.addEventListener("close", restore);
    desktop.addEventListener("change", widen);
    // Runs on unmount and when the router hides this page for back navigation: an open modal left in a
    // hidden page would keep the next page inert, so close it (without moving focus there).
    return () => {
      dialog.removeEventListener("close", restore);
      desktop.removeEventListener("change", widen);
      watch.disconnect();
      if (dialog.open) dialog.close();
      if (opener?.dialog === dialog) opener = null;
      delete dialog.dataset.leaving;
      unlock();
    };
    // Not keyed on the id: a refresh after completing a lesson renders a new id, and an open sheet must keep
    // its lock rather than be torn down. The id is read from the element when needed.
  }, []);
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
        tabIndex={-1}
        data-outline-sheet
        // A plain click on another lesson navigates: close first, so the sheet never stays open over the next
        // lesson. A modified click (new tab or window) leaves the sheet as it is; the current lesson just closes it.
        onClick={(e) => {
          const link = (e.target as HTMLElement).closest("a");
          if (link && (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) return;
          const leaving = !!link && link.getAttribute("aria-current") !== "page";
          if (leaving) e.currentTarget.dataset.leaving = "1";
          if (e.target === e.currentTarget || link) e.currentTarget.close();
          // The router moves to the chosen lesson: focus must not stay on this page's trigger, which close()
          // refocuses natively (restore skips it too). Blurred, focus starts at the top of the next lesson.
          if (leaving) (document.activeElement as HTMLElement | null)?.blur();
        }}
        // A modal dialog makes the page inert, but Tab past the last control would leave for the browser
        // chrome. Keep the cycle inside the sheet: last to first, and Shift+Tab from first to last (also from the
        // dialog itself, which takes focus when its padding or text is clicked: tabIndex -1).
        onKeyDown={(e) => {
          if (e.key !== "Tab") return;
          const items = [...e.currentTarget.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")].filter((el) => el.offsetParent !== null);
          const [first, last] = [items[0], items.at(-1)];
          if (!first || !last) return;
          const at = document.activeElement;
          if (!e.shiftKey && (at === last || at === e.currentTarget)) {
            e.preventDefault();
            first.focus();
          } else if (e.shiftKey && (at === first || at === e.currentTarget)) {
            e.preventDefault();
            last.focus();
          }
        }}
        className="outline-sheet m-0 mt-auto max-h-[85dvh] w-full overflow-y-auto overscroll-contain max-w-none rounded-t-plate border-t border-border bg-surface p-0 text-text shadow-float lg:hidden"
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
