-- Held tenant texts and gym drafts need read committed (Sol R2 W5, R3 W): their newest-row checks
-- must see rows other sessions committed after this transaction began. This file runs its own
-- transaction at repeatable read and expects every such entry point to refuse. Synthetic only.
begin isolation level repeatable read;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'alice@a.test', now()),
  ('00000000-0000-0000-0000-0000000000c1', 'pat@spindle.test', now());
insert into public.orgs (id, name, slug) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Gym A', 'gym-a');
insert into public.memberships (org_id, user_id, role) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-0000000000a1', 'owner');
insert into private.content_publishers (user_id, note) values ('00000000-0000-0000-0000-0000000000c1', 'test publisher');

select set_config('role', 'authenticated', true),
  set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}', true);
select throws_ok($$select public.save_course_draft('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', jsonb_build_object('id', 'a1000000-0000-4000-8000-000000000000',
  'slug', 'hinge', 'layer', 'method', 'title', 'Hinge basics', 'subtitle', '', 'description', '', 'level', 'foundation', 'outcomes', '[]'::jsonb,
  'parts', jsonb_build_array(jsonb_build_object('id', 'a1000000-0000-4000-8000-0000000000f1', 'ordinal', 1, 'title', 'Part', 'summary', '',
    'lessons', jsonb_build_array(jsonb_build_object('id', 'a1000000-0000-4000-8000-0000000000a1', 'slug', 'set-up', 'title', 'Set-up',
      'summary', '', 'durationMinutes', 5, 'format', 'article', 'objectives', '[]'::jsonb, 'anatomyIds', '[]'::jsonb,
      'blocks', jsonb_build_array(jsonb_build_object('kind', 'paragraph', 'content', 'Brace.', 'support', 'practice-based', 'claimIds', '[]'::jsonb)),
      'media', '[]'::jsonb, 'resources', '[]'::jsonb))))))$$,
  '25000', 'content writes need read committed isolation', 'a gym draft save refuses repeatable read');
select throws_ok($$select public.save_tenant_text('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'catalog_headline', null, 'Lift well')$$,
  '25000', 'content writes need read committed isolation', 'a held-text save refuses repeatable read');
select set_config('role', 'service_role', true), set_config('request.jwt.claims', '{"role":"service_role"}', true);
select throws_ok($$select public.publisher_decide_tenant_text('00000000-0000-0000-0000-0000000000c1', gen_random_uuid(),
  '{"decision": "admitted", "reason": "x", "textHash": "x"}')$$, 'P0002', 'no such tenant text',
  'a decision on a missing text fails before the lock');
select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
select throws_ok($$select private.lock_held_slot('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null)$$,
  '25000', 'content writes need read committed isolation', 'the slot lock every decision and revocation takes refuses repeatable read');

select * from finish();
rollback;
