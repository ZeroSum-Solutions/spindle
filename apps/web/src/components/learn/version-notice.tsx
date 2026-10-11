import { Minus, Pencil, Plus } from "lucide-react";
import type { DeltaView } from "@/lib/learning/view";

const ICON = { "aria-hidden": true, strokeWidth: 1.75, className: "mt-1 size-4 shrink-0 text-text-muted" } as const;

/** What changed between the learner's previous assigned version and this one: a compact list, one muted explanation. */
export function VersionNotice({ delta, versionNumber, credited = false }: { delta: DeltaView; versionNumber: number; credited?: boolean }) {
  const rows = [
    { label: "Changed", icon: <Pencil {...ICON} />, items: delta.changed },
    { label: "Added", icon: <Plus {...ICON} />, items: delta.added },
    { label: "Removed", icon: <Minus {...ICON} />, items: delta.removed },
  ].filter((r) => r.items.length > 0);
  return (
    <section aria-labelledby="changes-title" className="flex flex-col gap-3 rounded-card bg-surface-muted p-4">
      <h2 id="changes-title" className="font-medium">
        What changed from v{delta.fromVersionNumber} to v{versionNumber}
      </h2>
      {rows.length > 0 ? (
        <dl className="flex flex-col gap-1.5">
          {rows.map((r) => (
            <div key={r.label} className="flex items-start gap-2">
              {r.icon}
              <dt className="sr-only">{r.label}</dt>
              <dd>
                <span aria-hidden className="font-medium">{r.label}:</span> {r.items.join(", ")}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p>No lesson changed.{credited ? " Your credit carried over." : ""}</p>
      )}
      <p className="text-label text-text-muted">
        Changed lessons open again if you had completed them. Removed lessons keep your completion in v{delta.fromVersionNumber}. Unchanged lessons you completed carry their credit.
      </p>
    </section>
  );
}
