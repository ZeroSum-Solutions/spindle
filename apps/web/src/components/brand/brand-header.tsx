import type { MemberBrandView, NavLink } from "./view";

/** The tenant header band: the gym name as a text mark and up to two links. */
export function BrandHeader(_: { brand: MemberBrandView; fontFamily: string; links?: readonly NavLink[] }) {
  return null;
}
