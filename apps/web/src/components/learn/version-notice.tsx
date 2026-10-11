import type { DeltaView } from "@/lib/learning/view";

/** What changed between the learner's previous assigned version and this one. */
export function VersionNotice({ delta, versionNumber }: { delta: DeltaView; versionNumber: number }) {
  const rows: [string, string[]][] = [
    ["Changed (open again if you had completed them)", delta.changed],
    ["Added", delta.added],
    ["Removed (retired, your earlier completion stays in v" + delta.fromVersionNumber + ")", delta.removed],
  ];
  const any = rows.some(([, items]) => items.length > 0);
  return (
    <section aria-labelledby="changes-title" className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
      <h2 id="changes-title" className="font-medium">
        What changed from v{delta.fromVersionNumber} to v{versionNumber}
      </h2>
      {any ? (
        <dl className="flex flex-col gap-2">
          {rows
            .filter(([, items]) => items.length > 0)
            .map(([label, items]) => (
              <div key={label}>
                <dt className="text-label text-text-muted">{label}</dt>
                <dd>{items.join(", ")}</dd>
              </div>
            ))}
        </dl>
      ) : (
        <p>No lesson changed. Your credit carried over.</p>
      )}
      <p className="text-label text-text-muted">Unchanged lessons you completed carry their credit, linked to your original completion.</p>
    </section>
  );
}
