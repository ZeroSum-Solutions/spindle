import type { CSSProperties } from "react";
import { ThemeToggle } from "../theme/theme-toggle";
import { displayName, type MemberBrandView, type NavLink } from "./view";

/**
 * The tenant header band (DESIGN.md › Layout): the gym name as a text mark in the brand font, and
 * up to two links, always underlined. One row from a 480px container, two rows below. The name
 * wraps anywhere and never truncates. Not sticky. The focus ring here is on-band. The theme toggle sits
 * at the end in on-band colours (on-band on the band and on the band tint are checked by brandChecks).
 */
export function BrandHeader({ brand, fontFamily, links = [] }: { brand: MemberBrandView; fontFamily: string; links?: readonly NavLink[] }) {
  const shown = links.slice(0, 2);
  return (
    <header data-brand-header className="@container bg-band text-on-band" style={{ "--focus-ring": "var(--color-on-band)" } as CSSProperties}>
      <div className="mx-auto flex min-h-16 w-full max-w-[1200px] items-center gap-4 px-4 py-3 md:px-8">
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 @[480px]:flex-row @[480px]:items-center @[480px]:justify-between @[480px]:gap-8">
          <span data-brand-name className="min-w-0 text-[20px] font-semibold leading-[1.15] tracking-[-0.01em]" style={{ fontFamily, overflowWrap: "anywhere" }}>
            {displayName(brand)}
          </span>
          {shown.length > 0 ? (
            <nav aria-label="Gym">
              <ul className="flex flex-wrap gap-x-6">
                {shown.map((l) => (
                  <li key={l.href}>
                    <a href={l.href} className="inline-flex min-h-11 items-center text-label font-medium underline decoration-1 underline-offset-[5px] hover:decoration-2">
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
        </div>
        <ThemeToggle tone="band" />
      </div>
    </header>
  );
}
