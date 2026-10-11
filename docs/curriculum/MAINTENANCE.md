# Keeping published content honest

Published versions are immutable. What changes over time is the standing of what they cite: claim approvals run out, claims are withdrawn, papers are retracted, and video clips change or disappear. This page states what the system does in each case, what proves it, and the maintenance runs that keep it current.

Learners never see receipts. They see a plain flag on the affected block, and new publishes stop until the content is fixed.

## What happens, and what proves it (T17)

| Event | New publishes | Learners of an already-published version | Proof |
|---|---|---|---|
| A claim's approval runs out: its expiry, at most 24 months after it was recorded and 24 months after its model review | Refused: the claim is `expired` | The block keeps its Science label and shows **"Evidence due for recheck"** | Refusal: `content.test.sql` "an expired claim fails the gate". Caps: `evidence.test.sql` "an approval recorded 25 months ago is expired whatever expiry it names" and "an approval cannot outlast its model review by more than 24 months"; `content.test.sql` "an approval lasts at most 24 months (ADR 0007)". Learner state: `evidence.test.sql` "after publication a learner sees withdrawn, recheck_due and retracted claims". Render: `blocks.test.ts` "splits the run…" (third block). e2e: `player-lifecycle.spec.ts`, step "an expired approval keeps the Science presentation…" |
| A claim is rejected after approval (withdrawn) | Refused: the claim is `rejected` | The block loses the Science presentation and shows **"Claim withdrawn"**. The text and its sources stay, and so does the full review history. | Refusal: `evidence.test.sql` "a claim rejected after approval blocks a new publish". History: "withdrawing a claim keeps its history". Render: `blocks.test.ts` "splits the run…". e2e: `player-lifecycle.spec.ts`, step "a claim rejected after publication…" (label, text, sources and history) |
| A cited paper is retracted | Refused: the claim is `retracted` | The version shows its retraction notice and the block shows **"Source retracted"**. Credit is kept and completion stays possible. | Refusal: `content.test.sql` "after a retraction the course cannot publish again until it is fixed". Learner state: `evidence.test.sql` "after publication a learner sees withdrawn, recheck_due and retracted claims". e2e: `player.spec.ts` "a retraction flags the version, keeps credit and still allows completion". Script: `retraction-recheck.ts` (below) |
| Provider metadata for a clip is more than 30 days old | No effect | The title and channel are no longer shown; the clip still plays if it is playable | pgTAP: `evidence.test.sql` "metadata older than 30 days is not served" (title and channel null) |
| A clip is disabled | Refused | Off at once, in every version, with no new content version | pgTAP: `evidence.test.sql` "a disabled clip refuses a new publish", "disabling a clip takes effect at once in a published version", "disabling a clip makes no new content version". e2e: `player-video.spec.ts` "a playing clip that is switched off stops at once…" |
| A clip is retired | Refused | Off, in every version; its metadata is deleted and retirement is final | pgTAP: `evidence.test.sql` "a retired clip refuses a new publish", "a retired clip stays off in a published version", "retiring a clip deletes its provider metadata", "retirement is final" |
| A clip's embed check fails or is over 90 days old | Refused | Off at once, in every version | pgTAP: `evidence.test.sql` "a clip whose embed check is older than 90 days cannot publish", "a failed embed recheck stops new publishes", "a failed embed check stops playback in a published version at once", "an embed check older than 90 days stops playback in a published version" |
| A clip's segment review fails, is over 90 days old, or rests on a description over 90 days old | Refused | Off at once, in every version | pgTAP: `evidence.test.sql` "a failed segment review refuses a new publish", "a segment review older than 90 days refuses a new publish", "a failed segment review stops playback in a published version at once", "a segment review older than 90 days stops playback", "a fresh review of a description older than 90 days does not make the clip playable" |

For every clip row, the lesson still renders and can be completed without the clip: `player-video.spec.ts` "a switched-off clip offers nothing" and "…the lesson completes without playing".

## Maintenance runs

Run every command from `packages/evidence`, with the pinned toolchain:

```sh
cd packages/evidence
mise exec -- pnpm exec tsx scripts/<name>.ts …
```

The environment is described in [packages/evidence/README.md](../../packages/evidence/README.md#claim-pipeline-phase-3-adr-0007), and the publishing runbook is [PUBLISHING.md](PUBLISHING.md) (added with the shoulder publish runbook, PR #32). In short:

- `SPINDLE_DB_URL` must point at a loopback database. The shared local stack on `:54322` is refused unless the lead sets `SPINDLE_ALLOW_SHARED_DB=1` after migration admission.
- `SPINDLE_PUBLISHER_ID` is the publisher row the runs act as.

There are two kinds of run.

**Free upkeep runs.** These call only the free literature APIs and YouTube oEmbed, with no model. Each exits non-zero when someone has to act.

| Cadence | Command | Also needs | What it does | Exits non-zero when |
|---|---|---|---|---|
| Daily | `scripts/media.ts refresh` | — | Refreshes provider metadata older than 25 days. A clip the provider removed or refuses is marked unavailable and gets a failed embed check. | A refresh failed |
| Weekly | `scripts/media.ts recheck` | — | oEmbed-checks every active clip and records the result, so a passing clip's embed check stays well inside 90 days. A failure records a failed embed check and disables the clip. | A clip failed or was disabled |
| Monthly, 1st | `scripts/retraction-recheck.ts` (try `--dry-run` first) | `SPINDLE_CONTACT_EMAIL` | Rechecks every cited DOI source with Crossref, OpenAlex and Unpaywall. Records each retraction, which flags every published version citing it. Unknown status is never treated as "not retracted". | A retraction was recorded, a status is unknown, a cited source has no DOI, or a retraction is already on record |
| Monthly | The claims-due query below | Database owner access, read-only | Lists claims whose approval has run out or runs out within 60 days | Any row is listed: renew it (below) |

Metadata stays under the 30-day serving limit only while the daily refresh succeeds. A refresh run that fails, or does not run for several days, lets metadata pass 30 days. The player then hides the title and channel; playback is unaffected.

**Model review runs (renewals).** These run a model and record a new review. They are not upkeep jobs: start them by hand when a renewal is due.

| What | Needs | Cost |
|---|---|---|
| Claim re-review | `SPINDLE_EVIDENCE_DIR` and `SPINDLE_REVIEW_DIR` (absolute, private, outside the repository), the claim's private evidence files from `ingest.ts`, `codex` signed in | GPT-6.1 Sol on the Codex subscription |
| Segment re-review | `SPINDLE_REVIEW_DIR`, `GEMINI_API_KEY` or `GOOGLE_API_KEY`, `codex` signed in | Metered Gemini API call (capped at $5 per month by the private ledger), then GPT-6.1 Sol |

### Claims due

Run read-only as the database owner. It uses the same rule as the publish gate: only the latest review of a claim counts, and its effective expiry is `private.approval_expiry` (the stored expiry, capped at 24 months from recording and from the model review). An older, longer approval does not hide a newer, shorter one.

```sql
select c.id, c.statement, private.claim_status(c.id) as status, private.approval_expiry(l.r) as expires_at
from public.claims c
cross join lateral (
  select r from public.claim_reviews r where r.claim_id = c.id order by r.seq desc limit 1
) l
where private.claim_status(c.id) in ('approved', 'expired')
  and private.approval_expiry(l.r) < now() + interval '60 days'
order by expires_at;
```

### Renewing a claim

1. `scripts/review.ts --claims <ids> --safety ../../docs/curriculum/SAFETY.md`. Exit 0 means Sol returned a valid result for every claim. It does not mean every claim was approved: read the printed verdicts. Exit 1 means no valid result; nothing is recorded.
2. `scripts/record-review.ts --dir <printed dir>`. Nothing changes in the database until this step. It records every verdict, so a negative verdict withdraws the claim at once in published versions.
3. Check the database: `select public.publisher_claim_target('<publisher id>', '<claim id>') ->> 'status'` as the service role returns `approved`, and the claims-due query no longer lists the claim.

Renew before the expiry. After it, learners see "Evidence due for recheck" and new publishes are refused until step 3 passes.

### Renewing a clip's segment review

A segment review counts for 90 days, and so does the description it rests on. The describer ledger allows one new description per clip per 90 days, counted from the last description or the last attempted call. A call the provider refused before doing any work (HTTP 429 or 5xx, no usage) does not count: retry once the describer is available. So a description cannot be renewed early, and every renewal has a gap:

- On day 90 the description runs out. The clip turns off in every version and new publishes that embed it are refused.
- On or after that day, `scripts/segment-review.ts --media <id> --safety ../../docs/curriculum/SAFETY.md` gets a new Gemini description and sends it to Sol.
- Exit 0 means Sol returned a valid result, which may be a fail. Exit 1 means not approved, refused (interval or spend cap) or uncertain content; uncertain content records a failed segment check.
- `scripts/record-review.ts --dir <printed dir>` records the result. The clip stays off until a passing review is recorded.
- Check the database: `private.media_publishable('<media id>')` returns `ok` (as the database owner), or the lesson's published version shows the clip as playable.

`--reuse <earlier packet dir>` is only for a lesson edit inside the 90 days. It sends the same description to Sol with the current lessons and does not extend the description's 90 days.

### Schedule

These runs need the publisher's database credentials and the founder's local stack, so they run where that stack lives: on the founder's Mac, under launchd. GitHub Actions cannot reach a local database, so it is not used here, and no hosted scheduler is added.

Proposal for the founder or the lead to install (no agent installs it):

- **Daily plist:** `~/Library/LaunchAgents/com.spindle.maintenance.daily.plist` runs `media.ts refresh` every day at 07:00.
- **Weekly plist:** `…weekly` runs `media.ts recheck` on Mondays at 07:00.
- **Monthly plist:** `…monthly` runs a wrapper on the 1st of each month at 07:00. The wrapper calls `retraction-recheck.ts` and then the claims-due query.
- **Logs:** each wrapper writes to `~/Backups/spindle/maintenance/<date>-<job>.log`.
- **Alerts:** each wrapper exits non-zero on anything to act on. launchd keeps the exit status, and the existing healthcheck can surface it.
- Model review runs are not scheduled; the monthly claims-due list and each clip's 90-day date start them.

When Spindle has a hosted production database, the same commands move to a scheduled job inside that environment; that is part of the production procedure (PUBLISHING.md).

## Scratch evidence (T17, 2026-10-11)

These runs used the isolated scratch Postgres, migrations through `20261011151000`.

- **Retraction recheck:**
  - Setup: a published synthetic course citing two sources, one per DOI. 10.1016/s0140-6736(97)11096-0 has a Crossref retraction notice (10.1016/s0140-6736(10)60175-4); 10.1155/2013/635628 is sound.
  - `--dry-run`: "1 retracted (would record), 0 unknown", nothing written, exit 1.
  - Real run: retraction recorded and 1 published version flagged, exit 1.
- **Media:**
  - `admit` stored the metadata.
  - With the metadata backdated 26 days, `refresh` refreshed it. A second `refresh` found nothing due.
  - `recheck` passed.
  - `retire` deleted the metadata, and the status became `retired`.
- **Claims-due query:** in a rolled-back transaction with four synthetic claims, the old query (highest expiry of any approval) listed none. The query above listed the three that are due: one whose newer 30-day approval followed an older 700-day one, one capped by a model review 23 months old, and one already expired. It left out the claim approved for a year.
- **Lifecycle fixtures:** `expire` and `withdraw` (player-fixtures) moved a claim from approved to expired to rejected. Its review history read "approved, approved, rejected", and cleanup left no rows.
