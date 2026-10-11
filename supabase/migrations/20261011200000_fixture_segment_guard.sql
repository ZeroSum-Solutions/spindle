-- T15 follow-up: a synthetic-fixture review receipt can never pass a registry clip's segment check
-- outside a test session. Test suites declare fixture receipts per transaction with
-- set_config('spindle.fixture_receipts', 'on', true); application and evidence-script code never
-- sets it. This guards against an accident (a fixture-reviewed clip labelled "described by a
-- model" to learners); it is not a security boundary against a caller holding the service key.

create function private.guard_fixture_segment_pass()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.kind = 'segment' and new.outcome = 'pass'
     and coalesce(current_setting('spindle.fixture_receipts', true), '') <> 'on'
     and (exists (select 1 from public.review_runs r where r.id in (new.run_id, new.describer_run_id) and r.model like 'synthetic-fixture%')
          or coalesce(new.describer_model, '') like 'synthetic-fixture%') then
    raise exception 'invalid check.run: a synthetic-fixture review cannot pass a segment outside tests' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger practice_media_checks_fixture_guard before insert on public.practice_media_checks
  for each row execute function private.guard_fixture_segment_pass();

revoke all on function private.guard_fixture_segment_pass() from public, anon, authenticated, service_role;
