-- P4-A2 brand-schema part: the stored brand, the AA checks repeated in SQL (on the same fixture list
-- the engine uses: packages/engine/src/brand-fixtures.ts), the brand revision, and the member DTOs.
-- Synthetic brands and gyms only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'alice@a.test', now()),
  ('00000000-0000-0000-0000-0000000000a2', 'lee@a.test', now()),
  ('00000000-0000-0000-0000-0000000000a3', 'tess@a.test', now()),
  ('00000000-0000-0000-0000-0000000000b1', 'bob@b.test', now()),
  ('00000000-0000-0000-0000-0000000000c1', 'pat@spindle.test', now());
insert into public.orgs (id, name, slug) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Gym A', 'gym-a'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Gym B', 'gym-b');
insert into public.memberships (org_id, user_id, role) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-0000000000a1', 'owner'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-0000000000a2', 'lead'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-0000000000a3', 'trainer'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-0000000000b1', 'owner');
insert into private.content_publishers (user_id, note) values ('00000000-0000-0000-0000-0000000000c1', 'test publisher');

create function pg_temp.act_as(uid text) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.as_service() returns void language sql as $$
  select set_config('role', 'service_role', true), set_config('request.jwt.claims', '{"role":"service_role"}', true);
$$;
create function pg_temp.reset_role() returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;
create function pg_temp.id(name text) returns uuid language sql as $$ select current_setting('test.' || name)::uuid $$;
create function pg_temp.keep(name text, value uuid) returns uuid language sql as $$
  select set_config('test.' || name, value::text, true)::uuid
$$;
create function pg_temp.hash(tid uuid) returns text language sql as $$
  select set_config('test.h_' || replace(tid::text, '-', '_'), (select text_hash from private.tenant_texts where id = tid), true)
$$;
create function pg_temp.decide(tid uuid, decision text) returns text language sql as $$
  select public.publisher_decide_tenant_text('00000000-0000-0000-0000-0000000000c1', tid,
    jsonb_build_object('decision', decision, 'reason', 'Introductory coaching practice only.',
      'textHash', current_setting('test.h_' || replace(tid::text, '-', '_'), true)))
$$;
-- Admits every pending gym course title, as the publisher would (the hold itself is tested below).
create function pg_temp.admit_titles() returns void language plpgsql as $$
declare
  r text := current_setting('role');
  claims text := coalesce(current_setting('request.jwt.claims', true), '');
  t record;
begin
  perform set_config('role', 'postgres', true);
  for t in select tt.id, tt.text_hash from private.tenant_texts tt
           where tt.slot = 'course_title' and tt.text is not null
             and tt.seq = (select max(x.seq) from private.tenant_texts x where x.org_id = tt.org_id and x.slot = tt.slot and x.course_id = tt.course_id)
             and not exists (select 1 from private.tenant_text_admissions a where a.text_id = tt.id) loop
    perform public.publisher_decide_tenant_text('00000000-0000-0000-0000-0000000000c1', t.id,
      jsonb_build_object('decision', 'admitted', 'reason', 'Synthetic fixture title.', 'textHash', t.text_hash));
  end loop;
  perform set_config('role', r, true);
  perform set_config('request.jwt.claims', claims, true);
end;
$$;
create function pg_temp.brand(accent text default '#7A1F2B', band text default null) returns jsonb language sql as $$
  select jsonb_build_object('mark', jsonb_build_object('kind', 'text'), 'font', 'geist', 'colors',
    jsonb_build_object('accent', accent, 'onAccent', '#FFFFFF') || case when band is null then '{}'::jsonb else jsonb_build_object('band', band) end)
$$;
create function pg_temp.save_brand(b jsonb) returns bigint language sql as $$
  select public.save_org_brand('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', b)
$$;

-- 1. The AA checks: SQL equals the engine on every fixture pair --------------------------------
create temp table bfx (fx integer, n integer, brand text, role text, state text, fg text, bg text, minimum numeric, ratio numeric, pass boolean);
insert into bfx values
-- brand-fixtures:begin
  (1, 1, E'{"mark":{"kind":"text"},"colors":{"accent":"#7A1F2B","onAccent":"#FFFFFF"},"font":"barlow-condensed"}', E'Link on surface', E'default', E'#7a1f2b', E'#ffffff', 4.5, 10.202132, true),
  (1, 2, E'{"mark":{"kind":"text"},"colors":{"accent":"#7A1F2B","onAccent":"#FFFFFF"},"font":"barlow-condensed"}', E'Link on canvas', E'default', E'#7a1f2b', E'#f6f8fb', 4.5, 9.589292, true),
  (1, 3, E'{"mark":{"kind":"text"},"colors":{"accent":"#7A1F2B","onAccent":"#FFFFFF"},"font":"barlow-condensed"}', E'Link on a muted panel', E'default', E'#7a1f2b', E'#edf1f5', 4.5, 8.988340, true),
  (1, 4, E'{"mark":{"kind":"text"},"colors":{"accent":"#7A1F2B","onAccent":"#FFFFFF"},"font":"barlow-condensed"}', E'Link on surface', E'hover', E'#681a25', E'#ffffff', 4.5, 11.910951, true),
  (1, 5, E'{"mark":{"kind":"text"},"colors":{"accent":"#7A1F2B","onAccent":"#FFFFFF"},"font":"barlow-condensed"}', E'Link on canvas', E'hover', E'#681a25', E'#f6f8fb', 4.5, 11.195463, true),
  (1, 6, E'{"mark":{"kind":"text"},"colors":{"accent":"#7A1F2B","onAccent":"#FFFFFF"},"font":"barlow-condensed"}', E'Link on a muted panel', E'hover', E'#681a25', E'#edf1f5', 4.5, 10.493853, true),
  (1, 7, E'{"mark":{"kind":"text"},"colors":{"accent":"#7A1F2B","onAccent":"#FFFFFF"},"font":"barlow-condensed"}', E'Current lesson marker', E'selected', E'#7a1f2b', E'#f2e9ea', 4.5, 8.559646, true),
  (1, 8, E'{"mark":{"kind":"text"},"colors":{"accent":"#7A1F2B","onAccent":"#FFFFFF"},"font":"barlow-condensed"}', E'Muted text on the current lesson marker', E'selected', E'#52616d', E'#f2e9ea', 4.5, 5.356216, true),
  (1, 9, E'{"mark":{"kind":"text"},"colors":{"accent":"#7A1F2B","onAccent":"#FFFFFF"},"font":"barlow-condensed"}', E'Text on the current lesson marker', E'selected', E'#17232b', E'#f2e9ea', 4.5, 13.431990, true),
  (1, 10, E'{"mark":{"kind":"text"},"colors":{"accent":"#7A1F2B","onAccent":"#FFFFFF"},"font":"barlow-condensed"}', E'Selected control', E'selected', E'#ffffff', E'#7a1f2b', 4.5, 10.202132, true),
  (1, 11, E'{"mark":{"kind":"text"},"colors":{"accent":"#7A1F2B","onAccent":"#FFFFFF"},"font":"barlow-condensed"}', E'Selected control', E'hover', E'#ffffff', E'#681a25', 4.5, 11.910951, true),
  (1, 12, E'{"mark":{"kind":"text"},"colors":{"accent":"#7A1F2B","onAccent":"#FFFFFF"},"font":"barlow-condensed"}', E'Selected control edge', E'selected', E'#7a1f2b', E'#ffffff', 3, 10.202132, true),
  (1, 13, E'{"mark":{"kind":"text"},"colors":{"accent":"#7A1F2B","onAccent":"#FFFFFF"},"font":"barlow-condensed"}', E'Focus ring on canvas', E'focus', E'#7a1f2b', E'#f6f8fb', 3, 9.589292, true),
  (1, 14, E'{"mark":{"kind":"text"},"colors":{"accent":"#7A1F2B","onAccent":"#FFFFFF"},"font":"barlow-condensed"}', E'Focus ring on surface', E'focus', E'#7a1f2b', E'#ffffff', 3, 10.202132, true),
  (1, 15, E'{"mark":{"kind":"text"},"colors":{"accent":"#7A1F2B","onAccent":"#FFFFFF"},"font":"barlow-condensed"}', E'Focus ring on a muted panel', E'focus', E'#7a1f2b', E'#edf1f5', 3, 8.988340, true),
  (1, 16, E'{"mark":{"kind":"text"},"colors":{"accent":"#7A1F2B","onAccent":"#FFFFFF"},"font":"barlow-condensed"}', E'Focus ring on the current lesson', E'focus', E'#7a1f2b', E'#f2e9ea', 3, 8.559646, true),
  (1, 17, E'{"mark":{"kind":"text"},"colors":{"accent":"#7A1F2B","onAccent":"#FFFFFF"},"font":"barlow-condensed"}', E'Focus ring on a field in error', E'focus', E'#7a1f2b', E'#fff0ee', 3, 9.206523, true),
  (1, 18, E'{"mark":{"kind":"text"},"colors":{"accent":"#7A1F2B","onAccent":"#FFFFFF"},"font":"barlow-condensed"}', E'Error text on its panel', E'error', E'#b42318', E'#fff0ee', 4.5, 5.932715, true),
  (1, 19, E'{"mark":{"kind":"text"},"colors":{"accent":"#7A1F2B","onAccent":"#FFFFFF"},"font":"barlow-condensed"}', E'Error text on surface', E'error', E'#b42318', E'#ffffff', 4.5, 6.574289, true),
  (1, 20, E'{"mark":{"kind":"text"},"colors":{"accent":"#7A1F2B","onAccent":"#FFFFFF"},"font":"barlow-condensed"}', E'Brand name on the band', E'default', E'#17232b', E'#ffffff', 4.5, 16.009417, true),
  (1, 21, E'{"mark":{"kind":"text"},"colors":{"accent":"#7A1F2B","onAccent":"#FFFFFF"},"font":"barlow-condensed"}', E'Nav link on the band', E'default', E'#17232b', E'#ffffff', 4.5, 16.009417, true),
  (1, 22, E'{"mark":{"kind":"text"},"colors":{"accent":"#7A1F2B","onAccent":"#FFFFFF"},"font":"barlow-condensed"}', E'Chip text on the band tint', E'default', E'#17232b', E'#e3e5e6', 4.5, 12.667670, true),
  (1, 23, E'{"mark":{"kind":"text"},"colors":{"accent":"#7A1F2B","onAccent":"#FFFFFF"},"font":"barlow-condensed"}', E'Focus ring on the band', E'focus', E'#17232b', E'#ffffff', 3, 16.009417, true),
  (1, 24, E'{"mark":{"kind":"text"},"colors":{"accent":"#7A1F2B","onAccent":"#FFFFFF"},"font":"barlow-condensed"}', E'Text mark in the header', E'default', E'#7a1f2b', E'#ffffff', 3, 10.202132, true),
  (2, 1, E'{"mark":{"kind":"text"},"colors":{"accent":"#506E4B","onAccent":"#FFFFFF","band":"#0B3D2E"},"font":"fraunces"}', E'Link on surface', E'default', E'#506e4b', E'#ffffff', 4.5, 5.717293, true),
  (2, 2, E'{"mark":{"kind":"text"},"colors":{"accent":"#506E4B","onAccent":"#FFFFFF","band":"#0B3D2E"},"font":"fraunces"}', E'Link on canvas', E'default', E'#506e4b', E'#f6f8fb', 4.5, 5.373856, true),
  (2, 3, E'{"mark":{"kind":"text"},"colors":{"accent":"#506E4B","onAccent":"#FFFFFF","band":"#0B3D2E"},"font":"fraunces"}', E'Link on a muted panel', E'default', E'#506e4b', E'#edf1f5', 4.5, 5.037082, true),
  (2, 4, E'{"mark":{"kind":"text"},"colors":{"accent":"#506E4B","onAccent":"#FFFFFF","band":"#0B3D2E"},"font":"fraunces"}', E'Link on surface', E'hover', E'#445e40', E'#ffffff', 4.5, 7.189557, true),
  (2, 5, E'{"mark":{"kind":"text"},"colors":{"accent":"#506E4B","onAccent":"#FFFFFF","band":"#0B3D2E"},"font":"fraunces"}', E'Link on canvas', E'hover', E'#445e40', E'#f6f8fb', 4.5, 6.757681, true),
  (2, 6, E'{"mark":{"kind":"text"},"colors":{"accent":"#506E4B","onAccent":"#FFFFFF","band":"#0B3D2E"},"font":"fraunces"}', E'Link on a muted panel', E'hover', E'#445e40', E'#edf1f5', 4.5, 6.334184, true),
  (2, 7, E'{"mark":{"kind":"text"},"colors":{"accent":"#506E4B","onAccent":"#FFFFFF","band":"#0B3D2E"},"font":"fraunces"}', E'Current lesson marker', E'selected', E'#506e4b', E'#eef1ed', 4.5, 5.020446, true),
  (2, 8, E'{"mark":{"kind":"text"},"colors":{"accent":"#506E4B","onAccent":"#FFFFFF","band":"#0B3D2E"},"font":"fraunces"}', E'Muted text on the current lesson marker', E'selected', E'#52616d', E'#eef1ed', 4.5, 5.605897, true),
  (2, 9, E'{"mark":{"kind":"text"},"colors":{"accent":"#506E4B","onAccent":"#FFFFFF","band":"#0B3D2E"},"font":"fraunces"}', E'Text on the current lesson marker', E'selected', E'#17232b', E'#eef1ed', 4.5, 14.058122, true),
  (2, 10, E'{"mark":{"kind":"text"},"colors":{"accent":"#506E4B","onAccent":"#FFFFFF","band":"#0B3D2E"},"font":"fraunces"}', E'Selected control', E'selected', E'#ffffff', E'#506e4b', 4.5, 5.717293, true),
  (2, 11, E'{"mark":{"kind":"text"},"colors":{"accent":"#506E4B","onAccent":"#FFFFFF","band":"#0B3D2E"},"font":"fraunces"}', E'Selected control', E'hover', E'#ffffff', E'#445e40', 4.5, 7.189557, true),
  (2, 12, E'{"mark":{"kind":"text"},"colors":{"accent":"#506E4B","onAccent":"#FFFFFF","band":"#0B3D2E"},"font":"fraunces"}', E'Selected control edge', E'selected', E'#506e4b', E'#ffffff', 3, 5.717293, true),
  (2, 13, E'{"mark":{"kind":"text"},"colors":{"accent":"#506E4B","onAccent":"#FFFFFF","band":"#0B3D2E"},"font":"fraunces"}', E'Focus ring on canvas', E'focus', E'#506e4b', E'#f6f8fb', 3, 5.373856, true),
  (2, 14, E'{"mark":{"kind":"text"},"colors":{"accent":"#506E4B","onAccent":"#FFFFFF","band":"#0B3D2E"},"font":"fraunces"}', E'Focus ring on surface', E'focus', E'#506e4b', E'#ffffff', 3, 5.717293, true),
  (2, 15, E'{"mark":{"kind":"text"},"colors":{"accent":"#506E4B","onAccent":"#FFFFFF","band":"#0B3D2E"},"font":"fraunces"}', E'Focus ring on a muted panel', E'focus', E'#506e4b', E'#edf1f5', 3, 5.037082, true),
  (2, 16, E'{"mark":{"kind":"text"},"colors":{"accent":"#506E4B","onAccent":"#FFFFFF","band":"#0B3D2E"},"font":"fraunces"}', E'Focus ring on the current lesson', E'focus', E'#506e4b', E'#eef1ed', 3, 5.020446, true),
  (2, 17, E'{"mark":{"kind":"text"},"colors":{"accent":"#506E4B","onAccent":"#FFFFFF","band":"#0B3D2E"},"font":"fraunces"}', E'Focus ring on a field in error', E'focus', E'#506e4b', E'#fff0ee', 3, 5.159352, true),
  (2, 18, E'{"mark":{"kind":"text"},"colors":{"accent":"#506E4B","onAccent":"#FFFFFF","band":"#0B3D2E"},"font":"fraunces"}', E'Error text on its panel', E'error', E'#b42318', E'#fff0ee', 4.5, 5.932715, true),
  (2, 19, E'{"mark":{"kind":"text"},"colors":{"accent":"#506E4B","onAccent":"#FFFFFF","band":"#0B3D2E"},"font":"fraunces"}', E'Error text on surface', E'error', E'#b42318', E'#ffffff', 4.5, 6.574289, true),
  (2, 20, E'{"mark":{"kind":"text"},"colors":{"accent":"#506E4B","onAccent":"#FFFFFF","band":"#0B3D2E"},"font":"fraunces"}', E'Brand name on the band', E'default', E'#ffffff', E'#0b3d2e', 4.5, 12.200944, true),
  (2, 21, E'{"mark":{"kind":"text"},"colors":{"accent":"#506E4B","onAccent":"#FFFFFF","band":"#0B3D2E"},"font":"fraunces"}', E'Nav link on the band', E'default', E'#ffffff', E'#0b3d2e', 4.5, 12.200944, true),
  (2, 22, E'{"mark":{"kind":"text"},"colors":{"accent":"#506E4B","onAccent":"#FFFFFF","band":"#0B3D2E"},"font":"fraunces"}', E'Chip text on the band tint', E'default', E'#ffffff', E'#285447', 4.5, 8.573741, true),
  (2, 23, E'{"mark":{"kind":"text"},"colors":{"accent":"#506E4B","onAccent":"#FFFFFF","band":"#0B3D2E"},"font":"fraunces"}', E'Focus ring on the band', E'focus', E'#ffffff', E'#0b3d2e', 3, 12.200944, true),
  (2, 24, E'{"mark":{"kind":"text"},"colors":{"accent":"#506E4B","onAccent":"#FFFFFF","band":"#0B3D2E"},"font":"fraunces"}', E'Text mark in the header', E'default', E'#506e4b', E'#ffffff', 3, 5.717293, true),
  (3, 1, E'{"mark":{"kind":"text"},"colors":{"accent":"#9CAF88","onAccent":"#FFFFFF"},"font":"geist"}', E'Link on surface', E'default', E'#9caf88', E'#ffffff', 4.5, 2.359262, false),
  (3, 2, E'{"mark":{"kind":"text"},"colors":{"accent":"#9CAF88","onAccent":"#FFFFFF"},"font":"geist"}', E'Link on canvas', E'default', E'#9caf88', E'#f6f8fb', 4.5, 2.217542, false),
  (3, 3, E'{"mark":{"kind":"text"},"colors":{"accent":"#9CAF88","onAccent":"#FFFFFF"},"font":"geist"}', E'Link on a muted panel', E'default', E'#9caf88', E'#edf1f5', 4.5, 2.078571, false),
  (3, 4, E'{"mark":{"kind":"text"},"colors":{"accent":"#9CAF88","onAccent":"#FFFFFF"},"font":"geist"}', E'Link on surface', E'hover', E'#859574', E'#ffffff', 4.5, 3.206852, false),
  (3, 5, E'{"mark":{"kind":"text"},"colors":{"accent":"#9CAF88","onAccent":"#FFFFFF"},"font":"geist"}', E'Link on canvas', E'hover', E'#859574', E'#f6f8fb', 4.5, 3.014217, false),
  (3, 6, E'{"mark":{"kind":"text"},"colors":{"accent":"#9CAF88","onAccent":"#FFFFFF"},"font":"geist"}', E'Link on a muted panel', E'hover', E'#859574', E'#edf1f5', 4.5, 2.825319, false),
  (3, 7, E'{"mark":{"kind":"text"},"colors":{"accent":"#9CAF88","onAccent":"#FFFFFF"},"font":"geist"}', E'Current lesson marker', E'selected', E'#9caf88', E'#f5f7f3', 4.5, 2.188611, false),
  (3, 8, E'{"mark":{"kind":"text"},"colors":{"accent":"#9CAF88","onAccent":"#FFFFFF"},"font":"geist"}', E'Muted text on the current lesson marker', E'selected', E'#52616d', E'#f5f7f3', 4.5, 5.922234, true),
  (3, 9, E'{"mark":{"kind":"text"},"colors":{"accent":"#9CAF88","onAccent":"#FFFFFF"},"font":"geist"}', E'Text on the current lesson marker', E'selected', E'#17232b', E'#f5f7f3', 4.5, 14.851413, true),
  (3, 10, E'{"mark":{"kind":"text"},"colors":{"accent":"#9CAF88","onAccent":"#FFFFFF"},"font":"geist"}', E'Selected control', E'selected', E'#ffffff', E'#9caf88', 4.5, 2.359262, false),
  (3, 11, E'{"mark":{"kind":"text"},"colors":{"accent":"#9CAF88","onAccent":"#FFFFFF"},"font":"geist"}', E'Selected control', E'hover', E'#ffffff', E'#859574', 4.5, 3.206852, false),
  (3, 12, E'{"mark":{"kind":"text"},"colors":{"accent":"#9CAF88","onAccent":"#FFFFFF"},"font":"geist"}', E'Selected control edge', E'selected', E'#9caf88', E'#ffffff', 3, 2.359262, false),
  (3, 13, E'{"mark":{"kind":"text"},"colors":{"accent":"#9CAF88","onAccent":"#FFFFFF"},"font":"geist"}', E'Focus ring on canvas', E'focus', E'#9caf88', E'#f6f8fb', 3, 2.217542, false),
  (3, 14, E'{"mark":{"kind":"text"},"colors":{"accent":"#9CAF88","onAccent":"#FFFFFF"},"font":"geist"}', E'Focus ring on surface', E'focus', E'#9caf88', E'#ffffff', 3, 2.359262, false),
  (3, 15, E'{"mark":{"kind":"text"},"colors":{"accent":"#9CAF88","onAccent":"#FFFFFF"},"font":"geist"}', E'Focus ring on a muted panel', E'focus', E'#9caf88', E'#edf1f5', 3, 2.078571, false),
  (3, 16, E'{"mark":{"kind":"text"},"colors":{"accent":"#9CAF88","onAccent":"#FFFFFF"},"font":"geist"}', E'Focus ring on the current lesson', E'focus', E'#9caf88', E'#f5f7f3', 3, 2.188611, false),
  (3, 17, E'{"mark":{"kind":"text"},"colors":{"accent":"#9CAF88","onAccent":"#FFFFFF"},"font":"geist"}', E'Focus ring on a field in error', E'focus', E'#9caf88', E'#fff0ee', 3, 2.129026, false),
  (3, 18, E'{"mark":{"kind":"text"},"colors":{"accent":"#9CAF88","onAccent":"#FFFFFF"},"font":"geist"}', E'Error text on its panel', E'error', E'#b42318', E'#fff0ee', 4.5, 5.932715, true),
  (3, 19, E'{"mark":{"kind":"text"},"colors":{"accent":"#9CAF88","onAccent":"#FFFFFF"},"font":"geist"}', E'Error text on surface', E'error', E'#b42318', E'#ffffff', 4.5, 6.574289, true),
  (3, 20, E'{"mark":{"kind":"text"},"colors":{"accent":"#9CAF88","onAccent":"#FFFFFF"},"font":"geist"}', E'Brand name on the band', E'default', E'#17232b', E'#ffffff', 4.5, 16.009417, true),
  (3, 21, E'{"mark":{"kind":"text"},"colors":{"accent":"#9CAF88","onAccent":"#FFFFFF"},"font":"geist"}', E'Nav link on the band', E'default', E'#17232b', E'#ffffff', 4.5, 16.009417, true),
  (3, 22, E'{"mark":{"kind":"text"},"colors":{"accent":"#9CAF88","onAccent":"#FFFFFF"},"font":"geist"}', E'Chip text on the band tint', E'default', E'#17232b', E'#e3e5e6', 4.5, 12.667670, true),
  (3, 23, E'{"mark":{"kind":"text"},"colors":{"accent":"#9CAF88","onAccent":"#FFFFFF"},"font":"geist"}', E'Focus ring on the band', E'focus', E'#17232b', E'#ffffff', 3, 16.009417, true),
  (3, 24, E'{"mark":{"kind":"text"},"colors":{"accent":"#9CAF88","onAccent":"#FFFFFF"},"font":"geist"}', E'Text mark in the header', E'default', E'#9caf88', E'#ffffff', 3, 2.359262, false),
  (4, 1, E'{"mark":{"kind":"text"},"colors":{"accent":"#7A1F2B","onAccent":"#84B7A0"},"font":"geist"}', E'Link on surface', E'default', E'#7a1f2b', E'#ffffff', 4.5, 10.202132, true),
  (4, 2, E'{"mark":{"kind":"text"},"colors":{"accent":"#7A1F2B","onAccent":"#84B7A0"},"font":"geist"}', E'Link on canvas', E'default', E'#7a1f2b', E'#f6f8fb', 4.5, 9.589292, true),
  (4, 3, E'{"mark":{"kind":"text"},"colors":{"accent":"#7A1F2B","onAccent":"#84B7A0"},"font":"geist"}', E'Link on a muted panel', E'default', E'#7a1f2b', E'#edf1f5', 4.5, 8.988340, true),
  (4, 4, E'{"mark":{"kind":"text"},"colors":{"accent":"#7A1F2B","onAccent":"#84B7A0"},"font":"geist"}', E'Link on surface', E'hover', E'#681a25', E'#ffffff', 4.5, 11.910951, true),
  (4, 5, E'{"mark":{"kind":"text"},"colors":{"accent":"#7A1F2B","onAccent":"#84B7A0"},"font":"geist"}', E'Link on canvas', E'hover', E'#681a25', E'#f6f8fb', 4.5, 11.195463, true),
  (4, 6, E'{"mark":{"kind":"text"},"colors":{"accent":"#7A1F2B","onAccent":"#84B7A0"},"font":"geist"}', E'Link on a muted panel', E'hover', E'#681a25', E'#edf1f5', 4.5, 10.493853, true),
  (4, 7, E'{"mark":{"kind":"text"},"colors":{"accent":"#7A1F2B","onAccent":"#84B7A0"},"font":"geist"}', E'Current lesson marker', E'selected', E'#7a1f2b', E'#f2e9ea', 4.5, 8.559646, true),
  (4, 8, E'{"mark":{"kind":"text"},"colors":{"accent":"#7A1F2B","onAccent":"#84B7A0"},"font":"geist"}', E'Muted text on the current lesson marker', E'selected', E'#52616d', E'#f2e9ea', 4.5, 5.356216, true),
  (4, 9, E'{"mark":{"kind":"text"},"colors":{"accent":"#7A1F2B","onAccent":"#84B7A0"},"font":"geist"}', E'Text on the current lesson marker', E'selected', E'#17232b', E'#f2e9ea', 4.5, 13.431990, true),
  (4, 10, E'{"mark":{"kind":"text"},"colors":{"accent":"#7A1F2B","onAccent":"#84B7A0"},"font":"geist"}', E'Selected control', E'selected', E'#84b7a0', E'#7a1f2b', 4.5, 4.499682, false),
  (4, 11, E'{"mark":{"kind":"text"},"colors":{"accent":"#7A1F2B","onAccent":"#84B7A0"},"font":"geist"}', E'Selected control', E'hover', E'#84b7a0', E'#681a25', 4.5, 5.253362, true),
  (4, 12, E'{"mark":{"kind":"text"},"colors":{"accent":"#7A1F2B","onAccent":"#84B7A0"},"font":"geist"}', E'Selected control edge', E'selected', E'#7a1f2b', E'#ffffff', 3, 10.202132, true),
  (4, 13, E'{"mark":{"kind":"text"},"colors":{"accent":"#7A1F2B","onAccent":"#84B7A0"},"font":"geist"}', E'Focus ring on canvas', E'focus', E'#7a1f2b', E'#f6f8fb', 3, 9.589292, true),
  (4, 14, E'{"mark":{"kind":"text"},"colors":{"accent":"#7A1F2B","onAccent":"#84B7A0"},"font":"geist"}', E'Focus ring on surface', E'focus', E'#7a1f2b', E'#ffffff', 3, 10.202132, true),
  (4, 15, E'{"mark":{"kind":"text"},"colors":{"accent":"#7A1F2B","onAccent":"#84B7A0"},"font":"geist"}', E'Focus ring on a muted panel', E'focus', E'#7a1f2b', E'#edf1f5', 3, 8.988340, true),
  (4, 16, E'{"mark":{"kind":"text"},"colors":{"accent":"#7A1F2B","onAccent":"#84B7A0"},"font":"geist"}', E'Focus ring on the current lesson', E'focus', E'#7a1f2b', E'#f2e9ea', 3, 8.559646, true),
  (4, 17, E'{"mark":{"kind":"text"},"colors":{"accent":"#7A1F2B","onAccent":"#84B7A0"},"font":"geist"}', E'Focus ring on a field in error', E'focus', E'#7a1f2b', E'#fff0ee', 3, 9.206523, true),
  (4, 18, E'{"mark":{"kind":"text"},"colors":{"accent":"#7A1F2B","onAccent":"#84B7A0"},"font":"geist"}', E'Error text on its panel', E'error', E'#b42318', E'#fff0ee', 4.5, 5.932715, true),
  (4, 19, E'{"mark":{"kind":"text"},"colors":{"accent":"#7A1F2B","onAccent":"#84B7A0"},"font":"geist"}', E'Error text on surface', E'error', E'#b42318', E'#ffffff', 4.5, 6.574289, true),
  (4, 20, E'{"mark":{"kind":"text"},"colors":{"accent":"#7A1F2B","onAccent":"#84B7A0"},"font":"geist"}', E'Brand name on the band', E'default', E'#17232b', E'#ffffff', 4.5, 16.009417, true),
  (4, 21, E'{"mark":{"kind":"text"},"colors":{"accent":"#7A1F2B","onAccent":"#84B7A0"},"font":"geist"}', E'Nav link on the band', E'default', E'#17232b', E'#ffffff', 4.5, 16.009417, true),
  (4, 22, E'{"mark":{"kind":"text"},"colors":{"accent":"#7A1F2B","onAccent":"#84B7A0"},"font":"geist"}', E'Chip text on the band tint', E'default', E'#17232b', E'#e3e5e6', 4.5, 12.667670, true),
  (4, 23, E'{"mark":{"kind":"text"},"colors":{"accent":"#7A1F2B","onAccent":"#84B7A0"},"font":"geist"}', E'Focus ring on the band', E'focus', E'#17232b', E'#ffffff', 3, 16.009417, true),
  (4, 24, E'{"mark":{"kind":"text"},"colors":{"accent":"#7A1F2B","onAccent":"#84B7A0"},"font":"geist"}', E'Text mark in the header', E'default', E'#7a1f2b', E'#ffffff', 3, 10.202132, true),
  (5, 1, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#F2E8D5"},"font":"geist"}', E'Link on surface', E'default', E'#1f4e8c', E'#ffffff', 4.5, 8.311213, true),
  (5, 2, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#F2E8D5"},"font":"geist"}', E'Link on canvas', E'default', E'#1f4e8c', E'#f6f8fb', 4.5, 7.811960, true),
  (5, 3, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#F2E8D5"},"font":"geist"}', E'Link on a muted panel', E'default', E'#1f4e8c', E'#edf1f5', 4.5, 7.322392, true),
  (5, 4, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#F2E8D5"},"font":"geist"}', E'Link on surface', E'hover', E'#1a4277', E'#ffffff', 4.5, 10.049818, true),
  (5, 5, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#F2E8D5"},"font":"geist"}', E'Link on canvas', E'hover', E'#1a4277', E'#f6f8fb', 4.5, 9.446127, true),
  (5, 6, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#F2E8D5"},"font":"geist"}', E'Link on a muted panel', E'hover', E'#1a4277', E'#edf1f5', 4.5, 8.854147, true),
  (5, 7, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#F2E8D5"},"font":"geist"}', E'Current lesson marker', E'selected', E'#1f4e8c', E'#e9edf4', 4.5, 7.078278, true),
  (5, 8, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#F2E8D5"},"font":"geist"}', E'Muted text on the current lesson marker', E'selected', E'#52616d', E'#e9edf4', 4.5, 5.436964, true),
  (5, 9, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#F2E8D5"},"font":"geist"}', E'Text on the current lesson marker', E'selected', E'#17232b', E'#e9edf4', 4.5, 13.634483, true),
  (5, 10, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#F2E8D5"},"font":"geist"}', E'Selected control', E'selected', E'#ffffff', E'#1f4e8c', 4.5, 8.311213, true),
  (5, 11, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#F2E8D5"},"font":"geist"}', E'Selected control', E'hover', E'#ffffff', E'#1a4277', 4.5, 10.049818, true),
  (5, 12, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#F2E8D5"},"font":"geist"}', E'Selected control edge', E'selected', E'#1f4e8c', E'#ffffff', 3, 8.311213, true),
  (5, 13, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#F2E8D5"},"font":"geist"}', E'Focus ring on canvas', E'focus', E'#1f4e8c', E'#f6f8fb', 3, 7.811960, true),
  (5, 14, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#F2E8D5"},"font":"geist"}', E'Focus ring on surface', E'focus', E'#1f4e8c', E'#ffffff', 3, 8.311213, true),
  (5, 15, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#F2E8D5"},"font":"geist"}', E'Focus ring on a muted panel', E'focus', E'#1f4e8c', E'#edf1f5', 3, 7.322392, true),
  (5, 16, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#F2E8D5"},"font":"geist"}', E'Focus ring on the current lesson', E'focus', E'#1f4e8c', E'#e9edf4', 3, 7.078278, true),
  (5, 17, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#F2E8D5"},"font":"geist"}', E'Focus ring on a field in error', E'focus', E'#1f4e8c', E'#fff0ee', 3, 7.500136, true),
  (5, 18, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#F2E8D5"},"font":"geist"}', E'Error text on its panel', E'error', E'#b42318', E'#fff0ee', 4.5, 5.932715, true),
  (5, 19, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#F2E8D5"},"font":"geist"}', E'Error text on surface', E'error', E'#b42318', E'#ffffff', 4.5, 6.574289, true),
  (5, 20, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#F2E8D5"},"font":"geist"}', E'Brand name on the band', E'default', E'#17232b', E'#f2e8d5', 4.5, 13.172635, true),
  (5, 21, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#F2E8D5"},"font":"geist"}', E'Nav link on the band', E'default', E'#17232b', E'#f2e8d5', 4.5, 13.172635, true),
  (5, 22, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#F2E8D5"},"font":"geist"}', E'Chip text on the band tint', E'default', E'#17232b', E'#d8d0c1', 4.5, 10.453529, true),
  (5, 23, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#F2E8D5"},"font":"geist"}', E'Focus ring on the band', E'focus', E'#17232b', E'#f2e8d5', 3, 13.172635, true),
  (5, 24, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#F2E8D5"},"font":"geist"}', E'Text mark in the header', E'default', E'#1f4e8c', E'#ffffff', 3, 8.311213, true),
  (6, 1, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#808080"},"font":"geist"}', E'Link on surface', E'default', E'#1f4e8c', E'#ffffff', 4.5, 8.311213, true),
  (6, 2, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#808080"},"font":"geist"}', E'Link on canvas', E'default', E'#1f4e8c', E'#f6f8fb', 4.5, 7.811960, true),
  (6, 3, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#808080"},"font":"geist"}', E'Link on a muted panel', E'default', E'#1f4e8c', E'#edf1f5', 4.5, 7.322392, true),
  (6, 4, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#808080"},"font":"geist"}', E'Link on surface', E'hover', E'#1a4277', E'#ffffff', 4.5, 10.049818, true),
  (6, 5, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#808080"},"font":"geist"}', E'Link on canvas', E'hover', E'#1a4277', E'#f6f8fb', 4.5, 9.446127, true),
  (6, 6, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#808080"},"font":"geist"}', E'Link on a muted panel', E'hover', E'#1a4277', E'#edf1f5', 4.5, 8.854147, true),
  (6, 7, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#808080"},"font":"geist"}', E'Current lesson marker', E'selected', E'#1f4e8c', E'#e9edf4', 4.5, 7.078278, true),
  (6, 8, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#808080"},"font":"geist"}', E'Muted text on the current lesson marker', E'selected', E'#52616d', E'#e9edf4', 4.5, 5.436964, true),
  (6, 9, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#808080"},"font":"geist"}', E'Text on the current lesson marker', E'selected', E'#17232b', E'#e9edf4', 4.5, 13.634483, true),
  (6, 10, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#808080"},"font":"geist"}', E'Selected control', E'selected', E'#ffffff', E'#1f4e8c', 4.5, 8.311213, true),
  (6, 11, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#808080"},"font":"geist"}', E'Selected control', E'hover', E'#ffffff', E'#1a4277', 4.5, 10.049818, true),
  (6, 12, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#808080"},"font":"geist"}', E'Selected control edge', E'selected', E'#1f4e8c', E'#ffffff', 3, 8.311213, true),
  (6, 13, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#808080"},"font":"geist"}', E'Focus ring on canvas', E'focus', E'#1f4e8c', E'#f6f8fb', 3, 7.811960, true),
  (6, 14, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#808080"},"font":"geist"}', E'Focus ring on surface', E'focus', E'#1f4e8c', E'#ffffff', 3, 8.311213, true),
  (6, 15, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#808080"},"font":"geist"}', E'Focus ring on a muted panel', E'focus', E'#1f4e8c', E'#edf1f5', 3, 7.322392, true),
  (6, 16, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#808080"},"font":"geist"}', E'Focus ring on the current lesson', E'focus', E'#1f4e8c', E'#e9edf4', 3, 7.078278, true),
  (6, 17, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#808080"},"font":"geist"}', E'Focus ring on a field in error', E'focus', E'#1f4e8c', E'#fff0ee', 3, 7.500136, true),
  (6, 18, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#808080"},"font":"geist"}', E'Error text on its panel', E'error', E'#b42318', E'#fff0ee', 4.5, 5.932715, true),
  (6, 19, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#808080"},"font":"geist"}', E'Error text on surface', E'error', E'#b42318', E'#ffffff', 4.5, 6.574289, true),
  (6, 20, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#808080"},"font":"geist"}', E'Brand name on the band', E'default', E'#17232b', E'#808080', 4.5, 4.053592, false),
  (6, 21, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#808080"},"font":"geist"}', E'Nav link on the band', E'default', E'#17232b', E'#808080', 4.5, 4.053592, false),
  (6, 22, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#808080"},"font":"geist"}', E'Chip text on the band tint', E'default', E'#17232b', E'#737576', 4.5, 3.457336, false),
  (6, 23, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#808080"},"font":"geist"}', E'Focus ring on the band', E'focus', E'#17232b', E'#808080', 3, 4.053592, true),
  (6, 24, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#808080"},"font":"geist"}', E'Text mark in the header', E'default', E'#1f4e8c', E'#ffffff', 3, 8.311213, true),
  (7, 1, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#767676"},"font":"geist"}', E'Link on surface', E'default', E'#1f4e8c', E'#ffffff', 4.5, 8.311213, true),
  (7, 2, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#767676"},"font":"geist"}', E'Link on canvas', E'default', E'#1f4e8c', E'#f6f8fb', 4.5, 7.811960, true),
  (7, 3, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#767676"},"font":"geist"}', E'Link on a muted panel', E'default', E'#1f4e8c', E'#edf1f5', 4.5, 7.322392, true),
  (7, 4, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#767676"},"font":"geist"}', E'Link on surface', E'hover', E'#1a4277', E'#ffffff', 4.5, 10.049818, true),
  (7, 5, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#767676"},"font":"geist"}', E'Link on canvas', E'hover', E'#1a4277', E'#f6f8fb', 4.5, 9.446127, true),
  (7, 6, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#767676"},"font":"geist"}', E'Link on a muted panel', E'hover', E'#1a4277', E'#edf1f5', 4.5, 8.854147, true),
  (7, 7, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#767676"},"font":"geist"}', E'Current lesson marker', E'selected', E'#1f4e8c', E'#e9edf4', 4.5, 7.078278, true),
  (7, 8, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#767676"},"font":"geist"}', E'Muted text on the current lesson marker', E'selected', E'#52616d', E'#e9edf4', 4.5, 5.436964, true),
  (7, 9, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#767676"},"font":"geist"}', E'Text on the current lesson marker', E'selected', E'#17232b', E'#e9edf4', 4.5, 13.634483, true),
  (7, 10, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#767676"},"font":"geist"}', E'Selected control', E'selected', E'#ffffff', E'#1f4e8c', 4.5, 8.311213, true),
  (7, 11, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#767676"},"font":"geist"}', E'Selected control', E'hover', E'#ffffff', E'#1a4277', 4.5, 10.049818, true),
  (7, 12, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#767676"},"font":"geist"}', E'Selected control edge', E'selected', E'#1f4e8c', E'#ffffff', 3, 8.311213, true),
  (7, 13, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#767676"},"font":"geist"}', E'Focus ring on canvas', E'focus', E'#1f4e8c', E'#f6f8fb', 3, 7.811960, true),
  (7, 14, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#767676"},"font":"geist"}', E'Focus ring on surface', E'focus', E'#1f4e8c', E'#ffffff', 3, 8.311213, true),
  (7, 15, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#767676"},"font":"geist"}', E'Focus ring on a muted panel', E'focus', E'#1f4e8c', E'#edf1f5', 3, 7.322392, true),
  (7, 16, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#767676"},"font":"geist"}', E'Focus ring on the current lesson', E'focus', E'#1f4e8c', E'#e9edf4', 3, 7.078278, true),
  (7, 17, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#767676"},"font":"geist"}', E'Focus ring on a field in error', E'focus', E'#1f4e8c', E'#fff0ee', 3, 7.500136, true),
  (7, 18, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#767676"},"font":"geist"}', E'Error text on its panel', E'error', E'#b42318', E'#fff0ee', 4.5, 5.932715, true),
  (7, 19, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#767676"},"font":"geist"}', E'Error text on surface', E'error', E'#b42318', E'#ffffff', 4.5, 6.574289, true),
  (7, 20, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#767676"},"font":"geist"}', E'Brand name on the band', E'default', E'#ffffff', E'#767676', 4.5, 4.542225, true),
  (7, 21, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#767676"},"font":"geist"}', E'Nav link on the band', E'default', E'#ffffff', E'#767676', 4.5, 4.542225, true),
  (7, 22, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#767676"},"font":"geist"}', E'Chip text on the band tint', E'default', E'#ffffff', E'#868686', 4.5, 3.640807, false),
  (7, 23, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#767676"},"font":"geist"}', E'Focus ring on the band', E'focus', E'#ffffff', E'#767676', 3, 4.542225, true),
  (7, 24, E'{"mark":{"kind":"text"},"colors":{"accent":"#1F4E8C","onAccent":"#FFFFFF","band":"#767676"},"font":"geist"}', E'Text mark in the header', E'default', E'#1f4e8c', E'#ffffff', 3, 8.311213, true)
-- brand-fixtures:end
;
select results_eq(
  $$select b.fx, c.n, c.role, c.state, c.foreground, c.background, c.minimum, round(c.ratio::numeric, 6), c.pass
    from (select distinct fx, brand from bfx) b, private.brand_checks(b.brand::jsonb) c order by 1, 2$$,
  $$select fx, n, role, state, fg, bg, minimum, ratio, pass from bfx order by 1, 2$$,
  'every contrast pair, ratio and verdict in SQL equals @spindle/engine on the shared fixtures');
select is(private.mix('#0a0a0a', '#000000', 0.15), '#090909', 'mixing rounds half up as Math.round (8.5 to 9)');

-- 2. save_org_brand ------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select is(pg_temp.save_brand(pg_temp.brand()), 1::bigint, 'the owner saves a brand; the revision starts at 1');
select is(pg_temp.save_brand(pg_temp.brand('#506E4B', '#0B3D2E')), 2::bigint, 'each save moves the revision');
select pg_temp.reset_role();
select is((select brand from private.org_brand where org_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  '{"mark": {"kind": "text"}, "font": "geist", "colors": {"band": "#0b3d2e", "accent": "#506e4b", "onAccent": "#ffffff"}}'::jsonb,
  'the stored brand is normalized: lower-case literal colours, text mark');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$select pg_temp.save_brand(pg_temp.brand('#9CAF88'))$$, '22023',
  'invalid brand: Link on surface (default): 2.35:1, needs 4.5:1', 'a light accent is refused in SQL, as in the editor');
select throws_ok($$select pg_temp.save_brand(pg_temp.brand('#1F4E8C', '#808080'))$$, '22023',
  'invalid brand: Brand name on the band (default): 4.05:1, needs 4.5:1', 'a band where neither ink nor white reaches 4.5:1 is refused');
select throws_ok($$select pg_temp.save_brand(jsonb_set(pg_temp.brand(), '{colors,onAccent}', '"#84B7A0"'))$$, '22023',
  'invalid brand: Selected control (selected): 4.49:1, needs 4.5:1', 'the boundary is decided on the exact ratio (4.4997 fails)');
select throws_ok($$select pg_temp.save_brand(pg_temp.brand() || '{"name": "Andrew Fitness"}')$$, '22023',
  'invalid brand.name: the brand name is a held tenant text; save it with save_tenant_text', 'the name is not part of the stored brand');
select throws_ok($$select pg_temp.save_brand(jsonb_set(pg_temp.brand(), '{mark}', '{"kind": "logo", "key": "a.png"}'))$$, '22023',
  'invalid brand.mark: logo marks wait for tenant raster admission (P4-A3); use the text mark', 'no logo marks in P4-A2');
select throws_ok($$select pg_temp.save_brand(jsonb_set(pg_temp.brand(), '{colors,science}', '"#000000"'))$$, '22023',
  'invalid brand.colors: unknown key science', 'a brand cannot set an evidence colour');
select throws_ok($$select pg_temp.save_brand(jsonb_set(pg_temp.brand(), '{colors,accent}', '"red"'))$$, '22023',
  'invalid brand.colors.accent: must be a #RRGGBB colour', 'colours are literal hex only');
select throws_ok($$select pg_temp.save_brand(jsonb_set(pg_temp.brand(), '{font}', '"comic-sans"'))$$, '22023',
  'invalid brand.font: must be one of geist, barlow-condensed, fraunces', 'bundled fonts only');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select throws_ok($$select pg_temp.save_brand(pg_temp.brand())$$, '42501', 'only the owner of this gym can change its brand', 'a lead cannot change the brand');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select throws_ok($$select pg_temp.save_brand(pg_temp.brand())$$, '42501', 'only the owner of this gym can change its brand', 'another gym''s owner cannot');
select throws_ok($$select * from private.org_brand$$, '42501', null, 'the stored brand is not client-readable');

-- 3. MemberBrandDto ------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select is(public.member_brand('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') - 'brand',
  '{"orgId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "revision": 2, "name": "Your gym", "nameAdmitted": false, "texts": {}}'::jsonb,
  'a member sees the fallback name and no catalog text before LEAD admits any');
select is(public.member_brand('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') -> 'brand' -> 'colors' ->> 'band', '#0b3d2e', 'and the saved brand');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.keep('bn', public.save_tenant_text('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'brand_name', null, 'Andrew Fitness'));
select pg_temp.keep('hl', public.save_tenant_text('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'catalog_headline', null, 'Lift well for life'));
select pg_temp.keep('tl', public.save_tenant_text('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'catalog_tagline', null, 'Barbell coaching in a small room.'));
select pg_temp.reset_role();
select pg_temp.hash(pg_temp.id('bn'));
select pg_temp.hash(pg_temp.id('hl'));
select pg_temp.as_service();
select pg_temp.decide(pg_temp.id('bn'), 'admitted');
select pg_temp.decide(pg_temp.id('hl'), 'admitted');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select is(public.member_brand('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') - 'brand',
  '{"orgId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "revision": 4, "name": "Andrew Fitness", "nameAdmitted": true, "texts": {"headline": "Lift well for life"}}'::jsonb,
  'admitted texts appear, the pending tagline does not, and each decision moves the revision');
select pg_temp.as_service();
select public.publisher_revoke_tenant_text('00000000-0000-0000-0000-0000000000c1', pg_temp.id('hl'), '{"reason": "x"}');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select is(public.member_brand('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') -> 'texts', '{}'::jsonb, 'a revoked headline leaves at once');
select is((public.member_brand('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') ->> 'revision')::integer, 5, 'and moves the revision');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select throws_ok($$select public.member_brand('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$, '42501', 'not a member of this gym', 'another gym cannot read it');
select pg_temp.reset_role();
set local role anon;
select throws_ok($$select public.member_brand('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$, '42501', null, 'anonymous callers get no brand at all');
reset role;

-- 4. CourseCardDto -------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select public.save_course_draft('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', jsonb_build_object('id', 'a1000000-0000-4000-8000-000000000000',
  'slug', 'hinge', 'layer', 'method', 'title', 'Hinge basics', 'subtitle', 'Draft summary, not held', 'description', '', 'level', 'foundation',
  'outcomes', '[]'::jsonb, 'cover', jsonb_build_object('kind', 'pattern', 'pattern', 'dots', 'background', '#0b3d2e', 'foreground', '#ffffff'),
  'tags', '["strength"]'::jsonb, 'parts', jsonb_build_array(jsonb_build_object('id', 'a1000000-0000-4000-8000-0000000000f1', 'ordinal', 1,
    'title', 'Part', 'summary', '', 'lessons', jsonb_build_array(jsonb_build_object('id', 'a1000000-0000-4000-8000-0000000000a1', 'slug', 'set-up',
      'title', 'Set-up', 'summary', '', 'durationMinutes', 7, 'format', 'article', 'objectives', '[]'::jsonb, 'anatomyIds', '[]'::jsonb,
      'blocks', jsonb_build_array(jsonb_build_object('kind', 'paragraph', 'content', 'Brace, then hinge.', 'support', 'practice-based',
        'claimIds', '[]'::jsonb)), 'media', '[]'::jsonb, 'resources', '[]'::jsonb))))));
select pg_temp.keep('bl', public.save_tenant_text('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'course_blurb', 'a1000000-0000-4000-8000-000000000000', 'Hinge patterns for new lifters.'));
select pg_temp.reset_role();
select pg_temp.admit_titles();
select pg_temp.hash(pg_temp.id('bl'));
select pg_temp.as_service();
select pg_temp.decide(pg_temp.id('bl'), 'admitted');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.keep('v1', public.publish_course('a1000000-0000-4000-8000-000000000000'));
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select is(public.member_course_cards('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), jsonb_build_array(jsonb_build_object(
  'versionId', pg_temp.id('v1'), 'courseId', 'a1000000-0000-4000-8000-000000000000', 'layer', 'method', 'layerLabel', 'Gym method',
  'title', 'Hinge basics', 'summary', 'Hinge patterns for new lifters.',
  'cover', jsonb_build_object('kind', 'pattern', 'pattern', 'dots', 'background', '#0b3d2e', 'foreground', '#ffffff'),
  'tags', '["strength"]'::jsonb, 'lessonCount', 1, 'durationMinutes', 7, 'publishedBySpindle', false, 'seal', false)),
  'a member gets the card: admitted title and blurb, the tenant cover and tags, the fixed layer label');
select pg_temp.as_service();
select public.publisher_revoke_tenant_text('00000000-0000-0000-0000-0000000000c1', pg_temp.id('bl'), '{"reason": "x"}');
select pg_temp.reset_role();
select pg_temp.keep('tt', (select id from private.tenant_texts where slot = 'course_title' order by seq desc limit 1));
select pg_temp.as_service();
select public.publisher_revoke_tenant_text('00000000-0000-0000-0000-0000000000c1', pg_temp.id('tt'), '{"reason": "x"}');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select is(public.member_course_cards('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') -> 0 ->> 'title', 'Untitled course', 'a revoked title reads as the fallback on the card');
select is(public.member_course_cards('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') -> 0 -> 'summary', 'null'::jsonb, 'and a revoked blurb leaves it');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select is(public.member_course_cards('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), '[]'::jsonb, 'another gym does not see gym A''s course');
select throws_ok($$select public.member_course_cards('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$, '42501', 'not a member of this gym', 'nor read gym A''s cards');

select * from finish();
rollback;
