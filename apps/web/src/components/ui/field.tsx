import { useId } from "react";

/**
 * A labelled text field. `hint` and `error` are announced with the input (aria-describedby);
 * an error also marks the field invalid and draws the danger edge. The value is never cleared.
 */
export function Field({ label, name, hint, error, ...props }: { label: string; name: string; hint?: string; error?: string } & React.ComponentProps<"input">) {
  const id = useId();
  const described = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <input
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={described}
        className={`min-h-11 rounded-control border bg-surface px-3 text-base ${error ? "border-danger" : "border-control"}`}
        {...props}
      />
      {hint ? <span id={`${id}-hint`} className="text-label text-text-muted">{hint}</span> : null}
      {error ? <span id={`${id}-error`} className="text-label text-danger">{error}</span> : null}
    </label>
  );
}
