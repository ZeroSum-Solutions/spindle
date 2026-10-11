import type { ReactNode } from "react";

/** A mono eyebrow above a heading: section numbers ("02 / 05"), figure numbers and short context. */
export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`text-eyebrow tabular text-text-muted ${className}`}>{children}</p>;
}
