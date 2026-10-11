-- P4-A2 (spec revisions 3 and 4): course cover pattern and modality tags, and held tenant texts
-- (welcome note, course blurb, catalog headline and tagline), through the tenant RPCs, the snapshot,
-- the content hash, the learner projection and the member DTO. A held text stays pending, out of
-- every version and every member read, until LEAD records an admission bound to it. Synthetic only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(96);

-- Gym A: Alice owner, Lee lead, Tess trainer. Gym B ("Science Gym"): Bob owner. Pat publishes.
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'alice@a.test', now()),
  ('00000000-0000-0000-0000-0000000000a2', 'lee@a.test', now()),
  ('00000000-0000-0000-0000-0000000000a3', 'tess@a.test', now()),
  ('00000000-0000-0000-0000-0000000000b1', 'bob@b.test', now()),
  ('00000000-0000-0000-0000-0000000000c1', 'pat@spindle.test', now());
insert into public.orgs (id, name, slug) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Gym A', 'gym-a'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Science Gym', 'gym-b');
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
create function pg_temp.course(cid text, layer text, extra jsonb default '{}', title text default 'Hinge basics') returns jsonb
language sql as $$
  select jsonb_build_object('id', cid, 'slug', 'course-' || left(cid, 2), 'layer', layer, 'title', title,
    'subtitle', 'How we coach the hinge', 'description', 'Synthetic test content.', 'level', 'foundation', 'outcomes', '[]'::jsonb,
    'parts', jsonb_build_array(jsonb_build_object('id', left(cid, 34) || 'f1', 'ordinal', 1, 'title', 'Part one', 'summary', '',
      'lessons', jsonb_build_array(jsonb_build_object('id', left(cid, 34) || 'a1', 'slug', 'set-up', 'title', 'Set-up',
        'summary', 'Synthetic fixture.', 'durationMinutes', 5, 'format', 'article', 'objectives', '[]'::jsonb, 'anatomyIds', '[]'::jsonb,
        'blocks', jsonb_build_array(jsonb_build_object('kind', 'paragraph', 'content', 'Brace, then hinge.',
          'support', 'practice-based', 'claimIds', '[]'::jsonb)), 'media', '[]'::jsonb, 'resources', '[]'::jsonb)))))
  || extra
$$;
create function pg_temp.cover(pattern text default 'diagonal', bg text default '#1F6FEB', fg text default '#FFFFFF') returns jsonb
language sql as $$ select jsonb_build_object('kind', 'pattern', 'pattern', pattern, 'background', bg, 'foreground', fg) $$;
create function pg_temp.save(doc jsonb) returns uuid language sql as $$
  select public.save_course_draft('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', doc)
$$;
create function pg_temp.snap(version uuid) returns jsonb language sql as $$
  select snapshot from public.curriculum_versions where id = version
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
select pg_temp.keep('m', 'a1000000-0000-4000-8000-000000000000');

-- 1. Cover and tags through the draft RPC ------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select lives_ok($$select pg_temp.save(pg_temp.course('a1000000-0000-4000-8000-000000000000', 'method',
  jsonb_build_object('cover', pg_temp.cover(), 'tags', '["strength", "youth"]'::jsonb)))$$, 'an owner saves a method course with a cover and tags');
select pg_temp.reset_role();
select is((select cover from public.courses where id = pg_temp.id('m')), pg_temp.cover('diagonal', '#1f6feb', '#ffffff'),
  'the cover is stored with lowercase colours');
select is((select tags from public.courses where id = pg_temp.id('m')), array['strength', 'youth'], 'the tags are stored in order');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$select pg_temp.save(pg_temp.course('a1000000-0000-4000-8000-000000000000', 'method',
  jsonb_build_object('cover', pg_temp.cover('stripes'))))$$, '22023', 'invalid course.cover.pattern: must be one of solid, diagonal, grid, dots, rings, waves',
  'an unknown pattern is refused');
select throws_ok($$select pg_temp.save(pg_temp.course('a1000000-0000-4000-8000-000000000000', 'method',
  jsonb_build_object('cover', pg_temp.cover('dots', 'red'))))$$, '22023', 'invalid course.cover.background: must be a #RRGGBB colour',
  'a colour must be a literal #RRGGBB');
select throws_ok($$select pg_temp.save(pg_temp.course('a1000000-0000-4000-8000-000000000000', 'method',
  jsonb_build_object('cover', pg_temp.cover() || '{"assetId": "a1000000-0000-4000-8000-0000000000ff"}')))$$, '22023',
  'invalid course.cover: unknown key assetId', 'a cover cannot point at an uploaded image');
select throws_ok($$select pg_temp.save(pg_temp.course('a1000000-0000-4000-8000-000000000000', 'method',
  jsonb_build_object('cover', jsonb_build_object('kind', 'image', 'pattern', 'dots', 'background', '#000000', 'foreground', '#ffffff'))))$$,
  '22023', 'invalid course.cover.kind: must be one of pattern', 'an image cover is refused');
select throws_ok($$select pg_temp.save(pg_temp.course('a1000000-0000-4000-8000-000000000000', 'method',
  jsonb_build_object('tags', '["strength", "crossfit"]'::jsonb)))$$, '22023',
  'invalid course.tags[1]: must be one of strength, powerlifting, weightlifting, hypertrophy, speed, mobility, yoga, pilates, running, endurance, combat, team-sport, youth',
  'a tag outside the taxonomy is refused');
select throws_ok($$select pg_temp.save(pg_temp.course('a1000000-0000-4000-8000-000000000000', 'method',
  jsonb_build_object('tags', '["strength", "speed", "yoga"]'::jsonb)))$$, '22023', 'invalid course.tags: must have 0 to 2 items',
  'at most two tags');
select throws_ok($$select pg_temp.save(pg_temp.course('a1000000-0000-4000-8000-000000000000', 'method',
  jsonb_build_object('tags', '["yoga", "yoga"]'::jsonb)))$$, '22023', 'invalid course.tags: has a duplicate tag', 'no duplicate tags');
select throws_ok($$select pg_temp.save(pg_temp.course('a1000000-0000-4000-8000-000000000000', 'method',
  jsonb_build_object('welcome', jsonb_build_object('text', 'Hi'))))$$, '22023', 'invalid course: unknown key welcome',
  'the draft cannot carry a welcome note; it is a held tenant text');
select throws_ok($$select pg_temp.save(pg_temp.course('a1000000-0000-4000-8000-000000000000', 'method', '{}', 'Backed by science'))$$,
  '22023', 'invalid course.title: backed by (denied)', 'a method course title passes text admission at save');
select throws_ok($$select pg_temp.save(pg_temp.course('a1000000-0000-4000-8000-000000000000', 'method',
  '{"subtitle": "Visit www.example.org"}'))$$, '22023',
  'invalid course.subtitle: must be plain text, without links, addresses or markup (link)', 'so does its summary');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select throws_ok($$select pg_temp.save(pg_temp.course('a1000000-0000-4000-8000-000000000000', 'method',
  jsonb_build_object('cover', pg_temp.cover('grid'))))$$, '42501', 'only owners and leads of this org can author or assign content',
  'a trainer cannot change the cover');
select pg_temp.as_service();
select throws_ok($$select public.publisher_save_course_draft('00000000-0000-0000-0000-0000000000c1',
  pg_temp.course('b1000000-0000-4000-8000-000000000000', 'base', jsonb_build_object('cover', pg_temp.cover())))$$, '22023',
  'invalid course.cover: only gym method courses take a cover; base and modality courses use the Spindle cover',
  'a base course keeps the Spindle cover');
select lives_ok($$select public.publisher_save_course_draft('00000000-0000-0000-0000-0000000000c1',
  pg_temp.course('b1000000-0000-4000-8000-000000000000', 'base', '{"tags": ["mobility"]}', 'Science of the hinge'))$$,
  'a base course takes tags, and its title is not tenant text');
select pg_temp.reset_role();
select throws_ok($$update public.courses set cover = pg_temp.cover('dots', '#000000', '#ffffff') where id = 'b1000000-0000-4000-8000-000000000000'$$,
  '23514', null, 'even the table owner cannot give a base course a cover');
select throws_ok($$update public.courses set tags = array['strength', 'strength'] where id = pg_temp.id('m')$$, '23514', null,
  'nor store duplicate tags');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.save(pg_temp.course('a2000000-0000-4000-8000-000000000000', 'method', '{"subtitle": "  Cafe\u0301 hinges "}', E'Cafe\u0301 hinge '));
select pg_temp.reset_role();
select is((select title || '|' || subtitle from public.courses where id = 'a2000000-0000-4000-8000-000000000000'), E'Caf\u00e9 hinge|Caf\u00e9 hinges',
  'a gym title and summary are stored as admission normalizes them (NFC, trimmed)');
select throws_ok($$update public.courses set cover = '{"kind": null, "pattern": null, "background": "#000000", "foreground": "#ffffff"}'
  where id = pg_temp.id('m')$$, '23514', null, 'a cover with null fields fails the column check');

-- 2. Snapshot, hash and learner projection ------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$select public.publish_course(pg_temp.id('m'))$$, 'P0001',
  'publish gate: course a1000000-0000-4000-8000-000000000000 has no admitted title (LEAD admits held tenant text)',
  'a gym course cannot publish before LEAD admits its title');
select pg_temp.reset_role();
select is((select string_agg(private.tenant_text_status(id) || ':' || text, ',' order by seq) from private.tenant_texts
  where course_id = pg_temp.id('m') and slot = 'course_title'), 'pending:Hinge basics', 'saving the draft held its title, once');
select pg_temp.admit_titles();
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.keep('v1', public.publish_course(pg_temp.id('m')));
select pg_temp.reset_role();
select is(pg_temp.snap(pg_temp.id('v1')) -> 'cover', pg_temp.cover('diagonal', '#1f6feb', '#ffffff'), 'the version freezes the cover');
select is(pg_temp.snap(pg_temp.id('v1')) -> 'tags', '["strength", "youth"]'::jsonb, 'and the tags');
select is(pg_temp.snap(pg_temp.id('v1')) ->> 'title', 'Hinge basics', 'and the admitted title');
select is((select learner_snapshot -> 'cover' from public.curriculum_versions where id = pg_temp.id('v1')),
  pg_temp.cover('diagonal', '#1f6feb', '#ffffff'), 'learners receive the cover');
select is((select content_hash from public.curriculum_versions where id = pg_temp.id('v1')), private.sha256(pg_temp.snap(pg_temp.id('v1'))),
  'the content hash covers them');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select is(public.publish_course(pg_temp.id('m')), pg_temp.id('v1'), 'publishing again unchanged returns the same version');
select pg_temp.save(pg_temp.course('a1000000-0000-4000-8000-000000000000', 'method',
  jsonb_build_object('cover', pg_temp.cover('rings', '#0b3d2e', '#f5f5f5'), 'tags', '["strength"]'::jsonb)));
select pg_temp.keep('v2', public.publish_course(pg_temp.id('m')));
select pg_temp.reset_role();
select isnt(pg_temp.id('v2'), pg_temp.id('v1'), 'a new cover makes a new version');
select is(pg_temp.snap(pg_temp.id('v1')) -> 'cover' ->> 'pattern', 'diagonal', 'the earlier version keeps its cover');
select is(pg_temp.snap(pg_temp.id('v2')) -> 'tags', '["strength"]'::jsonb, 'the new version has the new tags');
select is((select count(*) from private.tenant_texts where course_id = pg_temp.id('m') and slot = 'course_title'), 1::bigint,
  'an unchanged title is not held again');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.save(pg_temp.course('a1000000-0000-4000-8000-000000000000', 'method',
  jsonb_build_object('cover', pg_temp.cover('rings', '#0b3d2e', '#f5f5f5'), 'tags', '["strength"]'::jsonb), 'Hinge basics, revised'));
select throws_ok($$select public.publish_course(pg_temp.id('m'))$$, 'P0001',
  'publish gate: course a1000000-0000-4000-8000-000000000000 has no admitted title (LEAD admits held tenant text)',
  'a changed title is held again: publish refuses until LEAD admits it');
select pg_temp.save(pg_temp.course('a1000000-0000-4000-8000-000000000000', 'method',
  jsonb_build_object('cover', pg_temp.cover('rings', '#0b3d2e', '#f5f5f5'), 'tags', '["strength"]'::jsonb)));
select throws_ok($$select public.publish_course(pg_temp.id('m'))$$, 'P0001',
  'publish gate: course a1000000-0000-4000-8000-000000000000 has no admitted title (LEAD admits held tenant text)',
  'going back to an earlier title is an edit too');
select pg_temp.reset_role();
select pg_temp.admit_titles();
select pg_temp.as_service();
select public.publisher_save_course_draft('00000000-0000-0000-0000-0000000000c1',
  pg_temp.course('b1000000-0000-4000-8000-000000000000', 'base', '{}', 'Science of the hinge'));
select pg_temp.reset_role();
select is(private.course_snapshot('b1000000-0000-4000-8000-000000000000') ?| array['cover', 'tags', 'welcome'], false,
  'a course without them has no cover, tags or welcome keys, so earlier hashes stay valid');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.keep('v2b', public.publish_course(pg_temp.id('m')));
select pg_temp.reset_role();
select isnt(pg_temp.snap(pg_temp.id('v2b')) ->> 'titleReceiptId', pg_temp.snap(pg_temp.id('v1')) ->> 'titleReceiptId',
  'a re-admitted title is a new receipt in the version');

-- 3. Held tenant texts: saved pending, admitted only by LEAD, bound to org, slot and text hash -------
create function pg_temp.save_text(slot text, txt text, course uuid default null) returns uuid language sql as $$
  select public.save_tenant_text('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', slot, course, txt)
$$;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select pg_temp.keep('w1', pg_temp.save_text('welcome', '  Welcome! We start with drills for the hips.  ', pg_temp.id('m')));
select is((select status || ':' || text from public.tenant_text_status('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'welcome', pg_temp.id('m'))),
  'pending:Welcome! We start with drills for the hips.', 'a lead saves a welcome note; it is pending and trimmed');
select throws_ok($$select pg_temp.save_text('welcome', 'Backed by science.', pg_temp.id('m'))$$, '22023',
  'invalid welcome: backed by (denied)', 'text admission still filters at save');
select throws_ok($$select pg_temp.save_text('catalog_tagline', 'Read more at coach.example')$$, '22023',
  'invalid catalog_tagline: must be plain text, without links, addresses or markup (link)', 'for every held slot');
select throws_ok(format($$select pg_temp.save_text('welcome', %L, %L)$$, 'Sci' || chr(8203) || 'ence', pg_temp.id('m')), '22023',
  'invalid welcome: must not contain control, format or invisible characters (control)', 'hidden characters are refused');
select throws_ok($$select pg_temp.save_text('course_title', 'Another title', pg_temp.id('m'))$$, '22023',
  'invalid slot: a course title is saved with the course draft', 'a title is held through the draft only');
select throws_ok($$select pg_temp.save_text('catalog_headline', 'Lift well', pg_temp.id('m'))$$, '22023',
  'invalid slot: catalog_headline belongs to the gym, not a course', 'a gym slot takes no course');
select pg_temp.reset_role();
select is((select count(*) from private.tenant_texts where org_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and slot <> 'course_title'), 1::bigint, 'a refused text stores nothing');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select throws_ok($$select pg_temp.save_text('welcome', 'Hello from Tess.', pg_temp.id('m'))$$, '42501', null, 'a trainer cannot write a held text');
select throws_ok($$select * from public.tenant_text_status('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'welcome', pg_temp.id('m'))$$, '42501', null,
  'nor read a pending one');
select throws_ok($$select * from private.tenant_texts$$, '42501', null, 'held texts are not readable by clients');
-- Foreign gym.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select throws_ok($$select pg_temp.save_text('welcome', 'Hello from Bob.', pg_temp.id('m'))$$, '42501', null, 'another gym cannot write gym A''s texts');
select throws_ok($$select public.save_tenant_text('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'welcome', pg_temp.id('m'), 'Hello.')$$, 'P0002',
  'no such course in this gym', 'nor attach its own text to gym A''s course');
select throws_ok($$select * from public.member_tenant_texts('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$, '42501', 'not a member of this gym',
  'nor read gym A''s admitted texts');

-- Pending text never reaches a version.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.keep('v3', public.publish_course(pg_temp.id('m')));
select is(pg_temp.id('v3'), pg_temp.id('v2b'), 'a pending note changes nothing: the same version');
-- The tenant cannot admit its own text.
select throws_ok($$select pg_temp.decide(pg_temp.id('w1'), 'admitted')$$, '42501', null, 'an owner cannot call the admission RPC');
select throws_ok(format($$insert into private.tenant_text_admissions (text_id, org_id, slot, course_id, text_hash, decision, reason,
  rules_version, decided_by) values (%L, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'welcome', %L, 'x', 'admitted', 'x', 'tt-2026-10-11.1',
  '00000000-0000-0000-0000-0000000000a1')$$, pg_temp.id('w1'), pg_temp.id('m')), '42501', null, 'nor write an admission row');
select pg_temp.reset_role();
select pg_temp.hash(pg_temp.id('w1'));
select throws_ok(format($$insert into private.tenant_text_admissions (text_id, org_id, slot, course_id, text_hash, decision, reason,
  rules_version, decided_by) values (%L, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'welcome', %L, %L, 'admitted', 'x', 'tt-2026-10-11.1',
  '00000000-0000-0000-0000-0000000000c1')$$, pg_temp.id('w1'), pg_temp.id('m'), current_setting('test.h_' || replace(pg_temp.id('w1')::text, '-', '_'))), 'P0001',
  'an admission must name the org, slot, course and text hash of the text it admits', 'a receipt cannot name another gym');
select throws_ok(format($$insert into private.tenant_text_admissions (text_id, org_id, slot, course_id, text_hash, decision, reason,
  rules_version, decided_by) values (%L, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'welcome', %L, %L, 'admitted', 'x', 'tt-2026-10-11.1',
  '00000000-0000-0000-0000-0000000000a1')$$, pg_temp.id('w1'), pg_temp.id('m'), current_setting('test.h_' || replace(pg_temp.id('w1')::text, '-', '_'))), '42501',
  'only a content publisher decides tenant text', 'even the table owner cannot record a tenant as the decider');
select pg_temp.as_service();
select throws_ok($$select public.publisher_decide_tenant_text('00000000-0000-0000-0000-0000000000c1', pg_temp.id('w1'),
  '{"decision": "admitted", "reason": "x", "textHash": "0000000000000000000000000000000000000000000000000000000000000000"}')$$, 'P0001',
  format('tenant text %s has changed since it was reviewed (stale hash)', pg_temp.id('w1')), 'a hash LEAD did not review is refused');
select is(pg_temp.decide(pg_temp.id('w1'), 'admitted'), 'admitted', 'LEAD admits the note');
select throws_ok($$select pg_temp.decide(pg_temp.id('w1'), 'rejected')$$, 'P0001', format('tenant text %s is already decided', pg_temp.id('w1')),
  'a decision is final');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.keep('v4', public.publish_course(pg_temp.id('m')));
select pg_temp.reset_role();
select is(pg_temp.snap(pg_temp.id('v4')) -> 'welcome', jsonb_build_object('text', 'Welcome! We start with drills for the hips.',
  'receiptId', (select id from private.tenant_text_admissions where text_id = pg_temp.id('w1')),
  'author', jsonb_build_object('authorUserId', '00000000-0000-0000-0000-0000000000a2', 'displayName', 'Your gym',
    'orgId', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'savedAt', (select to_char(saved_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') from private.tenant_texts where id = pg_temp.id('w1')))),
  'once admitted, the next version freezes the note with its receipt, author and the signature in force at publish');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select is((select learner_snapshot ? 'welcome' from public.curriculum_versions where id = pg_temp.id('v4')), false,
  'the learner projection carries no held course text');
select is((select state || ':' || text || ':' || display_name from public.version_tenant_texts(pg_temp.id('v4')) where slot = 'welcome'),
  'live:Welcome! We start with drills for the hips.:Your gym', 'a member reads the note through the receipt-checked read');
select pg_temp.reset_role();
select isnt((select content_hash from public.curriculum_versions where id = pg_temp.id('v4')),
  (select content_hash from public.curriculum_versions where id = pg_temp.id('v2')), 'the note is part of the content hash');

-- An edit resets the slot to pending: the next version leaves the note out until LEAD admits the new text.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.keep('w2', pg_temp.save_text('welcome', 'New text, same hips.', pg_temp.id('m')));
select is((select status from public.tenant_text_status('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'welcome', pg_temp.id('m'))), 'pending',
  'an edit is pending again');
select pg_temp.as_service();
select throws_ok($$select pg_temp.decide(pg_temp.id('w1'), 'admitted')$$, 'P0001', format('tenant text %s was replaced by a newer save', pg_temp.id('w1')),
  'LEAD decides only the newest value');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.keep('v5', public.publish_course(pg_temp.id('m')));
select pg_temp.reset_role();
select is(pg_temp.snap(pg_temp.id('v5')) ? 'welcome', false, 'an edited note is out of the next version until admitted');
select is(pg_temp.snap(pg_temp.id('v4')) -> 'welcome' ->> 'text', 'Welcome! We start with drills for the hips.', 'the earlier version keeps its note');
select pg_temp.hash(pg_temp.id('w2'));
select pg_temp.as_service();
select is(pg_temp.decide(pg_temp.id('w2'), 'rejected'), 'rejected', 'LEAD can reject a text');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select is((select status || ':' || reason from public.tenant_text_status('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'welcome', pg_temp.id('m'))),
  'rejected:Introductory coaching practice only.', 'the owner sees the decision and its reason');

-- The course blurb follows the same model.
select pg_temp.keep('b1', pg_temp.save_text('course_blurb', 'Hinge patterns for new lifters.', pg_temp.id('m')));
select pg_temp.keep('w3', pg_temp.save_text('welcome', 'Short and plain: hips first.', pg_temp.id('m')));
select pg_temp.reset_role();
select pg_temp.hash(pg_temp.id('b1'));
select pg_temp.hash(pg_temp.id('w3'));
select pg_temp.as_service();
select pg_temp.decide(pg_temp.id('b1'), 'admitted');
select pg_temp.decide(pg_temp.id('w3'), 'admitted');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.keep('v6', public.publish_course(pg_temp.id('m')));
select pg_temp.reset_role();
select is((pg_temp.snap(pg_temp.id('v6')) -> 'blurb') - 'author', jsonb_build_object('text', 'Hinge patterns for new lifters.',
  'receiptId', (select id from private.tenant_text_admissions where text_id = pg_temp.id('b1'))),
  'an admitted blurb is frozen into the version with its receipt');
select is(pg_temp.snap(pg_temp.id('v6')) -> 'blurb' -> 'author' ->> 'authorUserId', '00000000-0000-0000-0000-0000000000a1', 'and its author');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select pg_temp.keep('b2', pg_temp.save_text('course_blurb', 'Hinge patterns for new lifters.', pg_temp.id('m')));
select pg_temp.reset_role();
select pg_temp.hash(pg_temp.id('b2'));
select pg_temp.as_service();
select pg_temp.decide(pg_temp.id('b2'), 'admitted');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select isnt(public.publish_course(pg_temp.id('m')), pg_temp.id('v6'),
  'the same blurb admitted again from another author is a new receipt and a new version');

-- Gym texts: members read admitted ones only.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.keep('h1', pg_temp.save_text('catalog_headline', 'Lift well for life'));
select pg_temp.keep('t1', pg_temp.save_text('catalog_tagline', 'Barbell coaching in a small room.'));
select pg_temp.reset_role();
select pg_temp.hash(pg_temp.id('h1'));
select pg_temp.as_service();
select pg_temp.decide(pg_temp.id('h1'), 'admitted');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select results_eq($$select slot, text from public.member_tenant_texts('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') where slot <> 'brand_name'$$,
  $$values ('catalog_headline'::text, 'Lift well for life'::text)$$, 'a member reads the admitted headline and not the pending tagline');
-- The brand name is held: members see the fixed fallback until LEAD admits one.
create function pg_temp.brand() returns text language sql as $$
  select text || ':' || admitted from public.member_tenant_texts('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') where slot = 'brand_name'
$$;
select is(pg_temp.brand(), 'Your gym:false', 'with no admitted brand name, members see "Your gym"');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.keep('bn', pg_temp.save_text('brand_name', 'Andrew Fitness'));
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select is(pg_temp.brand(), 'Your gym:false', 'a pending brand name is never shown');
select pg_temp.reset_role();
select pg_temp.hash(pg_temp.id('bn'));
select pg_temp.as_service();
select pg_temp.decide(pg_temp.id('bn'), 'admitted');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select is(pg_temp.brand(), 'Andrew Fitness:true', 'once admitted, members see the brand name');
-- The welcome signature is resolved at publish: admitted coach name, then admitted brand name, then the fallback.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.keep('v7', public.publish_course(pg_temp.id('m')));
select pg_temp.reset_role();
select is(pg_temp.snap(pg_temp.id('v7')) -> 'welcome' -> 'author' ->> 'displayName', 'Andrew Fitness',
  'with an admitted brand name and no coach name, the next version signs the note with the brand');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.keep('cn', pg_temp.save_text('coach_name', 'Coach Dre'));
select is(public.publish_course(pg_temp.id('m')), pg_temp.id('v7'), 'a pending coach name changes nothing');
select pg_temp.reset_role();
select pg_temp.hash(pg_temp.id('cn'));
select pg_temp.as_service();
select pg_temp.decide(pg_temp.id('cn'), 'admitted');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.keep('v8', public.publish_course(pg_temp.id('m')));
select pg_temp.reset_role();
select is(pg_temp.snap(pg_temp.id('v8')) -> 'welcome' -> 'author' ->> 'displayName', 'Coach Dre',
  'once a coach name is admitted, the next version signs with it, though the note was saved before');
select is(pg_temp.snap(pg_temp.id('v6')) -> 'welcome' -> 'author' ->> 'displayName', 'Your gym', 'earlier versions keep their signature');

-- Revocation (Sol R1 B1): LEAD withdraws an admission; it leaves member reads at once and the next version.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$select public.publisher_revoke_tenant_text('00000000-0000-0000-0000-0000000000a1', pg_temp.id('w3'), '{"reason": "x"}')$$,
  '42501', null, 'a gym cannot revoke');
select pg_temp.as_service();
select throws_ok($$select public.publisher_revoke_tenant_text('00000000-0000-0000-0000-0000000000c1', pg_temp.id('t1'), '{"reason": "x"}')$$,
  'P0001', format('tenant text %s is pending, not admitted', pg_temp.id('t1')), 'only an admitted text can be revoked');
select is(public.publisher_revoke_tenant_text('00000000-0000-0000-0000-0000000000c1', pg_temp.id('w3'),
  '{"reason": "Implies an outcome on reflection."}'), 'revoked', 'LEAD revokes the admitted note');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select is((select state || ':' || coalesce(text, '-') from public.version_tenant_texts(pg_temp.id('v8')) where slot = 'welcome'), 'revoked:-',
  'members of an already-published version no longer get the note');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select is((select status || ':' || reason from public.tenant_text_status('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'welcome', pg_temp.id('m'))),
  'revoked:Implies an outcome on reflection.', 'the owner sees the revocation and its reason');
select pg_temp.keep('v9', public.publish_course(pg_temp.id('m')));
select pg_temp.reset_role();
select is(pg_temp.snap(pg_temp.id('v9')) ? 'welcome', false, 'the next version leaves the revoked note out');
select pg_temp.as_service();
select public.publisher_revoke_tenant_text('00000000-0000-0000-0000-0000000000c1', pg_temp.id('h1'), '{"reason": "x"}');
select public.publisher_revoke_tenant_text('00000000-0000-0000-0000-0000000000c1', pg_temp.id('bn'), '{"reason": "x"}');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select results_eq($$select slot, text, admitted from public.member_tenant_texts('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') where slot in ('brand_name', 'catalog_headline')$$,
  $$values ('brand_name'::text, 'Your gym'::text, false)$$, 'a revoked brand name falls back and a revoked headline disappears');
select pg_temp.reset_role();
select pg_temp.keep('tt', (select id from private.tenant_texts where course_id = pg_temp.id('m') and slot = 'course_title' order by seq desc limit 1));
select pg_temp.as_service();
select public.publisher_revoke_tenant_text('00000000-0000-0000-0000-0000000000c1', pg_temp.id('tt'), '{"reason": "x"}');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select is((select state || ':' || text from public.version_tenant_texts(pg_temp.id('v9')) where slot = 'course_title'), 'revoked:Untitled course',
  'a revoked title reads as the fallback in published versions');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$select public.publish_course(pg_temp.id('m'))$$, 'P0001',
  'publish gate: course a1000000-0000-4000-8000-000000000000 has no admitted title (LEAD admits held tenant text)',
  'a revoked title blocks publishing');
select pg_temp.save(pg_temp.course('a1000000-0000-4000-8000-000000000000', 'method',
  jsonb_build_object('cover', pg_temp.cover('rings', '#0b3d2e', '#f5f5f5'), 'tags', '["strength"]'::jsonb)));
select pg_temp.reset_role();
select is(private.tenant_text_status((select id from private.tenant_texts where course_id = pg_temp.id('m') and slot = 'course_title'
  order by seq desc limit 1)), 'pending', 'saving the draft again asks for the title anew');
select pg_temp.admit_titles();
select pg_temp.reset_role();
set local role anon;
select throws_ok($$select * from public.member_tenant_texts('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$, '42501', null,
  'anonymous callers get no tenant text');
reset role;

-- A newer rule set applies at the next publish.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.keep('w4', pg_temp.save_text('welcome', 'Short and plain: hips first.', pg_temp.id('m')));
select pg_temp.reset_role();
select pg_temp.hash(pg_temp.id('w4'));
select pg_temp.as_service();
select pg_temp.decide(pg_temp.id('w4'), 'admitted');
select pg_temp.reset_role();
insert into private.tenant_text_rules (version, rules)
select 'tt-test.2', jsonb_set(jsonb_set(rules, '{version}', '"tt-test.2"'), '{deny}', (rules -> 'deny') || '["hips"]')
from private.tenant_text_rules where version = 'tt-2026-10-11.1';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$select public.publish_course(pg_temp.id('m'))$$, 'P0001',
  'publish gate: course a1000000-0000-4000-8000-000000000000 welcome fails text admission: hips (denied)',
  'an admitted note that a newer rule set refuses blocks the publish');
select is(pg_temp.save_text('welcome', null, pg_temp.id('m')) is not null, true, 'the owner can clear the note');
select is((select status from public.tenant_text_status('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'welcome', pg_temp.id('m'))), 'cleared',
  'and it reads as cleared');
select pg_temp.keep('v7', public.publish_course(pg_temp.id('m')));
select pg_temp.reset_role();
select is(pg_temp.snap(pg_temp.id('v7')) ? 'welcome', false, 'a cleared note leaves the next version');
select throws_ok(format($$update private.tenant_texts set text = 'x' where id = %L$$, pg_temp.id('w1')), 'P0001',
  'tenant_texts rows are immutable', 'held texts are append-only');
select throws_ok($$select public.check_tenant_text('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'welcome', 'x')$$, '28000', 'not signed in',
  'text checks need a signed-in author');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select is(public.check_tenant_text('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'welcome', 'Science!') ->> 'reason', 'denied',
  'an author can check a text before saving');

select * from finish();
rollback;
