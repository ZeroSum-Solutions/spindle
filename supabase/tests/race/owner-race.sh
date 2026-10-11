#!/usr/bin/env bash
# Two co-owners demote themselves at the same time. Without per-org locking
# both commits succeed and the gym has no owner. Expect exactly one failure.
# Needs the local stack (`supabase start`). Leaves no data behind.
set -euo pipefail

DB="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
A=00000000-0000-0000-0000-0000000000a1
B=00000000-0000-0000-0000-0000000000b1
psql() { command psql "$DB" -X -q -v ON_ERROR_STOP=1 "$@"; }

cleanup() {
  psql -c "delete from public.orgs where slug = 'race-gym'; delete from auth.users where id in ('$A', '$B');" >/dev/null
}
trap cleanup EXIT
cleanup

psql <<SQL >/dev/null
insert into auth.users (id, email, email_confirmed_at) values ('$A', 'race-a@x.test', now()), ('$B', 'race-b@x.test', now());
begin;
insert into public.orgs (name, slug) values ('Race Gym', 'race-gym');
insert into public.memberships (org_id, user_id, role)
  select id, u, 'owner' from public.orgs, unnest(array['$A'::uuid, '$B'::uuid]) u where slug = 'race-gym';
commit;
SQL

demote() { # $1 = user id; holds its transaction open for 2 s after the change
  psql <<SQL
begin;
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims', '{"sub":"$1","role":"authenticated"}', true);
select public.set_member_role((select id from public.orgs where slug = 'race-gym'), '$1', 'lead');
select pg_sleep(2);
commit;
SQL
}

demote "$A" >/dev/null 2>"${TMPDIR:-/tmp}/race-a.err" & pid_a=$!
sleep 0.5
demote "$B" >/dev/null 2>"${TMPDIR:-/tmp}/race-b.err" & pid_b=$!
fails=0
wait "$pid_a" || fails=$((fails + 1))
wait "$pid_b" || fails=$((fails + 1))

owners=$(psql -At -c "select count(*) from public.memberships m join public.orgs o on o.id = m.org_id where o.slug = 'race-gym' and m.role = 'owner'")
if [ "$fails" -eq 1 ] && [ "$owners" -eq 1 ]; then
  echo "ok - concurrent self-demotion leaves exactly one owner"
else
  echo "not ok - failures=$fails owners=$owners" >&2
  cat "${TMPDIR:-/tmp}/race-a.err" "${TMPDIR:-/tmp}/race-b.err" >&2
  exit 1
fi
