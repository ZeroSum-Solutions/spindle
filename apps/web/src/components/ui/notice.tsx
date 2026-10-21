import { TriangleAlert } from "lucide-react";

/** An inline failure message. Danger red is reserved for failures (DESIGN.md › Colors). */
export function ErrorNote({ message }: { message: string | undefined }) {
  if (!message) return null;
  return (
    <p role="alert" className="flex items-start gap-2 rounded-small bg-danger-soft px-3 py-2 text-sm text-danger">
      <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
      <span>{message}</span>
    </p>
  );
}
