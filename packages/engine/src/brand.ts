import type { TenantBrand } from "@spindle/schema";

// Tenant brand validation (phase 4, P4-A). RED STUB: implemented in the next commit.
export const ATLAS = {} as Record<string, string>;
export const BASE_ATTRIBUTION = "";
export interface ContrastCheck {
  role: string;
  state: "default" | "hover" | "selected" | "focus" | "error";
  foreground: string;
  background: string;
  ratio: number;
  shown: string;
  minimum: number;
  pass: boolean;
}
declare const validated: unique symbol;
export type ValidatedBrand = TenantBrand & { readonly [validated]: true };
export type BrandResult = { ok: true; brand: ValidatedBrand; checks: ContrastCheck[] } | { ok: false; problems: string[]; checks: ContrastCheck[] };
export function brandChecks(_brand: Pick<TenantBrand, "colors" | "mark">): ContrastCheck[] {
  throw new Error("not implemented");
}
export function validateBrand(_input: unknown): BrandResult {
  throw new Error("not implemented");
}
export function brandToCssVars(_brand: ValidatedBrand): Record<string, string> {
  throw new Error("not implemented");
}
