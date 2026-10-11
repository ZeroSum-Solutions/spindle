import type { Metadata } from "next";
import { Coaches, type ThemeSwatch } from "@/components/landing/coaches";
import { SPINDLE } from "@/lib/brand";
import { tenantFontClass } from "@/lib/theme/fonts";
import { OXBLOOD, SAGE } from "@/lib/theme/preview-brands";
import { validateTheme } from "@/lib/theme/tenant-theme";

export const metadata: Metadata = {
  title: "For coaches and gyms: Spindle",
  description: "Teach your method on a shared, cited base. Your coaching sits on top, labelled as practice. Authoring, programs, video, certification tracks and branding are planned.",
};

/** The two example brands, rendered only if the validator accepts them; never tenant data. */
function swatches(): ThemeSwatch[] {
  return [OXBLOOD, SAGE].flatMap((brand) => {
    const result = validateTheme(brand);
    return result.ok ? [{ theme: result.theme, checks: result.checks, font: tenantFontClass(result.theme.font) }] : [];
  });
}

export default function CoachesPage() {
  return <Coaches brand={SPINDLE} swatches={swatches()} />;
}
