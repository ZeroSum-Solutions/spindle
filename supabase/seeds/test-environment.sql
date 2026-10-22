-- Local and CI stacks only: `supabase start` and `supabase db reset` load this seed after the
-- migrations. `supabase db push` loads it only with `--include-seed`, which must never be passed
-- to a hosted database. The marker lets a test transaction that also sets
-- spindle.fixture_receipts record synthetic-fixture segment passes (Sol R1 PR47-03).
insert into private.test_environment default values on conflict do nothing;
