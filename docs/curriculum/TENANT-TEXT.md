# Admitting gym text (LEAD and publisher runbook)

Gyms write a few texts that members see next to Spindle's own labels. Most of them are **held**: a saved text stays pending, and no member or published version shows it, until a content publisher records an admission. This page says how to review and decide held texts, and how to record an override.

## What is held

| Slot | Belongs to | Members see it |
|---|---|---|
| `brand_name` | the gym | through `member_tenant_texts`; "Your gym" until one is admitted |
| `catalog_headline`, `catalog_tagline`, `coach_name`, `coach_role` | the gym | through `member_tenant_texts`, once admitted |
| `course_title` | one gym method course | in versions only; publish refuses a gym course whose current title is not admitted |
| `welcome`, `course_blurb` | one gym method course | through `version_tenant_texts`, in versions published after admission |

Versions freeze each held course text with its receipt id. Members read welcome notes and blurbs only through `version_tenant_texts`, which checks that the receipt is still live; the learner projection leaves them out.

A gym saves a course title with the course draft: a new or changed title becomes a pending `course_title` row by itself. Course subtitles are not held: text admission checks them at save and again at publish. Lesson bodies are neither held nor text-admitted. They keep the existing method-course rules (practice-based only, no claims, structural validation).

A welcome note is signed with a name resolved when the course is published: the gym's admitted coach name, else its admitted brand name, else "Your gym". Each version keeps the name it was published with, and the receipt of the coach or brand name it came from. If you later revoke that name, published versions show "Your gym" in its place.

Every save is a new row, so an edit always sends a slot back to pending. An edited welcome note or blurb is left out of the next published version until its new text is admitted. Versions published earlier keep their text.

## Before a gym saves: the automatic filter

`save_tenant_text` runs text admission (`private.admit_tenant_text`, rule set `tt-2026-10-11.1`) and stores nothing on a refusal. The filter refuses:

- hidden and control characters;
- links, addresses and markup;
- citation and outcome shapes: a year in parentheses ("(2019)"), "et al.", or a percentage with an outcome ("reduces pain by 30%", "30% stronger"). Other years and percentages pass ("Coaching since 2012", "80% of 1RM");
- reserved words (science, review and evidence wording, Spindle, medical claims), even when the gym disguises them with spacing, look-alike letters or leet.

**The filter is advisory, and it can be evaded.** It is a first screen that catches common disguises: spacing, look-alike letters, leet, and spaced-out words. A determined writer can still get wording past it. It never decides anything:

- No held text is ever served to a member or published until a content publisher records an admission bound to its exact text hash.
- Read the whole text yourself. Never admit because the filter passed it.
- When in doubt, reject with a reason the gym can act on.

## Review

Use this rule: a held text is introductory coaching practice only. That covers what the course or gym covers, how the coach works, and how to start. Reject a text that:

- states or implies research, evidence, review or approval, in any wording;
- makes a medical, injury or outcome claim, or promises results;
- names or imitates Spindle, its labels, the base curriculum or a professional credential;
- addresses minors as participants (`youth` means youth coaching education only);
- includes personal data about anyone other than the coach.

For a welcome note, also check the gym's admitted coach name or brand name: the next publish signs the note with it.

### List what is pending

Run read-only as the database owner, from a trusted machine, against loopback or the production procedure's connection:

```sql
select t.id as text_id, o.slug as gym, t.slot, t.course_id, t.text, t.text_hash, t.saved_at
from private.tenant_texts t
join public.orgs o on o.id = t.org_id
where t.seq = (select max(seq) from private.tenant_texts x
               where x.org_id = t.org_id and x.slot = t.slot and x.course_id is not distinct from t.course_id)
  and private.tenant_text_status(t.id) = 'pending'
order by t.saved_at;
```

Only the newest row of a slot can be decided. An older pending row was replaced by a later save, so skip it.

## Decide

Decide as the service role, acting for your publisher id. Copy `text_hash` from the list above: the decision must name the exact text you read.

```sql
begin;
select set_config('role', 'service_role', true), set_config('request.jwt.claims', '{"role":"service_role"}', true);
select public.publisher_decide_tenant_text('<publisher id>', '<text_id>',
  '{"decision": "admitted", "reason": "Introductory coaching practice only.", "textHash": "<text_hash>"}');
commit;
```

- Use `"decision": "rejected"` with a reason the gym can act on. The owner and lead see the decision and the reason through `tenant_text_status`.
- A decision is final. A changed text is a new row, so it needs a new decision.
- The RPC refuses, and records nothing, when:
  - the text changed since you listed it (`stale hash`);
  - a newer save replaced it;
  - it was already decided;
  - an admission no longer passes text admission under the rules in force.

**Verify.** `private.tenant_text_status('<text_id>')` returns `admitted` or `rejected`. For a gym slot, a member of that gym now sees the text through `member_tenant_texts`. For a course slot, it appears in the snapshot only after the gym's next publish. For a course title, that publish is now allowed.

## Revoke an admission

Revoke an admitted text that should not have been admitted, or that the gym asks to withdraw:

```sql
begin;
select set_config('role', 'service_role', true), set_config('request.jwt.claims', '{"role":"service_role"}', true);
select public.publisher_revoke_tenant_text('<publisher id>', '<text_id>', '{"reason": "<why, for the gym>"}');
commit;
```

The effects are immediate:

- Gym texts leave `member_tenant_texts`. A revoked brand name reads as "Your gym".
- In versions already published, `version_tenant_texts` reports a revoked welcome note or blurb as `revoked`, with no text, and a revoked title as "Untitled course".
- The next publish leaves a revoked welcome note or blurb out. A revoked title blocks publishing until the gym saves the draft again and you admit the title anew.
- The owner and lead see `revoked` and your reason through `tenant_text_status`.

Only an admitted text can be revoked, and a revocation is final. A gym's new save is a new text that needs a new decision.

One limit: a revoked gym title stays inside the stored learner projection of versions published before the revocation, where a member can still read it directly. The player must take gym titles from `version_tenant_texts`, which shows the fallback.

## Overrides

A gym may need a reserved word in its own name or wording, for example a registered name such as "Sports Science Lab". Record an override for that exact text, in that gym and that slot:

```sql
begin;
select set_config('role', 'service_role', true), set_config('request.jwt.claims', '{"role":"service_role"}', true);
select public.publisher_record_text_override('<publisher id>', jsonb_build_object(
  'orgId', '<gym id>', 'slot', 'brand_name', 'text', 'Sports Science Lab',
  'reason', 'Registered business name; checked against the registry.'));
commit;
```

- The override covers only the reserved-word step. Hidden characters, links, citation and outcome shapes, and length are still refused, and the RPC refuses an override for any of them.
- It matches the text after normalization (NFC and trimmed edges), and nothing else: "Sports Science Lab!" or the same text in another slot or gym is still refused.
- It never admits a held text. A held text with an override, such as a brand name, still waits for your decision.
- Record the evidence behind the reason. Never grant an override for wording that would read as Spindle's science, review or credential labels.

## When the rule set changes

A new rule set is a new version, inserted by a migration (the TypeScript copy in `packages/engine/src/tenant-text-rules.ts` must match; a test checks it). Admitted texts are checked again under the new rules at the next publish. A course whose admitted welcome note or blurb now fails cannot publish until the gym edits the text and you admit the new one, or the gym clears it.
