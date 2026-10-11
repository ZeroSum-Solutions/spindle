# Keeping published content honest

Published versions are immutable. What changes over time is the standing of what they cite: claim approvals run out, claims are withdrawn, papers are retracted, and video clips change or disappear. This page states what the system does in each case, what proves it, and the maintenance runs that keep it current.

Learners never see receipts. They see a plain flag on the affected block, and new publishes stop until the content is fixed.

## What happens, and what proves it (T17)

| Event | New publishes | Learners of an already-published version | Proof |
|---|---|---|---|
| A claim's approval passes 24 months (capped by its model review date) | Refused: the claim is `expired` | The block keeps its Science label and shows **"Evidence due for recheck"** | pgTAP: `content.test.sql` "an expired claim fails the gate"; `evidence.test.sql` "an expired claim blocks a new publish" and "after publication a learner sees withdrawn, recheck_due and retracted claims". Render: `blocks.test.ts` "splits the run…". e2e: `player-lifecycle.spec.ts` "an expired approval keeps the Science presentation…" |
| A claim is rejected after approval (withdrawn) | Refused: the claim is `rejected` | The block loses the Science presentation and shows **"Claim withdrawn"**. The text and its sources stay, and so does the full review history. | pgTAP: `evidence.test.sql` "a claim rejected after approval blocks a new publish" and "withdrawing a claim keeps its history". Render: `blocks.test.ts`. e2e: `player-lifecycle.spec.ts` "a claim rejected after publication loses the Science presentation…" |
| A cited paper is retracted | Refused: the source has a recorded retraction | The version shows its retraction notice and the block shows **"Source retracted"**. Credit is kept and completion stays possible. | pgTAP: `evidence.test.sql` (retracted state). e2e: `player.spec.ts` "a retraction flags the version, keeps credit and still allows completion". Script: `retraction-recheck.ts` (below) |
| Provider metadata for a clip is more than 30 days old | No effect on publishing | The title and channel are no longer shown; the clip still plays if publishable | pgTAP: "metadata older than 30 days is not served" |
| A clip is retired | Refused | The clip is disabled; its metadata is deleted | pgTAP: "retiring a clip deletes its provider metadata" |
| A clip's embed check or segment review is over 90 days old, failed, or its description is over 90 days old | Refused | The clip turns off at once in every version, with no new content version. The lesson still renders and completes. | pgTAP: "a clip whose embed check is older than 90 days cannot publish", "a segment review older than 90 days stops playback", "a failed segment review stops playback…", "a fresh review of a description older than 90 days does not make the clip playable". e2e: `player-video.spec.ts` "a switched-off clip offers nothing", "a playing clip that is switched off stops at once", "…the lesson completes without playing" |
| A clip is disabled | Refused | Off at once, in every version | pgTAP: "disabling a clip takes effect at once in a published version". e2e: `player-video.spec.ts` |

## Maintenance runs

All runs use the evidence scripts in `packages/evidence/scripts` against the database the content lives in. They need the publisher environment from PUBLISHING.md (`SPINDLE_DB_URL`, `SPINDLE_PUBLISHER_ID`, `SPINDLE_CONTACT_EMAIL`). They call only the free literature APIs and YouTube oEmbed: no new vendor and no model. Each run exits non-zero when someone has to act.

| Cadence | Command | What it does | When it exits non-zero |
|---|---|---|---|
| Monthly, 1st | `tsx scripts/retraction-recheck.ts` (try `--dry-run` first) | Rechecks every cited DOI source with Crossref, OpenAlex and Unpaywall. Records each retraction, which flags every published version citing it. Unknown status is never treated as "not retracted". | A retraction was recorded, a status is unknown, a cited source has no DOI, or a retraction is already on record. |
| Weekly | `tsx scripts/media.ts recheck` | oEmbed-checks every active clip. A failure records a failed embed check and disables the clip. | A clip failed or was disabled |
| Weekly | `tsx scripts/media.ts refresh` | Refreshes provider metadata older than 25 days, so it is always under the 30-day serving limit. A clip the provider removed or refuses is marked unavailable and gets a failed embed check. | A refresh failed |
| Every 60 days per clip (before its 90-day limit) | `tsx scripts/segment-review.ts --media <id> --safety docs/curriculum/SAFETY.md` | New Gemini description, then Sol review (D-11); `--reuse <dir>` after a lesson edit. | Not approved, or refused by the spend cap or interval |
| Monthly | The claims-due query below | Lists approvals that expire within 60 days, so they can be re-reviewed (`review.ts --claims …`) before learners see "Evidence due for recheck". | Review any listed claim |

Claims due within 60 days (run read-only, as the database owner):

```sql
select c.id, c.statement, max(r.expires_at) as expires_at
from public.claims c join public.claim_reviews r on r.claim_id = c.id and r.decision = 'approved'
where private.claim_status(c.id) = 'approved'
group by c.id, c.statement
having max(r.expires_at) < now() + interval '60 days'
order by expires_at;
```

### Schedule

These runs need the publisher's database credentials and the founder's local stack, so they run where that stack lives: on the founder's Mac, under launchd. GitHub Actions cannot reach a local database, so it is not used here, and no hosted scheduler is added.

Proposal for the founder or LEAD to install (not installed by any agent):

- **Plist:** `~/Library/LaunchAgents/com.spindle.maintenance.monthly.plist` runs a wrapper on the 1st of each month at 07:00. The wrapper calls `retraction-recheck.ts` and then the claims-due query, with output in `~/Backups/spindle/maintenance/<date>.log`.
- **Weekly plist:** a second plist (`…weekly`) runs `media.ts recheck` and `media.ts refresh` on Mondays at 07:00.
- **Alerts:** each wrapper exits non-zero on anything to act on. launchd keeps the exit status, and the existing healthcheck can surface it.

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
- **Lifecycle fixtures:** `expire` and `withdraw` (player-fixtures) moved a claim from approved to expired to rejected. Its review history read "approved, approved, rejected", and cleanup left no rows.
