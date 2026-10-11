-- The publisher admission screen's reads and decision (P4-A2 rev4: "a LEAD tool, not tenant UI").
-- Signed-in content publishers act as themselves (auth.uid()); nobody else can list or decide held
-- texts, and the decision goes through publisher_decide_tenant_text with the reviewed hash.
-- Synthetic gyms and users only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'alice@a.test', now()),
  ('00000000-0000-0000-0000-0000000000a3', 'tess@a.test', now()),
  ('00000000-0000-0000-0000-0000000000c1', 'pat@spindle.test', now());
insert into public.orgs (id, name, slug) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Gym A', 'gym-a');
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
select throws_ok($$ select * from public.publisher_tenant_texts() $$, '42501', 'not a content publisher', 'an owner cannot list held texts');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select throws_ok($$ select * from public.publisher_tenant_texts() $$, '42501', 'not a content publisher', 'a trainer cannot list held texts');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
select is((select count(*)::int from public.publisher_tenant_texts() where status = 'pending' and org_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 2,
  'the publisher sees both pending texts');
select is((select text from public.publisher_tenant_texts() where text_id = current_setting('test.t1')::uuid), 'Lift well. Coach better.',
  'the full text is listed');
select is((select text_hash from public.publisher_tenant_texts() where text_id = current_setting('test.t1')::uuid), current_setting('test.h1'),
  'the hash is listed with the text');
select is((select org_name from public.publisher_tenant_texts() where text_id = current_setting('test.t1')::uuid), 'Gym A', 'the gym is named');

-- Deciding: publishers only, with the reviewed hash, as themselves.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok(format($$ select public.publisher_decide_my_tenant_text(%L, jsonb_build_object('decision', 'admitted', 'reason', 'x', 'textHash', %L)) $$,
  current_setting('test.t1'), current_setting('test.h1')), '42501', 'actor is not a content publisher', 'an owner cannot admit their own text');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
select throws_ok(format($$ select public.publisher_decide_my_tenant_text(%L, jsonb_build_object('decision', 'admitted', 'reason', 'x', 'textHash', %L)) $$,
  current_setting('test.t1'), repeat('0', 64)), 'P0001', null, 'a stale hash is refused');
select is(public.publisher_decide_my_tenant_text(current_setting('test.t1')::uuid,
  jsonb_build_object('decision', 'admitted', 'reason', 'Reviewed on the admission screen.', 'textHash', current_setting('test.h1'))), 'admitted',
  'the publisher admits with the reviewed hash');
select is(public.publisher_decide_my_tenant_text(current_setting('test.t2')::uuid,
  jsonb_build_object('decision', 'rejected', 'reason', 'Reads as an outcome claim.', 'textHash', current_setting('test.h2'))), 'rejected',
  'the publisher rejects with a reason');
select is((select decided_by from public.publisher_tenant_texts() where text_id = current_setting('test.t1')::uuid), '00000000-0000-0000-0000-0000000000c1'::uuid,
  'the decision records the signed-in publisher');
select is((select status from public.publisher_tenant_texts() where text_id = current_setting('test.t2')::uuid), 'rejected', 'history shows the rejection');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select is((select text from public.member_tenant_texts('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') where slot = 'catalog_headline' and admitted),
  'Lift well. Coach better.', 'a member now reads the admitted headline');

select * from finish();
rollback;
