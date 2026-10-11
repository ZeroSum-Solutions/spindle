# ADR 0005: Content publishing in the database

- Status: accepted, 2026-10-11

## Decision
- **Drafts and versions.** `courses`, `course_parts`, `lessons` and `lesson_blocks` hold editable drafts in the existing Course → Part → Lesson → Block vocabulary. Publishing freezes the whole tree into one immutable `curriculum_versions` row (a JSON snapshot in the `@spindle/schema` `Course` shape), plus one `version_lessons` row per lesson.
- **Who owns what.** Base and modality courses are global (`org_id` null). Method courses belong to one gym and are always practice-based. The table constraint `(layer = 'method') = (org_id is not null)` makes this structural.
- **Two write paths, no direct writes.** No client key and no service key has INSERT, UPDATE or DELETE on these tables.
  - Gym owners and leads call `save_course_draft`, `publish_course` and `assign_version`. Learners call `complete_lesson`.
  - Global content is written only by the `publisher_*` functions. Only the service role may execute them. Each call names an actor that must be listed in `private.content_publishers`, and each call is written to `private.content_audit`. Publishers are granted by owner-run SQL, never from token metadata.
- **The publish gate** runs in the database on every publish:
  - a science block must cite at least one claim, and every claim must be approved, unexpired and not retracted (the latest review decides; a retracted source retracts every claim citing it);
  - the block's exact content (kind and content, by sha256) and its exact claim set must have a `supported` binding review from a publisher. So a valid but unrelated citation fails, and so does a quiz whose explanation changed after review;
  - practice-based blocks carry no claims; method content cannot claim science; a base-layer quiz must bind claims;
  - the gate recomputes block hashes, so rows written around the validator still fail.
- **Hashes.** sha256 over Postgres's canonical `jsonb` text, as 64 lowercase hex characters. The lesson hash covers the lesson as it appears in the snapshot; the version hash covers the snapshot. Only the database computes them; other code compares them for equality.
- **Progress.** `assignments` bind a member to a version. `lesson_completions` hold one row per learner, version and lesson, so completing twice counts once. A lesson with the same id and hash in another assigned version of the course gets carried credit that points to the original completion. This happens whichever comes first, the assignment or the completion, and assigning again restores any missing credit. Changed lessons reopen and removed lessons drop out.
- **Concurrency.** Publishes take a shared transaction lock and a retraction takes it exclusively, before any check or scan. So a retraction either flags a version published at the same time or makes that publish fail. One learner's assignments and completions in an org are serialized the same way. These functions require read committed isolation (the Supabase default).
- **Sources.** Citation metadata depends on the kind: a textbook needs its edition and page (`locator`), a position stand needs a DOI, and a systematic review or meta-analysis needs a DOI or PMID. A nomenclature source may cite a URL. An approval must expire in the future; there is no maximum term.
- **Retractions.** Recording a retraction flags every published version that cites an affected claim (`version_flags`). Versions are never edited.
- **Storage.** `org-media` objects live under `<org_id>/…`: members read, owners and leads write. A trigger stops any caller, the service role included, from moving an object between orgs or buckets. `content-media` holds global media that signed-in users read and only the server writes.
- **JSON at the boundary.** Every `jsonb` argument is validated in SQL (types, lengths, enums, unknown keys, safe links) and normalized before it is stored or hashed. The rules match `@spindle/schema` ingress, or are stricter, so `parseCourse` accepts every published snapshot:
  - slugs use single hyphens;
  - links are root-relative `[A-Za-z0-9._~-]` paths without dot segments, queries or fragments, or https URLs without credentials, with an alphabetic top-level label and a valid port;
  - provenance and diagram ids are plain identifiers;
  - required text is blank by JavaScript's `trim` rules;
  - lengths count UTF-16 units.

## Why
- The plan requires the gate "in the database and CI, not by convention". Tenant callers must not be able to manufacture receipts, so reviews sit behind the service role and a named publisher.
- Whole-tree snapshots make "a published version can't be changed" a single-row guarantee, and the lesson player reads one row.
- Keying binding reviews on content hash and claim set means a review survives re-saving identical text and expires the moment the text or citations change.

## Consequences
- Editing published content means publishing a new version. Gyms cannot delete a course that has versions; deleting the whole gym removes its versions and progress.
- `quiz_attempts`, a provenance table and spaced-review items are later work.
