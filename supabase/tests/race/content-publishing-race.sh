#!/usr/bin/env bash
# Two connections race on content writes. Each case holds the first
# transaction open on a barrier until the second is seen waiting, or until a
# bounded timeout if it never waits (the bug), then checks the committed state:
#   1. publish, then retract a cited source: the new version gets flagged.
#   2. retract, then publish a course citing it: the publish is refused.
#   3. complete a lesson in v1, then assign v2: v2 gets the carried credit.
#   4. assign v2, then complete the lesson in v1: v2 gets the carried credit.
# It commits synthetic rows, so it refuses the shared local stack: point
# RACE_DB_URL at an isolated database, or run it in CI's ephemeral stack.
# Leaves no data behind.
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
BARRIER=7103
TMP="${TMPDIR:-/tmp}/content-race.$$"
mkdir -p "$TMP"
psql() { command psql "$DB" -X -q -v ON_ERROR_STOP=1 "$@"; }

cleanup() {
  psql >/dev/null <<SQL || true
begin;
alter table public.sources disable trigger user; alter table public.claims disable trigger user;
alter table public.claim_sources disable trigger user; alter table public.claim_reviews disable trigger user;
alter table public.source_retractions disable trigger user; alter table public.binding_reviews disable trigger user;
alter table public.curriculum_versions disable trigger user; alter table public.version_lessons disable trigger user;
alter table public.version_claims disable trigger user; alter table public.version_flags disable trigger user;
delete from public.orgs where id = '$ORG';
delete from public.courses where id in ('$C1', '$C2');
delete from public.binding_reviews where reviewer = '$P';
delete from public.claim_reviews where reviewer = '$P';
delete from public.source_retractions where recorded_by = '$P';
delete from public.claim_sources where claim_id in (select id from public.claims where created_by = '$P');
delete from public.claims where created_by = '$P';
delete from public.sources where created_by = '$P';
delete from private.content_audit where actor in ('$P', '$O', '$T1', '$T2');
delete from auth.users where id in ('$P', '$O', '$T1', '$T2');
alter table public.sources enable trigger user; alter table public.claims enable trigger user;
alter table public.claim_sources enable trigger user; alter table public.claim_reviews enable trigger user;
alter table public.source_retractions enable trigger user; alter table public.binding_reviews enable trigger user;
alter table public.curriculum_versions enable trigger user; alter table public.version_lessons enable trigger user;
alter table public.version_claims enable trigger user; alter table public.version_flags enable trigger user;
commit;
SQL
  rm -rf "$TMP"
}
trap cleanup EXIT
cleanup
mkdir -p "$TMP"

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
select public.publisher_review_claim('$P', id, jsonb_build_object('decision', 'approved', 'expiresAt', '2030-01-01T00:00:00Z',
  'receipt', '{"existenceCheckedAt": "2026-10-01T00:00:00Z", "faithfulness": "faithful", "retractionCheckedAt": "2026-10-01T00:00:00Z"}'::jsonb))
from public.claims where created_by = '$P';
select public.publisher_save_course_draft('$P', $(course "$C1" base "$(science 1)"));
select public.publisher_save_course_draft('$P', $(course "$C2" base "$(science 2)"));
select public.publisher_review_block('$P', b.id, '{"verdict": "supported"}')
from public.lesson_blocks b join public.lessons l on l.id = b.lesson_id where l.course_id in ('$C1', '$C2');
commit;
begin;
$(as_user "$O")
select public.save_course_draft('$ORG', $(course "$C3" method "jsonb_build_object('kind', 'paragraph', 'content', 'House cue.', 'support', 'practice-based', 'claimIds', '[]'::jsonb)"));
select set_config('race.v1', public.publish_course('$C3')::text, true);
select public.save_course_draft('$ORG', jsonb_set($(course "$C3" method "jsonb_build_object('kind', 'paragraph', 'content', 'House cue.', 'support', 'practice-based', 'claimIds', '[]'::jsonb)"), '{title}', '"Race fixture v2"'));
select public.publish_course('$C3');
select public.assign_version('$ORG', current_setting('race.v1')::uuid, u) from unnest(array['$T1', '$T2']::uuid[]) u;
commit;
SQL
V1=$(psql -At -c "select id from public.curriculum_versions where course_id = '$C3' and version_number = 1")
V2=$(psql -At -c "select id from public.curriculum_versions where course_id = '$C3' and version_number = 2")
A1=$(psql -At -c "select id from public.assignments where version_id = '$V1' and user_id = '$T1'")
A2=$(psql -At -c "select id from public.assignments where version_id = '$V1' and user_id = '$T2'")

poll() { # $1 SQL returning true when ready, $2 tries of 50 ms
  for _ in $(seq 1 "$2"); do [ "$(psql -At -c "$1")" = t ] && return 0; sleep 0.05; done; return 1
}
waiting() { echo "select exists (select 1 from pg_stat_activity where application_name = '$1' and wait_event_type = 'Lock')"; }

# race NAME FIRST_SQL SECOND_SQL: FIRST runs, then blocks on the barrier with its
# transaction open; SECOND starts; the barrier opens once SECOND waits (or after 3 s).
race() {
  local name=$1
  PGAPPNAME=race-holder psql <<SQL >/dev/null 2>"$TMP/$name.holder" &
select pg_advisory_lock($BARRIER);
do \$\$ begin
  for i in 1..60 loop
    exit when exists (select 1 from pg_stat_activity where application_name = 'race-second' and wait_event_type = 'Lock');
    perform pg_sleep(0.05);
  end loop;
end \$\$;
select pg_advisory_unlock($BARRIER);
SQL
  local holder=$!
  poll "select exists (select 1 from pg_locks where locktype = 'advisory' and objid = $BARRIER and granted)" 100 \
    || { echo "not ok - $name: barrier never held" >&2; exit 1; }
  PGAPPNAME=race-first psql <<SQL >/dev/null 2>"$TMP/$name.first" &
begin;
$2
select pg_advisory_lock($BARRIER);
select pg_advisory_unlock($BARRIER);
commit;
SQL
  local first=$!
  poll "$(waiting race-first)" 200 || { echo "not ok - $name: first transaction never reached the barrier" >&2; cat "$TMP/$name.first" >&2; exit 1; }
  PGAPPNAME=race-second psql <<SQL >/dev/null 2>"$TMP/$name.second" &
begin;
$3
commit;
SQL
  local second=$!
  set +e
  wait "$holder"; wait "$first"; FIRST_EXIT=$?; wait "$second"; SECOND_EXIT=$?
  set -e
}

fails=0
check() { # $1 description, $2 condition (0 = pass)
  if [ "$2" -eq 0 ]; then echo "ok - $1"; else echo "not ok - $1" >&2; fails=$((fails + 1)); fi
}

race publish-first \
  "$(as_service) select public.publisher_publish_course('$P', '$C1');" \
  "$(as_service) select public.publisher_record_retraction('$P', (select id from public.sources where doi = '10.5555/race.1'),
     '{\"origin\": \"crossref\", \"reference\": \"race\", \"detectedAt\": \"2026-10-10T00:00:00Z\"}');"
flagged=$(psql -At -c "select count(*) from public.version_flags f join public.curriculum_versions v on v.id = f.version_id where v.course_id = '$C1'")
check "publish then retract: both commit and the new version is flagged" $(( FIRST_EXIT == 0 && SECOND_EXIT == 0 && flagged == 1 ? 0 : 1 ))

race retract-first \
  "$(as_service) select public.publisher_record_retraction('$P', (select id from public.sources where doi = '10.5555/race.2'),
     '{\"origin\": \"crossref\", \"reference\": \"race\", \"detectedAt\": \"2026-10-10T00:00:00Z\"}');" \
  "$(as_service) select public.publisher_publish_course('$P', '$C2');"
versions=$(psql -At -c "select count(*) from public.curriculum_versions where course_id = '$C2'")
grep -q 'which is retracted' "$TMP/retract-first.second" && refused=0 || refused=1
check "retract then publish: the publish is refused as retracted and no version exists" \
  $(( FIRST_EXIT == 0 && SECOND_EXIT != 0 && refused == 0 && versions == 0 ? 0 : 1 ))

race complete-first \
  "$(as_user "$T1") select public.complete_lesson('$A1', '$L3');" \
  "$(as_user "$O") select public.assign_version('$ORG', '$V2', '$T1');"
carried=$(psql -At -c "select count(*) from public.lesson_completions c2 join public.lesson_completions c1
  on c1.id = c2.origin_completion_id and c1.version_id = '$V1' where c2.version_id = '$V2' and c2.user_id = '$T1'")
check "complete in v1 then assign v2: v2 carries the credit to the original completion" \
  $(( FIRST_EXIT == 0 && SECOND_EXIT == 0 && carried == 1 ? 0 : 1 ))

race assign-first \
  "$(as_user "$O") select public.assign_version('$ORG', '$V2', '$T2');" \
  "$(as_user "$T2") select public.complete_lesson('$A2', '$L3');"
carried=$(psql -At -c "select count(*) from public.lesson_completions c2 join public.lesson_completions c1
  on c1.id = c2.origin_completion_id and c1.version_id = '$V1' where c2.version_id = '$V2' and c2.user_id = '$T2'")
check "assign v2 then complete in v1: v2 carries the credit to the original completion" \
  $(( FIRST_EXIT == 0 && SECOND_EXIT == 0 && carried == 1 ? 0 : 1 ))

if [ "$fails" -ne 0 ]; then
  for f in "$TMP"/*; do echo "== $f" >&2; cat "$f" >&2; done
  exit 1
fi
