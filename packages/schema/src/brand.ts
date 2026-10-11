import { z } from "zod";

// Tenant brand (phase 4, P4-A). RED STUB: the real schema follows in the next commit.
export const BRAND_FONTS = {} as Record<string, { label: string; rights: string }>;
export type BrandFont = "geist" | "barlow-condensed" | "fraunces";
export const tenantBrandSchema = z.never();
export interface TenantBrand {
  name: string;
  mark: { kind: "text" } | { kind: "logo"; key: string; format: "png" | "webp"; width: number; height: number; bytes: number };
  colors: { accent: string; onAccent: string };
  font: BrandFont;
}
