import { Barlow_Condensed, Fraunces, Geist } from "next/font/google";
import type { BrandFont } from "@spindle/schema";

// Bundled tenant fonts. next/font self-hosts them at build time (no request to Google from
// the browser). Licences are recorded in BRAND_FONTS (@spindle/schema). Imported only where a tenant brand
// is rendered, so other pages do not load them.

const barlow = Barlow_Condensed({ subsets: ["latin"], weight: ["600"], variable: "--font-tenant-barlow" });
const fraunces = Fraunces({ subsets: ["latin"], weight: ["600"], variable: "--font-tenant-fraunces" });
// Geist stays a tenant option (the "geist" brand font) now that Spindle's own faces are Archivo and Newsreader.
const geist = Geist({ subsets: ["latin"], variable: "--font-tenant-geist" });

/** Class names that make `font-family: var(--tenant-font)` resolve to the tenant's bundled font. */
export function tenantFontClass(font: BrandFont): { className: string; family: string } {
  switch (font) {
    case "barlow-condensed":
      return { className: barlow.variable, family: "var(--font-tenant-barlow)" };
    case "fraunces":
      return { className: fraunces.variable, family: "var(--font-tenant-fraunces)" };
    default:
      return { className: geist.variable, family: "var(--font-tenant-geist)" };
  }
}
