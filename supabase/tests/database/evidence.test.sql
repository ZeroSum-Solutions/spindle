-- Phase 3 acceptance (ADR 0007): review receipts bound to exact hashes, the
-- claim lifecycle, the practice-media registry and graded quizzes. All
-- content and receipts are synthetic; no model is called.
begin;
create extension if not exists pgtap with schema extensions;
select plan(170);

-- Fixtures -------------------------------------------------------------------
-- Gym A: Alice owner, Tess and Tom trainers. Gym B: Bob owner, Tess trainer.
-- Pat is a content publisher; Mal is a signed-in user who is not.
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'alice@a.test', now()),
  ('00000000-0000-0000-0000-0000000000a3', 'tess@a.test', now()),
  ('00000000-0000-0000-0000-0000000000a4', 'tom@a.test', now()),
  ('00000000-0000-0000-0000-0000000000b1', 'bob@b.test', now()),
  ('00000000-0000-0000-0000-0000000000c1', 'pat@spindle.test', now()),
  ('00000000-0000-0000-0000-0000000000c2', 'mal@x.test', now());
insert into public.orgs (id, name, slug) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Gym A', 'gym-a'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Gym B', 'gym-b');
insert into public.memberships (org_id, user_id, role) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-0000000000a1', 'owner'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-0000000000a3', 'trainer'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-0000000000a4', 'trainer'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-0000000000b1', 'owner'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-0000000000a3', 'trainer');
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
create function pg_temp.pat() returns uuid language sql as $$ select '00000000-0000-0000-0000-0000000000c1'::uuid $$;
create function pg_temp.iso(t timestamptz) returns text language sql as $$
  select to_char(t at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
$$;

-- A synthetic model run: the receipt CI records instead of calling a model.
create function pg_temp.run(tag text) returns jsonb language sql as $$
  select jsonb_build_object('model', 'synthetic-fixture', 'session', 'ci-' || tag,
    'packetDigest', encode(extensions.digest(tag, 'sha256'), 'hex'), 'reviewedAt', '2026-10-01T00:00:00Z')
$$;
create function pg_temp.claim_receipt() returns jsonb language sql as $$
  select jsonb_build_object('existenceCheckedAt', '2026-10-01T00:00:00Z', 'faithfulness', 'faithful',
    'retractionCheckedAt', '2026-10-01T00:00:00Z')
$$;
create function pg_temp.claim_hash(claim uuid) returns text language sql as $$
  select public.publisher_claim_target(pg_temp.pat(), claim) ->> 'hash'
$$;
create function pg_temp.approve(claim uuid) returns uuid language sql as $$
  select public.publisher_review_claim(pg_temp.pat(), claim, jsonb_build_object('decision', 'approved',
    'expiresAt', pg_temp.iso(now() + interval '1 year'), 'expectedHash', pg_temp.claim_hash(claim),
    'receipt', pg_temp.claim_receipt(), 'run', pg_temp.run('claim-' || claim)))
$$;
create function pg_temp.source(doi text) returns uuid language sql as $$
  select public.publisher_add_source(pg_temp.pat(), jsonb_build_object('kind', 'systematic_review',
    'title', 'Synthetic review ' || doi, 'doi', doi, 'license', 'CC BY 4.0'))
$$;
create function pg_temp.claim(statement text, source uuid) returns uuid language sql as $$
  select public.publisher_add_claim(pg_temp.pat(), jsonb_build_object('statement', statement, 'evidenceLevel', 'synthetic',
    'population', 'synthetic adults', 'sourceIds', jsonb_build_array(source)))
$$;

create function pg_temp.sci(body text, claims uuid[]) returns jsonb language sql as $$
  select jsonb_build_object('kind', 'paragraph', 'content', body, 'support', 'science', 'claimIds', to_jsonb(claims))
$$;
create function pg_temp.prac(body text) returns jsonb language sql as $$
  select jsonb_build_object('kind', 'paragraph', 'content', body, 'support', 'practice-based', 'claimIds', '[]'::jsonb)
$$;
create function pg_temp.quiz(prompt text, support text, claims uuid[]) returns jsonb language sql as $$
  select jsonb_build_object('kind', 'quiz', 'support', support, 'claimIds', to_jsonb(claims), 'content',
    jsonb_build_object('prompt', prompt, 'options', jsonb_build_array('Wrong', 'Right'), 'answerIndex', 1,
      'explanation', 'Synthetic explanation.'))
$$;
create function pg_temp.video(media uuid, start_s integer, end_s integer, rationale text) returns jsonb language sql as $$
  select jsonb_build_object('kind', 'video', 'content', jsonb_build_object('mediaId', media, 'provider', 'youtube',
    'videoId', 'AbCdEfGhIj0', 'startSeconds', start_s, 'endSeconds', end_s, 'rationale', rationale, 'caption', ''))
$$;
create function pg_temp.lesson(lid text, slug text, blocks jsonb) returns jsonb language sql as $$
  select jsonb_build_object('id', lid, 'slug', slug, 'title', 'Lesson ' || slug, 'summary', 'Synthetic fixture.',
    'durationMinutes', 5, 'format', 'article', 'objectives', jsonb_build_array('Name the parts'),
    'anatomyIds', '[]'::jsonb, 'blocks', blocks, 'media', '[]'::jsonb, 'resources', '[]'::jsonb)
$$;
create function pg_temp.course(cid text, layer text, lessons jsonb, title text default 'Synthetic course') returns jsonb
language sql as $$
  select jsonb_build_object('id', cid, 'slug', 'course-' || left(cid, 2), 'layer', layer, 'title', title,
    'subtitle', 'Fixture', 'description', 'Synthetic test content.', 'level', 'foundation', 'outcomes', '[]'::jsonb,
    'parts', jsonb_build_array(jsonb_build_object('id', left(cid, 34) || 'f1', 'ordinal', 1, 'title', 'Part one',
      'summary', '', 'lessons', lessons)))
$$;
create function pg_temp.save(course jsonb) returns uuid language sql as $$
  select public.publisher_save_course_draft(pg_temp.pat(), course)
$$;
create function pg_temp.publish(cid uuid) returns uuid language sql as $$
  select public.publisher_publish_course(pg_temp.pat(), cid)
$$;
create function pg_temp.targets(cid uuid) returns jsonb language sql as $$
  select public.publisher_review_targets(pg_temp.pat(), cid)
$$;
create function pg_temp.lesson_target(cid uuid, lid uuid) returns jsonb language sql as $$
  select l from jsonb_array_elements(pg_temp.targets(cid) -> 'lessons') l where (l ->> 'lessonId')::uuid = lid
$$;
create function pg_temp.clean(target jsonb, tag text) returns jsonb language sql as $$
  select jsonb_build_object('verdict', 'clean', 'expectedHash', target -> 'hash', 'claimIds', target -> 'claimIds',
    'checks', jsonb_build_object('safety', 'pass', 'originality', 'pass'),
    'findings', jsonb_build_array(jsonb_build_object('severity', 'NIT', 'item', 'wording', 'note', 'Synthetic nit.')),
    'run', pg_temp.run(tag))
$$;
create function pg_temp.supported(target jsonb, tag text) returns jsonb language sql as $$
  select jsonb_build_object('verdict', 'supported', 'expectedHash', target -> 'hash', 'claimIds', target -> 'claimIds',
    'run', pg_temp.run(tag))
$$;
create function pg_temp.review_shell(cid uuid, tag text) returns uuid language sql as $$
  select public.publisher_review_course(pg_temp.pat(), cid, jsonb_build_object('verdict', 'clean',
    'expectedHash', pg_temp.targets(cid) -> 'course' -> 'hash', 'checks', '{"safety": "pass", "originality": "pass"}'::jsonb,
    'findings', '[]'::jsonb, 'run', pg_temp.run(tag)))
$$;
/** Records synthetic block, lesson and course receipts for the course exactly as it is now. */
create function pg_temp.review_all(cid uuid, tag text) returns void language plpgsql as $$
declare
  l jsonb;
  b jsonb;
begin
  for l in select * from jsonb_array_elements(pg_temp.targets(cid) -> 'lessons') loop
    for b in select * from jsonb_array_elements(l -> 'blocks') loop
      if jsonb_array_length(b -> 'claimIds') > 0 then
        perform public.publisher_review_block(pg_temp.pat(), (b ->> 'blockId')::uuid, pg_temp.supported(b, tag));
      end if;
    end loop;
    perform public.publisher_review_lesson(pg_temp.pat(), (l ->> 'lessonId')::uuid, pg_temp.clean(l, tag));
  end loop;
  perform pg_temp.review_shell(cid, tag);
end;
$$;

select pg_temp.as_service();
select pg_temp.keep('s1', pg_temp.source('10.5555/p3.1'));
select pg_temp.keep('s2', pg_temp.source('10.5555/p3.2'));
select pg_temp.keep('c_ok', pg_temp.claim('Synthetic claim about the cuff.', pg_temp.id('s1')));
select pg_temp.keep('c_other', pg_temp.claim('Synthetic claim about the hip.', pg_temp.id('s1')));
select pg_temp.approve(pg_temp.id('c_ok'));
select pg_temp.approve(pg_temp.id('c_other'));

-- 1. Block receipts: expected hash and claim set, compared atomically -------------------
create function pg_temp.s_tree(body text, claims uuid[], cue text) returns jsonb language sql as $$
  select pg_temp.course('71000000-0000-4000-8000-000000000000', 'base', jsonb_build_array(
    pg_temp.lesson('71000000-0000-4000-8000-000000000011', 'stale', jsonb_build_array(pg_temp.sci(body, claims), pg_temp.prac(cue)))))
$$;
select pg_temp.save(pg_temp.s_tree('The cuff has four muscles.', array[pg_temp.id('c_ok')], 'Cue a tall posture.'));
select pg_temp.review_shell('71000000-0000-4000-8000-000000000000', 'shell');
create function pg_temp.s_block() returns jsonb language sql as $$
  select pg_temp.targets('71000000-0000-4000-8000-000000000000') -> 'lessons' -> 0 -> 'blocks' -> 0
$$;
select set_config('test.block_a', pg_temp.s_block()::text, true);
create function pg_temp.block_a() returns jsonb language sql as $$ select current_setting('test.block_a')::jsonb $$;
select pg_temp.reset_role();
select is(pg_temp.block_a() ->> 'hash', private.block_hash('paragraph', '"The cuff has four muscles."'),
  'review targets report the database-computed block hash');
select pg_temp.as_service();
select throws_ok(format($$select public.publisher_review_block(pg_temp.pat(), %L, '{"verdict": "supported"}')$$,
  pg_temp.block_a() ->> 'blockId'), '22023', 'invalid review.expectedHash: is required',
  'a block review must name the hash the reviewer saw');
select throws_ok(format($$select public.publisher_review_block(pg_temp.pat(), %L,
  jsonb_build_object('verdict', 'supported', 'expectedHash', %L, 'claimIds', %L::jsonb))$$,
  pg_temp.block_a() ->> 'blockId', pg_temp.block_a() ->> 'hash', pg_temp.block_a() -> 'claimIds'),
  '22023', 'invalid review.run: a supported verdict needs a model run receipt', 'a supported verdict needs a model run');
-- Sol reviews A; a writer saves B; the recorder must not stamp the verdict onto B.
select pg_temp.save(pg_temp.s_tree('The cuff has five muscles.', array[pg_temp.id('c_ok')], 'Cue a tall posture.'));
select throws_ok(format($$select public.publisher_review_block(pg_temp.pat(), %L, pg_temp.supported(pg_temp.block_a(), 'a'))$$,
  pg_temp.block_a() ->> 'blockId'), 'P0002', 'no such global block', 'a review of a replaced block finds no block');
select throws_ok(format($$select public.publisher_review_block(pg_temp.pat(), %L, pg_temp.supported(pg_temp.block_a(), 'a'))$$,
  pg_temp.s_block() ->> 'blockId'), 'P0001',
  format('stale review: block %s changed after its review packet was built', pg_temp.s_block() ->> 'blockId'),
  'a review of content A cannot approve content B');
-- Same text, new citation set: the old claim set is stale too.
select set_config('test.block_b', pg_temp.s_block()::text, true);
select pg_temp.save(pg_temp.s_tree('The cuff has five muscles.', array[pg_temp.id('c_ok'), pg_temp.id('c_other')], 'Cue a tall posture.'));
select throws_ok(format($$select public.publisher_review_block(pg_temp.pat(), %L,
  pg_temp.supported(current_setting('test.block_b')::jsonb, 'b'))$$, pg_temp.s_block() ->> 'blockId'), 'P0001',
  format('stale review: block %s changed after its review packet was built', pg_temp.s_block() ->> 'blockId'),
  'a review of an older claim set cannot approve a new one');
select lives_ok($$select public.publisher_review_block(pg_temp.pat(), (pg_temp.s_block() ->> 'blockId')::uuid,
  pg_temp.supported(pg_temp.s_block(), 'c'))$$, 'a review of the current content and claims records');

-- 2. Lesson receipts --------------------------------------------------------------------
select pg_temp.keep('l_stale', '71000000-0000-4000-8000-000000000011');
select set_config('test.lesson_a', pg_temp.lesson_target('71000000-0000-4000-8000-000000000000', pg_temp.id('l_stale'))::text, true);
create function pg_temp.lesson_a() returns jsonb language sql as $$ select current_setting('test.lesson_a')::jsonb $$;
select is(pg_temp.lesson_a() ->> 'hash',
  encode(extensions.digest((pg_temp.lesson_a() -> 'lesson')::text, 'sha256'), 'hex'),
  'the lesson target hash is sha256 of the lesson JSON the snapshot will hold');
select is(pg_temp.lesson_a() -> 'claimIds',
  (select jsonb_agg(x order by x) from unnest(array[pg_temp.id('c_ok'), pg_temp.id('c_other')]) x),
  'the lesson target lists its sorted claim set');
select throws_ok($$select pg_temp.publish('71000000-0000-4000-8000-000000000000')$$, 'P0001',
  'publish gate: lesson 71000000-0000-4000-8000-000000000011 has no clean lesson review for its exact content',
  'global content needs a lesson receipt even when every block is bound');
select throws_ok($$select public.publisher_review_lesson(pg_temp.pat(), pg_temp.id('l_stale'),
  pg_temp.clean(pg_temp.lesson_a(), 'l') - 'run')$$, '22023', 'invalid review.run: a clean review needs a model run receipt',
  'a clean lesson review needs a model run');
select throws_ok($$select public.publisher_review_lesson(pg_temp.pat(), pg_temp.id('l_stale'),
  jsonb_set(pg_temp.clean(pg_temp.lesson_a(), 'l'), '{findings}',
    '[{"severity": "WARN", "item": "safety", "note": "Synthetic warning."}]'))$$,
  '22023', 'invalid review.verdict: a clean review has no BLOCK or WARN finding', 'clean means nothing above NIT');
select throws_ok($$select public.publisher_review_lesson(pg_temp.pat(), pg_temp.id('l_stale'),
  jsonb_set(pg_temp.clean(pg_temp.lesson_a(), 'l'), '{checks,originality}', '"fail"'))$$,
  '22023', 'invalid review.verdict: a clean review passes the safety and originality checks',
  'clean means the originality check passed');
select throws_ok($$select public.publisher_review_lesson(pg_temp.pat(), pg_temp.id('l_stale'),
  jsonb_set(pg_temp.clean(pg_temp.lesson_a(), 'l'), '{checks,safety}', '"fail"'))$$,
  '22023', 'invalid review.verdict: a clean review passes the safety and originality checks',
  'clean means the safety check passed');
select throws_ok($$select public.publisher_review_lesson(pg_temp.pat(), pg_temp.id('l_stale'),
  jsonb_set(pg_temp.clean(pg_temp.lesson_a(), 'l'), '{findings}', '[{"severity": "MINOR", "item": "x", "note": "x"}]'))$$,
  '22023', 'invalid review.findings[0].severity: must be one of BLOCK, WARN, NIT', 'finding severities are validated');
select throws_ok($$select public.publisher_review_lesson(pg_temp.pat(), pg_temp.id('l_stale'),
  pg_temp.clean(pg_temp.lesson_a(), 'l') || '{"passed": true}')$$,
  '22023', 'invalid review: unknown key passed', 'a lesson review refuses unknown keys');
select throws_ok($$select public.publisher_review_lesson(pg_temp.pat(), pg_temp.id('l_stale'),
  jsonb_set(pg_temp.clean(pg_temp.lesson_a(), 'l'), '{claimIds}', jsonb_build_array(pg_temp.id('c_ok'))))$$, 'P0001',
  'stale review: lesson 71000000-0000-4000-8000-000000000011 changed after its review packet was built',
  'a lesson review of another claim set is stale');
select lives_ok($$select public.publisher_review_lesson(pg_temp.pat(), pg_temp.id('l_stale'), pg_temp.clean(pg_temp.lesson_a(), 'l'))$$,
  'a clean lesson review of the current lesson records');
select lives_ok($$select pg_temp.keep('s_v1', pg_temp.publish('71000000-0000-4000-8000-000000000000'))$$,
  'bound blocks plus a clean lesson receipt publish');
-- Practice text is covered: only the practice cue changes.
select pg_temp.save(pg_temp.s_tree('The cuff has five muscles.', array[pg_temp.id('c_ok'), pg_temp.id('c_other')], 'Cue a slouch.'));
select throws_ok($$select public.publisher_review_lesson(pg_temp.pat(), pg_temp.id('l_stale'), pg_temp.clean(pg_temp.lesson_a(), 'l'))$$,
  'P0001', 'stale review: lesson 71000000-0000-4000-8000-000000000011 changed after its review packet was built',
  'a lesson review of the old practice text is stale');
select throws_ok($$select pg_temp.publish('71000000-0000-4000-8000-000000000000')$$, 'P0001',
  'publish gate: lesson 71000000-0000-4000-8000-000000000011 has no clean lesson review for its exact content',
  'changed practice guidance cannot publish on an older lesson receipt');
select public.publisher_review_lesson(pg_temp.pat(), pg_temp.id('l_stale'),
  jsonb_build_object('verdict', 'changes_required', 'expectedHash', pg_temp.lesson_target('71000000-0000-4000-8000-000000000000',
    pg_temp.id('l_stale')) -> 'hash', 'claimIds', pg_temp.lesson_target('71000000-0000-4000-8000-000000000000',
    pg_temp.id('l_stale')) -> 'claimIds', 'checks', '{"safety": "fail", "originality": "pass"}'::jsonb,
    'findings', '[{"severity": "BLOCK", "item": "safety", "note": "Synthetic unsafe cue."}]'::jsonb));
select throws_ok($$select pg_temp.publish('71000000-0000-4000-8000-000000000000')$$, 'P0001',
  'publish gate: lesson 71000000-0000-4000-8000-000000000011 has no clean lesson review for its exact content',
  'a lesson whose latest review requires changes cannot publish');
select lives_ok($$select public.publisher_review_lesson(pg_temp.pat(), pg_temp.id('l_stale'),
  pg_temp.clean(pg_temp.lesson_target('71000000-0000-4000-8000-000000000000', pg_temp.id('l_stale')), 'l2'))$$,
  'a fresh clean review of the new lesson records');
select lives_ok($$select pg_temp.publish('71000000-0000-4000-8000-000000000000')$$, 'after a fresh clean review it publishes');

-- 2b. Course text needs its own receipt; a phase-2 version is not reused --------------------------
select pg_temp.save(pg_temp.s_tree('The cuff has five muscles.', array[pg_temp.id('c_ok'), pg_temp.id('c_other')], 'Cue a slouch.')
  || '{"description": "Unreviewed course guidance."}');
select throws_ok($$select pg_temp.publish('71000000-0000-4000-8000-000000000000')$$, 'P0001',
  'publish gate: course 71000000-0000-4000-8000-000000000000 has no clean course review for its exact text',
  'changed course text cannot publish on an older course receipt');
select is((pg_temp.targets('71000000-0000-4000-8000-000000000000') -> 'course' -> 'shell') ->> 'description',
  'Unreviewed course guidance.', 'the course target carries the text to review');
select throws_ok($$select public.publisher_review_course(pg_temp.pat(), '71000000-0000-4000-8000-000000000000',
  jsonb_build_object('verdict', 'clean', 'expectedHash', repeat('b', 64), 'checks', '{"safety": "pass", "originality": "pass"}'::jsonb,
    'findings', '[]'::jsonb, 'run', pg_temp.run('shell-2')))$$, 'P0001',
  'stale review: course 71000000-0000-4000-8000-000000000000 changed after its review packet was built', 'a stale course review is refused');
select throws_ok($$select public.publisher_review_course(pg_temp.pat(), '71000000-0000-4000-8000-000000000000',
  jsonb_build_object('verdict', 'clean', 'expectedHash', pg_temp.targets('71000000-0000-4000-8000-000000000000') -> 'course' -> 'hash',
    'checks', '{"safety": "pass", "originality": "pass"}'::jsonb, 'findings', '{}'::jsonb, 'run', pg_temp.run('shell-2')))$$,
  '22023', 'invalid review.findings: must be an array of at most 200 findings', 'course review findings must be an array');
select lives_ok($$select pg_temp.review_shell('71000000-0000-4000-8000-000000000000', 'shell-2')$$, 'a course review of the current text records');
select lives_ok($$select pg_temp.keep('s_v3', pg_temp.publish('71000000-0000-4000-8000-000000000000'))$$,
  'with the course text reviewed it publishes');
select pg_temp.reset_role();
-- A version published under the phase-2 rules, with the same content as the draft.
insert into public.curriculum_versions (course_id, org_id, layer, version_number, snapshot, content_hash, published_by, rules)
select course_id, null, layer, version_number + 1, snapshot, content_hash, published_by, 'phase2'
from public.curriculum_versions where id = pg_temp.id('s_v3');
select pg_temp.as_service();
select pg_temp.keep('s_v5', pg_temp.publish('71000000-0000-4000-8000-000000000000'));
select ok((select rules = 'phase3' and version_number = 5 from public.curriculum_versions where id = pg_temp.id('s_v5')),
  'republishing a tree whose latest version is phase-2 makes a new phase-3 version');
select pg_temp.reset_role();
insert into public.lesson_blocks (lesson_id, org_id, ordinal, kind, support, content, content_hash)
select '71000000-0000-4000-8000-000000000011', null, 9, 'image', null, c, private.block_hash('image', c)
from (select jsonb_build_object('kind', 'image', 'src', 'https://www.youtube.com/watch?v=AbCdEfGhIj0', 'alt', 'x', 'caption', '',
  'provenanceId', 'p1') as c) t;
select pg_temp.as_service();
select throws_ok($$select pg_temp.publish('71000000-0000-4000-8000-000000000000')$$, 'P0001',
  'publish gate: lesson 71000000-0000-4000-8000-000000000011 has media on a video host; use a registry video block',
  'media saved around the validator cannot smuggle YouTube in');
select pg_temp.reset_role();
delete from public.lesson_blocks where lesson_id = '71000000-0000-4000-8000-000000000011' and ordinal = 9;
update public.lessons set media = jsonb_build_array(jsonb_build_object('kind', 'video', 'src', 'https://youtu.be/AbCdEfGhIj0',
  'alt', 'x', 'caption', '', 'provenanceId', 'p1')) where id = '71000000-0000-4000-8000-000000000011';
select pg_temp.as_service();
select throws_ok($$select pg_temp.publish('71000000-0000-4000-8000-000000000000')$$, 'P0001',
  'publish gate: course 71000000-0000-4000-8000-000000000000 has lesson media on a video host; use a registry video block',
  'lesson media saved around the validator cannot smuggle YouTube in');
select pg_temp.reset_role();
update public.lessons set media = '[]' where id = '71000000-0000-4000-8000-000000000011';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c2');
select throws_ok($$select public.publisher_review_course(pg_temp.pat(), '71000000-0000-4000-8000-000000000000', '{}')$$, '42501', null,
  'a signed-in user cannot record a course review');
select pg_temp.as_service();

-- 3. Run metadata is separate from the publisher actor ----------------------------------------
select pg_temp.reset_role();
select results_eq($$select r.model, r.session_id, lr.reviewer from public.lesson_reviews lr
  join public.review_runs r on r.id = lr.run_id where lr.lesson_id = '71000000-0000-4000-8000-000000000011' and lr.verdict = 'clean'
  order by lr.seq limit 1$$,
  $$values ('synthetic-fixture'::text, 'ci-l'::text, '00000000-0000-0000-0000-0000000000c1'::uuid)$$,
  'the model and session are stored apart from the publisher who recorded them');
select is((select count(*) from public.review_runs where session_id = 'ci-c'), 1::bigint,
  'one run row serves every item a session reviewed');
select pg_temp.as_service();
select throws_ok($$select public.publisher_review_lesson(pg_temp.pat(), pg_temp.id('l_stale'),
  jsonb_set(pg_temp.clean(pg_temp.lesson_target('71000000-0000-4000-8000-000000000000', pg_temp.id('l_stale')), 'l2'),
    '{run,reviewedAt}', '"2026-10-02T00:00:00Z"'))$$,
  '22023', 'invalid review.run.reviewedAt: differs from the recorded run', 'a run cannot be re-recorded with other metadata');
select throws_ok(format($$select public.publisher_review_lesson(pg_temp.pat(), pg_temp.id('l_stale'),
  jsonb_set(pg_temp.clean(pg_temp.lesson_target('71000000-0000-4000-8000-000000000000', pg_temp.id('l_stale')), 'future'),
    '{run,reviewedAt}', to_jsonb(%L::text)))$$, pg_temp.iso(now() + interval '1 day')),
  '22023', 'invalid review.run.reviewedAt: is in the future', 'a run cannot claim a future review time');
select throws_ok($$select public.publisher_review_lesson(pg_temp.pat(), pg_temp.id('l_stale'),
  jsonb_set(pg_temp.clean(pg_temp.lesson_target('71000000-0000-4000-8000-000000000000', pg_temp.id('l_stale')), 'm'),
    '{run,model}', '"GPT 6"'))$$, '22023', 'invalid review.run.model: must be a lowercase model id', 'model ids are validated');

-- 4. Forgery: tenants and direct writes ----------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c2');
select throws_ok($$select public.publisher_review_lesson(pg_temp.pat(), pg_temp.id('l_stale'), '{}')$$, '42501', null,
  'a signed-in user cannot record a lesson review, even naming a real publisher');
select throws_ok($$select public.publisher_review_targets(pg_temp.pat(), '71000000-0000-4000-8000-000000000000')$$, '42501', null,
  'a signed-in user cannot read review targets');
select throws_ok($$insert into public.lesson_reviews (lesson_id, lesson_hash, claim_ids, verdict, safety, originality, findings, reviewer)
  values ('71000000-0000-4000-8000-000000000011', repeat('0', 64), '{}', 'changes_required', 'pass', 'pass', '[]', auth.uid())$$,
  '42501', null, 'a signed-in user cannot insert lesson reviews');
select throws_ok($$select * from public.lesson_reviews$$, '42501', null, 'lesson reviews are not client-readable');
select throws_ok($$select * from public.review_runs$$, '42501', null, 'review runs are not client-readable');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$select public.publisher_review_block(pg_temp.pat(), gen_random_uuid(), '{}')$$, '42501', null,
  'a gym owner cannot record block reviews');
select pg_temp.as_service();
select throws_ok($$insert into public.review_runs (model, session_id, packet_digest, reviewed_at, recorded_by)
  values ('x', 'x', repeat('0', 64), now(), pg_temp.pat())$$, '42501', null, 'the service role cannot write runs directly');
select throws_ok($$insert into public.lesson_reviews (lesson_id, lesson_hash, claim_ids, verdict, safety, originality, findings, reviewer)
  values ('71000000-0000-4000-8000-000000000011', repeat('0', 64), '{}', 'changes_required', 'pass', 'pass', '[]', pg_temp.pat())$$,
  '42501', null, 'the service role cannot write lesson reviews directly');
select throws_ok($$select public.publisher_review_lesson('00000000-0000-0000-0000-0000000000c2', pg_temp.id('l_stale'), '{}')$$,
  '42501', 'actor is not a content publisher', 'the service path refuses an actor who is not a publisher');
select pg_temp.reset_role();
select throws_ok($$insert into public.lesson_reviews (lesson_id, lesson_hash, claim_ids, verdict, safety, originality, findings, reviewer)
  values ('71000000-0000-4000-8000-000000000011', repeat('0', 64), '{}', 'clean', 'pass', 'pass', '[]', '00000000-0000-0000-0000-0000000000c1')$$,
  '23514', null, 'even the table owner cannot store a clean lesson review without a model run');
select throws_ok($$update public.review_runs set model = 'other'$$, 'P0001', 'review_runs rows are immutable', 'runs are append-only');
select throws_ok($$delete from public.lesson_reviews$$, 'P0001', 'lesson_reviews rows are immutable', 'lesson reviews are append-only');
-- A phase-2 style binding review (no run) written around the RPC does not satisfy the gate.
select pg_temp.as_service();
select pg_temp.save(pg_temp.course('72000000-0000-4000-8000-000000000000', 'base', jsonb_build_array(
  pg_temp.lesson('72000000-0000-4000-8000-000000000011', 'legacy', jsonb_build_array(pg_temp.sci('Legacy fact.', array[pg_temp.id('c_ok')]))))));
select public.publisher_review_lesson(pg_temp.pat(), '72000000-0000-4000-8000-000000000011',
  pg_temp.clean(pg_temp.lesson_target('72000000-0000-4000-8000-000000000000', '72000000-0000-4000-8000-000000000011'), 'legacy'));
select pg_temp.reset_role();
insert into public.binding_reviews (block_hash, claim_ids, verdict, reviewer)
values (private.block_hash('paragraph', '"Legacy fact."'), array[pg_temp.id('c_ok')], 'supported', '00000000-0000-0000-0000-0000000000c1');
select pg_temp.as_service();
select throws_ok($$select pg_temp.publish('72000000-0000-4000-8000-000000000000')$$, 'P0001',
  'publish gate: lesson 72000000-0000-4000-8000-000000000011 has a paragraph block with no supporting binding review for its exact content and claims',
  'a supported binding review without a model run does not satisfy the gate');

-- 5. The gym method path is unchanged ----------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select lives_ok($$select public.save_course_draft('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', pg_temp.course('73000000-0000-4000-8000-000000000000',
  'method', jsonb_build_array(pg_temp.lesson('73000000-0000-4000-8000-000000000011', 'house',
    jsonb_build_array(pg_temp.prac('Greet every client.'), pg_temp.quiz('House rule?', 'practice-based', '{}'))))))$$,
  'a gym owner saves a practice-based method course');
select lives_ok($$select pg_temp.keep('m_v1', public.publish_course('73000000-0000-4000-8000-000000000000'))$$,
  'a method course publishes with no receipts at all');
select throws_ok($$select public.save_course_draft('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', pg_temp.course('73000000-0000-4000-8000-000000000000',
  'method', jsonb_build_array(pg_temp.lesson('73000000-0000-4000-8000-000000000011', 'house',
    jsonb_build_array(pg_temp.sci('Our method is proven.', array[pg_temp.id('c_ok')]))))))$$,
  '22023', 'invalid course.parts[0].lessons[0].blocks[0]: method content is practice-based', 'method content still cannot claim science');
select throws_ok($$select public.save_course_draft('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', pg_temp.course('73000000-0000-4000-8000-000000000000',
  'method', jsonb_build_array(pg_temp.lesson('73000000-0000-4000-8000-000000000011', 'house',
    jsonb_build_array(pg_temp.video(gen_random_uuid(), 0, 10, 'x'))))))$$,
  '22023', 'invalid course.parts[0].lessons[0].blocks[0]: gym method courses cannot embed registry videos',
  'a gym cannot embed registry videos');
select pg_temp.reset_role();
select is((select rules || '/' || coalesce(question_set_hash, 'none') from public.curriculum_versions where id = pg_temp.id('m_v1')),
  'phase3/none', 'a method version has no graded question set (its practice quiz is ungraded)');

-- 6. Claim lifecycle -----------------------------------------------------------------------
select pg_temp.as_service();
select pg_temp.keep('c_new', pg_temp.claim('Synthetic claim for lifecycle tests.', pg_temp.id('s1')));
select throws_ok(format($$select public.publisher_review_claim(pg_temp.pat(), %L, jsonb_build_object('decision', 'approved',
  'expiresAt', %L, 'expectedHash', pg_temp.claim_hash(%L), 'receipt', pg_temp.claim_receipt(), 'run', pg_temp.run('x')))$$,
  pg_temp.id('c_new'), pg_temp.iso(now() + interval '25 months'), pg_temp.id('c_new')),
  '22023', 'invalid review.expiresAt: must be at most 24 months away', 'an approval lasts at most 24 months');
select throws_ok(format($$select public.publisher_review_claim(pg_temp.pat(), %L, jsonb_build_object('decision', 'approved',
  'expiresAt', %L, 'expectedHash', pg_temp.claim_hash(%L), 'receipt', pg_temp.claim_receipt()))$$,
  pg_temp.id('c_new'), pg_temp.iso(now() + interval '1 year'), pg_temp.id('c_new')),
  '22023', 'invalid review.run: an approval needs a model run receipt', 'an approval needs a model run');
select throws_ok(format($$select public.publisher_review_claim(pg_temp.pat(), %L, jsonb_build_object('decision', 'approved',
  'expiresAt', %L, 'expectedHash', repeat('a', 64), 'receipt', pg_temp.claim_receipt(), 'run', pg_temp.run('x')))$$,
  pg_temp.id('c_new'), pg_temp.iso(now() + interval '1 year')),
  'P0001', format('stale review: claim %s does not match the reviewed hash', pg_temp.id('c_new')),
  'a claim review must name the claim hash the reviewer saw');
select throws_ok(format($$select public.publisher_review_claim(pg_temp.pat(), %L,
  jsonb_build_object('decision', 'approved', 'receipt', pg_temp.claim_receipt(), 'run', pg_temp.run('x')))$$, pg_temp.id('c_new')),
  '22023', 'invalid review.expectedHash: is required', 'a claim review without an expected hash is refused');
select lives_ok(format($$select public.publisher_review_claim(pg_temp.pat(), %L, jsonb_build_object('decision', 'approved',
  'expiresAt', %L, 'expectedHash', pg_temp.claim_hash(%L), 'receipt', pg_temp.claim_receipt(), 'run', pg_temp.run('x')))$$,
  pg_temp.id('c_new'), pg_temp.iso(now() + interval '23 months'), pg_temp.id('c_new')), 'a 23-month approval is accepted');
select is(public.publisher_claim_target(pg_temp.pat(), pg_temp.id('c_new')) ->> 'status', 'approved',
  'the claim target reports the gate status');
-- Rows written around the RPC: an approval without a run, and one older than 24 months.
select pg_temp.keep('c_legacy', pg_temp.claim('Synthetic claim approved before phase 3.', pg_temp.id('s1')));
select pg_temp.keep('c_old', pg_temp.claim('Synthetic claim approved long ago.', pg_temp.id('s1')));
select pg_temp.reset_role();
insert into public.claim_reviews (claim_id, decision, expires_at, receipt, reviewer)
values (pg_temp.id('c_legacy'), 'approved', now() + interval '1 year', pg_temp.claim_receipt(), '00000000-0000-0000-0000-0000000000c1');
insert into public.claim_reviews (claim_id, decision, expires_at, receipt, reviewer, created_at, run_id, claim_hash)
select pg_temp.id('c_old'), 'approved', now() + interval '5 years', pg_temp.claim_receipt(), '00000000-0000-0000-0000-0000000000c1',
  now() - interval '25 months', (select id from public.review_runs limit 1), private.claim_hash(pg_temp.id('c_old'));
select pg_temp.as_service();
select is(public.publisher_claim_target(pg_temp.pat(), pg_temp.id('c_legacy')) ->> 'status', 'unreceipted',
  'an approval without a model run cannot be cited in a new publish');
select is(public.publisher_claim_target(pg_temp.pat(), pg_temp.id('c_old')) ->> 'status', 'expired',
  'an approval recorded 25 months ago is expired whatever expiry it names');
select pg_temp.save(pg_temp.course('74000000-0000-4000-8000-000000000000', 'base', jsonb_build_array(
  pg_temp.lesson('74000000-0000-4000-8000-000000000011', 'legacy', jsonb_build_array(pg_temp.sci('Old fact.', array[pg_temp.id('c_legacy')]))))));
select pg_temp.review_all('74000000-0000-4000-8000-000000000000', 'legacy-claim');
select throws_ok($$select pg_temp.publish('74000000-0000-4000-8000-000000000000')$$, 'P0001',
  format('publish gate: lesson 74000000-0000-4000-8000-000000000011 cites claim %s, which is unreceipted', pg_temp.id('c_legacy')),
  'the gate refuses a claim approved without a model receipt');

-- Published, then withdrawn, expired or retracted: the learner sees it, new publishes stop.
select pg_temp.keep('s_ret', pg_temp.source('10.5555/p3.ret'));
select pg_temp.keep('c_w', pg_temp.claim('Synthetic claim later withdrawn.', pg_temp.id('s1')));
select pg_temp.keep('c_e', pg_temp.claim('Synthetic claim that will expire.', pg_temp.id('s1')));
select pg_temp.keep('c_r', pg_temp.claim('Synthetic claim from a paper later retracted.', pg_temp.id('s_ret')));
select pg_temp.approve(pg_temp.id(c)) from unnest(array['c_w', 'c_e', 'c_r']) c;
create function pg_temp.i_tree(title text) returns jsonb language sql as $$
  select pg_temp.course('75000000-0000-4000-8000-000000000000', 'base', jsonb_build_array(
    pg_temp.lesson('75000000-0000-4000-8000-000000000011', 'integrity', jsonb_build_array(
      pg_temp.sci('Withdrawn fact.', array[pg_temp.id('c_w')]), pg_temp.sci('Expiring fact.', array[pg_temp.id('c_e')]),
      pg_temp.sci('Retracted fact.', array[pg_temp.id('c_r')]), pg_temp.sci('Sound fact.', array[pg_temp.id('c_ok')])))), title)
$$;
select pg_temp.save(pg_temp.i_tree('Integrity'));
select pg_temp.review_all('75000000-0000-4000-8000-000000000000', 'integrity');
select pg_temp.keep('i_v1', pg_temp.publish('75000000-0000-4000-8000-000000000000'));
create function pg_temp.states() returns jsonb language sql as $$
  select jsonb_object_agg(claim_id, state) from public.version_integrity(pg_temp.id('i_v1'))
$$;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select is(pg_temp.states(), jsonb_build_object(pg_temp.id('c_w'), 'current', pg_temp.id('c_e'), 'current',
  pg_temp.id('c_r'), 'current', pg_temp.id('c_ok'), 'current'), 'a learner sees every cited claim as current after publishing');
select pg_temp.as_service();
select public.publisher_review_claim(pg_temp.pat(), pg_temp.id('c_w'), jsonb_build_object('decision', 'rejected',
  'expectedHash', pg_temp.claim_hash(pg_temp.id('c_w')), 'receipt', pg_temp.claim_receipt() || '{"faithfulness": "unfaithful"}'));
select public.publisher_record_retraction(pg_temp.pat(), pg_temp.id('s_ret'),
  '{"origin": "crossref", "reference": "10.5555/retraction.p3", "detectedAt": "2026-10-10T00:00:00Z"}');
select pg_temp.reset_role();
insert into public.claim_reviews (claim_id, decision, expires_at, receipt, reviewer, run_id, claim_hash)
select pg_temp.id('c_e'), 'approved', now() - interval '1 day', pg_temp.claim_receipt(), '00000000-0000-0000-0000-0000000000c1',
  (select id from public.review_runs limit 1), private.claim_hash(pg_temp.id('c_e'));
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select is(pg_temp.states(), jsonb_build_object(pg_temp.id('c_w'), 'withdrawn', pg_temp.id('c_e'), 'recheck_due',
  pg_temp.id('c_r'), 'retracted', pg_temp.id('c_ok'), 'current'),
  'after publication a learner sees withdrawn, recheck_due and retracted claims, with no receipt detail');
select is((select array_agg(column_name::text order by ordinal_position) from information_schema.columns
  where table_schema = 'public' and table_name = 'version_integrity'), null,
  'version_integrity is a function, not a readable table');
select pg_temp.reset_role();
select is((select array_agg(decision order by seq) from public.claim_reviews where claim_id = pg_temp.id('c_w')),
  array['approved', 'rejected'], 'withdrawing a claim keeps its history');
select pg_temp.as_service();
select pg_temp.save(pg_temp.i_tree('Integrity, revised'));
select throws_ok($$select pg_temp.publish('75000000-0000-4000-8000-000000000000')$$, 'P0001',
  format('publish gate: lesson 75000000-0000-4000-8000-000000000011 cites claim %s, which is rejected', pg_temp.id('c_w')),
  'a claim rejected after approval blocks a new publish');
select is(public.publisher_claim_target(pg_temp.pat(), pg_temp.id('c_e')) ->> 'status', 'expired',
  'an expired claim blocks a new publish');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select is((select count(*) from public.version_integrity(pg_temp.id('i_v1'))), 4::bigint,
  'any signed-in user can read the integrity of a global version');
select throws_ok(format('select * from public.version_integrity(%L)', pg_temp.id('m_v1')), 'P0002', 'no such version',
  'another gym cannot read the integrity of gym A''s version');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a4');
select is((select count(*) from public.version_integrity(pg_temp.id('m_v1'))), 0::bigint,
  'a member reads her gym''s method version (no claims)');
select pg_temp.reset_role();
set local role anon;
select throws_ok(format('select * from public.version_integrity(%L)', pg_temp.id('i_v1')), '42501', null,
  'anon cannot read version integrity');
reset role;

-- 7. Videos are never claim sources --------------------------------------------------------
select pg_temp.as_service();
select throws_ok($$select public.publisher_add_source(pg_temp.pat(), '{"kind": "nomenclature", "title": "x",
  "url": "https://www.youtube.com/watch?v=AbCdEfGhIj0", "license": "x"}')$$,
  '22023', 'invalid source.url: a video is never a claim source; use the practice-media registry', 'a YouTube URL is never a source');
select throws_ok($$select public.publisher_add_source(pg_temp.pat(), '{"kind": "nomenclature", "title": "x",
  "url": "https://youtu.be/AbCdEfGhIj0", "license": "x"}')$$,
  '22023', 'invalid source.url: a video is never a claim source; use the practice-media registry', 'a youtu.be link is never a source');
select pg_temp.reset_role();
insert into public.sources (id, kind, title, url, license, created_by)
values ('76000000-0000-4000-8000-0000000000aa', 'nomenclature', 'Smuggled video', 'https://m.youtube.com/watch?v=AbCdEfGhIj0',
  'x', '00000000-0000-0000-0000-0000000000c1');
select pg_temp.as_service();
select throws_ok($$select pg_temp.claim('Claim backed by a video.', '76000000-0000-4000-8000-0000000000aa')$$,
  '22023', 'invalid claim.sourceIds: a video is never a claim source; use the practice-media registry',
  'claim creation refuses a video source written around the source RPC');
select pg_temp.reset_role();
insert into public.claims (id, statement, evidence_level, population, created_by)
values ('76000000-0000-4000-8000-0000000000cc', 'Smuggled video claim.', 'x', 'x', '00000000-0000-0000-0000-0000000000c1');
insert into public.claim_sources values ('76000000-0000-4000-8000-0000000000cc', '76000000-0000-4000-8000-0000000000aa');
select pg_temp.as_service();
select is(public.publisher_claim_target(pg_temp.pat(), '76000000-0000-4000-8000-0000000000cc') ->> 'status', 'video-backed',
  'the gate refuses a video-backed claim even with rows written around the RPCs');
select throws_ok($$select public.publisher_save_course_draft(pg_temp.pat(), pg_temp.course('77000000-0000-4000-8000-000000000000', 'base',
  jsonb_build_array(pg_temp.lesson('77000000-0000-4000-8000-000000000011', 'img', jsonb_build_array(jsonb_build_object('kind', 'image',
    'content', jsonb_build_object('kind', 'video', 'src', 'https://www.youtube-nocookie.com/embed/AbCdEfGhIj0', 'alt', 'x',
      'caption', '', 'provenanceId', 'p1')))))))$$,
  '22023', 'invalid course.parts[0].lessons[0].blocks[0].content.src: YouTube media must use a video block from the practice-media registry',
  'a YouTube URL cannot sneak in as plain media');

-- 8. The practice-media registry ---------------------------------------------------------------
select pg_temp.keep('mv', public.publisher_admit_media(pg_temp.pat(), jsonb_build_object('provider', 'youtube',
  'videoId', 'AbCdEfGhIj0', 'startSeconds', 30, 'endSeconds', 95, 'rationale', 'Shows scapular upward rotation.',
  'embedCheckedAt', pg_temp.iso(now()))));
select pg_temp.keep('mv_old', public.publisher_admit_media(pg_temp.pat(), jsonb_build_object('provider', 'youtube',
  'videoId', 'AbCdEfGhIj0', 'startSeconds', 100, 'endSeconds', 120, 'rationale', 'An old embed check.',
  'embedCheckedAt', pg_temp.iso(now() - interval '100 days'))));
select throws_ok($$select public.publisher_admit_media(pg_temp.pat(), '{"provider": "youtube", "videoId": "short",
  "startSeconds": 0, "endSeconds": 5, "rationale": "x", "embedCheckedAt": "2026-10-01T00:00:00Z"}')$$,
  '22023', 'invalid media.videoId: must be 11 to 11 characters', 'a video id is 11 characters');
select throws_ok($$select public.publisher_admit_media(pg_temp.pat(), '{"provider": "vimeo", "videoId": "AbCdEfGhIj0",
  "startSeconds": 0, "endSeconds": 5, "rationale": "x", "embedCheckedAt": "2026-10-01T00:00:00Z"}')$$,
  '22023', 'invalid media.provider: must be one of youtube', 'only YouTube is admitted');
select throws_ok($$select public.publisher_admit_media(pg_temp.pat(), '{"provider": "youtube", "videoId": "AbCdEfGhIj0",
  "startSeconds": 50, "endSeconds": 50, "rationale": "x", "embedCheckedAt": "2026-10-01T00:00:00Z"}')$$,
  '22023', 'invalid media.endSeconds: must be after startSeconds', 'a segment ends after it starts');
create function pg_temp.v_tree(video jsonb, cue text) returns jsonb language sql as $$
  select pg_temp.course('78000000-0000-4000-8000-000000000000', 'base', jsonb_build_array(
    pg_temp.lesson('78000000-0000-4000-8000-000000000011', 'video', jsonb_build_array(pg_temp.prac(cue), video))))
$$;
select throws_ok($$select pg_temp.save(pg_temp.v_tree(pg_temp.video(pg_temp.id('mv'), 30, 96, 'Shows scapular upward rotation.'), 'Watch.'))$$,
  '22023', format('invalid course: video block %s does not match its practice-media registry entry', pg_temp.id('mv')),
  'a video block must match its registry segment exactly');
select throws_ok($$select pg_temp.save(pg_temp.v_tree(pg_temp.video(pg_temp.id('mv'), 30, 95, 'A different reason.'), 'Watch.'))$$,
  '22023', format('invalid course: video block %s does not match its practice-media registry entry', pg_temp.id('mv')),
  'a video block must carry the registry rationale');
select throws_ok($$select pg_temp.save(pg_temp.v_tree(pg_temp.video(pg_temp.id('mv'), 30, 95, 'Shows scapular upward rotation.')
  || '{"support": "science", "claimIds": []}', 'Watch.'))$$,
  '22023', 'invalid course.parts[0].lessons[0].blocks[1]: unknown key support', 'a video block cannot carry support or claims');
select lives_ok($$select pg_temp.save(pg_temp.v_tree(pg_temp.video(pg_temp.id('mv'), 30, 95, 'Shows scapular upward rotation.'), 'Watch.'))$$,
  'a video block matching the registry saves');
select pg_temp.review_all('78000000-0000-4000-8000-000000000000', 'video');
select throws_ok($$select pg_temp.publish('78000000-0000-4000-8000-000000000000')$$, 'P0001',
  'publish gate: lesson 78000000-0000-4000-8000-000000000011 has a video whose registry entry is segment-unchecked',
  'a clip without a segment review cannot publish');
select throws_ok(format($$select public.publisher_record_media_check(pg_temp.pat(), %L,
  jsonb_build_object('kind', 'segment', 'outcome', 'pass', 'checkedAt', %L))$$, pg_temp.id('mv'), pg_temp.iso(now())),
  '22023', 'invalid check.run: a passing segment review needs a model run receipt', 'a passing segment review needs a model run');
select public.publisher_record_media_check(pg_temp.pat(), pg_temp.id('mv'),
  jsonb_build_object('kind', 'segment', 'outcome', 'pass', 'checkedAt', pg_temp.iso(now()), 'run', pg_temp.run('segment')));
select lives_ok($$select pg_temp.keep('v_v1', pg_temp.publish('78000000-0000-4000-8000-000000000000'))$$,
  'a reviewed, embeddable clip publishes inside a reviewed lesson');
select pg_temp.reset_role();
select is((select snapshot #> '{parts,0,lessons,0,blocks,1}' from public.curriculum_versions where id = pg_temp.id('v_v1')),
  pg_temp.video(pg_temp.id('mv'), 30, 95, 'Shows scapular upward rotation.'),
  'the published lesson freezes the video id, segment and rationale, with no support label');
select is((select count(*) from public.version_claims where version_id = pg_temp.id('v_v1')), 0::bigint,
  'a video adds no claim to the version');
select throws_ok(format($$update public.practice_media set end_seconds = 200 where id = %L$$, pg_temp.id('mv')),
  'P0001', 'practice_media rows are immutable', 'registry segments are frozen');
select throws_ok($$update public.lesson_blocks set content = jsonb_set(content, '{startSeconds}', '0')
  where lesson_id = '78000000-0000-4000-8000-000000000011' and kind = 'video'$$, '22023',
  format('invalid course: video block %s does not match its practice-media registry entry', pg_temp.id('mv')),
  'even the table owner cannot point a video block at another segment');
-- The lesson hash seals the reference: another clip means another lesson review.
select pg_temp.as_service();
select public.publisher_record_media_check(pg_temp.pat(), pg_temp.id('mv_old'),
  jsonb_build_object('kind', 'segment', 'outcome', 'pass', 'checkedAt', pg_temp.iso(now()), 'run', pg_temp.run('segment-old')));
select pg_temp.save(pg_temp.v_tree(pg_temp.video(pg_temp.id('mv_old'), 100, 120, 'An old embed check.'), 'Watch.'));
select throws_ok($$select pg_temp.publish('78000000-0000-4000-8000-000000000000')$$, 'P0001',
  'publish gate: lesson 78000000-0000-4000-8000-000000000011 has a video whose registry entry is embed-unchecked',
  'a clip whose embed check is older than 90 days cannot publish');
select public.publisher_record_media_check(pg_temp.pat(), pg_temp.id('mv_old'),
  jsonb_build_object('kind', 'embed', 'outcome', 'pass', 'checkedAt', pg_temp.iso(now())));
select throws_ok($$select pg_temp.publish('78000000-0000-4000-8000-000000000000')$$, 'P0001',
  'publish gate: lesson 78000000-0000-4000-8000-000000000011 has no clean lesson review for its exact content',
  'swapping the clip invalidates the lesson receipt');
select public.publisher_record_media_check(pg_temp.pat(), pg_temp.id('mv_old'),
  jsonb_build_object('kind', 'embed', 'outcome', 'fail', 'checkedAt', pg_temp.iso(now()), 'notes', 'Embedding disabled.'));
select pg_temp.review_all('78000000-0000-4000-8000-000000000000', 'video-2');
select throws_ok($$select pg_temp.publish('78000000-0000-4000-8000-000000000000')$$, 'P0001',
  'publish gate: lesson 78000000-0000-4000-8000-000000000011 has a video whose registry entry is embed-unchecked',
  'a failed embed recheck stops new publishes');
-- Disable at once, without a new version; metadata only while fresh; retire deletes it.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select results_eq(format('select media_id, state, title from public.version_media(%L)', pg_temp.id('v_v1')),
  format($$values (%L::uuid, 'playable'::text, null::text)$$, pg_temp.id('mv')), 'a learner sees the clip as playable');
select pg_temp.as_service();
select public.publisher_refresh_media_metadata(pg_temp.pat(), pg_temp.id('mv'), jsonb_build_object('title', 'Synthetic clip',
  'channel', 'Synthetic channel', 'available', true, 'fetchedAt', pg_temp.iso(now())));
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select results_eq(format('select state, title, channel, available from public.version_media(%L)', pg_temp.id('v_v1')),
  $$values ('playable'::text, 'Synthetic clip'::text, 'Synthetic channel'::text, true)$$, 'fresh provider metadata is served');
select pg_temp.as_service();
select public.publisher_refresh_media_metadata(pg_temp.pat(), pg_temp.id('mv'), jsonb_build_object('title', 'Synthetic clip',
  'channel', 'Synthetic channel', 'available', true, 'fetchedAt', pg_temp.iso(now() - interval '31 days')));
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select results_eq(format('select state, title from public.version_media(%L)', pg_temp.id('v_v1')),
  $$values ('playable'::text, null::text)$$, 'metadata older than 30 days is not served');
-- Playback follows the latest checks, not only the status (Sol S01).
select pg_temp.as_service();
select public.publisher_record_media_check(pg_temp.pat(), pg_temp.id('mv'),
  jsonb_build_object('kind', 'segment', 'outcome', 'fail', 'checkedAt', pg_temp.iso(now()), 'notes', 'Unsafe cue in the segment.'));
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select results_eq(format('select state from public.version_media(%L)', pg_temp.id('v_v1')), $$values ('disabled'::text)$$,
  'a failed segment review stops playback in a published version at once');
select pg_temp.as_service();
select public.publisher_record_media_check(pg_temp.pat(), pg_temp.id('mv'),
  jsonb_build_object('kind', 'segment', 'outcome', 'pass', 'checkedAt', pg_temp.iso(now() - interval '91 days'), 'run', pg_temp.run('segment-old-pass')));
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select results_eq(format('select state from public.version_media(%L)', pg_temp.id('v_v1')), $$values ('disabled'::text)$$,
  'a segment review older than 90 days stops playback');
select pg_temp.as_service();
select public.publisher_record_media_check(pg_temp.pat(), pg_temp.id('mv'),
  jsonb_build_object('kind', 'segment', 'outcome', 'pass', 'checkedAt', pg_temp.iso(now()), 'run', pg_temp.run('segment-recheck')));
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select results_eq(format('select state from public.version_media(%L)', pg_temp.id('v_v1')), $$values ('playable'::text)$$,
  'a fresh passing segment review restores playback');
select pg_temp.as_service();
select public.publisher_set_media_status(pg_temp.pat(), pg_temp.id('mv'), '{"status": "disabled", "reason": "Synthetic takedown."}');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select results_eq(format('select state from public.version_media(%L)', pg_temp.id('v_v1')), $$values ('disabled'::text)$$,
  'disabling a clip takes effect at once in a published version');
select pg_temp.reset_role();
select is((select count(*) from public.curriculum_versions where course_id = '78000000-0000-4000-8000-000000000000'), 1::bigint,
  'disabling a clip makes no new content version');
select pg_temp.as_service();
select public.publisher_set_media_status(pg_temp.pat(), pg_temp.id('mv'), '{"status": "retired", "reason": "Leaves the registry."}');
select is((select count(*) from public.practice_media_metadata where media_id = pg_temp.id('mv')), 0::bigint,
  'retiring a clip deletes its provider metadata');
select throws_ok(format($$select public.publisher_refresh_media_metadata(pg_temp.pat(), %L, '{"title": "x", "channel": "x",
  "available": true, "fetchedAt": "2026-10-01T00:00:00Z"}')$$, pg_temp.id('mv')), 'P0001',
  format('media %s is retired', pg_temp.id('mv')), 'a retired clip gets no new metadata');
select throws_ok(format($$select public.publisher_set_media_status(pg_temp.pat(), %L, '{"status": "active", "reason": "x"}')$$,
  pg_temp.id('mv')), 'P0001', format('media %s is retired', pg_temp.id('mv')), 'retirement is final');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c2');
select throws_ok(format($$select public.publisher_set_media_status(pg_temp.pat(), %L, '{"status": "active", "reason": "x"}')$$,
  pg_temp.id('mv_old')), '42501', null, 'a signed-in user cannot change a clip''s status');
select throws_ok($$select * from public.practice_media$$, '42501', null, 'the registry is not client-readable');

-- 9. Graded quizzes ---------------------------------------------------------------------------
select pg_temp.as_service();
create function pg_temp.q_tree(last_prompt text, title text) returns jsonb language sql as $$
  select pg_temp.course('79000000-0000-4000-8000-000000000000', 'base', jsonb_build_array(
    pg_temp.lesson('79000000-0000-4000-8000-000000000011', 'quiz-one', jsonb_build_array(
      pg_temp.sci('The cuff has four muscles.', array[pg_temp.id('c_ok')]),
      pg_temp.quiz('Q one?', 'science', array[pg_temp.id('c_ok')]), pg_temp.quiz('Q two?', 'science', array[pg_temp.id('c_ok')]))),
    pg_temp.lesson('79000000-0000-4000-8000-000000000012', 'quiz-two', jsonb_build_array(
      pg_temp.quiz('Q three?', 'science', array[pg_temp.id('c_ok')]), pg_temp.quiz('Q four?', 'science', array[pg_temp.id('c_ok')]),
      pg_temp.quiz(last_prompt, 'science', array[pg_temp.id('c_ok')])))), title)
$$;
select pg_temp.save(pg_temp.q_tree('Q five?', 'Quiz course'));
select pg_temp.review_all('79000000-0000-4000-8000-000000000000', 'quiz');
select pg_temp.keep('q_v1', pg_temp.publish('79000000-0000-4000-8000-000000000000'));
select pg_temp.reset_role();
select is((select jsonb_agg(q ->> 'questionId') from jsonb_array_elements(private.graded_questions(
  (select snapshot from public.curriculum_versions where id = pg_temp.id('q_v1')))) q),
  '["79000000-0000-4000-8000-000000000011:q1", "79000000-0000-4000-8000-000000000011:q2", "79000000-0000-4000-8000-000000000012:q1", "79000000-0000-4000-8000-000000000012:q2", "79000000-0000-4000-8000-000000000012:q3"]'::jsonb,
  'graded questions have stable ids in course order');
select ok((select rules = 'phase3' and question_set_hash = private.sha256(private.graded_questions(snapshot))
  from public.curriculum_versions where id = pg_temp.id('q_v1')), 'a phase-3 version records its question-set hash');
create function pg_temp.answers(picks integer[]) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('questionId', q, 'answerIndex', picks[i]) order by i)
  from unnest(array['79000000-0000-4000-8000-000000000011:q1', '79000000-0000-4000-8000-000000000011:q2',
    '79000000-0000-4000-8000-000000000012:q1', '79000000-0000-4000-8000-000000000012:q2',
    '79000000-0000-4000-8000-000000000012:q3']) with ordinality as t (q, i)
$$;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.keep('tess_q1', public.assign_version('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', pg_temp.id('q_v1'), '00000000-0000-0000-0000-0000000000a3'));
select pg_temp.keep('tom_q1', public.assign_version('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', pg_temp.id('q_v1'), '00000000-0000-0000-0000-0000000000a4'));
create function pg_temp.submit(assignment uuid, attempt_key text, answers jsonb) returns setof record language sql as $$
  select attempt_id, correct, total, passed from public.submit_quiz_attempt(assignment, attempt_key::uuid, answers)
$$;
create function pg_temp.status(assignment uuid) returns jsonb language sql as $$
  select to_jsonb(s) from public.module_status(assignment) s
$$;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select throws_ok($$select * from public.submit_quiz_attempt(pg_temp.id('tess_q1'), gen_random_uuid(),
  pg_temp.answers(array[1, 1, 1, 1, null]) - 4)$$, '22023', 'invalid answers: every graded question needs exactly one answer',
  'an incomplete attempt is refused');
select throws_ok($$select * from public.submit_quiz_attempt(pg_temp.id('tess_q1'), gen_random_uuid(),
  (pg_temp.answers(array[1, 1, 1, 1, 1]) - 4) || jsonb_build_array(pg_temp.answers(array[1, 1, 1, 1, 1]) -> 0))$$,
  '22023', 'invalid answers[4].questionId: is answered twice', 'a question answered twice is refused');
select throws_ok($$select * from public.submit_quiz_attempt(pg_temp.id('tess_q1'), gen_random_uuid(),
  jsonb_set(pg_temp.answers(array[1, 1, 1, 1, 1]), '{4,questionId}', '"79000000-0000-4000-8000-000000000012:q9"'))$$,
  '22023', 'invalid answers[4].questionId: is not a graded question in this version', 'an unknown question is refused');
select throws_ok($$select * from public.submit_quiz_attempt(pg_temp.id('tess_q1'), gen_random_uuid(),
  jsonb_set(pg_temp.answers(array[1, 1, 1, 1, 1]), '{0,passed}', 'true'))$$,
  '22023', 'invalid answers[0]: unknown key passed', 'a client cannot send passed');
select throws_ok($$select * from public.submit_quiz_attempt(pg_temp.id('tess_q1'), gen_random_uuid(),
  jsonb_build_object('answers', pg_temp.answers(array[1, 1, 1, 1, 1]), 'passed', true))$$,
  '22023', 'invalid answers: must be an array', 'a client cannot wrap answers with a verdict');
select throws_ok($$select * from public.submit_quiz_attempt(pg_temp.id('tess_q1'), gen_random_uuid(), pg_temp.answers(array[1, 1, 1, 1, 2]))$$,
  '22023', 'invalid answers[4].answerIndex: must be an integer from 0 to 1', 'an answer outside the options is refused');
select throws_ok($$select * from public.submit_quiz_attempt(pg_temp.id('tom_q1'), gen_random_uuid(), pg_temp.answers(array[1, 1, 1, 1, 1]))$$,
  'P0002', 'no such assignment', 'a learner cannot submit on another learner''s assignment');
select results_eq($$select correct, total, passed from pg_temp.submit(pg_temp.id('tess_q1'), '00000000-0000-4000-8000-0000000000f1',
  pg_temp.answers(array[1, 1, 1, 0, 0])) as t (attempt_id uuid, correct integer, total integer, passed boolean)$$,
  $$values (3, 5, false)$$, '60% fails');
select results_eq($$select correct, total, passed from pg_temp.submit(pg_temp.id('tess_q1'), '00000000-0000-4000-8000-0000000000f2',
  pg_temp.answers(array[1, 1, 1, 1, 0])) as t (attempt_id uuid, correct integer, total integer, passed boolean)$$,
  $$values (4, 5, true)$$, '80% passes (the boundary)');
select is((select attempt_id from pg_temp.submit(pg_temp.id('tess_q1'), '00000000-0000-4000-8000-0000000000f2',
  pg_temp.answers(array[1, 1, 1, 1, 0])) as t (attempt_id uuid, correct integer, total integer, passed boolean)),
  (select id from public.quiz_attempts where attempt_key = '00000000-0000-4000-8000-0000000000f2'),
  'a double submit with the same key returns the same attempt');
select throws_ok($$select * from public.submit_quiz_attempt(pg_temp.id('tess_q1'), '00000000-0000-4000-8000-0000000000f2',
  pg_temp.answers(array[1, 1, 1, 1, 1]))$$, '22023', 'invalid attemptKey: was already used for different answers',
  'an attempt key cannot be reused for other answers');
select pg_temp.submit(pg_temp.id('tess_q1'), '00000000-0000-4000-8000-0000000000f3', pg_temp.answers(array[0, 0, 0, 0, 0]));
select is((select count(*) from public.quiz_attempts), 3::bigint, 'retries are unlimited and the learner sees her own attempts');
select is(pg_temp.status(pg_temp.id('tess_q1')) - 'assignment_id' - 'version_id' - 'best_attempt_id' - 'quiz_credit_attempt_id',
  '{"lessons_total": 2, "lessons_completed": 0, "quiz_required": true, "questions_total": 5, "best_correct": 4, "best_total": 5,
    "quiz_passed": true, "quiz_carried": false, "complete": false}'::jsonb,
  'the best attempt counts after a worse retry, and lessons are still open');
select public.complete_lesson(pg_temp.id('tess_q1'), l) from (values ('79000000-0000-4000-8000-000000000011'::uuid),
  ('79000000-0000-4000-8000-000000000012'::uuid)) v (l);
select is(pg_temp.status(pg_temp.id('tess_q1')) ->> 'complete', 'true', 'every lesson plus a passing attempt completes the module');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a4');
select public.complete_lesson(pg_temp.id('tom_q1'), l) from (values ('79000000-0000-4000-8000-000000000011'::uuid),
  ('79000000-0000-4000-8000-000000000012'::uuid)) v (l);
select pg_temp.submit(pg_temp.id('tom_q1'), '00000000-0000-4000-8000-0000000000f4', pg_temp.answers(array[1, 1, 1, 0, 0]));
select is(pg_temp.status(pg_temp.id('tom_q1')) ->> 'complete', 'false', 'all lessons with only a failed attempt is not complete');
select is((select count(*) from public.quiz_attempts), 1::bigint, 'Tom sees only his own attempt');
select throws_ok($$select pg_temp.status(pg_temp.id('tess_q1'))$$, 'P0002', 'no such assignment',
  'a trainer cannot read another trainer''s module status');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select is(pg_temp.status(pg_temp.id('tess_q1')) ->> 'complete', 'true', 'the gym owner can read a trainer''s module status');
select is((select count(*) from public.quiz_attempts), 4::bigint, 'the gym owner sees her gym''s attempts');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select throws_ok($$select pg_temp.status(pg_temp.id('tess_q1'))$$, 'P0002', 'no such assignment',
  'another gym cannot read gym A''s module status');
select is((select count(*) from public.quiz_attempts), 0::bigint, 'another gym sees no gym A attempts');
-- Scores never come from the caller.
select pg_temp.reset_role();
insert into public.quiz_attempts (org_id, user_id, version_id, attempt_key, question_set_hash, answers, correct, total)
select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-0000000000a4', pg_temp.id('q_v1'),
  '00000000-0000-4000-8000-0000000000f5', question_set_hash, pg_temp.answers(array[0, 0, 0, 0, 0]), 5, 5
from public.curriculum_versions where id = pg_temp.id('q_v1');
select results_eq($$select correct, passed from public.quiz_attempts where attempt_key = '00000000-0000-4000-8000-0000000000f5'$$,
  $$values (0, false)$$, 'even the table owner cannot store a forged score: the database rescores the answers');
select throws_ok($$insert into public.quiz_attempts (org_id, user_id, version_id, attempt_key, question_set_hash, answers, correct, total)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-0000000000a4',
    current_setting('test.q_v1')::uuid, gen_random_uuid(), repeat('0', 64), '[]', 0, 1)$$,
  'P0001', 'the attempt does not match the version''s question set', 'an attempt must use its version''s question set');
select throws_ok($$update public.quiz_attempts set correct = 5$$, 'P0001', 'quiz_attempts rows are immutable', 'attempts are immutable');
select pg_temp.as_service();
select throws_ok($$insert into public.quiz_attempts (org_id, user_id, version_id, attempt_key, question_set_hash, answers, correct, total)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-0000000000a4',
    current_setting('test.q_v1')::uuid, gen_random_uuid(), repeat('0', 64), '[]', 5, 5)$$,
  '42501', null, 'the service role cannot write attempts');
select throws_ok($$select * from public.submit_quiz_attempt(current_setting('test.tess_q1')::uuid, gen_random_uuid(), '[]')$$,
  '42501', null, 'the service role cannot submit attempts');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select throws_ok($$insert into public.quiz_attempts (org_id, user_id, version_id, attempt_key, question_set_hash, answers, correct, total)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', auth.uid(), current_setting('test.q_v1')::uuid, gen_random_uuid(),
    repeat('0', 64), '[]', 5, 5)$$, '42501', null, 'a learner cannot insert an attempt directly');

-- Across versions and gyms: credit carries only on an unchanged question set, in the same gym.
select pg_temp.as_service();
select pg_temp.save(pg_temp.q_tree('Q five?', 'Quiz course, retitled'));
select pg_temp.review_shell('79000000-0000-4000-8000-000000000000', 'quiz-2');
select pg_temp.keep('q_v2', pg_temp.publish('79000000-0000-4000-8000-000000000000'));
select pg_temp.save(pg_temp.q_tree('Q five, reworded?', 'Quiz course, retitled'));
select pg_temp.review_all('79000000-0000-4000-8000-000000000000', 'quiz-3');
select pg_temp.keep('q_v3', pg_temp.publish('79000000-0000-4000-8000-000000000000'));
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.keep('tess_q2', public.assign_version('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', pg_temp.id('q_v2'), '00000000-0000-0000-0000-0000000000a3'));
select pg_temp.keep('tess_q3', public.assign_version('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', pg_temp.id('q_v3'), '00000000-0000-0000-0000-0000000000a3'));
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select pg_temp.keep('tess_b1', public.assign_version('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', pg_temp.id('q_v1'), '00000000-0000-0000-0000-0000000000a3'));
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select is(pg_temp.status(pg_temp.id('tess_q2')) - 'assignment_id' - 'version_id' - 'best_attempt_id' - 'quiz_credit_attempt_id',
  '{"lessons_total": 2, "lessons_completed": 2, "quiz_required": true, "questions_total": 5, "best_correct": null,
    "best_total": null, "quiz_passed": true, "quiz_carried": true, "complete": true}'::jsonb,
  'an unchanged question set carries the pass (and the lessons) to the new version');
select is(pg_temp.status(pg_temp.id('tess_q2')) ->> 'quiz_credit_attempt_id',
  (select id::text from public.quiz_attempts where attempt_key = '00000000-0000-4000-8000-0000000000f2'),
  'the carried pass points at the original passing attempt');
select is(pg_temp.status(pg_temp.id('tess_q3')) - 'assignment_id' - 'version_id' - 'best_attempt_id' - 'quiz_credit_attempt_id',
  '{"lessons_total": 2, "lessons_completed": 1, "quiz_required": true, "questions_total": 5, "best_correct": null,
    "best_total": null, "quiz_passed": false, "quiz_carried": false, "complete": false}'::jsonb,
  'a changed question set needs a new pass, and the changed lesson reopens');
select is(pg_temp.status(pg_temp.id('tess_b1')) ->> 'quiz_passed', 'false', 'a pass in gym A does not count in gym B');
select throws_ok($$select * from public.submit_quiz_attempt(pg_temp.id('tess_b1'), gen_random_uuid(),
  jsonb_set(pg_temp.answers(array[1, 1, 1, 1, 1]), '{1,questionId}', '"79000000-0000-4000-8000-000000000011:q1"'))$$,
  '22023', 'invalid answers[1].questionId: is answered twice', 'gym B grading uses the same validation');

-- Versions published before phase 3 keep the lessons-only rule.
select pg_temp.reset_role();
insert into public.curriculum_versions (id, course_id, org_id, layer, version_number, snapshot, content_hash, published_by, rules)
select '79000000-0000-4000-8000-0000000000e1', course_id, null, layer, 50, snapshot, content_hash, published_by, 'phase2'
from public.curriculum_versions where id = pg_temp.id('q_v1');
insert into public.version_lessons (version_id, lesson_id, org_id, ordinal, content_hash)
select '79000000-0000-4000-8000-0000000000e1', lesson_id, null, ordinal, content_hash from public.version_lessons
where version_id = pg_temp.id('q_v1');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.keep('tom_legacy', public.assign_version('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '79000000-0000-4000-8000-0000000000e1',
  '00000000-0000-0000-0000-0000000000a4'));
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a4');
select is(pg_temp.status(pg_temp.id('tom_legacy')) - 'assignment_id' - 'version_id' - 'best_attempt_id' - 'quiz_credit_attempt_id',
  '{"lessons_total": 2, "lessons_completed": 2, "quiz_required": false, "questions_total": 0, "best_correct": null,
    "best_total": null, "quiz_passed": false, "quiz_carried": false, "complete": true}'::jsonb,
  'a pre-phase-3 version completes on lessons alone');
select throws_ok($$select * from public.submit_quiz_attempt(pg_temp.id('tom_legacy'), gen_random_uuid(), pg_temp.answers(array[1, 1, 1, 1, 1]))$$,
  'P0001', 'this version has no graded quiz', 'a pre-phase-3 version takes no graded attempts');
-- A gym method version: practice quizzes are ungraded discussion.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.keep('tom_m', public.assign_version('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', pg_temp.id('m_v1'), '00000000-0000-0000-0000-0000000000a4'));
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a4');
select public.complete_lesson(pg_temp.id('tom_m'), '73000000-0000-4000-8000-000000000011');
select is(pg_temp.status(pg_temp.id('tom_m')) ->> 'complete', 'true', 'a method course completes on lessons alone');
select pg_temp.reset_role();
set local role anon;
select throws_ok(format('select * from public.module_status(%L)', pg_temp.id('tess_q1')), '42501', null, 'anon cannot read module status');
reset role;

-- 9b. Sol R1: question limit, practice quizzes, old runs, tenant idempotence ----------------------------
select pg_temp.as_service();
-- A graded set the learner can always submit: 1000 publishes and is submittable; 1001 is refused at publish.
create function pg_temp.big_tree(n_lessons integer, extra boolean) returns jsonb language sql as $$
  select pg_temp.course('7a000000-0000-4000-8000-000000000000', 'base',
    (select jsonb_agg(pg_temp.lesson(format('7a000000-0000-4000-8000-%s', lpad(i::text, 12, '0')), 'big-' || i,
       (select jsonb_agg(pg_temp.quiz('Same synthetic question?', 'science', array[pg_temp.id('c_ok')])) from generate_series(1, 200)))
       order by i) from generate_series(1, n_lessons) i)
    || case when extra then jsonb_build_array(pg_temp.lesson('7a000000-0000-4000-8000-000000000999', 'big-extra',
         jsonb_build_array(pg_temp.quiz('One more?', 'science', array[pg_temp.id('c_ok')])))) else '[]'::jsonb end)
$$;
select pg_temp.save(pg_temp.big_tree(5, true));
select throws_ok($$select pg_temp.publish('7a000000-0000-4000-8000-000000000000')$$, 'P0001',
  'publish gate: course 7a000000-0000-4000-8000-000000000000 has 1001 graded questions; the limit is 1000',
  'a course with 1001 graded questions cannot publish (a learner could never submit it)');
select pg_temp.save(pg_temp.big_tree(5, false));
select pg_temp.review_all('7a000000-0000-4000-8000-000000000000', 'big');
select lives_ok($$select pg_temp.keep('big_v1', pg_temp.publish('7a000000-0000-4000-8000-000000000000'))$$,
  'a course with exactly 1000 graded questions publishes');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.keep('tom_big', public.assign_version('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', pg_temp.id('big_v1'), '00000000-0000-0000-0000-0000000000a4'));
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a4');
select results_eq($$select correct, total, passed from public.submit_quiz_attempt(pg_temp.id('tom_big'), gen_random_uuid(),
  (select jsonb_agg(jsonb_build_object('questionId', format('7a000000-0000-4000-8000-%s:q%s', lpad(l::text, 12, '0'), q), 'answerIndex', 1))
   from generate_series(1, 5) l, generate_series(1, 200) q))$$, $$values (1000, 1000, true)$$,
  'all 1000 answers can be submitted and scored');
-- Base lessons may carry ungraded practice quizzes (Sol R03).
select pg_temp.as_service();
select lives_ok($$select pg_temp.save(pg_temp.course('7b000000-0000-4000-8000-000000000000', 'base', jsonb_build_array(
  pg_temp.lesson('7b000000-0000-4000-8000-000000000011', 'mixed', jsonb_build_array(
    pg_temp.quiz('Graded?', 'science', array[pg_temp.id('c_ok')]), pg_temp.quiz('Discuss: how would you cue this client?', 'practice-based', '{}'))))))$$,
  'a base lesson saves with a claim-free practice quiz');
select pg_temp.review_all('7b000000-0000-4000-8000-000000000000', 'mixed');
select lives_ok($$select pg_temp.keep('mixed_v1', pg_temp.publish('7b000000-0000-4000-8000-000000000000'))$$,
  'a base lesson with a practice quiz publishes');
select pg_temp.reset_role();
select is((select jsonb_agg(q ->> 'questionId') from jsonb_array_elements(private.graded_questions(
  (select snapshot from public.curriculum_versions where id = pg_temp.id('mixed_v1')))) q),
  '["7b000000-0000-4000-8000-000000000011:q1"]'::jsonb, 'only the science quiz is graded');
select pg_temp.as_service();
select throws_ok($$select pg_temp.save(pg_temp.course('7b000000-0000-4000-8000-000000000000', 'base', jsonb_build_array(
  pg_temp.lesson('7b000000-0000-4000-8000-000000000011', 'mixed', jsonb_build_array(
    pg_temp.quiz('Discuss?', 'practice-based', array[pg_temp.id('c_ok')]))))))$$,
  '22023', 'invalid course.parts[0].lessons[0].blocks[0]: a practice-based block cannot carry claims',
  'a practice quiz still cannot carry claims');
-- An old model run cannot renew a claim (Sol S06).
select pg_temp.keep('c_run', pg_temp.claim('Synthetic claim reviewed long ago.', pg_temp.id('s1')));
select throws_ok(format($$select public.publisher_review_claim(pg_temp.pat(), %L, jsonb_build_object('decision', 'approved',
  'expiresAt', %L, 'expectedHash', pg_temp.claim_hash(%L), 'receipt', pg_temp.claim_receipt(),
  'run', jsonb_set(pg_temp.run('ancient'), '{reviewedAt}', to_jsonb(%L::text))))$$,
  pg_temp.id('c_run'), pg_temp.iso(now() + interval '1 year'), pg_temp.id('c_run'), pg_temp.iso(now() - interval '23 months')),
  '22023', 'invalid review.expiresAt: must be at most 24 months after the model review',
  'an approval cannot outlast its model review by more than 24 months');
select lives_ok(format($$select public.publisher_review_claim(pg_temp.pat(), %L, jsonb_build_object('decision', 'approved',
  'expiresAt', %L, 'expectedHash', pg_temp.claim_hash(%L), 'receipt', pg_temp.claim_receipt(),
  'run', jsonb_set(pg_temp.run('ancient'), '{reviewedAt}', to_jsonb(%L::text))))$$,
  pg_temp.id('c_run'), pg_temp.iso(now() + interval '20 days'), pg_temp.id('c_run'), pg_temp.iso(now() - interval '23 months')),
  'an approval within 24 months of its model review is accepted');
select pg_temp.reset_role();
insert into public.claim_reviews (claim_id, decision, expires_at, receipt, reviewer, run_id, claim_hash)
select pg_temp.id('c_run'), 'approved', now() + interval '1 year', pg_temp.claim_receipt(), '00000000-0000-0000-0000-0000000000c1',
  r.id, private.claim_hash(pg_temp.id('c_run'))
from public.review_runs r where r.session_id = 'ci-ancient';
select pg_temp.as_service();
select is(public.publisher_claim_target(pg_temp.pat(), pg_temp.id('c_run')) ->> 'status', 'approved',
  'an approval row inside the run window is current');
select pg_temp.reset_role();
insert into public.review_runs (model, session_id, packet_digest, reviewed_at, recorded_by)
values ('synthetic-fixture', 'ci-older', repeat('9', 64), now() - interval '25 months', '00000000-0000-0000-0000-0000000000c1');
insert into public.claim_reviews (claim_id, decision, expires_at, receipt, reviewer, run_id, claim_hash)
select pg_temp.id('c_run'), 'approved', now() + interval '1 year', pg_temp.claim_receipt(), '00000000-0000-0000-0000-0000000000c1',
  r.id, private.claim_hash(pg_temp.id('c_run'))
from public.review_runs r where r.session_id = 'ci-older';
select pg_temp.as_service();
select is(public.publisher_claim_target(pg_temp.pat(), pg_temp.id('c_run')) ->> 'status', 'expired',
  'an approval written around the RPC on a 25-month-old run is expired');
-- Unchanged gym courses stay idempotent across the migration (Sol R05).
select pg_temp.reset_role();
insert into public.curriculum_versions (course_id, org_id, layer, version_number, snapshot, content_hash, published_by, rules)
select course_id, org_id, layer, version_number + 1, snapshot, content_hash, published_by, 'phase2'
from public.curriculum_versions where id = pg_temp.id('m_v1');
select pg_temp.keep('m_v2_legacy', (select id from public.curriculum_versions where course_id = '73000000-0000-4000-8000-000000000000' and rules = 'phase2'));
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select is(public.publish_course('73000000-0000-4000-8000-000000000000'), pg_temp.id('m_v2_legacy'),
  'republishing an unchanged gym course returns its latest version, whatever rules it was published under');
select pg_temp.reset_role();

-- 10. Privileges and hygiene -------------------------------------------------------------------
create temp table p3_tables (name text);
insert into p3_tables values ('review_runs'), ('lesson_reviews'), ('course_reviews'), ('practice_media'), ('practice_media_checks'),
  ('practice_media_status'), ('practice_media_metadata'), ('quiz_attempts');
select is((select count(*) from p3_tables t, (values ('anon'), ('authenticated'), ('service_role')) r (role),
    (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) p (priv)
  where has_table_privilege(r.role, 'public.' || t.name, p.priv)), 0::bigint,
  'no client or service role has any write privilege on phase-3 tables');
select is((select array_agg(t.name order by t.name) from p3_tables t where has_table_privilege('authenticated', 'public.' || t.name, 'SELECT')),
  array['quiz_attempts'], 'only quiz attempts are client-readable (rows filtered by RLS)');
select is((select count(*) from p3_tables t where has_table_privilege('anon', 'public.' || t.name, 'SELECT')), 0::bigint,
  'anon reads no phase-3 table');
select ok((select bool_and(c.relrowsecurity) from p3_tables t join pg_class c on c.oid = ('public.' || t.name)::regclass),
  'RLS is on for every phase-3 table');
select is((select count(*) from (values ('publisher_claim_target(uuid,uuid)'), ('publisher_review_targets(uuid,uuid)'),
    ('publisher_review_lesson(uuid,uuid,jsonb)'), ('publisher_review_course(uuid,uuid,jsonb)'), ('publisher_admit_media(uuid,jsonb)'), ('publisher_record_media_check(uuid,uuid,jsonb)'),
    ('publisher_set_media_status(uuid,uuid,jsonb)'), ('publisher_refresh_media_metadata(uuid,uuid,jsonb)')) f (sig),
    (values ('anon'), ('authenticated')) r (role)
  where has_function_privilege(r.role, 'public.' || f.sig, 'EXECUTE')), 0::bigint,
  'new publisher functions are not executable by anon or authenticated');
select is((select count(*) from (values ('version_integrity(uuid)'), ('version_media(uuid)'),
    ('submit_quiz_attempt(uuid,uuid,jsonb)'), ('module_status(uuid)')) f (sig), (values ('anon'), ('service_role')) r (role)
  where has_function_privilege(r.role, 'public.' || f.sig, 'EXECUTE')), 0::bigint,
  'learner functions are executable by signed-in users only');
select is((select count(*) from pg_proc p where p.pronamespace = 'private'::regnamespace
  and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('service_role', p.oid, 'EXECUTE'))), 0::bigint,
  'no private function is executable by anon or the service role');
select is((select count(*) from pg_proc p where p.prosecdef and p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
  and not coalesce(p.proconfig, '{}') @> array['search_path=""']), 0::bigint,
  'every security-definer function pins an empty search_path');
select ok((select array_agg(distinct action) from private.content_audit where actor = '00000000-0000-0000-0000-0000000000c1')
  @> array['review_lesson', 'review_course', 'admit_media', 'check_media', 'set_media_status', 'refresh_media_metadata', 'review_block', 'review_claim'],
  'every new publisher action is audited under the named actor');

select * from finish();
rollback;
