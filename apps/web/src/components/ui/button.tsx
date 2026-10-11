import { LoaderCircle } from "lucide-react";

const VARIANT = {
  primary: "bg-ink text-on-ink hover:bg-ink-hover",
  secondary: "border border-control bg-surface text-text hover:bg-surface-muted",
  ghost: "text-text hover:bg-surface-muted",
} as const;

/**
 * Spindle's button. Primary actions are ink (one per screen; ink inverts with the theme); a gym brand
 * never recolours them. `loading` keeps the exact width (the label stays in place, transparent, and the
 * spinner sits over it), disables the button and announces the busy state; the press gives a small
 * physical response (`.pressable`, none under reduced motion).
 */
export function Button({
  children,
  variant = "primary",
  loading = false,
  className = "",
  disabled,
  ...props
}: React.ComponentProps<"button"> & { variant?: keyof typeof VARIANT; loading?: boolean }) {
  return (
    <button
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={`pressable relative inline-flex min-h-12 items-center justify-center rounded-control px-4 font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${VARIANT[variant]} ${className}`}
      {...props}
    >
      {/* The label keeps its box (and its accessible name) while loading, so the width never changes. */}
      <span className={`inline-flex items-center gap-2 ${loading ? "opacity-0" : ""}`}>{children}</span>
      {loading ? (
        <span aria-hidden data-button-spinner className="absolute inset-0 flex items-center justify-center">
          <LoaderCircle strokeWidth={1.75} className="size-4 animate-spin motion-reduce:animate-none" />
        </span>
      ) : null}
    </button>
  );
}
