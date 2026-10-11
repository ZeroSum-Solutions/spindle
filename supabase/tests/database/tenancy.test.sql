-- Phase 1 acceptance: gyms cannot see or change each other's data, and the
-- role rules hold for clients and for the service role.
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

-- Fixtures: two gyms. Alice owns A, Bob owns B, Tess trains at A, Lee leads at A.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@a.test'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@b.test'),
  ('00000000-0000-0000-0000-00000000000c', 'tess@a.test'),
  ('00000000-0000-0000-0000-00000000000d', 'lee@a.test'),
  ('00000000-0000-0000-0000-00000000000e', 'eve@x.test');

create function pg_temp.act_as(uid text, email text) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'email', email, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.reset_role() returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;

select pg_temp.act_as('00000000-0000-0000-0000-00000000000a', 'alice@a.test');
select set_config('test.org_a', public.create_org('Gym A', 'gym-a')::text, true);
select set_config('test.tess_token', public.create_invite(current_setting('test.org_a')::uuid, 'Tess@A.test', 'trainer'), true);
select set_config('test.lee_token', public.create_invite(current_setting('test.org_a')::uuid, 'lee@a.test', 'lead'), true);

select pg_temp.act_as('00000000-0000-0000-0000-00000000000b', 'bob@b.test');
select set_config('test.org_b', public.create_org('Gym B', 'gym-b')::text, true);

-- 1-4: invites -------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-00000000000e', 'eve@x.test');
select throws_ok(format('select public.accept_invite(%L)', current_setting('test.tess_token')),
  '42501', 'invite was sent to a different email', 'an invite cannot be used by another email');

select pg_temp.act_as('00000000-0000-0000-0000-00000000000c', 'tess@a.test');
select is(public.accept_invite(current_setting('test.tess_token')), current_setting('test.org_a')::uuid,
  'the invited trainer joins gym A');
select throws_ok(format('select public.accept_invite(%L)', current_setting('test.tess_token')),
  '42501', 'invite is invalid or expired', 'an invite works only once');

select pg_temp.act_as('00000000-0000-0000-0000-00000000000d', 'lee@a.test');
select is(public.accept_invite(current_setting('test.lee_token')), current_setting('test.org_a')::uuid,
  'the invited lead joins gym A');

-- 5-12: Bob (gym B) cannot read or touch gym A ---------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b', 'bob@b.test');
select results_eq('select slug from public.orgs', $$values ('gym-b')$$, 'Bob sees only his own gym');
select is((select count(*) from public.memberships where org_id = current_setting('test.org_a')::uuid), 0::bigint,
  'Bob sees no gym A memberships');
select is((select count(*) from public.invites where org_id = current_setting('test.org_a')::uuid), 0::bigint,
  'Bob sees no gym A invites');
update public.orgs set name = 'Hijacked' where id = current_setting('test.org_a')::uuid;
select pg_temp.reset_role();
select is((select name from public.orgs where id = current_setting('test.org_a')::uuid), 'Gym A',
  'Bob cannot rename gym A');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b', 'bob@b.test');
select throws_ok(format($$insert into public.memberships (org_id, user_id, role) values (%L, %L, 'owner')$$,
  current_setting('test.org_a'), '00000000-0000-0000-0000-00000000000b'),
  '42501', null, 'Bob cannot insert himself into gym A');
select throws_ok(format('delete from public.memberships where org_id = %L', current_setting('test.org_a')),
  '42501', null, 'Bob cannot delete gym A memberships directly');
select throws_ok(format($$select public.create_invite(%L, 'spy@b.test', 'trainer')$$, current_setting('test.org_a')),
  '42501', 'not a member of this org', 'Bob cannot invite people into gym A');
select throws_ok(format($$select public.remove_member(%L, %L)$$, current_setting('test.org_a'),
  '00000000-0000-0000-0000-00000000000c'),
  '42501', 'only owners can remove other members', 'Bob cannot remove gym A members');

-- 13-18: role rules inside gym A ---------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-00000000000c', 'tess@a.test');
select throws_ok(format($$select public.set_member_role(%L, %L, 'owner')$$, current_setting('test.org_a'),
  '00000000-0000-0000-0000-00000000000c'),
  '42501', 'only owners can change roles', 'a trainer cannot promote herself');
select throws_ok(format($$update public.memberships set role = 'owner' where user_id = %L$$,
  '00000000-0000-0000-0000-00000000000c'),
  '42501', null, 'a trainer cannot update memberships directly');
select throws_ok(format($$select public.create_invite(%L, 'x@a.test', 'trainer')$$, current_setting('test.org_a')),
  '42501', 'trainers cannot invite', 'a trainer cannot invite');
select is((select count(*) from public.invites), 0::bigint, 'a trainer cannot read invites');

select pg_temp.act_as('00000000-0000-0000-0000-00000000000d', 'lee@a.test');
select throws_ok(format($$select public.create_invite(%L, 'x@a.test', 'lead')$$, current_setting('test.org_a')),
  '42501', 'only owners can invite leads', 'a lead cannot invite another lead');
select lives_ok(format($$select public.create_invite(%L, 'new@a.test', 'trainer')$$, current_setting('test.org_a')),
  'a lead can invite a trainer');

-- 19-23: the last owner stays --------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a', 'alice@a.test');
select throws_ok(format($$select public.remove_member(%L, %L)$$, current_setting('test.org_a'),
  '00000000-0000-0000-0000-00000000000a'),
  'P0001', 'an org must keep at least one owner', 'the last owner cannot leave');
select throws_ok(format($$select public.set_member_role(%L, %L, 'lead')$$, current_setting('test.org_a'),
  '00000000-0000-0000-0000-00000000000a'),
  'P0001', 'an org must keep at least one owner', 'the last owner cannot demote herself');
select lives_ok(format($$select public.set_member_role(%L, %L, 'owner')$$, current_setting('test.org_a'),
  '00000000-0000-0000-0000-00000000000d'), 'an owner can promote a lead to co-owner');
select lives_ok(format($$select public.set_member_role(%L, %L, 'lead')$$, current_setting('test.org_a'),
  '00000000-0000-0000-0000-00000000000a'), 'with a co-owner, the first owner can step down');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b', 'bob@b.test');
select is(private.role_in(current_setting('test.org_a')::uuid), null::public.member_role,
  'Bob has no role in gym A');

-- 24-27: service-role paths keep the invariants --------------------------------
select pg_temp.reset_role();
set local role service_role;
select throws_ok(format($$update public.memberships set org_id = %L where user_id = %L$$,
  current_setting('test.org_b'), '00000000-0000-0000-0000-00000000000c'),
  'P0001', 'membership org and user are immutable', 'service role cannot move a member to another gym');
select throws_ok(format($$delete from public.memberships where org_id = %L$$, current_setting('test.org_b')),
  'P0001', 'an org must keep at least one owner', 'service role cannot strip a gym of its only owner');
select throws_ok(format($$update public.invites set org_id = %L where org_id = %L$$,
  current_setting('test.org_b'), current_setting('test.org_a')),
  'P0001', 'invite org is immutable', 'service role cannot move invites to another gym');
select lives_ok(format($$delete from public.orgs where id = %L$$, current_setting('test.org_b')),
  'deleting a whole gym cascades its memberships');

-- 28-32: anonymous callers and schema hygiene ---------------------------------
reset role;
set local role anon;
select throws_ok('select * from public.orgs', '42501', null, 'anon cannot read orgs');
select throws_ok($$select public.create_org('x', 'xyz')$$, '42501', null, 'anon cannot create orgs');
reset role;
select ok((select bool_and(relrowsecurity) from pg_class
  where oid in ('public.orgs'::regclass, 'public.memberships'::regclass, 'public.invites'::regclass)),
  'RLS is on for every tenancy table');
select is((select count(*) from public.invites where token_hash ~ '^[0-9a-f]{64}$'), 3::bigint,
  'invite tokens are stored only as sha256 hashes');
select is((select count(*) from public.memberships where org_id = current_setting('test.org_a')::uuid), 3::bigint,
  'gym A has its three members after all of the above');

select * from finish();
rollback;
