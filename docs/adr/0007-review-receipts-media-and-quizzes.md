# ADR 0007: Review receipts, claim lifecycle, practice media and graded quizzes

- Status: accepted, 2026-10-11
- Supersedes: the receipt and publish rules of [ADR 0005](0005-content-publishing.md) (binding reviews keyed on the current draft, approvals without a ceiling, no lesson review) and its "quiz_attempts are later work" consequence. Everything else in ADR 0005 stands.
- Decisions: D-08 (model review until launch, PT at launch) and D-09 (YouTube embeds), in [DECISIONS.md](../DECISIONS.md).

## Decision
- **Receipts are bound to what the reviewer saw.** The trusted recorder builds a packet from `publisher_review_targets` (or `publisher_claim_target`), which reports the database-computed hashes and sorted claim sets. It sends them back with the verdict as `expectedHash` and `claimIds`.
  - `publisher_review_block` and `publisher_review_lesson` lock the course row against a concurrent save. They then compare the current hash and claim set with the expected ones, and refuse a mismatch as a stale review. A review of content A can never be recorded against content B.
  - `publisher_review_claim` compares the claim hash (statement, evidence level, population and sorted source ids) the same way.
  - A positive verdict (approved claim, supported block, clean lesson, passing segment review) needs a `run`: model, session, packet digest and review time. The run is stored in `review_runs`, apart from the publisher actor recorded in each review's `reviewer` column. A negative verdict may be recorded without a run.
  - Receipts and runs are append-only, server-side only, and written only through the `publisher_*` functions. Clients cannot read them. The service role can read them but cannot write them directly.
- **Lesson receipts.** `lesson_reviews` binds a verdict to the exact lesson hash (the lesson as it will appear in the snapshot: practice text and frozen video fields included) and its sorted claim set. `clean` means a model run, passing safety and originality checks, and no BLOCK or WARN finding. A table check enforces this for every writer.
- **The publish gate** keeps every ADR 0005 check and adds:
  - a supported binding review must carry a model run;
  - a claim must have a model-receipted approval on its current hash, at most 24 months old, with no source on a video host;
  - a video block must match its registry entry exactly, and the clip must be active, with a passing embed check and a passing segment review in the last 90 days;
  - **global (founder) content only:** every lesson needs a clean lesson review on its exact hash and claim set. Gym method courses keep the ADR 0005 path: practice-based, no receipts, and no registry videos.
- **Claim lifecycle.** An approval lasts at most 24 months: the RPC refuses a later expiry, and the gate caps any older row at `created_at + 24 months`. An expired or rejected claim blocks new publishes. Published versions are never edited. Instead `version_integrity(version)` tells a signed-in reader each cited claim's state: `current`, `recheck_due` (approval expired), `withdrawn` (rejected after approval; the block loses its Science presentation) or `retracted`. It exposes no receipt detail. Review history is kept.
- **Practice-media registry.** YouTube clips live in `practice_media`, never in `sources`. Video id, segment and rationale are frozen (immutable rows) and copied into a `video` block. The block carries no support field and no claims, so it is always practice-based. Embed checks and segment reviews are append-only (`practice_media_checks`). Status (`active`, `disabled`, `retired`) is append-only and takes effect at once for every version, without a new content version (`version_media`). Provider title, channel and availability sit in `practice_media_metadata`. They are refreshable, served only while under 30 days old, and deleted on retirement. Sources and claims refuse YouTube-family URLs, and so does plain lesson media.
- **Graded quizzes.** A version published under these rules records `rules = 'phase3'` and the sha256 of its graded question set: every quiz block with `support: "science"`, in course order. Question ids are `<lesson id>:q<n>`. `submit_quiz_attempt` takes answers only. The database validates them (every question exactly once, options in range, no other keys) and scores them from the assigned version's snapshot. A trigger rescores any insert, so no caller can store a forged score. A pass needs at least 80% in integer arithmetic. Retries are unlimited, the best attempt counts, and an attempt key makes a double submit count once. `module_status` completes a module when every lesson is complete and a passing attempt exists. That attempt is the learner's own, or one from another version of the same course in the same gym with an identical question-set hash. Versions published before this migration (`rules = 'phase2'`), and courses without graded questions, keep the lessons-only rule.

## Why
- Sol's plan review found that a recorder could stamp a verdict onto newer content, and that changed practice guidance could publish with no review (P3-04, P3-05). Both were reproduced on the phase-2 schema before this change. Content-addressed receipts with an atomic compare close both.
- D-08 makes model review the build-time gate for base content. Gyms author their own method content, so the tenant path stays as it was.
- The plan sets 24-month claim validity, 90-day clip rechecks and 30-day provider data. A cap computed in the gate also covers rows written before the rule.
- A separate registry keeps videos out of the evidence chain by construction. Freezing the segment in the lesson hash means a registry change cannot silently alter a reviewed lesson.
- Server scoring from the immutable version means the client never decides "passed" (P3-08). Carrying credit only on an identical question-set hash, within one gym, keeps a pass from surviving changed questions or leaking between gyms (P3-09).

## Consequences
- Every phase-2 fixture now records synthetic receipts through the same RPCs (`model: "synthetic-fixture"`). CI never calls a model and has no approval shortcut.
- Editing a lesson, including only its practice text or its clip, needs a fresh lesson review before the next publish.
- Phase-2 approvals and binding reviews without a run no longer satisfy the gate. They need a receipted review before the content republishes.
- The published snapshot still contains each quiz's `answerIndex`, which signed-in readers of the version can see. Server scoring stops forged scores, not a learner who reads the answer key. Hiding answers would need a separate learner view of the snapshot and is not part of this change.
- Retraction rechecks before every publish, and the monthly recheck, run in the review harness (phase 3, milestone 2). The database records their results through the existing retraction RPC and claim reviews.
