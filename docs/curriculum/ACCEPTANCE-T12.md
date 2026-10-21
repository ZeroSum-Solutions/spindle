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
2. **Stack.** Run the key-free health checks from [TESTING.md](../TESTING.md#health-check). Do not paste `supabase status` output anywhere, because it prints local keys.
   ```sh
   pg_isready -h 127.0.0.1 -p 54322
   curl --fail --silent --show-error http://127.0.0.1:54324/api/v1/info >/dev/null
   curl --fail --silent --show-error http://127.0.0.1:54321/storage/v1/status >/dev/null
   ```
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
5. **App target, before any sign-in.** Every account in this runbook is created by an OTP sign-in through the app, so the app must be bound to the local stack first. This step only starts the server; it writes nothing.
   - The app reads `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from its process environment, with `apps/web/.env.local` as the fallback. It does not read `SPINDLE_DB_URL`, and it accepts remote URLs.
   - Set both in the server's own environment so the effective values are known, without printing the key. Stop if either check fails:
     ```sh
     cd ~/projects/spindle
     eval "$(supabase status -o env | grep '^PUBLISHABLE_KEY=')"
     test -n "$PUBLISHABLE_KEY"
     NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$PUBLISHABLE_KEY" mise exec -- pnpm --filter web dev --port 3000
     ```
   - The target is proved after the backup (step 1b): requesting a code is an Auth write.

## 1. Back up first

Write the backup to `~/Backups/spindle/`, not to the Inbox. Dump and verify **inside the database container**, whose client tools match its PostgreSQL 17. The host's `pg_restore` (v16) cannot read a v17 archive. The block stops at the first failure; do not go on to step 2 unless it prints `backup verified`.

```sh
set -euo pipefail
mkdir -p ~/Backups/spindle && chmod 700 ~/Backups/spindle
ts=$(date -u +%Y%m%dT%H%M%SZ)
docker exec supabase_db_spindle pg_dump -U postgres -d postgres -Fc -f /tmp/shared-pre-t12.dump
docker exec supabase_db_spindle pg_restore --list /tmp/shared-pre-t12.dump > /dev/null       # the table of contents reads
docker exec supabase_db_spindle pg_restore --file=/dev/null /tmp/shared-pre-t12.dump        # every data block reads
docker cp supabase_db_spindle:/tmp/shared-pre-t12.dump ~/Backups/spindle/shared-pre-t12-$ts.dump
docker exec supabase_db_spindle rm /tmp/shared-pre-t12.dump
test -s ~/Backups/spindle/shared-pre-t12-$ts.dump && echo "backup verified: shared-pre-t12-$ts.dump"
set +euo pipefail
```

Keep the file name. Restoring is a LEAD decision. It runs as one transaction and stops at the first error, so a failed restore leaves the database as it was:

```sh
set -euo pipefail
tmp=/tmp/restore-t12-$(date -u +%Y%m%dT%H%M%SZ)-$$.dump
docker cp ~/Backups/spindle/shared-pre-t12-$ts.dump supabase_db_spindle:$tmp \
  && docker exec supabase_db_spindle pg_restore -U postgres -d postgres --clean --if-exists --single-transaction --exit-on-error $tmp \
  && echo "restore succeeded"
docker exec supabase_db_spindle rm -f $tmp
set +euo pipefail
```

A failed copy stops the block before `pg_restore`, so an older file can never be restored by mistake.

Only "restore succeeded" counts as recovered.

Never use `supabase db reset` here.

### 1b. Prove the app's target (after `backup verified`, before any account)

Requesting a code creates an Auth user (`shouldCreateUser`), so this probe comes after the backup. The sign-in form calls a server action, and the server calls Auth. DevTools therefore never shows an Auth request; the proof is the server's environment (step 0.5) plus where the code arrives:

1. Note the newest message in the local Mailpit (`http://127.0.0.1:54324`).
2. In a fresh browser, open `http://127.0.0.1:3000/sign-in` and request a code for `t12-probe@spindle.test`. The server action must redirect to `/sign-in/verify?email=t12-probe%40spindle.test…` (the code-entry page), not back to the form with an error.
3. A **new** message to `t12-probe@spindle.test` must arrive in the local Mailpit within a minute. Only that message proves the app is on the local stack.
4. Do not finish the probe sign-in. Stop if no message arrives.

## 2. Dry run: read-only checks and packet builds

Run as the database owner with psql (`docker exec -i supabase_db_spindle psql -U postgres -d postgres -v ON_ERROR_STOP=1`). The preflight queries below only read. Creating the publisher, further down, is the one write in this step.

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

**Publisher.** If no content publisher exists yet, create one. This is the only manual write outside the scripts.

1. Create the account through Auth: sign in once as `t12-publisher@spindle.test` in a fresh browser, with the code from Mailpit (:54324). Auth creates a complete user row; never insert into `auth.users` by hand.
2. Register it:

```sql
begin;
insert into private.content_publishers (user_id, note)
select id, 'T12 shared-stack publisher' from auth.users where email = 't12-publisher@spindle.test';
commit;
select user_id from private.content_publishers where note = 'T12 shared-stack publisher';  -- SPINDLE_PUBLISHER_ID
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
| 6 | `mise exec -- pnpm exec tsx scripts/review.ts --claims "$(cat "$SPINDLE_MODULE_STATE_DIR/claim-ids.txt")" --timeout-ms 3600000` | exit 0, a Sol session id, one `approve` per id in `claim-ids.txt`, which is comma-separated (22 at main 56e8120) |
| 7 | `mise exec -- pnpm exec tsx scripts/record-review.ts --dir "$SPINDLE_REVIEW_DIR/<printed digest>"` | 22 receipts recorded |
| 8 | `mise exec -- pnpm exec tsx scripts/review.ts --course "$(cat "$SPINDLE_MODULE_STATE_DIR/course-id.txt")" --safety ../../docs/curriculum/SAFETY.md --timeout-ms 3600000` | exit 0, a Sol session id, and as many items as the course `--dry-run` printed (`buildContentPacket`: claim-bound science blocks + lessons + course). At main 56e8120 that is 54 items: 45 science blocks `supported`, 8 lessons and the course `clean`. |
| 9 | `mise exec -- pnpm exec tsx scripts/record-review.ts --dir "$SPINDLE_REVIEW_DIR/<printed digest>"` | one receipt per item of step 8 (54 at main 56e8120) |
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

Use synthetic accounts only, on `.test` addresses, so Mailpit receives their codes.

1. **Create the accounts through Auth.** In a fresh browser profile, sign in once each as `t12-owner@spindle.test`, `t12-learner@spindle.test` and `t12-outsider@spindle.test`, with the codes from Mailpit, then sign out. This is the same OTP path the e2e fixtures use (`userClient` in `apps/web/e2e/player-fixtures.ts`). Never insert into `auth.users` by hand: Auth needs fields (instance, audience, role) that a bare insert leaves empty.
2. **Gym, invite and assignment.** Run the RPCs as each user with psql as the owner, using the ids Auth created:

```sql
select id as owner from auth.users where email = 't12-owner@spindle.test' \gset
select id as learner from auth.users where email = 't12-learner@spindle.test' \gset
select id as outsider from auth.users where email = 't12-outsider@spindle.test' \gset
begin;
select set_config('role', 'authenticated', true), set_config('request.jwt.claims', json_build_object('sub', :'owner', 'role', 'authenticated', 'email', 't12-owner@spindle.test')::text, true);
select public.create_org('T12 acceptance gym', 't12-gym') as org \gset
select public.create_invite(:'org', 't12-learner@spindle.test', 'trainer') as token \gset
commit;
begin;
select set_config('role', 'authenticated', true), set_config('request.jwt.claims', json_build_object('sub', :'learner', 'role', 'authenticated', 'email', 't12-learner@spindle.test')::text, true);
select public.accept_invite(:'token');
commit;
begin;
select set_config('role', 'authenticated', true), set_config('request.jwt.claims', json_build_object('sub', :'owner', 'role', 'authenticated', 'email', 't12-owner@spindle.test')::text, true);
select public.assign_version(:'org', '<version id>', :'learner') as assignment \gset
commit;
\echo assignment :assignment
```

Before the acceptance session, `module_status(:'assignment')` run as the learner must return: `lessons_total 8`, `lessons_completed 0`, `quiz_required true`, `questions_total 21`, `quiz_passed false`, `complete false`.

## 5. The acceptance run (fresh session)

Use a fresh browser profile or a new EGO Lite task space, with no cookies. The app runs from the main checkout on :3000 against the shared stack.

Use the app server started in step 0.5, with the target already verified. If the server was restarted, repeat that verification before signing in.

Keep screenshots and notes in `~/.claude/goal-state/spindle/receipts/T12/`, outside the repository. Step 6 lists what to record there.

**The pass mark is 80%.** The quiz has 21 graded questions, so 17 correct passes and 16 fails. Testing both sides of that line proves the threshold. To get the answer key and the explanations in course order, run as the owner, read-only:

```sql
select q ->> 'questionId', q ->> 'answerIndex', left(q ->> 'explanation', 60)
from public.curriculum_versions v, jsonb_array_elements(private.graded_questions(v.snapshot)) q
where v.id = '<version id>';
```

Pick three explanation fragments from that list for the payload checks (A3b).

| # | Check | Pass when |
|---|---|---|
| A1 | Open `/sign-in?next=%2Fgyms%2Ft12-gym%2Flearn` and sign in as `t12-learner@spindle.test` with the emailed code (Mailpit :54324) | Lands on `/gyms/t12-gym/learn`; the assignment for "The shoulder" is listed |
| A2 | Open the module | 8 lessons in order 01–08; progress 0 of 8; the quiz is shown as required and not passed |
| A3 | Open **each** of the 8 lessons | Every block renders. Science blocks show the Science label and "Show sources" with the real sources. Practice blocks are labelled practice-based and carry no sources. All 8 diagrams show their drawing and legend (every shoulder diagram id is in the registry since #35; a missing drawing fails A3). Graded questions show the prompt only, never options with the answer marked or the explanation. Safety warnings point to the stop rules and "When to refer out". |
| A3b | **Payload leak check, before any attempt.** In the signed-in tab's console, for the quiz page and for each lesson with graded questions, fetch the page twice, once plain and once with the RSC header: `await (await fetch(path)).text()` and `await (await fetch(path, { headers: { RSC: "1" } })).text()` | No body contains `"answerIndex"` or any of the three explanation fragments, and each body is longer than 500 characters (a real page, not an error). This is the pattern in `apps/web/e2e/player-quiz.spec.ts`. |
| A4 | Complete each lesson | Each completion sticks after a reload; progress reaches 8 of 8; `module_status` shows `lessons_completed 8` and `complete false` (the quiz is still due) |
| A5 | **Failing attempt, one below the line:** answer exactly 16 correctly (5 wrong) and submit | Result: not passed, 16 of 21. No answers or explanations are shown. Repeat the A3b payload check: still no key or explanation. In DevTools, open the submission's POST to the quiz page (the server action, with a `Next-Action` header). Its response must carry the score only (16 of 21, not passed), with no `"answerIndex"` and none of the three explanation fragments. `quiz_attempt_review(<attempt>)` as the learner is refused (message contains "the answer review opens after a passing attempt"). `complete false`. |
| A6 | **Passing attempt, exactly on the line:** answer exactly 17 correctly (4 wrong) and submit | Result: passed, 17 of 21. The answer review opens with the explanations. `module_status` shows `quiz_passed true`, `complete true`. Record this attempt id for N4. |
| A7 | **Persistence:** sign out, close the browser, then sign in again in a new fresh session | 8 of 8 lessons complete, quiz passed, module complete. No duplicate completions: as the owner, `select count(*) from public.lesson_completions where user_id = :'learner' and org_id = :'org' and version_id = '<version id>'` is 8 (the unique key on org, user, version and lesson makes a duplicate impossible; this proves all 8 landed). Reloading and re-completing changes nothing. |

**Negatives (each must fail closed):**

| # | Check | Pass when |
|---|---|---|
| N1 | Signed out, open the module URL | Redirect to sign-in; no content |
| N2 | Sign in as `t12-outsider@spindle.test` (no membership) and open the learner's module URL | Not found; no title, lessons or quiz shown |
| N3 | As the outsider, `select * from public.module_status('<assignment>')` and `select * from public.version_integrity('<version id>')` | `module_status` is refused (message contains "no such assignment"). `version_integrity` works for any signed-in user, because the version is global and readable by everyone; it reveals no assignment and no progress. |
| N4 | Request the learner's **recorded passing attempt** from A6 with `quiz_attempt_review`, first as the outsider, then as the owner | Both refused (message contains "no such attempt"). The attempt exists, so this proves ownership, not absence. The answer key is never shown to owners or leads. |
| N5 | As the learner, `submit_quiz_attempt` with 20 answers, a duplicate question id, or an option index out of range | Refused (22023; message contains "every graded question needs exactly one answer", "is answered twice", or names the invalid index); no attempt stored |
| N6 | As the learner, `complete_lesson` with a lesson id that is not in the version | Refused (message contains "lesson is not in this version") |
| N7 | As the learner (trainer role), `save_course_draft` or `publish_course` | Refused (42501) |
| N8 | `select learner_snapshot` as the learner: count graded `answerIndex` and `explanation` keys | 0 and 0 |
| N9 | As the learner, `select snapshot from public.curriculum_versions` | Refused: learners read `learner_snapshot` only |

## 6. Receipt

Record outside the repository, in `~/.claude/goal-state/spindle/receipts/T12/`:

- the main SHA;
- the backup file name;
- the migration list;
- both Sol session ids and the packet digests;
- the receipt counts;
- the version id, the assignment id, and `module_status` before and after;
- the attempt ids with their scores;
- the result of every check, A1–A7 and N1–N9, with screenshot file names.

Mark any check that did not run as unverified, never as passed.
