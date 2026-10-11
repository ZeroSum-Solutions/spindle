-- Phase 3 acceptance (ADR 0007): review receipts bound to exact hashes, the
-- claim lifecycle, the practice-media registry and graded quizzes. All
-- content and receipts are synthetic; no model is called.
begin;
create extension if not exists pgtap with schema extensions;
select plan(276);

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
-- A synthetic describer run (D-11): what a Gemini segment description would record.
create function pg_temp.describer(tag text, cost numeric, at timestamptz default now() - interval '1 day') returns jsonb language sql as $$
  select jsonb_build_object('run', jsonb_build_object('model', 'gemini-3.8-flash', 'session', 'gemini-' || tag,
    'packetDigest', encode(extensions.digest('describe-' || tag, 'sha256'), 'hex'), 'reviewedAt', pg_temp.iso(at)), 'costUsd', cost)
$$;
-- The lessons that embed a clip now, as a segment packet would carry them (Sol PR20-10).
create function pg_temp.ctx(media uuid) returns jsonb language sql security definer as $$ select private.segment_context(media) $$;
-- A complete passing segment review of a clip, reviewed with the lessons that embed it now.
create function pg_temp.seg_pass(media uuid, tag text, at timestamptz) returns jsonb language sql as $$
  select jsonb_build_object('kind', 'segment', 'outcome', 'pass', 'checkedAt', pg_temp.iso(at), 'run', pg_temp.run(tag),
    'describer', pg_temp.describer(tag, 0.01), 'context', pg_temp.ctx(media))
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
-- A row saved before the storage-only rule (P18-06): written around its trigger.
alter table public.lesson_blocks disable trigger lesson_blocks_media_storage;
insert into public.lesson_blocks (lesson_id, org_id, ordinal, kind, support, content, content_hash)
select '71000000-0000-4000-8000-000000000011', null, 9, 'image', null, c, private.block_hash('image', c)
from (select jsonb_build_object('kind', 'image', 'src', 'https://www.youtube.com/watch?v=AbCdEfGhIj0', 'alt', 'x', 'caption', '',
  'provenanceId', 'p1') as c) t;
alter table public.lesson_blocks enable trigger lesson_blocks_media_storage;
select pg_temp.as_service();
select throws_ok($$select pg_temp.publish('71000000-0000-4000-8000-000000000000')$$, 'P0001',
  'publish gate: lesson 71000000-0000-4000-8000-000000000011 has media on a video host; use a registry video block',
  'media saved around the validator cannot smuggle YouTube in');
select pg_temp.reset_role();
delete from public.lesson_blocks where lesson_id = '71000000-0000-4000-8000-000000000011' and ordinal = 9;
alter table public.lessons disable trigger lessons_media_storage;
update public.lessons set media = jsonb_build_array(jsonb_build_object('kind', 'video', 'src', 'https://youtu.be/AbCdEfGhIj0',
  'alt', 'x', 'caption', '', 'provenanceId', 'p1')) where id = '71000000-0000-4000-8000-000000000011';
alter table public.lessons enable trigger lessons_media_storage;
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
select public.publisher_record_media_check(pg_temp.pat(), pg_temp.id('mv'), pg_temp.seg_pass(pg_temp.id('mv'), 'segment', now()));
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
select pg_temp.save(pg_temp.v_tree(pg_temp.video(pg_temp.id('mv_old'), 100, 120, 'An old embed check.'), 'Watch.'));
select public.publisher_record_media_check(pg_temp.pat(), pg_temp.id('mv_old'), pg_temp.seg_pass(pg_temp.id('mv_old'), 'segment-old', now()));
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
-- The draft embeds the first clip again, so it can be re-reviewed with its lesson.
select pg_temp.save(pg_temp.v_tree(pg_temp.video(pg_temp.id('mv'), 30, 95, 'Shows scapular upward rotation.'), 'Watch.'));
select public.publisher_record_media_check(pg_temp.pat(), pg_temp.id('mv'),
  jsonb_build_object('kind', 'segment', 'outcome', 'fail', 'checkedAt', pg_temp.iso(now()), 'notes', 'Unsafe cue in the segment.'));
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select results_eq(format('select state from public.version_media(%L)', pg_temp.id('v_v1')), $$values ('disabled'::text)$$,
  'a failed segment review stops playback in a published version at once');
select pg_temp.as_service();
select public.publisher_record_media_check(pg_temp.pat(), pg_temp.id('mv'), pg_temp.seg_pass(pg_temp.id('mv'), 'segment-old-pass', now() - interval '91 days'));
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select results_eq(format('select state from public.version_media(%L)', pg_temp.id('v_v1')), $$values ('disabled'::text)$$,
  'a segment review older than 90 days stops playback');
select pg_temp.as_service();
select public.publisher_record_media_check(pg_temp.pat(), pg_temp.id('mv'), pg_temp.seg_pass(pg_temp.id('mv'), 'segment-recheck', now()));
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

-- 8b. Model-described segments (D-11): a passing segment review names its describer run ------------
select pg_temp.as_service();
select pg_temp.keep('md', public.publisher_admit_media(pg_temp.pat(), jsonb_build_object('provider', 'youtube',
  'videoId', 'MdEsCrIbEd0', 'startSeconds', 30, 'endSeconds', 90, 'rationale', 'Model-described synthetic clip.',
  'embedCheckedAt', pg_temp.iso(now()))));
create function pg_temp.md_tree(cue text) returns jsonb language sql as $$
  select pg_temp.course('7e000000-0000-4000-8000-000000000000', 'base', jsonb_build_array(
    pg_temp.lesson('7e000000-0000-4000-8000-000000000011', 'described', jsonb_build_array(pg_temp.prac(cue),
      jsonb_build_object('kind', 'video', 'content', jsonb_build_object('mediaId', pg_temp.id('md'), 'provider', 'youtube', 'videoId', 'MdEsCrIbEd0',
        'startSeconds', 30, 'endSeconds', 90, 'rationale', 'Model-described synthetic clip.', 'caption', ''))))))
$$;
select throws_ok(format($$select public.publisher_record_media_check(pg_temp.pat(), %L, pg_temp.seg_pass(%L, 'seg-nolesson', now()))$$,
  pg_temp.id('md'), pg_temp.id('md')),
  '22023', 'invalid check.context: must list the lessons the reviewer saw', 'a clip no lesson embeds cannot pass a segment review');
select public.publisher_save_course_draft(pg_temp.pat(), pg_temp.md_tree('Watch the setup.'));
select throws_ok(format($$select public.publisher_record_media_check(pg_temp.pat(), %L,
  pg_temp.seg_pass(%L, 'seg-nodesc', now()) - 'describer')$$, pg_temp.id('md'), pg_temp.id('md')),
  '22023', 'invalid check.describer: a passing segment review needs the describer run it reviewed',
  'a passing segment review must name the description it reviewed');
select throws_ok(format($$select public.publisher_record_media_check(pg_temp.pat(), %L,
  pg_temp.seg_pass(%L, 'seg-neg', now()) || jsonb_build_object('describer', pg_temp.describer('neg', -1)))$$, pg_temp.id('md'), pg_temp.id('md')),
  '22023', 'invalid check.describer.costUsd: must be a number from 0 to 100', 'describer cost is validated');
select throws_ok(format($$select public.publisher_record_media_check(pg_temp.pat(), %L,
  jsonb_build_object('kind', 'embed', 'outcome', 'pass', 'checkedAt', %L, 'describer', pg_temp.describer('embed', 0.01)))$$,
  pg_temp.id('md'), pg_temp.iso(now())),
  '22023', 'invalid check.describer: only segment reviews have a describer', 'an embed check has no describer');
select throws_ok(format($$select public.publisher_record_media_check(pg_temp.pat(), %L,
  pg_temp.seg_pass(%L, 'seg-noctx', now()) - 'context')$$, pg_temp.id('md'), pg_temp.id('md')),
  '22023', 'invalid check.context: a passing segment review needs the lessons it was reviewed with',
  'a passing segment review must name the lessons it was reviewed with (Sol PR20-10)');
select throws_ok(format($$select public.publisher_record_media_check(pg_temp.pat(), %L,
  pg_temp.seg_pass(%L, 'seg-stale', now()) || jsonb_build_object('context', jsonb_build_array(jsonb_build_object(
    'lessonId', '7e000000-0000-4000-8000-000000000011', 'hash', repeat('0', 64)))))$$, pg_temp.id('md'), pg_temp.id('md')),
  'P0001', format('stale review: the lessons that embed media %s changed after its segment packet was built', pg_temp.id('md')),
  'a segment review of an older lesson text is refused');
select throws_ok(format($$select public.publisher_record_media_check(pg_temp.pat(), %L,
  pg_temp.seg_pass(%L, 'seg-gemini', now()) || jsonb_build_object('run', jsonb_build_object('model', 'gemini-3.8-flash',
    'session', 'gemini-other-session', 'packetDigest', repeat('e', 64), 'reviewedAt', '2026-10-01T00:00:00Z')))$$, pg_temp.id('md'), pg_temp.id('md')),
  '22023', 'invalid check.run: a describer model cannot review a segment',
  'a Gemini run never reviews a segment, even with another session (Sol PR20-04)');
select throws_ok(format($$select public.publisher_record_media_check(pg_temp.pat(), %L,
  jsonb_build_object('kind', 'embed', 'outcome', 'pass', 'checkedAt', %L, 'context', pg_temp.ctx(%L)))$$,
  pg_temp.id('md'), pg_temp.iso(now()), pg_temp.id('md')),
  '22023', 'invalid check.context: only segment reviews have a lesson context', 'an embed check has no lesson context');
select lives_ok(format($$select pg_temp.keep('md_check', public.publisher_record_media_check(pg_temp.pat(), %L,
  pg_temp.seg_pass(%L, 'seg-ok', now()) || jsonb_build_object('describer', pg_temp.describer('ok', 0.0067))))$$,
  pg_temp.id('md'), pg_temp.id('md')), 'a segment review with its describer run and lessons records');
select lives_ok(format($$select public.publisher_record_media_check(pg_temp.pat(), %L,
  jsonb_build_object('kind', 'segment', 'outcome', 'fail', 'checkedAt', %L, 'notes', 'Describer reported uncertain content.'))$$,
  pg_temp.id('md'), pg_temp.iso(now())), 'a failed segment review may omit the describer and lessons');
select pg_temp.reset_role();
select results_eq(format($$select c.describer_model, c.describer_cost_usd, c.described_at = (pg_temp.describer('ok', 0.0067) #>> '{run,reviewedAt}')::timestamptz,
  d.session_id, c.describer_run_id <> c.run_id, c.context = pg_temp.ctx(%L) from public.practice_media_checks c
  join public.review_runs d on d.id = c.describer_run_id where c.id = %L$$, pg_temp.id('md'), pg_temp.id('md_check')),
  $$values ('gemini-3.8-flash'::text, 0.0067::numeric, true, 'gemini-ok'::text, true, true)$$,
  'the describer model, cost, time, run and reviewed lessons are stored apart from the reviewing run');
select pg_temp.as_service();
select public.publisher_record_media_check(pg_temp.pat(), pg_temp.id('md'), pg_temp.seg_pass(pg_temp.id('md'), 'seg-ok2', now()));
select pg_temp.review_all('7e000000-0000-4000-8000-000000000000', 'described');
select pg_temp.keep('md_v1', pg_temp.publish('7e000000-0000-4000-8000-000000000000'));
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select results_eq(format('select state, review from public.version_media(%L)', pg_temp.id('md_v1')),
  $$values ('playable'::text, 'model-described'::text)$$, 'a playable clip is reported as model-described (no human check is claimed)');
-- The approval is bound to the lessons Sol saw (Sol PR20-10).
select pg_temp.as_service();
select public.publisher_save_course_draft(pg_temp.pat(), pg_temp.md_tree('Watch the setup, then hold the end position for a minute.'));
select pg_temp.review_all('7e000000-0000-4000-8000-000000000000', 'described-2');
select throws_ok($$select pg_temp.publish('7e000000-0000-4000-8000-000000000000')$$, 'P0001',
  'publish gate: lesson 7e000000-0000-4000-8000-000000000011 has a video whose registry entry is not segment-reviewed with this lesson',
  'a lesson edited after the segment review cannot publish the clip');
select public.publisher_record_media_check(pg_temp.pat(), pg_temp.id('md'), pg_temp.seg_pass(pg_temp.id('md'), 'seg-ok3', now()));
select lives_ok($$select pg_temp.keep('md_v2', pg_temp.publish('7e000000-0000-4000-8000-000000000000'))$$,
  'a fresh segment review with the edited lesson lets it publish');
-- Playback is bound to the lessons the latest review saw, per version (Sol R2 PR20-10).
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select results_eq(format('select state from public.version_media(%L)', pg_temp.id('md_v2')), $$values ('playable'::text)$$,
  'the version whose lesson the latest segment review saw plays the clip');
select results_eq(format('select state, review from public.version_media(%L)', pg_temp.id('md_v1')), $$values ('disabled'::text, null::text)$$,
  'an older version whose lesson the latest segment review did not see stops playing the clip');
select pg_temp.as_service();
select public.publisher_save_course_draft(pg_temp.pat(), pg_temp.course('e7000000-0000-4000-8000-000000000000', 'base', jsonb_build_array(
  pg_temp.lesson('e7000000-0000-4000-8000-000000000011', 'described-too', jsonb_build_array(pg_temp.prac('Another cue.'),
    jsonb_build_object('kind', 'video', 'content', jsonb_build_object('mediaId', pg_temp.id('md'), 'provider', 'youtube', 'videoId', 'MdEsCrIbEd0',
      'startSeconds', 30, 'endSeconds', 90, 'rationale', 'Model-described synthetic clip.', 'caption', '')))))));
select pg_temp.review_all('e7000000-0000-4000-8000-000000000000', 'described-too');
select throws_ok($$select pg_temp.publish('e7000000-0000-4000-8000-000000000000')$$, 'P0001',
  'publish gate: lesson e7000000-0000-4000-8000-000000000011 has a video whose registry entry is not segment-reviewed with this lesson',
  'a lesson that embeds the clip after its review cannot publish it');
-- A description older than 90 days does not count, however fresh the review of it (Sol R2 PR20-11).
select pg_temp.as_service();
select public.publisher_record_media_check(pg_temp.pat(), pg_temp.id('md'),
  pg_temp.seg_pass(pg_temp.id('md'), 'seg-old-desc', now()) || jsonb_build_object('describer', pg_temp.describer('old-desc', 0.01, now() - interval '91 days')));
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select results_eq(format('select state from public.version_media(%L)', pg_temp.id('md_v2')), $$values ('disabled'::text)$$,
  'a fresh review of a description older than 90 days does not make the clip playable');
select pg_temp.as_service();
select throws_ok($$select pg_temp.publish('7e000000-0000-4000-8000-000000000000')$$, 'P0001',
  'publish gate: lesson 7e000000-0000-4000-8000-000000000011 has a video whose registry entry is segment-unchecked',
  'nor can it publish');
-- A pass stored before this migration (no describer, no lessons) does not count (Sol PR20-07).
select pg_temp.reset_role();
alter table public.practice_media_checks drop constraint practice_media_checks_describer_check;
insert into public.practice_media_checks (media_id, kind, outcome, checked_at, run_id, recorded_by)
  values (pg_temp.id('md'), 'segment', 'pass', now(), (select id from public.review_runs where model = 'synthetic-fixture' limit 1),
    '00000000-0000-0000-0000-0000000000c1');
alter table public.practice_media_checks add constraint practice_media_checks_describer_check check (
    (describer_run_id is null) = (describer_model is null)
    and (describer_run_id is null) = (describer_cost_usd is null)
    and (describer_run_id is null) = (described_at is null)
    and (kind = 'segment' or describer_run_id is null)
    and (kind <> 'segment' or outcome <> 'pass' or describer_run_id is not null)
    and (kind = 'segment' or context is null)
    and (kind <> 'segment' or outcome <> 'pass' or context is not null)
  ) not valid;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select results_eq(format('select state, review from public.version_media(%L)', pg_temp.id('md_v1')),
  $$values ('disabled'::text, null::text)$$, 'a legacy pass without a describer run is not reported as model-described');
select pg_temp.reset_role();
select throws_ok(format($$insert into public.practice_media_checks (media_id, kind, outcome, checked_at, run_id, recorded_by)
  values (%L, 'segment', 'pass', now(), (select id from public.review_runs limit 1), '00000000-0000-0000-0000-0000000000c1')$$, pg_temp.id('md')),
  '23514', null, 'even the table owner cannot store a passing segment review without a describer');

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

-- 9c. The lesson slug "quiz" is reserved for the module quiz route -----------------------------------
select pg_temp.as_service();
select throws_ok($$select pg_temp.save(pg_temp.course('7c000000-0000-4000-8000-000000000000', 'base', jsonb_build_array(
  pg_temp.lesson('7c000000-0000-4000-8000-000000000011', 'quiz', jsonb_build_array(pg_temp.prac('x'))))))$$,
  '22023', 'invalid course: the lesson slug "quiz" is reserved', 'a global lesson cannot use the slug quiz');
select lives_ok($$select pg_temp.save(pg_temp.course('7c000000-0000-4000-8000-000000000000', 'base', jsonb_build_array(
  pg_temp.lesson('7c000000-0000-4000-8000-000000000011', 'quizzes', jsonb_build_array(pg_temp.prac('x'))))))$$,
  'a lesson slug that only starts with quiz is fine');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$select public.save_course_draft('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', pg_temp.course('7d000000-0000-4000-8000-000000000000',
  'method', jsonb_build_array(pg_temp.lesson('7d000000-0000-4000-8000-000000000011', 'quiz', jsonb_build_array(pg_temp.prac('x')))))) $$,
  '22023', 'invalid course: the lesson slug "quiz" is reserved', 'a gym lesson cannot use the slug quiz either');
select pg_temp.reset_role();
select throws_ok($$update public.lessons set slug = 'quiz' where id = '7c000000-0000-4000-8000-000000000011'$$,
  '22023', 'invalid course: the lesson slug "quiz" is reserved', 'not even the table owner can write the reserved slug');

-- 9d. Answer keys never reach learners (ADR 0007, closes the accepted S04 risk) ---------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a4');
select throws_ok(format($$select snapshot from public.curriculum_versions where id = %L$$, pg_temp.id('q_v1')), '42501', null,
  'a learner cannot select the raw snapshot column');
select throws_ok($$select * from public.curriculum_versions$$, '42501', null, 'a learner cannot select * (it includes the raw snapshot)');
select is((select count(*) from jsonb_path_query((select learner_snapshot from public.curriculum_versions where id = pg_temp.id('q_v1')),
  '$.parts[*].lessons[*].blocks[*] ? (@.kind == "quiz" && @.support == "science").content.answerIndex')), 0::bigint,
  'the learner projection carries no answer index for a graded quiz');
select is((select count(*) from jsonb_path_query((select learner_snapshot from public.curriculum_versions where id = pg_temp.id('q_v1')),
  '$.parts[*].lessons[*].blocks[*] ? (@.kind == "quiz" && @.support == "science").content.explanation')), 0::bigint,
  'the learner projection carries no explanation for a graded quiz');
select is((select count(*) from jsonb_path_query((select learner_snapshot from public.curriculum_versions where id = pg_temp.id('q_v1')),
  '$.parts[*].lessons[*].blocks[*] ? (@.kind == "quiz").content.prompt')), 5::bigint, 'learners still get every question and its options');
select pg_temp.reset_role();
select is((select learner_snapshot #> '{parts,0,lessons,0,blocks,1,content}' from public.curriculum_versions where id = pg_temp.id('mixed_v1')),
  (select snapshot #> '{parts,0,lessons,0,blocks,1,content}' from public.curriculum_versions where id = pg_temp.id('mixed_v1')),
  'a practice self-check keeps its answer and explanation') ;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a4');
select throws_ok(format($$select * from public.quiz_attempt_review(%L)$$, (select id from public.quiz_attempts where attempt_key = '00000000-0000-4000-8000-0000000000f4')),
  'P0001', 'the answer review opens after a passing attempt', 'a failed attempt reveals no answers');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select results_eq(format($$select question_id, chosen, answer_index, correct from public.quiz_attempt_review(%L) order by question_id$$,
  (select id from public.quiz_attempts where attempt_key = '00000000-0000-4000-8000-0000000000f2')),
  $$values ('79000000-0000-4000-8000-000000000011:q1'::text, 1, 1, true), ('79000000-0000-4000-8000-000000000011:q2', 1, 1, true),
    ('79000000-0000-4000-8000-000000000012:q1', 1, 1, true), ('79000000-0000-4000-8000-000000000012:q2', 1, 1, true),
    ('79000000-0000-4000-8000-000000000012:q3', 0, 1, false)$$,
  'after a pass the learner gets each answer and explanation back');
select is((select count(*) from public.quiz_attempt_review((select id from public.quiz_attempts where attempt_key = '00000000-0000-4000-8000-0000000000f2'))
  where explanation = 'Synthetic explanation.'), 5::bigint, 'the post-pass review carries the explanations');
-- Only the attempt's own learner may review it (Sol R1 PR22-02); the real attempt id is kept
-- before switching users, because RLS hides it from them (PR22-04).
select pg_temp.reset_role();
select pg_temp.keep('f2_attempt', (select id from public.quiz_attempts where attempt_key = '00000000-0000-4000-8000-0000000000f2'));
select isnt(pg_temp.id('f2_attempt'), null, 'the passing attempt under test exists');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a4');
select throws_ok(format($$select * from public.quiz_attempt_review(%L)$$, pg_temp.id('f2_attempt')),
  'P0002', 'no such attempt', 'another learner cannot review someone else''s attempt');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok(format($$select * from public.quiz_attempt_review(%L)$$, pg_temp.id('f2_attempt')),
  'P0002', 'no such attempt', 'the gym owner cannot read a learner''s answer review');
select pg_temp.reset_role();
update public.memberships set role = 'lead' where org_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and user_id = '00000000-0000-0000-0000-0000000000a4';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a4');
select throws_ok(format($$select * from public.quiz_attempt_review(%L)$$, pg_temp.id('f2_attempt')),
  'P0002', 'no such attempt', 'a gym lead cannot read a learner''s answer review');
select pg_temp.reset_role();
update public.memberships set role = 'trainer' where org_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and user_id = '00000000-0000-0000-0000-0000000000a4';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select throws_ok(format($$select * from public.quiz_attempt_review(%L)$$, pg_temp.id('f2_attempt')),
  'P0002', 'no such attempt', 'another gym''s owner cannot read it either');
select throws_ok($$select private.graded_questions('{}')$$, '42501', null, 'learners cannot call the private grading helper');
select pg_temp.as_service();
select ok((select snapshot #>> '{parts,0,lessons,0,blocks,1,content,answerIndex}' = '1' from public.curriculum_versions where id = pg_temp.id('q_v1')),
  'the publisher path still reads the full snapshot');
select pg_temp.reset_role();
select is((select learner_snapshot from public.curriculum_versions where id = pg_temp.id('m_v1')),
  (select snapshot from public.curriculum_versions where id = pg_temp.id('m_v1')), 'a gym method projection equals its snapshot (practice only)');
-- 9e. Publishing after a retraction recheck is bound to the sources that were rechecked (Sol N01) -----
select pg_temp.as_service();
create function pg_temp.cited(cid uuid) returns jsonb language sql as $$
  select coalesce(jsonb_agg(distinct cs.source_id), '[]'::jsonb) from public.lessons l join public.lesson_blocks b on b.lesson_id = l.id
  join public.block_claims bc on bc.block_id = b.id join public.claim_sources cs on cs.claim_id = bc.claim_id where l.course_id = cid
$$;
select pg_temp.save(pg_temp.course('7f200000-0000-4000-8000-000000000000', 'base', jsonb_build_array(
  pg_temp.lesson('7f200000-0000-4000-8000-000000000011', 'checked', jsonb_build_array(pg_temp.sci('The cuff has four muscles.', array[pg_temp.id('c_ok')]))))));
select pg_temp.review_all('7f200000-0000-4000-8000-000000000000', 'checked');
select set_config('test.checked_a', pg_temp.cited('7f200000-0000-4000-8000-000000000000')::text, true);
-- A concurrent save switches the draft to another, already reviewed citation set before publishing.
select pg_temp.keep('s_other', pg_temp.source('10.5555/p3.checked-other'));
select pg_temp.keep('c_checked_other', pg_temp.claim('Synthetic claim on an unchecked source.', pg_temp.id('s_other')));
select pg_temp.approve(pg_temp.id('c_checked_other'));
select pg_temp.save(pg_temp.course('7f200000-0000-4000-8000-000000000000', 'base', jsonb_build_array(
  pg_temp.lesson('7f200000-0000-4000-8000-000000000011', 'checked', jsonb_build_array(pg_temp.sci('The cuff has four muscles.', array[pg_temp.id('c_checked_other')]))))));
select pg_temp.review_all('7f200000-0000-4000-8000-000000000000', 'checked-2');
select throws_ok($$select public.publisher_publish_course_checked(pg_temp.pat(), '7f200000-0000-4000-8000-000000000000',
  current_setting('test.checked_a')::jsonb)$$, 'P0001',
  'stale recheck: course 7f200000-0000-4000-8000-000000000000 cites sources that were not rechecked',
  'a publish is refused when the cited sources differ from the rechecked set');
select is((select count(*) from public.curriculum_versions where course_id = '7f200000-0000-4000-8000-000000000000'), 0::bigint,
  'nothing was published on a stale recheck');
select lives_ok($$select public.publisher_publish_course_checked(pg_temp.pat(), '7f200000-0000-4000-8000-000000000000',
  pg_temp.cited('7f200000-0000-4000-8000-000000000000'))$$, 'a publish with the current cited set goes through the full gate');
select throws_ok($$select public.publisher_publish_course_checked(pg_temp.pat(), '7f200000-0000-4000-8000-000000000000', '{}')$$,
  '22023', 'invalid checkedSources: must be an array', 'the checked set must be an array of source ids');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c2');
select throws_ok($$select public.publisher_publish_course_checked(pg_temp.pat(), '7f200000-0000-4000-8000-000000000000', '[]')$$, '42501', null,
  'a signed-in user cannot call the checked publish');
select pg_temp.reset_role();

-- 9f. Media must be a stored file of the content's owner (P18-06) -----------------------------------
create function pg_temp.img(src text) returns jsonb language sql as $$
  select jsonb_build_object('kind', 'image', 'content', jsonb_build_object('kind', 'image', 'src', src, 'alt', 'x', 'caption', '', 'provenanceId', 'p1'))
$$;
create function pg_temp.with_media(src text) returns jsonb language sql as $$
  select jsonb_set(pg_temp.lesson('8a400000-0000-4000-8000-000000000011', 'stored', jsonb_build_array(pg_temp.prac('x'))),
    '{media}', jsonb_build_array(jsonb_build_object('kind', 'video', 'src', src, 'alt', 'x', 'caption', '', 'provenanceId', 'p1')))
$$;
select pg_temp.as_service();
select throws_ok($$select pg_temp.save(pg_temp.course('8a400000-0000-4000-8000-000000000000', 'base', jsonb_build_array(
  pg_temp.lesson('8a400000-0000-4000-8000-000000000011', 'stored', jsonb_build_array(pg_temp.img('https://cdn.example.org/cuff.png'))))))$$,
  '22023', 'invalid course: media must be a stored file under /media/content/ or the gym''s own /media/org/<gym id>/ (got https://cdn.example.org/cuff.png)',
  'global content cannot use an external image');
select throws_ok(format($$select pg_temp.save(pg_temp.course('8a400000-0000-4000-8000-000000000000', 'base', jsonb_build_array(
  pg_temp.lesson('8a400000-0000-4000-8000-000000000011', 'stored', jsonb_build_array(pg_temp.img('/media/org/%s/cuff.png'))))))$$, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  '22023', null, 'global content cannot use a gym''s media');
select throws_ok($$select pg_temp.save(pg_temp.course('8a400000-0000-4000-8000-000000000000', 'base', jsonb_build_array(
  pg_temp.with_media('https://cdn.example.org/clip.mp4'))))$$, '22023', null, 'global lesson media cannot be an external video');
-- Video is registry-only, even as a stored file (Sol R1 PR23-01).
select throws_ok($$select pg_temp.save(pg_temp.course('8a400000-0000-4000-8000-000000000000', 'base', jsonb_build_array(
  pg_temp.with_media('/media/content/clip.mp4'))))$$, '22023',
  'invalid course: a plain video asset is not allowed; use a registry video block (got /media/content/clip.mp4)',
  'stored lesson media cannot be a plain video');
select throws_ok($$select pg_temp.save(pg_temp.course('8a400000-0000-4000-8000-000000000000', 'base', jsonb_build_array(
  pg_temp.lesson('8a400000-0000-4000-8000-000000000011', 'stored', jsonb_build_array(jsonb_build_object('kind', 'image', 'content',
    jsonb_build_object('kind', 'video', 'src', '/media/content/clip.mp4', 'alt', 'x', 'caption', '', 'provenanceId', 'p1')))))))$$, '22023',
  'invalid course: a plain video asset is not allowed; use a registry video block (got /media/content/clip.mp4)',
  'an image block cannot carry a stored video');
create function pg_temp.stored_lesson() returns jsonb language sql as $$
  select jsonb_set(pg_temp.lesson('8a400000-0000-4000-8000-000000000011', 'stored', jsonb_build_array(pg_temp.img('/media/content/shoulder/cuff.png'))),
    '{resources}', '[{"label": "Watch", "href": "https://www.youtube.com/watch?v=AbCdEfGhIj0", "type": "reference"}]')
$$;
select lives_ok($$select pg_temp.save(pg_temp.course('8a400000-0000-4000-8000-000000000000', 'base', jsonb_build_array(pg_temp.stored_lesson())))$$,
  'global content uses stored global media, and resource links stay unrestricted');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
create function pg_temp.gym_course(src text) returns jsonb language sql as $$
  select pg_temp.course('8b500000-0000-4000-8000-000000000000', 'method', jsonb_build_array(
    pg_temp.lesson('8b500000-0000-4000-8000-000000000011', 'gym-stored', jsonb_build_array(pg_temp.img(src)))))
$$;
select throws_ok($$select public.save_course_draft('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', pg_temp.gym_course('https://cdn.example.org/house.png'))$$,
  '22023', null, 'a gym cannot use an external image');
select throws_ok($$select public.save_course_draft('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', pg_temp.gym_course('/media/org/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/x.png'))$$,
  '22023', null, 'a gym cannot use another gym''s media');
select lives_ok($$select public.save_course_draft('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', pg_temp.gym_course('/media/org/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/house.png'))$$,
  'a gym uses its own stored media');
-- Moving a row to another gym re-checks its media (Sol R1 PR23-02). The trigger fires before the
-- foreign keys, so its own error shows the check ran on an org_id-only update.
select pg_temp.reset_role();
select throws_ok($$update public.lesson_blocks set org_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  where lesson_id = '8b500000-0000-4000-8000-000000000011' and kind = 'image'$$, '22023',
  'invalid course: media must be a stored file under /media/content/ or the gym''s own /media/org/<gym id>/ (got /media/org/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/house.png)',
  'a block moved to another gym keeps no foreign gym media, even for the table owner');
update public.lessons set media = jsonb_build_array(jsonb_build_object('kind', 'image', 'src', '/media/org/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/l.png', 'alt', 'x', 'caption', '', 'provenanceId', 'p1'))
where id = '8b500000-0000-4000-8000-000000000011';
select throws_ok($$update public.lessons set org_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' where id = '8b500000-0000-4000-8000-000000000011'$$, '22023',
  'invalid course: media must be a stored file under /media/content/ or the gym''s own /media/org/<gym id>/ (got /media/org/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/l.png)',
  'a lesson moved to another gym keeps no foreign gym media, even for the table owner');
update public.lessons set media = '[]'::jsonb where id = '8b500000-0000-4000-8000-000000000011';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select lives_ok($$select public.save_course_draft('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', pg_temp.gym_course('/media/content/shared.png'))$$,
  'a gym may use stored global media');
-- Rows written before this rule: the publish gate refuses them.
select pg_temp.reset_role();
alter table public.lesson_blocks disable trigger lesson_blocks_media_storage;
update public.lesson_blocks set content = jsonb_set(content, '{src}', '"https://cdn.example.org/legacy.png"')
where lesson_id = '8b500000-0000-4000-8000-000000000011' and kind = 'image';
alter table public.lesson_blocks enable trigger lesson_blocks_media_storage;
update public.lesson_blocks set content_hash = private.block_hash(kind, content) where lesson_id = '8b500000-0000-4000-8000-000000000011';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$select public.publish_course('8b500000-0000-4000-8000-000000000000')$$, 'P0001',
  'publish gate: lesson 8b500000-0000-4000-8000-000000000011 has media that is not a stored file of its owner',
  'a legacy external image cannot publish in gym content');
select pg_temp.reset_role();
alter table public.lessons disable trigger lessons_media_storage;
update public.lessons set media = jsonb_build_array(jsonb_build_object('kind', 'video', 'src', 'https://cdn.example.org/legacy.mp4', 'alt', 'x', 'caption', '', 'provenanceId', 'p1'))
where id = '8a400000-0000-4000-8000-000000000011';
alter table public.lessons enable trigger lessons_media_storage;
select pg_temp.as_service();
select pg_temp.review_all('8a400000-0000-4000-8000-000000000000', 'stored');
select throws_ok($$select pg_temp.publish('8a400000-0000-4000-8000-000000000000')$$, 'P0001',
  'publish gate: course 8a400000-0000-4000-8000-000000000000 has lesson media that is not a stored file of its owner',
  'legacy external lesson media cannot publish in global content');
-- A stored plain video saved before the rule cannot publish either (Sol R1 PR23-01).
select pg_temp.reset_role();
alter table public.lessons disable trigger lessons_media_storage;
update public.lessons set media = jsonb_build_array(jsonb_build_object('kind', 'video', 'src', '/media/content/legacy.mp4', 'alt', 'x', 'caption', '', 'provenanceId', 'p1'))
where id = '8a400000-0000-4000-8000-000000000011';
alter table public.lessons enable trigger lessons_media_storage;
select pg_temp.as_service();
select pg_temp.review_all('8a400000-0000-4000-8000-000000000000', 'stored-video');
select throws_ok($$select pg_temp.publish('8a400000-0000-4000-8000-000000000000')$$, 'P0001',
  'publish gate: course 8a400000-0000-4000-8000-000000000000 has a plain video asset; use a registry video block',
  'a legacy stored plain video cannot publish');
select pg_temp.reset_role();

-- 9g. Diagram teaching text lives in the reviewed lesson data (Sol R16) -------------------------------
create function pg_temp.diagram(support text, claims uuid[], legend jsonb default null) returns jsonb language sql as $$
  select jsonb_build_object('kind', 'diagram', 'support', support, 'claimIds', to_jsonb(claims), 'content', jsonb_build_object(
    'diagramId', 'shoulder.rhythm', 'alt', 'The shoulder blade rotating upward as the arm rises.', 'caption', 'Scapular upward rotation',
    'legend', coalesce(legend, '[{"key": "scapula", "label": "Shoulder blade", "text": "Rotates upward as the arm rises."}]'::jsonb)))
$$;
select pg_temp.as_service();
select throws_ok($$select pg_temp.save(pg_temp.course('8c600000-0000-4000-8000-000000000000', 'base', jsonb_build_array(
  pg_temp.lesson('8c600000-0000-4000-8000-000000000011', 'diagram', jsonb_build_array(jsonb_build_object('kind', 'diagram', 'content',
    jsonb_build_object('diagramId', 'shoulder.rhythm', 'caption', 'x')))))))$$,
  '22023', 'invalid course.parts[0].lessons[0].blocks[0].support: is required', 'a diagram must say how its teaching text is supported');
select throws_ok($$select pg_temp.save(pg_temp.course('8c600000-0000-4000-8000-000000000000', 'base', jsonb_build_array(
  pg_temp.lesson('8c600000-0000-4000-8000-000000000011', 'diagram', jsonb_build_array(pg_temp.diagram('practice-based', '{}',
    '[{"key": "scapula", "label": "x", "text": "y", "colour": "red"}]'))))))$$,
  '22023', 'invalid course.parts[0].lessons[0].blocks[0].content.legend[0]: unknown key colour', 'legend items are strict');
select throws_ok($$select pg_temp.save(pg_temp.course('8c600000-0000-4000-8000-000000000000', 'base', jsonb_build_array(
  pg_temp.lesson('8c600000-0000-4000-8000-000000000011', 'diagram', jsonb_build_array(pg_temp.diagram('practice-based', '{}',
    '[{"key": "two words", "label": "x", "text": "y"}]'))))))$$,
  '22023', 'invalid course.parts[0].lessons[0].blocks[0].content.legend[0].key: must be a plain identifier', 'legend keys are plain identifiers');
select lives_ok($$select pg_temp.save(pg_temp.course('8c600000-0000-4000-8000-000000000000', 'base', jsonb_build_array(
  pg_temp.lesson('8c600000-0000-4000-8000-000000000011', 'diagram', jsonb_build_array(pg_temp.diagram('science', array[pg_temp.id('c_ok')]))))))$$,
  'a science diagram with its text and claim saves');
select throws_ok($$select pg_temp.publish('8c600000-0000-4000-8000-000000000000')$$, 'P0001',
  'publish gate: lesson 8c600000-0000-4000-8000-000000000011 has a diagram block with no supporting binding review for its exact content and claims',
  'a science diagram needs a binding review of its exact text');
select pg_temp.review_all('8c600000-0000-4000-8000-000000000000', 'diagram');
select lives_ok($$select pg_temp.keep('dg_v1', pg_temp.publish('8c600000-0000-4000-8000-000000000000'))$$, 'once reviewed, the diagram publishes');
select pg_temp.reset_role();
select is((select snapshot #> '{parts,0,lessons,0,blocks,0,content,legend,0,text}' from public.curriculum_versions where id = pg_temp.id('dg_v1')),
  '"Rotates upward as the arm rises."'::jsonb, 'the legend text is frozen in the snapshot, so the lesson hash covers it');
select is((select count(*) from public.version_claims where version_id = pg_temp.id('dg_v1')), 1::bigint, 'the diagram''s claim is cited by the version');
-- Editing only the legend text changes the hashes, so the old reviews no longer count (Sol R1 PR23-03).
select pg_temp.as_service();
select pg_temp.save(pg_temp.course('8c600000-0000-4000-8000-000000000000', 'base', jsonb_build_array(
  pg_temp.lesson('8c600000-0000-4000-8000-000000000011', 'diagram', jsonb_build_array(pg_temp.diagram('science', array[pg_temp.id('c_ok')],
    '[{"key": "scapula", "label": "Shoulder blade", "text": "Tilts backward as the arm rises."}]'))))));
select throws_ok($$select pg_temp.publish('8c600000-0000-4000-8000-000000000000')$$, 'P0001',
  'publish gate: lesson 8c600000-0000-4000-8000-000000000011 has a diagram block with no supporting binding review for its exact content and claims',
  'a legend edit needs a fresh binding review before it can publish');
select pg_temp.review_all('8c600000-0000-4000-8000-000000000000', 'diagram-legend-edit');
select lives_ok($$select pg_temp.keep('dg_v2', pg_temp.publish('8c600000-0000-4000-8000-000000000000'))$$, 'after fresh reviews the edited legend publishes');
select pg_temp.reset_role();
select isnt((select content_hash from public.curriculum_versions where id = pg_temp.id('dg_v2')),
  (select content_hash from public.curriculum_versions where id = pg_temp.id('dg_v1')), 'the edited legend made a new version hash');
-- A diagram row saved before the rule (no support, no text) cannot publish.
alter table public.lesson_blocks disable trigger user;
alter table public.lesson_blocks drop constraint lesson_blocks_check;
update public.lesson_blocks set support = null, content = '{"diagramId": "shoulder.rhythm", "caption": "x"}'::jsonb
where lesson_id = '8c600000-0000-4000-8000-000000000011' and kind = 'diagram';
delete from public.block_claims where block_id in (select id from public.lesson_blocks where lesson_id = '8c600000-0000-4000-8000-000000000011');
update public.lesson_blocks set content_hash = private.block_hash(kind, content) where lesson_id = '8c600000-0000-4000-8000-000000000011';
alter table public.lesson_blocks add constraint lesson_blocks_check check ((support is null) = (kind in ('heading', 'image', 'video'))) not valid;
alter table public.lesson_blocks enable trigger user;
select pg_temp.as_service();
select throws_ok($$select pg_temp.publish('8c600000-0000-4000-8000-000000000000')$$, 'P0001',
  'publish gate: lesson 8c600000-0000-4000-8000-000000000011 has a diagram without reviewable text (alt, caption, legend and support)',
  'a legacy diagram row cannot publish');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$select public.save_course_draft('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', pg_temp.course('8d700000-0000-4000-8000-000000000000', 'method',
  jsonb_build_array(pg_temp.lesson('8d700000-0000-4000-8000-000000000011', 'gym-diagram', jsonb_build_array(pg_temp.diagram('science', array[pg_temp.id('c_ok')]))))))$$,
  '22023', 'invalid course.parts[0].lessons[0].blocks[0]: method content is practice-based', 'gym diagrams are practice-based');
select lives_ok($$select public.save_course_draft('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', pg_temp.course('8d700000-0000-4000-8000-000000000000', 'method',
  jsonb_build_array(pg_temp.lesson('8d700000-0000-4000-8000-000000000011', 'gym-diagram', jsonb_build_array(pg_temp.diagram('practice-based', '{}'))))))$$,
  'a gym saves a practice-based diagram with its text');
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

-- 12. D-12: a recorded source-type override for a mislabelled guideline or position stand ------------
select pg_temp.as_service();
create function pg_temp.ps(doi text, ov jsonb, kind text default 'position_stand') returns jsonb language sql as $$
  select jsonb_build_object('kind', kind, 'title', 'Synthetic position stand', 'doi', doi, 'license', 'Synthetic test record',
    'kindOverride', ov)
$$;
create function pg_temp.ov(doc text default 'position_stand', types jsonb default '["Review", "Journal Article"]',
  why text default 'The title and the society page name it a position stand; PubMed tags it only as a review.') returns jsonb
language sql as $$ select jsonb_build_object('documentType', doc, 'justification', why, 'publicationTypes', types) $$;
select throws_ok($$select public.publisher_add_source(pg_temp.pat(), pg_temp.ps('10.5555/ov.1', pg_temp.ov(), 'systematic_review'))$$,
  '22023', 'invalid source.kindOverride: only a guideline, position stand or open foundation reference can be recorded by override',
  'an override is refused for a systematic review');
select throws_ok($$select public.publisher_add_source(pg_temp.pat(), pg_temp.ps('10.5555/ov.2',
  pg_temp.ov('position_stand', '["Randomized Controlled Trial", "Journal Article"]')))$$,
  '22023', 'invalid source.kindOverride.publicationTypes: name a study or notice type; only guidance documents and open references can be overridden',
  'an override is refused for a record PubMed types as a study');
select throws_ok($$select public.publisher_add_source(pg_temp.pat(), pg_temp.ps('10.5555/ov.3',
  pg_temp.ov('position_stand', '["Retraction of Publication"]')))$$,
  '22023', 'invalid source.kindOverride.publicationTypes: name a study or notice type; only guidance documents and open references can be overridden',
  'an override is refused for a notice');
select throws_ok($$select public.publisher_add_source(pg_temp.pat(), pg_temp.ps('10.5555/ov.4', pg_temp.ov('narrative_review')))$$,
  '22023', null, 'an override names a guidance document type');
select throws_ok($$select public.publisher_add_source(pg_temp.pat(), pg_temp.ps('10.5555/ov.5', pg_temp.ov('position_stand', '["Review"]', 'Looks right.')))$$,
  '22023', null, 'an override needs a real justification');
select throws_ok($$select public.publisher_add_source(pg_temp.pat(), pg_temp.ps('10.5555/ov.6', pg_temp.ov() - 'publicationTypes'))$$,
  '22023', null, 'an override records the publication types it overrides');
select lives_ok($$select pg_temp.keep('ov_src', public.publisher_add_source(pg_temp.pat(), pg_temp.ps('10.5555/ov.7', pg_temp.ov('care_pathway'))))$$,
  'a publisher records an override for a mislabelled guidance document');
select pg_temp.reset_role();
select results_eq(format($$select o.kind, o.document_type, o.publication_types, o.recorded_by, s.kind
  from public.source_kind_overrides o join public.sources s on s.id = o.source_id where o.source_id = %L$$, pg_temp.id('ov_src')),
  $$values ('position_stand'::text, 'care_pathway'::text, array['Review', 'Journal Article'], '00000000-0000-0000-0000-0000000000c1'::uuid, 'position_stand'::text)$$,
  'the override is stored with its document type, overridden types and the publisher who recorded it');
select is((select count(*) from private.content_audit where action = 'source_kind_override' and target = pg_temp.id('ov_src')), 1::bigint,
  'the override is logged');
select throws_ok(format($$update public.source_kind_overrides set justification = repeat('x', 50) where source_id = %L$$, pg_temp.id('ov_src')),
  'P0001', 'source_kind_overrides rows are immutable', 'an override cannot be rewritten, even by the table owner');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select throws_ok('select * from public.source_kind_overrides', '42501', null, 'learners cannot read overrides');
select pg_temp.reset_role();

-- Open foundation references: only foundation claims may cite them (plan v3 section 4).
select pg_temp.as_service();
create function pg_temp.fr(doi text, ov jsonb, license text default 'CC BY 4.0') returns jsonb language sql as $$
  select jsonb_build_object('kind', 'foundation_reference', 'title', 'Synthetic anatomy review', 'doi', doi, 'license', license)
    || case when ov is null then '{}'::jsonb else jsonb_build_object('kindOverride', ov) end
$$;
create function pg_temp.frov(doc text default 'anatomy_reference') returns jsonb language sql as $$
  select jsonb_build_object('documentType', doc, 'justification', 'An open-access anatomy review used for structure and naming only, never for effects.',
    'publicationTypes', '["Review", "Journal Article"]'::jsonb)
$$;
select throws_ok($$select public.publisher_add_source(pg_temp.pat(), pg_temp.fr('10.5555/fr.1', null))$$,
  '22023', 'invalid source.kindOverride: a foundation reference is admitted only by a recorded override',
  'a foundation reference needs a recorded override');
select throws_ok($$select public.publisher_add_source(pg_temp.pat(), pg_temp.fr('10.5555/fr.2', pg_temp.frov(), 'All rights reserved'))$$,
  '22023', 'invalid source.license: a foundation reference must carry an open licence (CC BY, CC0 or public domain)',
  'a foundation reference must be open');
select throws_ok($$select public.publisher_add_source(pg_temp.pat(), pg_temp.fr('10.5555/fr.3', pg_temp.frov('clinical_guideline')))$$,
  '22023', null, 'a foundation reference is an anatomy or nomenclature reference, not guidance');
select lives_ok($$select pg_temp.keep('fr_src', public.publisher_add_source(pg_temp.pat(), pg_temp.fr('10.5555/fr.4', pg_temp.frov())))$$,
  'an open anatomy review is admitted as a foundation reference by override');
select throws_ok(format($$select public.publisher_add_claim(pg_temp.pat(), jsonb_build_object('statement', 'Synthetic applied claim.',
  'evidenceLevel', 'x', 'population', 'x', 'sourceIds', jsonb_build_array(%L)))$$, pg_temp.id('fr_src')),
  '23514', 'only a foundation claim can cite a foundation reference', 'an applied claim cannot cite a foundation reference');
select lives_ok(format($$select pg_temp.keep('fr_claim', public.publisher_add_claim(pg_temp.pat(), jsonb_build_object('statement',
  'Synthetic anatomy claim.', 'evidenceLevel', 'Open anatomy reference', 'population', 'Adults', 'domain', 'foundation',
  'sourceIds', jsonb_build_array(%L))))$$, pg_temp.id('fr_src')), 'a foundation claim cites a foundation reference');
select is(public.publisher_claim_target(pg_temp.pat(), pg_temp.id('fr_claim')) ->> 'domain', 'foundation',
  'the claim target names the domain the reviewer must check');
select pg_temp.reset_role();
select throws_ok(format($$update public.claims set domain = 'applied' where id = %L$$, pg_temp.id('fr_claim')),
  'P0001', 'a claim''s domain is fixed when it is created', 'even the table owner cannot change a claim''s domain');
insert into public.claims (id, statement, evidence_level, population, created_by)
values ('76000000-0000-4000-8000-0000000000dd', 'Smuggled applied claim.', 'x', 'x', '00000000-0000-0000-0000-0000000000c1');
select throws_ok(format($$insert into public.claim_sources values ('76000000-0000-4000-8000-0000000000dd', %L)$$, pg_temp.id('fr_src')),
  '23514', 'only a foundation claim can cite a foundation reference', 'even the table owner cannot attach a foundation reference to an applied claim');

-- Sol R1 on #26: restricted licences, every study and notice type, and truncation.
select pg_temp.as_service();
select throws_ok($$select public.publisher_add_source(pg_temp.pat(), pg_temp.fr('10.5555/fr.5', pg_temp.frov(), 'CC BY-NC-SA 4.0'))$$,
  '22023', 'invalid source.license: a foundation reference must carry an open licence (CC BY, CC0 or public domain)',
  'a restricted CC licence is not open (PR26-01)');
select lives_ok($$select public.publisher_add_source(pg_temp.pat(), pg_temp.fr('10.5555/fr.6', pg_temp.frov(), 'CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)'))$$,
  'CC BY with a version and a link is open');
select throws_ok($$select public.publisher_add_source(pg_temp.pat(), pg_temp.ps('10.5555/ov.8', pg_temp.ov('position_stand', '["Multicenter Study", "Journal Article"]')))$$,
  '22023', 'invalid source.kindOverride.publicationTypes: name a study or notice type; only guidance documents and open references can be overridden',
  'any study type blocks an override (PR26-02)');
select throws_ok($$select public.publisher_add_source(pg_temp.pat(), pg_temp.ps('10.5555/ov.9', pg_temp.ov('position_stand', '["Expression of Concern"]')))$$,
  '22023', 'invalid source.kindOverride.publicationTypes: name a study or notice type; only guidance documents and open references can be overridden',
  'a notice blocks an override (PR26-02)');
select pg_temp.reset_role();
select throws_ok('truncate public.source_kind_overrides cascade', 'P0001', 'source_kind_overrides cannot be truncated',
  'even the table owner cannot truncate overrides (PR26-06)');

create function pg_temp.old_hash(cid uuid) returns text language sql security definer as $$
  select private.sha256(jsonb_build_object('id', c.id, 'statement', c.statement, 'evidenceLevel', c.evidence_level,
    'population', c.population, 'sourceIds', coalesce((select jsonb_agg(cs.source_id order by cs.source_id)
      from public.claim_sources cs where cs.claim_id = c.id), '[]'::jsonb)))
  from public.claims c where c.id = cid
$$;
create function pg_temp.hash_of(cid uuid) returns text language sql security definer as $$ select private.claim_hash(cid) $$;
select is(pg_temp.hash_of('76000000-0000-4000-8000-0000000000dd'), pg_temp.old_hash('76000000-0000-4000-8000-0000000000dd'),
  'an applied claim keeps the hash it had before D-12');
select isnt(pg_temp.hash_of(pg_temp.id('fr_claim')), pg_temp.old_hash(pg_temp.id('fr_claim')),
  'a foundation claim''s hash covers its domain');

select pg_temp.as_service();
select throws_ok($$select public.publisher_add_source(pg_temp.pat(), pg_temp.fr('10.5555/fr.7', pg_temp.frov(), 'CC BY 4.0; non-commercial use only'))$$,
  '22023', 'invalid source.license: a foundation reference must carry an open licence (CC BY, CC0 or public domain)',
  'a restriction after punctuation is not dropped (PR26-01 R2)');
select throws_ok($$select public.publisher_add_source(pg_temp.pat(), pg_temp.fr('10.5555/fr.8', pg_temp.frov(), 'CC BY (NC-SA)'))$$,
  '22023', 'invalid source.license: a foundation reference must carry an open licence (CC BY, CC0 or public domain)',
  'a parenthesised restriction is not dropped (PR26-01 R2)');
select throws_ok($$select public.publisher_add_source(pg_temp.pat(), pg_temp.fr('10.5555/fr.9', pg_temp.frov(), 'CC BY 4.0 (https://creativecommons.org/licenses/by-nc/4.0/)'))$$,
  '22023', 'invalid source.license: a foundation reference must carry an open licence (CC BY, CC0 or public domain)',
  'a licence URL must match an open licence');
select pg_temp.reset_role();

select * from finish();
rollback;
