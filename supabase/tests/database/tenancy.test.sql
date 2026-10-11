-- Phase 1 acceptance: gyms cannot see or change each other's data, and the
-- role rules hold for clients and for the service role.
begin;
create extension if not exists pgtap with schema extensions;
select plan(66);

-- Fixtures: Alice owns gym A, Bob owns gym B, Tess trains at A, Lee leads at A.
-- Mallory has an unconfirmed email; Sam's account email is sam@x.test.
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@a.test', now()),
  ('00000000-0000-0000-0000-00000000000b', 'bob@b.test', now()),
  ('00000000-0000-0000-0000-00000000000c', 'tess@a.test', now()),
  ('00000000-0000-0000-0000-00000000000d', 'lee@a.test', now()),
  ('00000000-0000-0000-0000-00000000000e', 'eve@x.test', now()),
  ('00000000-0000-0000-0000-00000000000f', 'mallory@a.test', null),
  ('00000000-0000-0000-0000-000000000010', 'sam@x.test', now());

create function pg_temp.act_as(uid text, email text) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'email', email, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.reset_role() returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;
-- Org ids are captured as postgres right after creation; looking them up under a
-- caller's role would return NULL for other gyms and make cross-tenant tests vacuous.
create function pg_temp.org(slug text) returns uuid language sql as $$
  select current_setting('test.org_' || replace(slug, '-', '_'))::uuid
$$;
create function pg_temp.capture(slug text) returns void language sql as $$
  select set_config('test.org_' || replace(slug, '-', '_'), (select id::text from public.orgs where orgs.slug = $1), true)
$$;

select pg_temp.act_as('00000000-0000-0000-0000-00000000000a', 'alice@a.test');
select public.create_org('Gym A', 'gym-a');
select pg_temp.reset_role();
select pg_temp.capture('gym-a');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a', 'alice@a.test');
select set_config('test.tess_token', public.create_invite(pg_temp.org('gym-a'), 'Tess@A.test', 'trainer'), true);
select set_config('test.lee_token', public.create_invite(pg_temp.org('gym-a'), 'lee@a.test', 'lead'), true);
select set_config('test.mallory_token', public.create_invite(pg_temp.org('gym-a'), 'mallory@a.test', 'trainer'), true);
select set_config('test.old_token', public.create_invite(pg_temp.org('gym-a'), 'old@a.test', 'trainer'), true);
select set_config('test.revoked_token', public.create_invite(pg_temp.org('gym-a'), 'sam@x.test', 'trainer'), true);
select set_config('test.sam_invite', (select id::text from public.invites where email = 'sam@x.test'), true);

select pg_temp.act_as('00000000-0000-0000-0000-00000000000b', 'bob@b.test');
select public.create_org('Gym B', 'gym-b');
select pg_temp.reset_role();
select pg_temp.capture('gym-b');
select is(pg_temp.org('gym-a') is not null and pg_temp.org('gym-b') is not null, true, 'both gym ids were captured');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b', 'bob@b.test');
select set_config('test.bob_invite', public.create_invite(pg_temp.org('gym-b'), 'eve@x.test', 'trainer'), true);

-- 1-3: privilege matrix. Clients get SELECT (plus orgs.name UPDATE); no direct writes.
select pg_temp.reset_role();
select table_privs_are('public', 'orgs', 'anon', array[]::text[], 'anon has no privileges on orgs');
select table_privs_are('public', 'memberships', 'anon', array[]::text[], 'anon has no privileges on memberships');
select table_privs_are('public', 'invites', 'anon', array[]::text[], 'anon has no privileges on invites');
select table_privs_are('public', 'orgs', 'authenticated', array['SELECT'], 'authenticated may only SELECT orgs (plus the name column)');
select ok(has_column_privilege('authenticated', 'public.orgs', 'name', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.orgs', 'slug', 'UPDATE'), 'authenticated may update only orgs.name');
select table_privs_are('public', 'memberships', 'authenticated', array['SELECT'], 'authenticated may only SELECT memberships');
select table_privs_are('public', 'invites', 'authenticated', array['SELECT'], 'authenticated may only SELECT invites');
select is((select count(*) from information_schema.routine_privileges
  where routine_schema = 'public' and grantee in ('anon', 'PUBLIC')
    and routine_name in ('create_org', 'create_invite', 'revoke_invite', 'accept_invite', 'set_member_role', 'remove_member')),
  0::bigint, 'no client RPC is executable by anon or PUBLIC');
-- 4-5: TRUNCATE bypasses triggers, so even the service role lacks it.
select ok(not has_table_privilege('service_role', 'public.memberships', 'TRUNCATE'), 'service role cannot TRUNCATE memberships');
select ok(not has_table_privilege('service_role', 'public.orgs', 'TRUNCATE'), 'service role cannot TRUNCATE orgs');
-- 6-7: RPCs are for signed-in users only.
-- 8: RLS is on everywhere.
select ok((select bool_and(relrowsecurity) from pg_class
  where oid in ('public.orgs'::regclass, 'public.memberships'::regclass, 'public.invites'::regclass)),
  'RLS is on for every tenancy table');

-- 9-15: accepting invites --------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-00000000000e', 'eve@x.test');
select throws_ok(format('select public.accept_invite(%L)', current_setting('test.tess_token')),
  '42501', 'invite was sent to a different email', 'an invite cannot be used by another account');
-- Sam's token claims say tess@a.test, but his confirmed account email is sam@x.test.
select pg_temp.act_as('00000000-0000-0000-0000-000000000010', 'tess@a.test');
select throws_ok(format('select public.accept_invite(%L)', current_setting('test.tess_token')),
  '42501', 'invite was sent to a different email', 'a stale or forged email claim is ignored');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000f', 'mallory@a.test');
select throws_ok(format('select public.accept_invite(%L)', current_setting('test.mallory_token')),
  '42501', 'invite was sent to a different email', 'an unconfirmed email cannot accept');

select pg_temp.act_as('00000000-0000-0000-0000-00000000000c', 'tess@a.test');
select is(public.accept_invite(current_setting('test.tess_token')), pg_temp.org('gym-a'), 'Tess joins gym A');
select throws_ok(format('select public.accept_invite(%L)', current_setting('test.tess_token')),
  '42501', 'invite is invalid or expired', 'an invite works only once');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000d', 'lee@a.test');
select is(public.accept_invite(current_setting('test.lee_token')), pg_temp.org('gym-a'), 'Lee joins gym A as lead');

select pg_temp.reset_role();
update public.invites set expires_at = now() - interval '1 second' where email = 'old@a.test';
insert into auth.users (id, email, email_confirmed_at) values ('00000000-0000-0000-0000-000000000011', 'old@a.test', now());
select pg_temp.act_as('00000000-0000-0000-0000-000000000011', 'old@a.test');
select throws_ok(format('select public.accept_invite(%L)', current_setting('test.old_token')),
  '42501', 'invite is invalid or expired', 'an expired invite is refused');

-- 16-19: revoking invites
select pg_temp.act_as('00000000-0000-0000-0000-00000000000c', 'tess@a.test');
select throws_ok(format('select public.revoke_invite(%L)',
  current_setting('test.sam_invite')),
  '42501', 'not allowed to revoke this invite', 'a trainer cannot revoke invites');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b', 'bob@b.test');
select throws_ok(format('select public.revoke_invite(%L)',
  current_setting('test.sam_invite')),
  '42501', 'not allowed to revoke this invite', 'Bob cannot revoke gym A invites');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a', 'alice@a.test');
select lives_ok(format('select public.revoke_invite(%L)',
  current_setting('test.sam_invite')), 'the owner revokes an invite');
select pg_temp.act_as('00000000-0000-0000-0000-000000000010', 'sam@x.test');
select throws_ok(format('select public.accept_invite(%L)', current_setting('test.revoked_token')),
  '42501', 'invite is invalid or expired', 'a revoked invite is refused');

-- 20-34: Bob (gym B) cannot read or change gym A --------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b', 'bob@b.test');
select results_eq('select slug from public.orgs', $$values ('gym-b')$$, 'Bob sees only his own gym');
select is((select count(*) from public.memberships where org_id <> pg_temp.org('gym-b')), 0::bigint,
  'Bob sees no other gym''s memberships');
select is((select count(*) from public.invites where org_id <> pg_temp.org('gym-b')), 0::bigint,
  'Bob sees no other gym''s invites');
select is((select count(*) from public.invites where org_id = pg_temp.org('gym-b')), 1::bigint,
  'Bob sees his own gym''s invite');
update public.orgs set name = 'Hijacked' where slug = 'gym-a';
select throws_ok($$insert into public.orgs (name, slug) values ('Rogue', 'rogue')$$, '42501', null,
  'Bob cannot insert orgs directly');
select throws_ok($$delete from public.orgs where slug = 'gym-a'$$, '42501', null, 'Bob cannot delete gym A');
select throws_ok(format($$insert into public.memberships (org_id, user_id, role) values (%L, %L, 'owner')$$,
  pg_temp.org('gym-a'), '00000000-0000-0000-0000-00000000000b'), '42501', null,
  'Bob cannot insert himself into gym A');
select throws_ok($$update public.memberships set role = 'trainer'$$, '42501', null,
  'Bob cannot update memberships directly');
select throws_ok($$delete from public.memberships$$, '42501', null, 'Bob cannot delete memberships directly');
select throws_ok(format($$insert into public.invites (org_id, email, role, token_hash) values (%L, 'x@b.test', 'trainer', 'x')$$,
  pg_temp.org('gym-a')), '42501', null, 'Bob cannot insert invites directly');
select throws_ok($$update public.invites set role = 'lead'$$, '42501', null, 'Bob cannot update invites directly');
select throws_ok($$delete from public.invites$$, '42501', null, 'Bob cannot delete invites directly');
select throws_ok(format($$select public.create_invite(%L, 'spy@b.test', 'trainer')$$, pg_temp.org('gym-a')),
  '42501', 'not a member of this org', 'Bob cannot invite people into gym A');
select throws_ok(format($$select public.set_member_role(%L, %L, 'trainer')$$, pg_temp.org('gym-a'),
  '00000000-0000-0000-0000-00000000000a'), '42501', 'only owners can change roles', 'Bob cannot change gym A roles');
select throws_ok(format($$select public.remove_member(%L, %L)$$, pg_temp.org('gym-a'),
  '00000000-0000-0000-0000-00000000000c'), '42501', 'only owners can remove other members',
  'Bob cannot remove gym A members');
select pg_temp.reset_role();
-- 35
select is((select name from public.orgs where slug = 'gym-a'), 'Gym A', 'Bob''s rename of gym A changed nothing');

-- 36-41: role rules inside gym A ---------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-00000000000c', 'tess@a.test');
select throws_ok(format($$select public.set_member_role(%L, %L, 'owner')$$, pg_temp.org('gym-a'),
  '00000000-0000-0000-0000-00000000000c'), '42501', 'only owners can change roles', 'a trainer cannot promote herself');
select throws_ok(format($$select public.create_invite(%L, 'x@a.test', 'trainer')$$, pg_temp.org('gym-a')),
  '42501', 'trainers cannot invite', 'a trainer cannot invite');
select is((select count(*) from public.invites), 0::bigint, 'a trainer cannot read invites');
update public.orgs set name = 'Tess Gym' where slug = 'gym-a';
select pg_temp.act_as('00000000-0000-0000-0000-00000000000d', 'lee@a.test');
select throws_ok(format($$select public.create_invite(%L, 'x@a.test', 'lead')$$, pg_temp.org('gym-a')),
  '42501', 'only owners can invite leads', 'a lead cannot invite another lead');
select lives_ok(format($$select public.create_invite(%L, 'new@a.test', 'trainer')$$, pg_temp.org('gym-a')),
  'a lead can invite a trainer');
select pg_temp.reset_role();
select is((select name from public.orgs where slug = 'gym-a'), 'Gym A', 'a trainer cannot rename the gym');

-- 42-47: the last owner stays --------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a', 'alice@a.test');
select throws_ok(format($$select public.remove_member(%L, %L)$$, pg_temp.org('gym-a'),
  '00000000-0000-0000-0000-00000000000a'), 'P0001', 'an org must keep at least one owner', 'the last owner cannot leave');
select throws_ok(format($$select public.set_member_role(%L, %L, 'lead')$$, pg_temp.org('gym-a'),
  '00000000-0000-0000-0000-00000000000a'), 'P0001', 'an org must keep at least one owner',
  'the last owner cannot demote herself');
select lives_ok(format($$select public.set_member_role(%L, %L, 'owner')$$, pg_temp.org('gym-a'),
  '00000000-0000-0000-0000-00000000000d'), 'an owner can promote a lead to co-owner');
select lives_ok(format($$select public.set_member_role(%L, %L, 'lead')$$, pg_temp.org('gym-a'),
  '00000000-0000-0000-0000-00000000000a'), 'with a co-owner, the first owner can step down');
select lives_ok(format($$update public.orgs set name = 'Gym A' where slug = 'gym-a'$$), 'no-op update as a non-owner runs');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b', 'bob@b.test');
select is(private.role_in(pg_temp.org('gym-a')), null::public.member_role, 'Bob has no role in gym A');

-- removing a member revokes the invites they sent and the ones sent to them
select pg_temp.reset_role();
insert into public.invites (org_id, email, role, token_hash, invited_by)
  values (pg_temp.org('gym-a'), 'orphan@x.test', 'trainer', repeat('a', 64), null);
select set_config('test.orphan_invite', (select id::text from public.invites where email = 'orphan@x.test'), true);
insert into public.invites (org_id, email, role, token_hash, invited_by)
  values (pg_temp.org('gym-a'), 'alice@a.test', 'trainer', repeat('b', 64), '00000000-0000-0000-0000-00000000000d');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b', 'bob@b.test');
select throws_ok(format('select public.revoke_invite(%L)', current_setting('test.orphan_invite')),
  '42501', 'not allowed to revoke this invite', 'a non-member cannot revoke an invite whose sender is gone');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000d', 'lee@a.test');
select lives_ok(format($$select public.remove_member(%L, %L)$$, pg_temp.org('gym-a'),
  '00000000-0000-0000-0000-00000000000a'), 'the new owner removes Alice');
select pg_temp.reset_role();
select is((select count(*) from public.invites where invited_by = '00000000-0000-0000-0000-00000000000a'
  and accepted_at is null and revoked_at is null), 0::bigint, 'Alice''s sent invites were revoked');
select is((select count(*) from public.invites where email = 'alice@a.test' and revoked_at is null), 0::bigint,
  'invites addressed to Alice were revoked, so she cannot rejoin with them');

-- 50-55: service-role paths keep the invariants --------------------------------
set local role service_role;
select throws_ok(format($$update public.memberships set org_id = %L where user_id = %L$$,
  pg_temp.org('gym-b'), '00000000-0000-0000-0000-00000000000c'),
  'P0001', 'membership org and user are immutable', 'service role cannot move a member to another gym');
select throws_ok(format($$delete from public.memberships where org_id = %L$$, pg_temp.org('gym-b')),
  'P0001', 'an org must keep at least one owner', 'service role cannot strip a gym of its only owner');
select throws_ok(format($$update public.invites set org_id = %L where org_id = %L$$,
  pg_temp.org('gym-b'), pg_temp.org('gym-a')), 'P0001', 'invite org is immutable',
  'service role cannot move invites to another gym');
select throws_ok('truncate public.memberships', '42501', null, 'service role cannot truncate memberships');
set constraints all immediate;
select throws_ok($$insert into public.orgs (name, slug) values ('Ownerless', 'ownerless')$$,
  'P0001', 'an org must have an owner', 'an org cannot exist without an owner');
set constraints all deferred;
select lives_ok(format($$delete from public.orgs where id = %L$$, pg_temp.org('gym-b')),
  'deleting a whole gym cascades its memberships and invites');

-- 56-58: account deletion and anonymous callers ---------------------------------
reset role;
select lives_ok($$delete from auth.users where email = 'tess@a.test'$$, 'a trainer''s account can be deleted');
select is((select count(*) from public.invites where accepted_at is not null and accepted_by is null), 1::bigint,
  'the deleted account''s accepted invite keeps its record without the user link');
set local role anon;
select throws_ok('select * from public.orgs', '42501', null, 'anon cannot read orgs');
reset role;

-- 59-60: hygiene
select is((select count(*) from public.invites where token_hash !~ '^[0-9a-f]{64}$'), 0::bigint,
  'invite tokens are stored only as sha256 hashes');
select is((select count(*) from public.memberships where org_id = pg_temp.org('gym-a')), 1::bigint,
  'gym A ends with only Lee after the removals and deletion');

select * from finish();
rollback;
