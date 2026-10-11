-- The publisher admission screen's reads and decision (P4-A2 rev4: "a LEAD tool, not tenant UI").
-- Signed-in content publishers act as themselves (auth.uid()); nobody else can list or decide held
-- texts, and the decision goes through publisher_decide_tenant_text with the reviewed hash.
-- Synthetic gyms and users only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'alice@a.test', now()),
  ('00000000-0000-0000-0000-0000000000a3', 'tess@a.test', now()),
  ('00000000-0000-0000-0000-0000000000c1', 'pat@spindle.test', now());
insert into public.orgs (id, name, slug) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Gym A', 'gym-a'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Gym B', 'gym-b');
insert into auth.users (id, email, email_confirmed_at) values ('00000000-0000-0000-0000-0000000000b1', 'bob@b.test', now());
insert into public.memberships (org_id, user_id, role) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-0000000000b1', 'owner');
insert into public.memberships (org_id, user_id, role) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-0000000000a1', 'owner'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-0000000000a3', 'trainer');
insert into private.content_publishers (user_id, note) values ('00000000-0000-0000-0000-0000000000c1', 'test publisher');

create function pg_temp.act_as(uid text) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.anon() returns void language sql as $$
  select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
$$;
create function pg_temp.reset_role() returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;

-- The owner saves two held texts.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select set_config('test.t1', public.save_tenant_text('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'catalog_headline', null, 'Lift well. Coach better.')::text, true);
select set_config('test.t2', public.save_tenant_text('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'catalog_tagline', null, 'Our method for teaching the barbell.')::text, true);
select pg_temp.reset_role();
select set_config('test.h1', (select text_hash from private.tenant_texts where id = current_setting('test.t1')::uuid), true);
select set_config('test.h2', (select text_hash from private.tenant_texts where id = current_setting('test.t2')::uuid), true);

-- Who is a publisher.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
select is(public.is_content_publisher(), true, 'a content publisher is recognised');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select is(public.is_content_publisher(), false, 'a gym owner is not a content publisher');
select pg_temp.anon();
select throws_ok($$ select public.is_content_publisher() $$, '42501', null, 'anonymous callers cannot even ask');

-- Listing: publishers only.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select * from public.admission_tenant_texts() $$, '42501', 'not a content publisher', 'an owner cannot list held texts');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select throws_ok($$ select * from public.admission_tenant_texts() $$, '42501', 'not a content publisher', 'a trainer cannot list held texts');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
select is((select count(*)::int from public.admission_tenant_texts() where status = 'pending' and org_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 2,
  'the publisher sees both pending texts');
select is((select text from public.admission_tenant_texts() where text_id = current_setting('test.t1')::uuid), 'Lift well. Coach better.',
  'the full text is listed');
select is((select text_hash from public.admission_tenant_texts() where text_id = current_setting('test.t1')::uuid), current_setting('test.h1'),
  'the hash is listed with the text');
select is((select org_name from public.admission_tenant_texts() where text_id = current_setting('test.t1')::uuid), 'Gym A', 'the gym is named');

-- Deciding: publishers only, with the reviewed hash, as themselves.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok(format($$ select public.admission_decide_tenant_text(%L, jsonb_build_object('decision', 'admitted', 'reason', 'x', 'textHash', %L)) $$,
  current_setting('test.t1'), current_setting('test.h1')), '42501', 'actor is not a content publisher', 'an owner cannot admit their own text');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
select throws_ok(format($$ select public.admission_decide_tenant_text(%L, jsonb_build_object('decision', 'admitted', 'reason', 'x', 'textHash', %L)) $$,
  current_setting('test.t1'), repeat('0', 64)), 'P0001', null, 'a stale hash is refused');
select is(public.admission_decide_tenant_text(current_setting('test.t1')::uuid,
  jsonb_build_object('decision', 'admitted', 'reason', 'Reviewed on the admission screen.', 'textHash', current_setting('test.h1'))), 'admitted',
  'the publisher admits with the reviewed hash');
select is(public.admission_decide_tenant_text(current_setting('test.t2')::uuid,
  jsonb_build_object('decision', 'rejected', 'reason', 'Reads as an outcome claim.', 'textHash', current_setting('test.h2'))), 'rejected',
  'the publisher rejects with a reason');
select is((select decided_by from public.admission_tenant_texts() where text_id = current_setting('test.t1')::uuid), '00000000-0000-0000-0000-0000000000c1'::uuid,
  'the decision records the signed-in publisher');
select is((select status from public.admission_tenant_texts() where text_id = current_setting('test.t2')::uuid), 'rejected', 'history shows the rejection');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select is((select text from public.member_tenant_texts('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') where slot = 'catalog_headline' and admitted),
  'Lift well. Coach better.', 'a member now reads the admitted headline');


-- Sol R1 on #46: the pending queue is never capped. An older pending text stays listed behind more
-- than 500 newer history rows (gym B's headline saved 501 times: 500 superseded values and one pending).
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select set_config('test.t3', public.save_tenant_text('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'coach_name', null, 'Coach A. Example')::text, true);
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select count(public.save_tenant_text('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'catalog_headline', null, 'Headline ' || g)) from generate_series(1, 501) g;
select pg_temp.reset_role();
select set_config('test.oldest_b', (select id::text from private.tenant_texts where org_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' order by seq limit 1), true);
select set_config('test.oldest_b_hash', (select text_hash from private.tenant_texts where id = current_setting('test.oldest_b')::uuid), true);
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
select ok(exists (select 1 from public.admission_tenant_texts() where text_id = current_setting('test.t3')::uuid and status = 'pending' and not superseded),
  'an older pending text stays in the queue behind more than 500 newer history rows');
select ok((select count(*) from public.admission_tenant_texts() where not (status = 'pending' and not superseded)) <= 500,
  'only the history is capped, at 500 rows');

-- Adversarial wrapper calls: replay, a superseded value, unknown ids; none leaves a receipt.
select set_config('test.receipts', (select count(*)::text from private.tenant_text_admissions), true);
select throws_ok(format($$ select public.admission_decide_tenant_text(%L, jsonb_build_object('decision', 'rejected', 'reason', 'x', 'textHash', %L)) $$,
  current_setting('test.t1'), current_setting('test.h1')), 'P0001', null, 'a second decision on the same value is refused');
select throws_ok(format($$ select public.admission_decide_tenant_text(%L, jsonb_build_object('decision', 'admitted', 'reason', 'x', 'textHash', %L)) $$,
  current_setting('test.oldest_b'), current_setting('test.oldest_b_hash')), 'P0001', null, 'a superseded value cannot be decided');
select throws_ok(format($$ select public.admission_decide_tenant_text(%L, jsonb_build_object('decision', 'admitted', 'reason', 'x', 'textHash', %L)) $$,
  gen_random_uuid(), repeat('a', 64)), 'P0002', null, 'a publisher deciding an unknown id gets not-found');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select throws_ok(format($$ select public.admission_decide_tenant_text(%L, jsonb_build_object('decision', 'admitted', 'reason', 'x', 'textHash', %L)) $$,
  gen_random_uuid(), repeat('a', 64)), '42501', 'actor is not a content publisher',
  'a non-publisher gets the same refusal for an unknown id as for a real one (no existence hint)');
select pg_temp.reset_role();
select is((select count(*)::text from private.tenant_text_admissions), current_setting('test.receipts'), 'no refused call left a receipt');

select * from finish();
rollback;
