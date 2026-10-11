# T12: publish the shoulder module on the shared stack, and accept it

This runbook publishes the real shoulder module (`content/shoulder`) on the shared local stack (`127.0.0.1:54322`), following [PUBLISHING.md](PUBLISHING.md). It then runs the phase-3 acceptance as a learner in a fresh session.

**Only the LEAD runs it, after admitting every migration on `main`.** It writes to the shared database. No agent runs any step below against :54322.

The same flow was rehearsed three times on an isolated scratch database. Rehearsal 3 (main b0e70ac + #31 + #32, drafts from #33) published version 79b1f8c0… on scratch. The expected results below come from that run.

## 0. Before anything

1. **Code.** Use a clean checkout of `main`:
   ```sh
   git -C ~/projects/spindle fetch origin
   git -C ~/projects/spindle switch --detach origin/main
   git -C ~/projects/spindle rev-parse HEAD
   ```
   Record the SHA. Every later receipt names it.
2. **Stack.** `supabase status` shows the shared stack running. Mailpit on :54324 receives sign-in codes.
3. **Toolchain.** `mise exec -- pnpm install`, then `mise exec -- pnpm check`. Run everything below as `mise exec -- …` from `packages/evidence` unless stated otherwise.
4. **Environment.** Write it to a private file, for example `~/.config/spindle/t12.env` with mode 600. Never commit it or paste it in chat.
   ```sh
   export SPINDLE_DB_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres'
   export SPINDLE_ALLOW_SHARED_DB=1
   export SPINDLE_PUBLISHER_ID='<publisher user id on the shared stack, step 2>'
   export SPINDLE_CONTACT_EMAIL='<contact address for the literature APIs>'
   export SPINDLE_EVIDENCE_DIR=~/Private/spindle/evidence     # may be the rehearsal's: abstracts, full text, excerpts
   export SPINDLE_EXCERPT_DIR=~/Private/spindle/excerpts      # the BESS excerpt files named in sources.json
   export SPINDLE_REVIEW_DIR=~/Private/spindle/review-shared  # new, empty
   export SPINDLE_MODULE_STATE_DIR=~/Private/spindle/state-shared  # new, empty: state is bound to one publisher and database
   ```
   Each directory must be outside the repository, with mode 700 (`mkdir -p … && chmod 700 …`). The state directory **must be new**. A state file written for scratch is refused on the shared database, and that refusal is correct.

## 1. Back up first

Write the backup to `~/Backups/spindle/`, not to the Inbox:

```sh
mkdir -p ~/Backups/spindle && chmod 700 ~/Backups/spindle
ts=$(date -u +%Y%m%dT%H%M%SZ)
docker exec supabase_db_spindle pg_dump -U postgres -d postgres -Fc > ~/Backups/spindle/shared-pre-t12-$ts.dump
pg_restore --list ~/Backups/spindle/shared-pre-t12-$ts.dump | grep -c 'TABLE DATA'   # non-zero
ls -l ~/Backups/spindle/shared-pre-t12-$ts.dump
```

Keep the file name. Restoring is a LEAD decision. If it is needed:

```sh
docker exec -i supabase_db_spindle pg_restore -U postgres -d postgres --clean --if-exists < ~/Backups/spindle/shared-pre-t12-$ts.dump
```

Never use `supabase db reset` here.

## 2. Dry run: read-only checks and packet builds

Run as the database owner with psql (`docker exec -i supabase_db_spindle psql -U postgres -d postgres -v ON_ERROR_STOP=1`). Everything in this step only reads.

```sql
-- Every migration on main is applied (the list must match supabase/migrations on main).
select version from supabase_migrations.schema_migrations order by version;
-- The shoulder course does not exist yet (UUIDv5 "course:shoulder"; the same id on every database).
select id, layer, title from public.courses where id = '99bc81db-798f-5c4a-b01a-bcba6eeef23f';
select count(*) from public.curriculum_versions where course_id = '99bc81db-798f-5c4a-b01a-bcba6eeef23f';
-- Nothing yet from this publisher.
select count(*) from public.claims where created_by = '<publisher id>';
```

Expected: the migration list matches main, and the other queries return 0 rows or 0.

**If the course already exists,** stop and decide. Re-running is safe by design (the ids are stable and the steps reuse unchanged rows), but say so in the receipt.

**Publisher.** If no content publisher exists yet, the LEAD creates one. This is the only manual write outside the scripts:

```sql
begin;
insert into auth.users (id, email, email_confirmed_at)
values ('<new uuid>', 'publisher@spindle.test', now());
insert into private.content_publishers (user_id, note) values ('<new uuid>', 'T12 shared-stack publisher');
commit;
```

**Packet dry runs.** Once steps 3 to 5 below have run, check each review before calling Sol. `--dry-run` builds and checks the packet without calling the model:

```sh
mise exec -- pnpm exec tsx scripts/review.ts --claims "$(cat "$SPINDLE_MODULE_STATE_DIR/claim-ids.txt")" --dry-run
mise exec -- pnpm exec tsx scripts/review.ts --course "$(cat "$SPINDLE_MODULE_STATE_DIR/course-id.txt")" --safety ../../docs/curriculum/SAFETY.md --dry-run
```

Each prints a packet digest and exits 0, and nothing is recorded.

## 3. Publish (PUBLISHING.md steps 1 to 9)

Source the environment, then run from `packages/evidence`:

| # | Command | Expected (rehearsal 3) |
|---|---|---|
| 3 | `mise exec -- pnpm exec tsx scripts/module.ts sources --manifest ../../content/shoulder/sources.json` | 19/19 sources `ready`. Overrides recorded: ACSM and BESS as position stands, Frank and Cavanaugh as anatomy references. Frank full text: sections 2–4 and Table 1. BESS: 3 private excerpts, 252 words. |
| 4 | `mise exec -- pnpm exec tsx scripts/module.ts claims --drafts ../../content/shoulder/drafts` | 22 claim slots mapped, `claim-ids.txt` written, exit 0 |
| 5 | `mise exec -- pnpm exec tsx scripts/module.ts course --module ../../content/shoulder/module.json --drafts ../../content/shoulder/drafts` | course 99bc81db-798f-5c4a-b01a-bcba6eeef23f saved with 8 lessons |
| – | the two `--dry-run` commands in step 2 | packet digests, exit 0 |
| 6 | `mise exec -- pnpm exec tsx scripts/review.ts --claims "$(cat "$SPINDLE_MODULE_STATE_DIR/claim-ids.txt")" --timeout-ms 3600000` | exit 0, a Sol session id, 22 verdicts `approve` |
| 7 | `mise exec -- pnpm exec tsx scripts/record-review.ts --dir "$SPINDLE_REVIEW_DIR/<printed digest>"` | 22 receipts recorded |
| 8 | `mise exec -- pnpm exec tsx scripts/review.ts --course "$(cat "$SPINDLE_MODULE_STATE_DIR/course-id.txt")" --safety ../../docs/curriculum/SAFETY.md --timeout-ms 3600000` | exit 0, a Sol session id, 51 items: 42 science blocks `supported`, 8 lessons and the course `clean` |
| 9 | `mise exec -- pnpm exec tsx scripts/record-review.ts --dir "$SPINDLE_REVIEW_DIR/<printed digest>"` | 51 receipts recorded |
| 10 | `mise exec -- pnpm exec tsx scripts/publish.ts --course "$(cat "$SPINDLE_MODULE_STATE_DIR/course-id.txt")"` | retraction recheck: 19 sources, none retracted; prints the **version id** |

**On any refusal, stop.**

- A rejected claim or a `changes_required` or `unsupported` receipt is a content finding. It goes back to the content owner (PUBLISHING.md step 8).
- Record the outcome anyway, then re-run from step 4 after the drafts change on main.
- Never force a step and never edit rows by hand.

Sol runs on the Codex subscription, so no metered calls are made. Each review run took 10–40 minutes in rehearsal.

**After publishing, verify as the owner, read-only:**

```sql
select v.id, v.version_number, v.rules, v.question_set_hash is not null as has_qset,
  (select count(*) from public.version_lessons where version_id = v.id) as lessons,
  (select count(distinct claim_id) from public.version_claims where version_id = v.id) as claims,
  (select count(*) from jsonb_path_query(v.learner_snapshot, '$.parts[*].lessons[*].blocks[*] ? (@.kind == "quiz" && @.support == "science").content.answerIndex')) as leaked_keys
from public.curriculum_versions v where v.course_id = '99bc81db-798f-5c4a-b01a-bcba6eeef23f' order by version_number desc limit 1;
```

Expected: `rules = phase3`, `has_qset = true`, 8 lessons, 22 claims, `leaked_keys = 0`.

## 4. Gym, learner and assignment

Use synthetic accounts only, on `.test` addresses, so Mailpit receives their codes. Run as the owner with psql. The RPCs run as each user, as in the rehearsal:

```sql
insert into auth.users (id, email, email_confirmed_at) values
  ('7e512000-0000-4000-8000-00000000a001', 't12-owner@spindle.test', now()),
  ('7e512000-0000-4000-8000-00000000a002', 't12-learner@spindle.test', now()),
  ('7e512000-0000-4000-8000-00000000b001', 't12-outsider@spindle.test', now());
begin;
select set_config('role', 'authenticated', true), set_config('request.jwt.claims', '{"sub":"7e512000-0000-4000-8000-00000000a001","role":"authenticated","email":"t12-owner@spindle.test"}', true);
select public.create_org('T12 acceptance gym', 't12-gym') as org \gset
select public.create_invite(:'org', 't12-learner@spindle.test', 'trainer') as token \gset
commit;
begin;
select set_config('role', 'authenticated', true), set_config('request.jwt.claims', '{"sub":"7e512000-0000-4000-8000-00000000a002","role":"authenticated","email":"t12-learner@spindle.test"}', true);
select public.accept_invite(:'token');
commit;
begin;
select set_config('role', 'authenticated', true), set_config('request.jwt.claims', '{"sub":"7e512000-0000-4000-8000-00000000a001","role":"authenticated","email":"t12-owner@spindle.test"}', true);
select public.assign_version(:'org', '<version id>', '7e512000-0000-4000-8000-00000000a002') as assignment \gset
commit;
\echo assignment :assignment
```

Before the learner signs in, `module_status(:'assignment')` run as the learner must return: `lessons_total 8`, `lessons_completed 0`, `quiz_required true`, `questions_total 21`, `quiz_passed false`, `complete false`.

## 5. The acceptance run (fresh session)

Use a fresh browser profile or a new EGO Lite task space, with no cookies. The app runs from main (`mise exec -- pnpm dev`, :3000) against the shared stack. Keep screenshots and notes in the ignored receipts folder, never in the repository.

**The pass mark is 80%.** The quiz has 21 graded questions, so 17 correct passes and 16 fails. To get the answer key in course order, run as the owner, read-only:

```sql
select q ->> 'questionId', q ->> 'answerIndex'
from public.curriculum_versions v, jsonb_array_elements(private.graded_questions(v.snapshot)) q
where v.id = '<version id>';
```

| # | Check | Pass when |
|---|---|---|
| A1 | Sign in as `t12-learner@spindle.test` with the emailed code (Mailpit :54324) | Lands on `/gyms/t12-gym/learn`; the assignment for "Shoulder" is listed |
| A2 | Open the module | 8 lessons in order 01–08; progress 0 of 8; the quiz is shown as required and not passed |
| A3 | Open **each** of the 8 lessons | Every block renders. Science blocks show the Science label and "Show sources" with the real sources. Practice blocks are labelled practice-based and carry no sources. Diagrams show their legend. Graded questions show the prompt only, never options with the answer marked or the explanation. Safety warnings point to the stop rules and "When to refer out". |
| A4 | Complete each lesson | Each completion sticks after a reload; progress reaches 8 of 8; `module_status` shows `lessons_completed 8` and `complete false` (the quiz is still due) |
| A5 | **Failing attempt:** answer exactly 16 correctly (5 wrong) and submit | Result: not passed, 16/21. No answers or explanations are shown. `quiz_attempt_review(<attempt>)` as the learner is refused ("opens after a passing attempt"). `complete false`. |
| A6 | **Passing attempt:** answer all 21 correctly and submit | Result: passed, 21/21. The answer review opens with the explanations. `module_status` shows `quiz_passed true`, `complete true`. |
| A7 | **Persistence:** sign out, close the browser, then sign in again in a new fresh session | 8 of 8 lessons complete, quiz passed, module complete. No duplicate completions: `select count(*) from public.lesson_completions where user_id = '…a002'` is 8. Reloading and re-completing changes nothing. |

**Negatives (each must fail closed):**

| # | Check | Pass when |
|---|---|---|
| N1 | Signed out, open the module URL | Redirect to sign-in; no content |
| N2 | Sign in as `t12-outsider@spindle.test` (no membership) and open the learner's module URL | Not found; no title, lessons or quiz shown |
| N3 | As the outsider, `select * from public.module_status('<assignment>')` and `select * from public.version_integrity('<version id>')` | `module_status` is refused ("no such assignment"). `version_integrity` works for any signed-in user, because the version is global and readable by everyone; it reveals no assignment and no progress. |
| N4 | As the learner, `quiz_attempt_review` of an attempt id that is not theirs, and as the owner, `quiz_attempt_review` of the learner's passing attempt | Both refused ("no such attempt"). The answer key is never shown to owners or leads. |
| N5 | As the learner, `submit_quiz_attempt` with 20 answers, a duplicate question id, or an option index out of range | Refused (22023: "every graded question needs exactly one answer", "is answered twice", or an invalid index); no attempt stored |
| N6 | As the learner, `complete_lesson` with a lesson id that is not in the version | Refused ("lesson is not in this version") |
| N7 | As the learner (trainer role), `save_course_draft` or `publish_course` | Refused (42501) |
| N8 | `select learner_snapshot` as the learner: count graded `answerIndex` and `explanation` keys | 0 and 0 |
| N9 | As the learner, `select snapshot from public.curriculum_versions` | Refused: learners read `learner_snapshot` only |

## 6. Receipt

Record outside the repository, in the LEAD's goal-state notes:

- the main SHA;
- the backup file name;
- the migration list;
- both Sol session ids and the packet digests;
- the receipt counts;
- the version id, the assignment id, and `module_status` before and after;
- the attempt ids with their scores;
- the result of every check, A1–A7 and N1–N9, with screenshot file names.

Mark any check that did not run as unverified, never as passed.
