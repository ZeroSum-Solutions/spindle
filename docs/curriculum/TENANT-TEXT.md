# Admitting gym text (LEAD and publisher runbook)

Gyms write a few texts that members see next to Spindle's own labels. Most of them are **held**: a saved text stays pending, and no member or published version shows it, until a content publisher records an admission. This page says how to review and decide held texts, and how to record an override.

## What is held

| Slot | Belongs to | Members see it |
|---|---|---|
| `brand_name` | the gym | through `member_tenant_texts`; "Your gym" until one is admitted |
| `catalog_headline`, `catalog_tagline`, `coach_name`, `coach_role` | the gym | through `member_tenant_texts`, once admitted |
| `course_title` | one gym method course | in versions only; publish refuses a gym course whose current title is not admitted |
| `welcome`, `course_blurb` | one gym method course | in the next version published after admission |

A gym saves a course title with the course draft: a new or changed title becomes a pending `course_title` row by itself. Course subtitles and lesson bodies are not held. Text admission checks them at save and again at publish.

A welcome note is signed with a name frozen at save: the gym's admitted coach name, else its admitted brand name, else "Your gym".

Every save is a new row, so an edit always sends a slot back to pending. An edited welcome note or blurb is left out of the next published version until its new text is admitted. Versions published earlier keep their text.

## Before a gym saves: the automatic filter

`save_tenant_text` runs text admission (`private.admit_tenant_text`, rule set `tt-2026-10-11.1`) and stores nothing on a refusal. The filter refuses:

- hidden and control characters;
- links, addresses and markup;
- citation and outcome shapes: a year in parentheses ("(2019)"), "et al.", or a percentage with an outcome ("reduces pain by 30%", "30% stronger"). Other years and percentages pass ("Coaching since 2012", "80% of 1RM");
- reserved words (science, review and evidence wording, Spindle, medical claims), even when the gym disguises them with spacing, look-alike letters or leet.

A text that reaches you has passed this filter. Your review covers what a filter cannot judge.

## Review

Use this rule: a held text is introductory coaching practice only. That covers what the course or gym covers, how the coach works, and how to start. Reject a text that:

- states or implies research, evidence, review or approval, in any wording;
- makes a medical, injury or outcome claim, or promises results;
- names or imitates Spindle, its labels, the base curriculum or a professional credential;
- addresses minors as participants (`youth` means youth coaching education only);
- includes personal data about anyone other than the coach.

For a welcome note, also read the name it is signed with.

### List what is pending

Run read-only as the database owner, from a trusted machine, against loopback or the production procedure's connection:

```sql
select t.id as text_id, o.slug as gym, t.slot, t.course_id, t.text, t.text_hash, t.display_name, t.saved_at
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
