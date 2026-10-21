-- T15 follow-up (Sol R1 PR47-03, 04, 05): a registry clip's segment passes only with a GPT-6.1 Sol
-- review, and a synthetic-fixture receipt never passes one outside a test database.
--
-- Fixture receipts need two things at once:
--   1. the test-environment marker: a row in private.test_environment. No migration writes it and
--      no API role can (every grant is revoked). Only local and CI setup provisions it, through
--      the seed supabase/seeds/test-environment.sql that `supabase start` and `db reset` load;
--      `db push` never loads seeds, so a hosted database has no marker;
--   2. the transaction flag set_config('spindle.fixture_receipts', 'on', true), which a suite sets
--      for its own transaction. Any session can set a custom setting, so the flag alone is not
--      enough.
-- This guards against accidents (a fixture-reviewed clip labelled "described by a model" to
-- learners); it is not a boundary against the database owner, who can change anything.

create table private.test_environment (
  marker boolean primary key default true check (marker),
  provisioned_at timestamptz not null default now()
);
comment on table private.test_environment is
  'Test-only marker. Provisioned by supabase/seeds/test-environment.sql on local and CI stacks; never in a hosted database.';
alter table private.test_environment enable row level security;
revoke all on table private.test_environment from public, anon, authenticated, service_role;

/** True only in a test database (marker) whose current transaction declared fixture receipts (flag). */
create function private.fixture_receipts_allowed()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(current_setting('spindle.fixture_receipts', true), '') = 'on'
     and exists (select 1 from private.test_environment)
$$;

/** True when a check rests on a synthetic-fixture run, as its review or as its description. */
create function private.check_uses_fixture(c public.practice_media_checks)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(c.describer_model, '') like 'synthetic-fixture%'
      or exists (select 1 from public.review_runs r where r.id in (c.run_id, c.describer_run_id) and r.model like 'synthetic-fixture%')
$$;

/**
 * A passing segment check is reviewed by gpt-6.1-sol, whoever inserts it (the RPC or a direct
 * write). A synthetic-fixture review or description passes only where fixture receipts are
 * allowed. After the row's own constraints, so a malformed row still reports its constraint.
 */
create function private.guard_segment_pass()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  reviewer text;
begin
  if new.kind <> 'segment' or new.outcome <> 'pass' then return new; end if;
  if private.check_uses_fixture(new) then
    if not private.fixture_receipts_allowed() then
      raise exception 'invalid check.run: a synthetic-fixture review cannot pass a segment outside tests' using errcode = '22023';
    end if;
  end if;
  select r.model into reviewer from public.review_runs r where r.id = new.run_id;
  if reviewer is distinct from 'gpt-6.1-sol' and not (reviewer like 'synthetic-fixture%' and private.fixture_receipts_allowed()) then
    raise exception 'invalid check.run: a segment passes only with a gpt-6.1-sol review' using errcode = '22023';
  end if;
  return new;
end;
$$;

/**
 * Appends a failed segment check for every clip whose latest segment check is a pass that this
 * guard would refuse now: a synthetic-fixture receipt or a reviewer other than gpt-6.1-sol. The
 * clip then stops playing and publishing until a real review passes it. Returns the count.
 */
create function private.retire_unreviewed_segment_passes()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  n integer;
begin
  insert into public.practice_media_checks (media_id, kind, outcome, checked_at, notes, recorded_by)
  select c.media_id, 'segment', 'fail', clock_timestamp(),
    'Retired: only a gpt-6.1-sol review of a real description passes a segment (Sol R1 PR47-04).',
    '00000000-0000-0000-0000-000000000000'
  from public.practice_media_checks c
  where c.seq in (select max(l.seq) from public.practice_media_checks l where l.kind = 'segment' group by l.media_id)
    and c.outcome = 'pass'
    and (private.check_uses_fixture(c)
         or (select r.model from public.review_runs r where r.id = c.run_id) is distinct from 'gpt-6.1-sol');
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Lock order (Sol R2, R3): a writer locks clip rows (private.lock_media, FOR UPDATE), and
-- receiptSql may lock several in one transaction in packet order, not id order. Then it writes
-- practice_media_checks. `create trigger` locks that table, and the retirement needs a key-share
-- lock on each retired clip's row, so taking rows one by one can deadlock with a writer. Instead
-- take EXCLUSIVE on practice_media first: it conflicts with the ROW SHARE every row-lock holder
-- keeps, so this waits until every open writer transaction ends, and new writers wait for this
-- migration. A writer already holding a row keeps its table lock and can lock more rows. Plain
-- reads (ACCESS SHARE) are not blocked.
-- One statement: the Supabase CLI runs each migration statement on its own, so a lock taken in
-- one statement would be gone by the next. The retirement covers passes stored before this guard
-- (Sol R1 PR47-04).
do $$
begin
  lock table public.practice_media in exclusive mode;
  create trigger practice_media_checks_segment_guard after insert or update on public.practice_media_checks
    for each row execute function private.guard_segment_pass();
  perform private.retire_unreviewed_segment_passes();
end;
$$;

revoke all on function private.fixture_receipts_allowed(), private.check_uses_fixture(public.practice_media_checks),
  private.guard_segment_pass(), private.retire_unreviewed_segment_passes() from public, anon, authenticated, service_role;
