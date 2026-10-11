// Dates render on the server and the client alike, so pin the zone and locale:
// otherwise hydration differs by machine.
const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** "11 Oct 2026" for a PostgreSQL timestamptz string. */
export function formatDate(iso: string): string {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? "an unknown date" : DATE.format(ms);
}
