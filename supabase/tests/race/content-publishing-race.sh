#!/usr/bin/env bash
# Two connections race on content writes. In each case the first transaction
# runs its operation, signals ready and stays open. The second operation then
# starts, and the case counts only if that second backend is seen waiting on
# the content advisory lock held by the first one (proven overlap). Then the
# first commits and the committed state is checked (cases 5-6 wait on the
# course row lock instead of an advisory lock):
#   1. publish, then retract a cited source: the new version gets flagged.
#   2. retract, then publish a course citing it: the publish is refused.
#   3. complete a lesson in v1, then assign v2: v2 gets the carried credit.
#   4. assign v2, then complete the lesson in v1: v2 gets the carried credit.
#   5. save a new draft, then record a lesson review of the old packet: the
#      review waits for the save and is refused as stale.
#   6. record a lesson review, then save a new draft: the review stays bound to
#      the old hash, so the new draft cannot publish on it.
#   7. retire a registry clip, then refresh its metadata: the refresh waits and
#      is refused, and no metadata survives the retirement.
#   8. retire a clip, then reactivate it: the activation waits and is refused,
#      and the clip stays retired.
# It commits synthetic rows, so it refuses the shared local stack: point
# RACE_DB_URL at an isolated database, or run it in CI's ephemeral stack.
# Every connection, statement and wait is bounded. On exit or interruption it
# stops only its own children and backends, removes its fixtures and fails if
# that cleanup fails.
set -euo pipefail

DB="${RACE_DB_URL:-}"
if [ -z "$DB" ]; then
  if [ "${CI:-}" = "true" ]; then DB=postgresql://postgres:postgres@127.0.0.1:54322/postgres
  else echo "set RACE_DB_URL to an isolated database (this test commits rows)" >&2; exit 2; fi
fi
case "$DB" in *:54322/*) [ "${CI:-}" = "true" ] || { echo "refusing the shared local stack on :54322 outside CI" >&2; exit 2; } ;; esac

P=7ace0000-0000-4000-8000-0000000000c1   # publisher
O=7ace0000-0000-4000-8000-0000000000a1   # gym owner
T1=7ace0000-0000-4000-8000-0000000000a3  # learners
T2=7ace0000-0000-4000-8000-0000000000a4
ORG=7ace0000-0000-4000-8000-00000000a000
C1=7ace0001-0000-4000-8000-000000000000  # global courses citing K1, K2
C2=7ace0002-0000-4000-8000-000000000000
C3=7ace0003-0000-4000-8000-000000000000  # gym method course
C4=7ace0004-0000-4000-8000-000000000000  # global course for the stale-review cases
RUN="content-race-$$"                     # application_name prefix of every backend this run owns
TMP="${TMPDIR:-/tmp}/$RUN"
OWNED=""                                  # pids of this run's child processes
export PGCONNECT_TIMEOUT=5
export PGOPTIONS="-c statement_timeout=30s -c lock_timeout=30s -c idle_in_transaction_session_timeout=30s"
psql() { command psql "$DB" -X -q -v ON_ERROR_STOP=1 "$@"; }
q() { PGAPPNAME="$RUN-probe" psql -At -c "$1"; }

# >>> process control (sourced by content-publishing-race-proc.test.sh)
# OWNED lists only children not yet reaped. A PID counts as running only while
# this shell's job table says so: once a child is reaped (by wait or by bash
# itself), its number may belong to an unrelated process and is never signalled.
running() { case " $(jobs -rp | tr '\n' ' ') " in *" $1 "*) return 0 ;; esac; return 1; }
forget() { OWNED=$(echo " $OWNED " | sed "s/ $1 / /"); }
# Bounded wait for one child; returns its status (and forgets it) or 124 on timeout.
wait_child() { # $1 pid, $2 seconds
  local n=$(( $2 * 20 )) status=0
  while running "$1"; do
    n=$((n - 1)); [ "$n" -gt 0 ] || return 124
    sleep 0.05
  done
  wait "$1" 2>/dev/null || status=$?
  forget "$1"
  return "$status"
}
stop_children() {
  local pid
  for pid in $OWNED; do if running "$pid"; then kill -TERM "$pid" 2>/dev/null || true; fi; done
  for pid in $OWNED; do
    if ! wait_child "$pid" 5; then
      if running "$pid"; then kill -KILL "$pid" 2>/dev/null || true; fi
      wait "$pid" 2>/dev/null || true
      forget "$pid"
    fi
  done
}
# <<< process control
# Polls with a new connection each try, so activity and lock views are fresh.
poll() { # $1 SQL returning t when ready, $2 tries of 50 ms
  local i
  for i in $(seq 1 "$2"); do [ "$(q "$1" 2>/dev/null)" = t ] && return 0; sleep 0.05; done
  return 1
}

remove_fixtures() {
  PGOPTIONS="-c statement_timeout=20s -c lock_timeout=10s" psql >/dev/null <<SQL || return 1
begin;
alter table public.sources disable trigger user; alter table public.claims disable trigger user;
alter table public.claim_sources disable trigger user; alter table public.claim_reviews disable trigger user;
alter table public.source_retractions disable trigger user; alter table public.binding_reviews disable trigger user;
alter table public.curriculum_versions disable trigger user; alter table public.version_lessons disable trigger user;
alter table public.version_claims disable trigger user; alter table public.version_flags disable trigger user;
alter table public.review_runs disable trigger user; alter table public.lesson_reviews disable trigger user;
alter table public.course_reviews disable trigger user;
alter table public.practice_media disable trigger user; alter table public.practice_media_checks disable trigger user;
alter table public.practice_media_status disable trigger user;
delete from public.practice_media_metadata where recorded_by = '$P';
delete from public.practice_media_status where recorded_by = '$P';
delete from public.practice_media_checks where recorded_by = '$P';
delete from public.practice_media where admitted_by = '$P';
delete from public.orgs where id = '$ORG';
delete from public.courses where id in ('$C1', '$C2', '$C4');
delete from public.binding_reviews where reviewer = '$P';
delete from public.lesson_reviews where reviewer = '$P';
delete from public.course_reviews where reviewer = '$P';
delete from public.claim_reviews where reviewer = '$P';
delete from public.source_retractions where recorded_by = '$P';
delete from public.claim_sources where claim_id in (select id from public.claims where created_by = '$P');
delete from public.claims where created_by = '$P';
delete from public.sources where created_by = '$P';
delete from public.review_runs where recorded_by = '$P';
delete from private.content_audit where actor in ('$P', '$O', '$T1', '$T2');
delete from auth.users where id in ('$P', '$O', '$T1', '$T2');
alter table public.sources enable trigger user; alter table public.claims enable trigger user;
alter table public.claim_sources enable trigger user; alter table public.claim_reviews enable trigger user;
alter table public.source_retractions enable trigger user; alter table public.binding_reviews enable trigger user;
alter table public.curriculum_versions enable trigger user; alter table public.version_lessons enable trigger user;
alter table public.version_claims enable trigger user; alter table public.version_flags enable trigger user;
alter table public.review_runs enable trigger user; alter table public.lesson_reviews enable trigger user;
alter table public.course_reviews enable trigger user;
alter table public.practice_media enable trigger user; alter table public.practice_media_checks enable trigger user;
alter table public.practice_media_status enable trigger user;
commit;
SQL
  [ "$(q "select count(*) from auth.users where id in ('$P', '$O', '$T1', '$T2')")" = 0 ]
}

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  q "select count(pg_terminate_backend(pid)) from pg_stat_activity
     where application_name like '$RUN-%' and application_name <> '$RUN-probe'" >/dev/null 2>&1 || true
  stop_children
  if ! remove_fixtures; then echo "not ok - cleanup failed; synthetic fixtures may remain" >&2; status=1; fi
  rm -rf "$TMP"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
mkdir -p "$TMP"
remove_fixtures || { echo "could not clear old fixtures" >&2; exit 1; }

as_user() { echo "select set_config('role', 'authenticated', true), set_config('request.jwt.claims', '{\"sub\":\"$1\",\"role\":\"authenticated\"}', true);"; }
as_service() { echo "select set_config('role', 'service_role', true), set_config('request.jwt.claims', '{\"role\":\"service_role\"}', true);"; }
course() { # $1 course id, $2 layer, $3 block json
  echo "jsonb_build_object('id', '$1', 'slug', 'race-' || left('$1', 8), 'layer', '$2', 'title', 'Race fixture',
    'subtitle', '', 'description', 'Synthetic.', 'level', 'foundation', 'outcomes', '[]'::jsonb,
    'parts', jsonb_build_array(jsonb_build_object('id', left('$1', 34) || 'f1', 'ordinal', 1, 'title', 'Part', 'summary', '',
      'lessons', jsonb_build_array(jsonb_build_object('id', left('$1', 34) || '11', 'slug', 'race', 'title', 'Race lesson',
        'summary', '', 'durationMinutes', 5, 'format', 'article', 'objectives', '[]'::jsonb, 'anatomyIds', '[]'::jsonb,
        'blocks', jsonb_build_array($3), 'media', '[]'::jsonb, 'resources', '[]'::jsonb)))))"
}
science() { echo "jsonb_build_object('kind', 'paragraph', 'content', 'Synthetic race claim $1.', 'support', 'science',
  'claimIds', jsonb_build_array((select id from public.claims where statement = 'Race claim $1')))"; }
L3=7ace0003-0000-4000-8000-000000000011
L4=7ace0004-0000-4000-8000-000000000011
# Synthetic review receipts (ADR 0007): a fixture run, never a model call.
RUNJ='{"model": "synthetic-fixture", "session": "ci-race", "packetDigest": "0000000000000000000000000000000000000000000000000000000000000002", "reviewedAt": "2026-10-01T00:00:00Z"}'
lesson_review() { # $1 lesson id, $2 expected hash, $3 claim ids json
  echo "public.publisher_review_lesson('$P', $1, jsonb_build_object('verdict', 'clean', 'expectedHash', $2,
    'claimIds', $3, 'checks', '{\"safety\": \"pass\", \"originality\": \"pass\"}'::jsonb, 'findings', '[]'::jsonb, 'run', '$RUNJ'::jsonb))"
}

psql >/dev/null <<SQL
insert into auth.users (id, email, email_confirmed_at) values
  ('$P', 'race-p@x.test', now()), ('$O', 'race-o@x.test', now()), ('$T1', 'race-t1@x.test', now()), ('$T2', 'race-t2@x.test', now());
insert into private.content_publishers (user_id, note) values ('$P', 'content race test');
begin;
insert into public.orgs (id, name, slug) values ('$ORG', 'Race Content Gym', 'race-content-gym');
insert into public.memberships (org_id, user_id, role) values ('$ORG', '$O', 'owner'), ('$ORG', '$T1', 'trainer'), ('$ORG', '$T2', 'trainer');
commit;
begin;
$(as_service)
select public.publisher_add_source('$P', '{"kind": "systematic_review", "title": "Race source 1", "doi": "10.5555/race.1", "license": "x"}');
select public.publisher_add_source('$P', '{"kind": "systematic_review", "title": "Race source 2", "doi": "10.5555/race.2", "license": "x"}');
select public.publisher_add_claim('$P', jsonb_build_object('statement', 'Race claim ' || n, 'evidenceLevel', 'synthetic',
  'population', 'synthetic', 'sourceIds', jsonb_build_array((select id from public.sources where doi = '10.5555/race.' || n))))
from generate_series(1, 2) n;
select public.publisher_review_claim('$P', id, jsonb_build_object('decision', 'approved',
  'expiresAt', to_char(now() + interval '1 year', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'expectedHash', public.publisher_claim_target('$P', id) ->> 'hash', 'run', '$RUNJ'::jsonb,
  'receipt', '{"existenceCheckedAt": "2026-10-01T00:00:00Z", "faithfulness": "faithful", "retractionCheckedAt": "2026-10-01T00:00:00Z"}'::jsonb))
from public.claims where created_by = '$P';
select public.publisher_save_course_draft('$P', $(course "$C1" base "$(science 1)"));
select public.publisher_save_course_draft('$P', $(course "$C2" base "$(science 2)"));
select public.publisher_save_course_draft('$P', $(course "$C4" base "jsonb_build_object('kind', 'paragraph', 'content', 'Cue A.', 'support', 'practice-based', 'claimIds', '[]'::jsonb)"));
select public.publisher_review_block('$P', (b ->> 'blockId')::uuid, jsonb_build_object('verdict', 'supported',
  'expectedHash', b -> 'hash', 'claimIds', b -> 'claimIds', 'run', '$RUNJ'::jsonb))
from unnest(array['$C1', '$C2']::uuid[]) c, jsonb_path_query(public.publisher_review_targets('$P', c), '\$.lessons[*].blocks[*]') b;
select $(lesson_review "(l ->> 'lessonId')::uuid" "l -> 'hash'" "l -> 'claimIds'")
from unnest(array['$C1', '$C2']::uuid[]) c, jsonb_path_query(public.publisher_review_targets('$P', c), '\$.lessons[*]') l;
select public.publisher_review_course('$P', c, jsonb_build_object('verdict', 'clean',
  'expectedHash', public.publisher_review_targets('$P', c) -> 'course' -> 'hash',
  'checks', '{"safety": "pass", "originality": "pass"}'::jsonb, 'findings', '[]'::jsonb, 'run', '$RUNJ'::jsonb))
from unnest(array['$C1', '$C2']::uuid[]) c;
commit;
begin;
$(as_user "$O")
select public.save_course_draft('$ORG', $(course "$C3" method "jsonb_build_object('kind', 'paragraph', 'content', 'House cue.', 'support', 'practice-based', 'claimIds', '[]'::jsonb)"));
select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
-- P4-A2: a gym title is held until a publisher admits it (the publisher does here, as in the pgTAP fixtures).
select public.publisher_decide_tenant_text('$P', t.id, jsonb_build_object('decision', 'admitted', 'reason', 'Race fixture title.', 'textHash', t.text_hash))
from (select * from private.tenant_texts where course_id = '$C3' and slot = 'course_title' order by seq desc limit 1) t
where not exists (select 1 from private.tenant_text_admissions a where a.text_id = t.id);
$(as_user "$O")
select set_config('race.v1', public.publish_course('$C3')::text, true);
select public.save_course_draft('$ORG', jsonb_set($(course "$C3" method "jsonb_build_object('kind', 'paragraph', 'content', 'House cue.', 'support', 'practice-based', 'claimIds', '[]'::jsonb)"), '{title}', '"Race fixture v2"'));
select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
-- P4-A2: a gym title is held until a publisher admits it (the publisher does here, as in the pgTAP fixtures).
select public.publisher_decide_tenant_text('$P', t.id, jsonb_build_object('decision', 'admitted', 'reason', 'Race fixture title.', 'textHash', t.text_hash))
from (select * from private.tenant_texts where course_id = '$C3' and slot = 'course_title' order by seq desc limit 1) t
where not exists (select 1 from private.tenant_text_admissions a where a.text_id = t.id);
$(as_user "$O")
select public.publish_course('$C3');
select public.assign_version('$ORG', current_setting('race.v1')::uuid, u) from unnest(array['$T1', '$T2']::uuid[]) u;
commit;
SQL
V1=$(q "select id from public.curriculum_versions where course_id = '$C3' and version_number = 1")
V2=$(q "select id from public.curriculum_versions where course_id = '$C3' and version_number = 2")
A1=$(q "select id from public.assignments where version_id = '$V1' and user_id = '$T1'")
A2=$(q "select id from public.assignments where version_id = '$V1' and user_id = '$T2'")

fails=0
check() { # $1 description, $2 condition (0 = pass)
  if [ "$2" -eq 0 ]; then echo "ok - $1"; else echo "not ok - $1" >&2; fails=$((fails + 1)); fi
}

# race NAME FIRST_SQL SECOND_SQL [row]. Sets OVERLAP (0 = proven), FIRST_EXIT, SECOND_EXIT.
# With "row", the wait proven is on the first transaction's row lock, not an advisory lock.
race() {
  local name=$1 fifo="$TMP/$1.fifo" first second fpid
  mkfifo "$fifo"
  PGAPPNAME="$RUN-first" psql <"$fifo" >/dev/null 2>"$TMP/$name.first" &
  first=$!; OWNED="$OWNED $first"
  exec 3<>"$fifo"
  # Ready signal: the operation finished and its transaction is still open.
  printf 'begin;\n%s\nset application_name = %s;\n' "$2" "'$RUN-ready'" >&3
  if ! poll "select exists (select 1 from pg_stat_activity
             where application_name = '$RUN-ready' and state = 'idle in transaction')" 200; then
    echo "not ok - $name: the first operation never became ready" >&2; cat "$TMP/$name.first" >&2; exit 1
  fi
  fpid=$(q "select pid from pg_stat_activity where application_name = '$RUN-ready'")
  PGAPPNAME="$RUN-second" psql >/dev/null 2>"$TMP/$name.second" <<SQL &
begin;
$3
commit;
SQL
  second=$!; OWNED="$OWNED $second"
  # Overlap: the second backend waits on a content advisory lock (7101 publishing,
  # 7102 learner) and the first, still-open transaction is what blocks it.
  OVERLAP=1
  local kind="l.locktype = 'advisory' and l.classid in (7101, 7102)"
  [ "${4:-}" = row ] && kind="l.locktype in ('transactionid', 'tuple')"
  poll "select exists (select 1 from pg_stat_activity a join pg_locks l on l.pid = a.pid and not l.granted
        where a.application_name = '$RUN-second' and $kind
          and $fpid = any (pg_blocking_pids(a.pid)))" 200 && OVERLAP=0
  printf 'commit;\n' >&3
  exec 3>&-
  FIRST_EXIT=0; wait_child "$first" 20 || FIRST_EXIT=$?
  SECOND_EXIT=0; wait_child "$second" 20 || SECOND_EXIT=$?
  if [ "$FIRST_EXIT" -eq 124 ] || [ "$SECOND_EXIT" -eq 124 ]; then
    echo "not ok - $name: a transaction did not finish in time" >&2; exit 1
  fi
  [ "$OVERLAP" -eq 0 ] || echo "# $name: the second operation never waited on the first" >&2
}

race publish-first \
  "$(as_service) select public.publisher_publish_course('$P', '$C1');" \
  "$(as_service) select public.publisher_record_retraction('$P', (select id from public.sources where doi = '10.5555/race.1'),
     '{\"origin\": \"crossref\", \"reference\": \"race\", \"detectedAt\": \"2026-10-10T00:00:00Z\"}');"
flagged=$(q "select count(*) from public.version_flags f join public.curriculum_versions v on v.id = f.version_id where v.course_id = '$C1'")
check "publish then retract: overlap proven, both commit and the new version is flagged" \
  $(( OVERLAP == 0 && FIRST_EXIT == 0 && SECOND_EXIT == 0 && flagged == 1 ? 0 : 1 ))

race retract-first \
  "$(as_service) select public.publisher_record_retraction('$P', (select id from public.sources where doi = '10.5555/race.2'),
     '{\"origin\": \"crossref\", \"reference\": \"race\", \"detectedAt\": \"2026-10-10T00:00:00Z\"}');" \
  "$(as_service) select public.publisher_publish_course('$P', '$C2');"
versions=$(q "select count(*) from public.curriculum_versions where course_id = '$C2'")
refused=1; grep -q 'which is retracted' "$TMP/retract-first.second" && refused=0
check "retract then publish: overlap proven, the publish is refused as retracted and no version exists" \
  $(( OVERLAP == 0 && FIRST_EXIT == 0 && SECOND_EXIT != 0 && refused == 0 && versions == 0 ? 0 : 1 ))

carried() { q "select count(*) from public.lesson_completions c2 join public.lesson_completions c1
  on c1.id = c2.origin_completion_id and c1.version_id = '$V1' where c2.version_id = '$V2' and c2.user_id = '$1'"; }
race complete-first \
  "$(as_user "$T1") select public.complete_lesson('$A1', '$L3');" \
  "$(as_user "$O") select public.assign_version('$ORG', '$V2', '$T1');"
check "complete in v1 then assign v2: overlap proven and v2 carries the credit to the original completion" \
  $(( OVERLAP == 0 && FIRST_EXIT == 0 && SECOND_EXIT == 0 && $(carried "$T1") == 1 ? 0 : 1 ))

race assign-first \
  "$(as_user "$O") select public.assign_version('$ORG', '$V2', '$T2');" \
  "$(as_user "$T2") select public.complete_lesson('$A2', '$L3');"
check "assign v2 then complete in v1: overlap proven and v2 carries the credit to the original completion" \
  $(( OVERLAP == 0 && FIRST_EXIT == 0 && SECOND_EXIT == 0 && $(carried "$T2") == 1 ? 0 : 1 ))

# Cases 5-6: the review packet for C4 is built from version A of its lesson.
HASH_A=$(q "select public.publisher_review_targets('$P', '$C4') #>> '{lessons,0,hash}'")
save_b() { echo "$(as_service) select public.publisher_save_course_draft('$P', $(course "$C4" base "jsonb_build_object('kind', 'paragraph', 'content', 'Cue $1.', 'support', 'practice-based', 'claimIds', '[]'::jsonb)"));"; }
race save-first "$(save_b B)" "$(as_service) select $(lesson_review "'$L4'" "'$HASH_A'" "'[]'::jsonb");" row
stale=1; grep -q 'stale review: lesson' "$TMP/save-first.second" && stale=0
reviews=$(q "select count(*) from public.lesson_reviews where lesson_id = '$L4'")
check "save then record an old review: overlap proven, the review is refused as stale and nothing is recorded" \
  $(( OVERLAP == 0 && FIRST_EXIT == 0 && SECOND_EXIT != 0 && stale == 0 && reviews == 0 ? 0 : 1 ))

HASH_B=$(q "select public.publisher_review_targets('$P', '$C4') #>> '{lessons,0,hash}'")
race review-first "$(as_service) select $(lesson_review "'$L4'" "'$HASH_B'" "'[]'::jsonb");" "$(save_b C)" row
gate=1
out=$(PGAPPNAME="$RUN-probe" psql -At -c "$(as_service) select public.publisher_publish_course('$P', '$C4');" 2>&1) \
  || { echo "$out" | grep -q 'has no clean lesson review' && gate=0; }
bound=$(q "select count(*) from public.lesson_reviews where lesson_id = '$L4' and lesson_hash = '$HASH_B'")
check "record a review then save: overlap proven, the review stays on the old hash and the new draft cannot publish" \
  $(( OVERLAP == 0 && FIRST_EXIT == 0 && SECOND_EXIT == 0 && gate == 0 && bound == 1 ? 0 : 1 ))

# Cases 7-8: two registry clips, each with fresh provider metadata.
media() { q "begin; $(as_service) select public.publisher_admit_media('$P', jsonb_build_object('provider', 'youtube', 'videoId', '$1',
  'startSeconds', 0, 'endSeconds', 30, 'rationale', 'Race clip.', 'embedCheckedAt', to_char(now(), 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"'))); commit;" | tail -1; }
meta() { echo "$(as_service) select public.publisher_refresh_media_metadata('$P', '$1', jsonb_build_object('title', 'Race clip', 'channel', 'Race', 'available', true, 'fetchedAt', to_char(now(), 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"')));"; }
status() { echo "$(as_service) select public.publisher_set_media_status('$P', '$1', '{\"status\": \"$2\", \"reason\": \"race\"}');"; }
M7=$(media RaceClip007); M8=$(media RaceClip008)
q "begin; $(meta "$M7") commit;" >/dev/null
race retire-refresh "$(status "$M7" retired)" "$(meta "$M7")" row
refused=1; grep -q "is retired" "$TMP/retire-refresh.second" && refused=0
left=$(q "select count(*) from public.practice_media_metadata where media_id = '$M7'")
check "retire then refresh metadata: overlap proven, the refresh is refused and no metadata survives" \
  $(( OVERLAP == 0 && FIRST_EXIT == 0 && SECOND_EXIT != 0 && refused == 0 && left == 0 ? 0 : 1 ))

race retire-activate "$(status "$M8" retired)" "$(status "$M8" active)" row
refused=1; grep -q "is retired" "$TMP/retire-activate.second" && refused=0
final=$(q "select status from public.practice_media_status where media_id = '$M8' order by seq desc limit 1")
check "retire then reactivate: overlap proven, the activation is refused and the clip stays retired" \
  $(( OVERLAP == 0 && FIRST_EXIT == 0 && SECOND_EXIT != 0 && refused == 0 ? 0 : 1 ))
[ "$final" = retired ] || { echo "not ok - the clip's final status is $final" >&2; fails=$((fails + 1)); }

if [ "$fails" -ne 0 ]; then
  for f in "$TMP"/*.first "$TMP"/*.second; do echo "== $(basename "$f")" >&2; cat "$f" >&2; done
  exit 1
fi
