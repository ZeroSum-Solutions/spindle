# Publishing a base module

This runbook takes one base module from its drafts (`content/<module>/drafts`) to a published, assignable version. It adds no rule of its own. Every step calls an existing evidence script or publisher RPC, and the database gate decides (ADR 0005, ADR 0007, ADR 0004 and D-12/D-13).

## Who runs it, and where

| Target | Who | How |
|---|---|---|
| Isolated scratch Postgres (any loopback port except 54322) | Any agent, for rehearsals | As below |
| Shared local stack (`127.0.0.1:54322`) | The LEAD only, after admitting every migration | The LEAD sets `SPINDLE_ALLOW_SHARED_DB=1` for that run; without it, every script refuses :54322 |
| Production | The owner, with the LEAD; never an agent alone | Not supported by these scripts: they accept loopback database URLs only and refuse any remote host. Production publishing gets its own procedure before launch (D-08). |

## What you need

- **Toolchain:** run everything as `mise exec -- …`, from `packages/evidence`.
- **Database:** `SPINDLE_DB_URL` points at the target: a loopback `postgresql://` URL, with no query string, and every migration applied (see the table above).
- **Publisher:** `SPINDLE_PUBLISHER_ID` is a content publisher's user id (`private.content_publishers`).
- **Contact:** `SPINDLE_CONTACT_EMAIL` is sent to the literature APIs.
- **Private directories:** each must be outside the repository, mode 700. The scripts refuse a directory inside the repo.
  - `SPINDLE_EVIDENCE_DIR`: abstracts, full-text sections, publisher excerpts.
  - `SPINDLE_REVIEW_DIR`: review packets and outcomes.
  - `SPINDLE_EXCERPT_DIR`: the publisher-excerpt text files named in `content/<module>/sources.json`. The text is quoted exactly, at most 300 words per source, and is **never committed**.
  - `SPINDLE_MODULE_STATE_DIR`: slot→claim map and course id.
- **Reviewer:** the `codex` CLI signed in on the subscription. Sol runs as `gpt-6.1-sol` with `xhigh` effort, from a fresh, credential-free home.

## Inputs (committed)

- `content/<module>/drafts/NN-*.json`: lessons, one per number (two drafts with the same number are refused). Each science block binds `claim-slot:` ids, and each `claimSlots` entry gives `statement`, `domain`, `evidenceLevel`, `population` and candidate sources.
- `content/<module>/sources.json`: every source the drafts cite, with its DOI and PMID (both are passed to ingest and must agree). Each entry can also carry:
  - a D-12 override (`kindOverride` plus `justification`);
  - D-13 open-license full-text sections (`fullText`: exact section names or table labels);
  - D-13 publisher-excerpt *locators* (`excerpts`: file name, locator, attribution). The text itself is never in the repository.
- `content/<module>/module.json`: course title, description, level, outcomes and part order. Course, part and lesson ids are UUIDv5 values derived from the module key and the lesson ids, so every run addresses the same rows.

## Steps

Run from `packages/evidence` with the environment set.

1. **Sources.** Ingest every source, record overrides, and add full text and publisher excerpts:
   ```sh
   mise exec -- pnpm exec tsx scripts/module.ts sources --manifest ../../content/<module>/sources.json
   ```
   Every source must end `ready`. A blocked source names its reason (kind, license, retraction, missing year or abstract, identifiers that disagree). Fix the manifest or the draft; never force it. A stored excerpt is reused only when its text and attribution are identical. To replace one, remove it from the private evidence file, run again, and review the claims that rely on it again.
2. **Claims.** Create one claim per slot from the drafts:
   ```sh
   mise exec -- pnpm exec tsx scripts/module.ts claims --drafts ../../content/<module>/drafts
   ```
   - Each claim is checkpointed as soon as it exists, and an interrupted run recovers an identical committed claim instead of duplicating it.
   - A re-run reuses a claim while its statement, metadata and sources are unchanged, and creates a new one when the slot changed.
   - Slots that no draft defines any more drop out of the map.
   - A slot whose source is missing loses its mapping and blocks the step (exit 1).
   - A slot defined differently in two lessons is refused before any write.
   - The state file records the publisher and database it belongs to and is written atomically (temporary file, then rename). A state file written for another publisher or database is refused: use one `SPINDLE_MODULE_STATE_DIR` per publisher and database.
   - **Recovery:** if the state file is reported unreadable (an interrupted write) or has an unknown shape, move it aside and run step 2 again. It recovers this publisher's identical claims (same text, metadata and exact sources) instead of creating duplicates.
   - Two slots with an identical claim share one claim id; `claim-ids.txt` lists each id once.
3. **Course draft.** Save the course tree, with slots replaced by claim ids. Each slot must be unchanged since step 2, so run step 2 after any draft change:
   ```sh
   mise exec -- pnpm exec tsx scripts/module.ts course --module ../../content/<module>/module.json --drafts ../../content/<module>/drafts
   ```
4. **Claim review (Sol).**
   ```sh
   mise exec -- pnpm exec tsx scripts/review.ts --claims "$(cat "$SPINDLE_MODULE_STATE_DIR/claim-ids.txt")" --timeout-ms 3600000
   ```
   - Exit 0 prints Sol's session id and one verdict per claim.
   - A refused review (exit 1) records nothing. Sol's raw answer is in the private `outcome.json`; fix the cause and run again.
5. **Record claim receipts.**
   ```sh
   mise exec -- pnpm exec tsx scripts/record-review.ts --dir "$SPINDLE_REVIEW_DIR/<packet digest>"
   ```
6. **Content review (Sol).** This covers every science block, every lesson and the course, against SAFETY.md:
   ```sh
   mise exec -- pnpm exec tsx scripts/review.ts --course "$(cat "$SPINDLE_MODULE_STATE_DIR/course-id.txt")" --safety ../../docs/curriculum/SAFETY.md --timeout-ms 3600000
   ```
7. **Record content receipts.** Use `record-review.ts --dir <packet dir>` as in step 5. Record every outcome, including `unsupported` and `changes_required` verdicts: they are true receipts, and the gate refuses on them.
8. **Fix and repeat.** Any finding is a content change in the drafts, made by the content owner. Then repeat steps 2–7.
   - The review commands always review everything they are given: step 4 reviews every claim in `claim-ids.txt`, and step 6 reviews the whole course.
   - What carries over is the receipts. The gate accepts a receipt for an unchanged claim, science block, lesson or course shell; anything that changed needs a fresh receipt. Editing the course title, description, outcomes, part titles or lesson order changes the course shell.
   - Repeat until every claim is approved, every science block is `supported`, and every lesson and the course are `clean`. Practice blocks have no block receipt; their text is reviewed within the lesson.
9. **Publish.**
   ```sh
   mise exec -- pnpm exec tsx scripts/publish.ts --course "$(cat "$SPINDLE_MODULE_STATE_DIR/course-id.txt")"
   ```
   This rechecks every cited source for retraction. It then calls `publisher_publish_course_checked`, whose gate repeats every receipt check and prints the version id.
10. **Assign and confirm.** A gym owner or lead assigns the version (`assign_version`). The learner's `module_status(<assignment>)` must report the lesson count, `quiz_required` and `questions_total` for the graded quiz, and `complete = false` until the lessons and the quiz are done.

## Privacy and licensing

- Abstracts, full-text sections and publisher excerpts stay in the private directories and in review packets. They are never committed, logged in public CI, or shown to learners (D-13).
- Full text is used only when every recorded license is open (CC BY, CC0 or public domain). A table is excerpted only when it is a plain grid. Anything else is a publisher excerpt with a page or section locator.

## Rehearsal record

The latest rehearsal run, with exact commands, Sol session ids and outcomes, is kept outside the repository in the LEAD's goal-state notes (`P3-publish-rehearsal.md`).
