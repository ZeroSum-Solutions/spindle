# ADR 0006: Content ingress and version credit

- Status: accepted, 2026-10-10

## Decision
- **Ingress schemas:** `@spindle/schema` has strict zod schemas for the existing Course → Part → Lesson → Block tree (`parseCatalog`, `parseCourse`). Unknown keys and unknown block kinds fail. They check shape only. `validateCatalog` still checks ids, provenance and claim approval, and the database publish gate (ADR 0005) checks that a citation fits the exact content.
- **Media and links:** `src` and `href` must be a root-relative path with no dot segments, percent escapes, backslashes or whitespace, or an `https` URL without credentials with an alphabetic top-level label, no punycode (`xn--`) labels and a port from 1 to 65535, matching the database link rule. The WHATWG URL parser must also accept it, but the result never depends on that parser alone, because its IDNA handling differs between Node releases. Every other scheme fails, `http`, `data` and `javascript` included.
- **Evidence binding shape:** a science block has one or more unique claim ids. A practice-based block has none. Blocks that cannot carry support (heading, image, diagram) cannot carry claim ids either.
- **Version credit** is a set of pure functions in `@spindle/engine`:
  - `diffVersions(previous, next)` returns the unchanged, changed, added and removed lesson ids.
  - `carryForwardCredit(previous, next, completions)` returns the rows to carry, the reopened lessons, the outstanding lessons and whether the course is complete.
  - `retireReviewItems(delta, items)` retires review items for removed lessons.
- **Credit rule:** a lesson is credited in a new version when the learner has a completion with the same lesson id and content hash in any earlier version. A carried row points at the root completion, never at another carried row. The original row stays tied to the version where it happened. A lesson with a different hash reopens. A removed lesson gets no row.
- **Hashes:** the database computes lesson content hashes (sha256 hex, ADR 0005). The engine receives them in a `VersionManifest` and only compares them for equality. TypeScript never recomputes them.

## Why
- One hash algorithm, in one place, removes any chance of the database and the app disagreeing about what changed.
- Pure functions let the database rules and the web app share one tested definition of credit.
- Shape checks at ingress stop malformed or unsafe content before it reaches the publish gate or the player. They cannot judge whether a citation is relevant, so they do not replace the review receipt.

## Consequences
- Duplicate completions collapse to the earliest one, so a double submit never counts twice. The order matches the database (`order by completed_at, id`): completion times keep PostgreSQL's microsecond precision across offsets, and ingress rejects finer precision.
- A lesson that changes and then returns to content the learner already completed gets its credit back.
- Rows for versions the caller has no manifest for are trusted as stored. The database guarantees their hashes.
