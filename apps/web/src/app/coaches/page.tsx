import type { Metadata } from "next";
import { Coaches, exampleSwatches } from "@/components/landing/coaches";
import { SPINDLE } from "@/lib/brand";
import { tenantFontClass } from "@/lib/theme/fonts";
import { OXBLOOD, SAGE } from "@/lib/theme/preview-brands";

export const metadata: Metadata = {
  title: "For coaches and gyms: Spindle",
  description: "Teach your method on a shared, cited base. Your coaching sits on top, labelled as practice. Authoring, programs, video, certification tracks and branding are planned.",
};

export default function CoachesPage() {
  // The two made-up example brands, through the validator; never tenant data.
  return <Coaches brand={SPINDLE} swatches={exampleSwatches([OXBLOOD, SAGE], tenantFontClass)} />;
}
