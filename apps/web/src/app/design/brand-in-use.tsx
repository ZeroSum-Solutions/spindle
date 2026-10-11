import { validateBrand } from "@spindle/engine";
import { CatalogPreviewScene } from "@/components/brand/catalog-scene";
import { CATALOG_SCENES, type CatalogScene } from "@/lib/theme/preview-catalog";
import { HARBOR, OXBLOOD, PALE_SAGE } from "@/lib/theme/preview-brands";
import { ThemePair } from "./kit";

/** A copy of a catalog scene whose element ids carry the theme, so two panes never share an id. */
function themedScene(scene: CatalogScene, theme: "light" | "dark"): CatalogScene {
  const course = <T extends { id: string; href: string }>(c: T): T => ({ ...c, id: `${c.id}-${theme}`, href: `${c.href}-${theme}` });
  return {
    ...scene,
    id: `${scene.id}-${theme}` as CatalogScene["id"],
    methodCourses: scene.methodCourses.map(course),
    baseCourses: scene.baseCourses.map(course),
    modalityCourses: scene.modalityCourses.map(course),
  };
}

/** Gym brands in use: a synthetic gym's member catalog in both themes, and the example accent pairs through the validator. */
export function BrandInUseBoard() {
  const strength = CATALOG_SCENES.find((s) => s.id === "strength")!;
  return (
    <div className="flex flex-col gap-block">
      <ThemePair wide>{(theme) => <CatalogPreviewScene scene={themedScene(strength, theme)} />}</ThemePair>
      <ul className="grid grid-cols-1 gap-stack md:grid-cols-3">
        {[OXBLOOD, HARBOR, PALE_SAGE].map((b) => {
          const r = validateBrand(b);
          const failing = r.checks.filter((c) => !c.pass);
          return (
            <li key={b.name} data-brand-example={b.name} className="flex flex-col gap-tight rounded-card border border-border bg-surface p-stack">
              <span className="flex items-center gap-tight">
                <span aria-hidden className="size-6 rounded-small" style={{ background: b.colors.accent }} />
                <span aria-hidden className="size-6 rounded-small" style={{ background: b.colors.accentDark }} />
                <span className="text-ui font-semibold text-text">{b.name}</span>
              </span>
              <span className="text-code text-text-muted">
                light {b.colors.accent} · dark {b.colors.accentDark}
              </span>
              <span className={`text-label ${r.ok ? "text-text" : "text-danger"}`}>
                {r.ok ? `Accepted: ${r.checks.length} of ${r.checks.length} checks pass.` : `Refused: ${failing.length} of ${r.checks.length} checks fail, first: ${failing[0]!.role}.`}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="max-w-[66ch] text-label text-text-muted">
        A gym sets one accent pair per theme. Every pair is checked in both themes and refused, never adjusted; the accent must also stay clear of Spindle&apos;s
        signal and the evidence colours. More scenes on{" "}
        <a href="/brand-preview" className="text-brand underline underline-offset-2 hover:text-brand-hover">
          /brand-preview
        </a>
        .
      </p>
    </div>
  );
}
