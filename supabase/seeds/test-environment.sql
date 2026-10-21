-- Local and CI stacks only: `supabase start` and `supabase db reset` load this seed after the
-- migrations; `supabase db push` never does. The marker lets a test transaction that also sets
-- spindle.fixture_receipts record synthetic-fixture segment passes (Sol R1 PR47-03). Never load
-- it into a hosted database.
insert into private.test_environment default values on conflict do nothing;
