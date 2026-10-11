import { LoaderCircle } from "lucide-react";

const VARIANT = {
  primary: "bg-ink text-white hover:bg-ink-hover",
  secondary: "border border-control bg-surface text-text hover:bg-surface-muted",
  ghost: "text-text hover:bg-surface-muted",
} as const;

/**
 * Spindle's button. Primary actions are ink (one per screen); a gym brand never recolours them.
 * `loading` keeps the width, disables the button and announces the busy state; the press gives a
 * small physical response (`.pressable`, none under reduced motion).
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
      className={`pressable inline-flex min-h-12 items-center justify-center gap-2 rounded-control px-4 font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${VARIANT[variant]} ${className}`}
      {...props}
    >
      {loading ? <LoaderCircle aria-hidden strokeWidth={1.75} className="size-4 animate-spin motion-reduce:animate-none" /> : null}
      {children}
    </button>
  );
}
