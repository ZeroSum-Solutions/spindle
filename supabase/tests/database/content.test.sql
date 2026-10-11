-- Phase 2 acceptance: the publish gate, immutable versions, assignments and
-- progress, D-07 global-row and storage checks. All content is synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(124);

-- Fixtures -------------------------------------------------------------------
-- Gym A: Alice owner, Lee lead, Tess and Tom trainers. Gym B: Bob owner.
-- Pat is a content publisher; Mal is a signed-in user who is not.
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'alice@a.test', now()),
  ('00000000-0000-0000-0000-0000000000a2', 'lee@a.test', now()),
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
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-0000000000a2', 'lead'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-0000000000a3', 'trainer'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-0000000000a4', 'trainer'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-0000000000b1', 'owner');
insert into private.content_publishers (user_id, note) values ('00000000-0000-0000-0000-0000000000c1', 'test publisher');

create function pg_temp.act_as(uid text) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.as_service() returns void language sql as $$
  select set_config('role', 'service_role', true),
         set_config('request.jwt.claims', '{"role":"service_role"}', true);
$$;
create function pg_temp.reset_role() returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;
create function pg_temp.id(name text) returns uuid language sql as $$ select current_setting('test.' || name)::uuid $$;
create function pg_temp.keep(name text, value uuid) returns uuid language sql as $$
  select set_config('test.' || name, value::text, true)::uuid
$$;

create function pg_temp.sci(body text, claims uuid[]) returns jsonb language sql as $$
  select jsonb_build_object('kind', 'paragraph', 'content', body, 'support', 'science', 'claimIds', to_jsonb(claims))
$$;
create function pg_temp.prac(body text) returns jsonb language sql as $$
  select jsonb_build_object('kind', 'paragraph', 'content', body, 'support', 'practice-based', 'claimIds', '[]'::jsonb)
$$;
create function pg_temp.quiz(explanation text, support text, claims uuid[]) returns jsonb language sql as $$
  select jsonb_build_object('kind', 'quiz', 'support', support, 'claimIds', to_jsonb(claims), 'content',
    jsonb_build_object('prompt', 'How many rotator cuff muscles are there?', 'options', jsonb_build_array('Three', 'Four'),
      'answerIndex', 1, 'explanation', explanation))
$$;
create function pg_temp.lesson(lid text, slug text, blocks jsonb) returns jsonb language sql as $$
  select jsonb_build_object('id', lid, 'slug', slug, 'title', 'Lesson ' || slug, 'summary', 'Synthetic fixture.',
    'durationMinutes', 5, 'format', 'article', 'objectives', jsonb_build_array('Name the parts'),
    'anatomyIds', jsonb_build_array('UBERON:0001467'), 'blocks', blocks, 'media', '[]'::jsonb, 'resources', '[]'::jsonb)
$$;
create function pg_temp.course(cid text, layer text, lessons jsonb, title text default 'Synthetic course') returns jsonb
language sql as $$
  select jsonb_build_object('id', cid, 'slug', 'course-' || left(cid, 2), 'layer', layer, 'title', title,
    'subtitle', 'Fixture', 'description', 'Synthetic test content.', 'level', 'foundation', 'outcomes', '[]'::jsonb,
    'parts', jsonb_build_array(jsonb_build_object('id', left(cid, 34) || 'f1', 'ordinal', 1, 'title', 'Part one',
      'summary', '', 'lessons', lessons)))
$$;
create function pg_temp.review_course(cid uuid, verdict text) returns void language plpgsql as $$
declare
  b uuid;
begin
  for b in select lb.id from public.lesson_blocks lb join public.lessons l on l.id = lb.lesson_id
           where l.course_id = cid and lb.support = 'science' loop
    perform public.publisher_review_block('00000000-0000-0000-0000-0000000000c1', b, jsonb_build_object('verdict', verdict));
  end loop;
end;
$$;
create function pg_temp.receipt(faithfulness text) returns jsonb language sql as $$
  select jsonb_build_object('existenceCheckedAt', '2026-10-01T00:00:00Z', 'faithfulness', faithfulness,
    'retractionCheckedAt', '2026-10-01T00:00:00Z')
$$;
create function pg_temp.approve(claim uuid) returns uuid language sql as $$
  select public.publisher_review_claim('00000000-0000-0000-0000-0000000000c1', claim,
    jsonb_build_object('decision', 'approved', 'expiresAt', to_char(now() + interval '1 year', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'receipt', pg_temp.receipt('faithful')))
$$;

-- Evidence through the publisher path (service role, named publisher actor).
select pg_temp.as_service();
select pg_temp.keep('s1', public.publisher_add_source('00000000-0000-0000-0000-0000000000c1',
  '{"kind": "systematic_review", "title": "Synthetic review one", "doi": "10.5555/SYNTH.1", "license": "CC BY 4.0"}'));
select pg_temp.keep('s2', public.publisher_add_source('00000000-0000-0000-0000-0000000000c1',
  '{"kind": "meta_analysis", "title": "Synthetic review two", "pmid": "123", "license": "CC BY 4.0"}'));
select pg_temp.keep('s3', public.publisher_add_source('00000000-0000-0000-0000-0000000000c1',
  '{"kind": "textbook", "title": "Synthetic textbook", "url": "https://example.org/book", "locator": "2e p. 1", "license": "link only"}'));
create function pg_temp.claim(statement text, source uuid) returns uuid language sql as $$
  select public.publisher_add_claim('00000000-0000-0000-0000-0000000000c1', jsonb_build_object(
    'statement', statement, 'evidenceLevel', 'synthetic', 'population', 'synthetic adults', 'sourceIds', jsonb_build_array(source)))
$$;
select pg_temp.keep('c_ok', pg_temp.claim('Synthetic claim about the cuff.', pg_temp.id('s1')));
select pg_temp.keep('c_other', pg_temp.claim('Synthetic claim about the hip.', pg_temp.id('s3')));
select pg_temp.keep('c_exp', pg_temp.claim('Synthetic claim that expired.', pg_temp.id('s3')));
select pg_temp.keep('c_unrev', pg_temp.claim('Synthetic claim never reviewed.', pg_temp.id('s3')));
select pg_temp.keep('c_ret', pg_temp.claim('Synthetic claim from a retracted paper.', pg_temp.id('s2')));
select pg_temp.keep('c_rej', pg_temp.claim('Synthetic claim later withdrawn.', pg_temp.id('s3')));
select pg_temp.approve(pg_temp.id('c_ok'));
select pg_temp.approve(pg_temp.id('c_other'));
select pg_temp.approve(pg_temp.id('c_ret'));
select pg_temp.approve(pg_temp.id('c_rej'));
select public.publisher_review_claim('00000000-0000-0000-0000-0000000000c1', pg_temp.id('c_rej'),
  jsonb_build_object('decision', 'rejected', 'receipt', pg_temp.receipt('unfaithful')));
select pg_temp.reset_role();
-- Approvals cannot be backdated through the API, so the expired one is inserted directly.
insert into public.claim_reviews (claim_id, decision, expires_at, receipt, reviewer)
values (pg_temp.id('c_exp'), 'approved', now() - interval '1 day', pg_temp.receipt('faithful'),
        '00000000-0000-0000-0000-0000000000c1');

-- Global course G, v1: L1 (heading, science paragraph, science quiz), L2 (science), L3 (practice).
create function pg_temp.g_tree(l2_text text, with_l3 boolean, title text) returns jsonb language sql as $$
  select pg_temp.course('61000000-0000-4000-8000-000000000000', 'base',
    jsonb_build_array(
      pg_temp.lesson('61000000-0000-4000-8000-000000000011', 'cuff',
        jsonb_build_array('{"kind": "heading", "content": "The cuff"}'::jsonb,
          pg_temp.sci('The rotator cuff is four muscles.', array[pg_temp.id('c_ok')]),
          pg_temp.quiz('Four muscles form the cuff.', 'science', array[pg_temp.id('c_ok')]))),
      pg_temp.lesson('61000000-0000-4000-8000-000000000012', 'rhythm',
        jsonb_build_array(pg_temp.sci(l2_text, array[pg_temp.id('c_ok')]))))
    || case when with_l3 then jsonb_build_array(pg_temp.lesson('61000000-0000-4000-8000-000000000013', 'cues',
         jsonb_build_array(pg_temp.prac('Cue a tall posture.'))))
       else jsonb_build_array(pg_temp.lesson('61000000-0000-4000-8000-000000000014', 'drills',
         jsonb_build_array(pg_temp.prac('Try wall slides.')))) end,
    title)
$$;
select pg_temp.as_service();
select public.publisher_save_course_draft('00000000-0000-0000-0000-0000000000c1',
  pg_temp.g_tree('The scapula moves with the arm.', true, 'Synthetic course'));
select pg_temp.review_course('61000000-0000-4000-8000-000000000000', 'supported');

-- 1-3: the happy path and idempotent publishing
select lives_ok($$select pg_temp.keep('g_v1', public.publisher_publish_course('00000000-0000-0000-0000-0000000000c1',
  '61000000-0000-4000-8000-000000000000'))$$, 'a fully reviewed global course publishes');
select is(public.publisher_publish_course('00000000-0000-0000-0000-0000000000c1', '61000000-0000-4000-8000-000000000000'),
  pg_temp.id('g_v1'), 'publishing an unchanged tree returns the same version');
select pg_temp.reset_role();
select is((select version_number from public.curriculum_versions where id = pg_temp.id('g_v1')), 1, 'the first version is number 1');

-- 4-7: hashes are sha256 over the snapshot exactly as stored
select is((select content_hash from public.curriculum_versions where id = pg_temp.id('g_v1')),
  (select encode(extensions.digest(snapshot::text, 'sha256'), 'hex') from public.curriculum_versions where id = pg_temp.id('g_v1')),
  'the version hash is sha256 of the snapshot text');
select is((select count(*) from public.version_lessons vl
  join public.curriculum_versions v on v.id = vl.version_id,
  jsonb_path_query(v.snapshot, '$.parts[*].lessons[*]') l
  where v.id = pg_temp.id('g_v1') and (l ->> 'id')::uuid = vl.lesson_id
    and vl.content_hash = encode(extensions.digest(l::text, 'sha256'), 'hex')), 3::bigint,
  'each lesson hash is sha256 of that lesson in the snapshot');
select is((select snapshot #> '{parts,0,lessons,0,blocks,1,claimIds}' from public.curriculum_versions where id = pg_temp.id('g_v1')),
  jsonb_build_array(pg_temp.id('c_ok')), 'the snapshot keeps claim bindings');
select is((select count(*) from public.version_claims where version_id = pg_temp.id('g_v1')), 2::bigint,
  'version_claims lists each cited (lesson, claim) pair');

-- 8-20: publish gate negatives (course N) ----------------------------------------
create function pg_temp.save_n(blocks jsonb) returns uuid language sql as $$
  select public.publisher_save_course_draft('00000000-0000-0000-0000-0000000000c1',
    pg_temp.course('62000000-0000-4000-8000-000000000000', 'base',
      jsonb_build_array(pg_temp.lesson('62000000-0000-4000-8000-000000000011', 'neg', blocks))))
$$;
create function pg_temp.gate(reason text) returns text language sql as $$
  select format('publish gate: lesson 62000000-0000-4000-8000-000000000011 %s', reason)
$$;
create function pg_temp.publish_n() returns uuid language sql as $$
  select public.publisher_publish_course('00000000-0000-0000-0000-0000000000c1', '62000000-0000-4000-8000-000000000000')
$$;
select pg_temp.as_service();
-- The same reviewed sentence, now citing a different (approved) claim.
select pg_temp.save_n(jsonb_build_array(pg_temp.sci('The rotator cuff is four muscles.', array[pg_temp.id('c_other')])));
select throws_ok('select pg_temp.publish_n()', 'P0001',
  pg_temp.gate('has a paragraph block with no supporting binding review for its exact content and claims'),
  'an approved but unrelated citation fails the gate');
select pg_temp.review_course('62000000-0000-4000-8000-000000000000', 'unsupported');
select throws_ok('select pg_temp.publish_n()', 'P0001',
  pg_temp.gate('has a paragraph block with no supporting binding review for its exact content and claims'),
  'a binding review that says unsupported fails the gate');
-- Adding a supported claim to an approved set changes the set, so it needs its own review.
select pg_temp.save_n(jsonb_build_array(pg_temp.sci('The rotator cuff is four muscles.',
  array[pg_temp.id('c_ok'), pg_temp.id('c_other')])));
select throws_ok('select pg_temp.publish_n()', 'P0001',
  pg_temp.gate('has a paragraph block with no supporting binding review for its exact content and claims'),
  'padding a reviewed block with an extra claim fails the gate');
select pg_temp.save_n(jsonb_build_array(pg_temp.quiz('Four muscles, and they move the hip.', 'science', array[pg_temp.id('c_ok')])));
select throws_ok('select pg_temp.publish_n()', 'P0001',
  pg_temp.gate('has a quiz block with no supporting binding review for its exact content and claims'),
  'a distorted quiz explanation fails the gate');
select pg_temp.save_n(jsonb_build_array(pg_temp.sci('Expired fact.', array[pg_temp.id('c_exp')])));
select throws_ok('select pg_temp.publish_n()', 'P0001',
  pg_temp.gate(format('cites claim %s, which is expired', pg_temp.id('c_exp'))), 'an expired claim fails the gate');
select is(public.publisher_record_retraction('00000000-0000-0000-0000-0000000000c1', pg_temp.id('s2'),
  '{"origin": "crossref", "reference": "10.5555/retraction.2", "detectedAt": "2026-10-09T12:00:00Z"}'), 0,
  'a retraction nobody published yet flags no versions');
select pg_temp.save_n(jsonb_build_array(pg_temp.sci('Retracted fact.', array[pg_temp.id('c_ret')])));
select pg_temp.review_course('62000000-0000-4000-8000-000000000000', 'supported');
select throws_ok('select pg_temp.publish_n()', 'P0001',
  pg_temp.gate(format('cites claim %s, which is retracted', pg_temp.id('c_ret'))),
  'a retracted claim fails the gate even with a supporting binding review');
select pg_temp.save_n(jsonb_build_array(pg_temp.sci('Unreviewed fact.', array[pg_temp.id('c_unrev')])));
select throws_ok('select pg_temp.publish_n()', 'P0001',
  pg_temp.gate(format('cites claim %s, which is unreviewed', pg_temp.id('c_unrev'))), 'an unreviewed claim fails the gate');
select pg_temp.save_n(jsonb_build_array(pg_temp.sci('Withdrawn fact.', array[pg_temp.id('c_rej')])));
select throws_ok('select pg_temp.publish_n()', 'P0001',
  pg_temp.gate(format('cites claim %s, which is rejected', pg_temp.id('c_rej'))),
  'a claim whose latest review rejects it fails the gate');

-- The gate does not trust the draft writer: rows written around the validator still fail.
select pg_temp.save_n(jsonb_build_array(pg_temp.sci('The rotator cuff is four muscles.', array[pg_temp.id('c_ok')])));
select lives_ok('select pg_temp.publish_n()', 'the reviewed sentence and claim publish in another course');
select pg_temp.reset_role();
update public.lesson_blocks set content = '"The rotator cuff is five muscles."'
where lesson_id = '62000000-0000-4000-8000-000000000011';
select pg_temp.as_service();
select throws_ok('select pg_temp.publish_n()', 'P0001',
  pg_temp.gate('has a block whose hash does not match its content'), 'a block edited behind the hash fails the gate');
select pg_temp.save_n(jsonb_build_array(pg_temp.prac('Cue the shoulder blade.')));
select pg_temp.reset_role();
insert into public.block_claims (block_id, claim_id)
select id, pg_temp.id('c_ok') from public.lesson_blocks where lesson_id = '62000000-0000-4000-8000-000000000011';
select pg_temp.as_service();
select throws_ok('select pg_temp.publish_n()', 'P0001',
  pg_temp.gate('has a practice-based block carrying claims'), 'a practice-based block cannot carry claims');
select pg_temp.save_n(jsonb_build_array(pg_temp.sci('Science without a claim.', array[pg_temp.id('c_ok')])));
select pg_temp.reset_role();
delete from public.block_claims where block_id in
  (select id from public.lesson_blocks where lesson_id = '62000000-0000-4000-8000-000000000011');
select pg_temp.as_service();
select throws_ok('select pg_temp.publish_n()', 'P0001',
  pg_temp.gate('has a science block without a claim'), 'a science block without a claim fails the gate');
select pg_temp.reset_role();

-- 21-32: input validation at the JSON boundary --------------------------------------
select pg_temp.as_service();
select throws_ok($$select pg_temp.save_n(jsonb_build_array(pg_temp.quiz('Practice quiz.', 'practice-based', '{}')))$$,
  '22023', 'invalid course.parts[0].lessons[0].blocks[0]: a base-layer quiz explanation must bind claims',
  'a base-layer quiz must bind claims');
select throws_ok($$select public.publisher_save_course_draft('00000000-0000-0000-0000-0000000000c1', '[]')$$,
  '22023', 'invalid course: must be an object', 'a course must be a JSON object');
select throws_ok($$select public.publisher_save_course_draft('00000000-0000-0000-0000-0000000000c1',
  jsonb_set(pg_temp.course('62000000-0000-4000-8000-000000000000', 'base',
    jsonb_build_array(pg_temp.lesson('62000000-0000-4000-8000-000000000011', 'neg', jsonb_build_array(pg_temp.prac('x'))))),
    '{parts,0,lessons,0,claimIDs}', '[]'))$$,
  '22023', 'invalid course.parts[0].lessons[0]: unknown key claimIDs', 'unknown keys are refused');
select throws_ok($$select pg_temp.save_n(jsonb_build_array(jsonb_set(pg_temp.quiz('x', 'science', array[pg_temp.id('c_ok')]),
  '{content,answerIndex}', '2')))$$,
  '22023', 'invalid course.parts[0].lessons[0].blocks[0].content.answerIndex: must be an integer from 0 to 1',
  'a quiz answer outside its options is refused');
select throws_ok($$select pg_temp.save_n(jsonb_build_array(jsonb_set(pg_temp.sci('x', array[pg_temp.id('c_ok')]),
  '{claimIds}', '["not-a-uuid"]')))$$,
  '22023', 'invalid course.parts[0].lessons[0].blocks[0].claimIds[0]: must be a lowercase uuid', 'claim ids must be uuids');
select throws_ok($$select pg_temp.save_n(jsonb_build_array(pg_temp.sci('x', array['99999999-9999-4999-8999-999999999999'::uuid])))$$,
  '22023', 'invalid course: unknown claim 99999999-9999-4999-8999-999999999999', 'unknown claims are refused');
select throws_ok($$select pg_temp.save_n(jsonb_build_array(jsonb_build_object('kind', 'image', 'content',
  jsonb_build_object('kind', 'image', 'src', 'javascript:alert(1)', 'alt', 'x', 'caption', '', 'provenanceId', 'p1'))))$$,
  '22023', 'invalid course.parts[0].lessons[0].blocks[0].content.src: must be an https URL or a site path',
  'script URLs are refused as media');
select throws_ok($$select pg_temp.save_n(jsonb_build_array(jsonb_build_object('kind', 'image', 'content',
  jsonb_build_object('kind', 'image', 'src', '//evil.test/x.png', 'alt', 'x', 'caption', '', 'provenanceId', 'p1'))))$$,
  '22023', 'invalid course.parts[0].lessons[0].blocks[0].content.src: must be an https URL or a site path',
  'protocol-relative URLs are refused as media');
select throws_ok($$select pg_temp.save_n(jsonb_build_array(jsonb_build_object('kind', 'image', 'content',
  jsonb_build_object('kind', 'image', 'src', '/media/../admin', 'alt', 'x', 'caption', '', 'provenanceId', 'p1'))))$$,
  '22023', 'invalid course.parts[0].lessons[0].blocks[0].content.src: must be an https URL or a site path',
  'dot segments are refused in media paths');
select throws_ok($$select public.publisher_add_claim('00000000-0000-0000-0000-0000000000c1',
  '{"statement": "x", "evidenceLevel": "x", "population": "x"}')$$,
  '22023', 'invalid claim.sourceIds: is required', 'a claim needs sources');
select throws_ok(format($$select public.publisher_review_claim('00000000-0000-0000-0000-0000000000c1', %L,
  jsonb_build_object('decision', 'approved', 'expiresAt', '2027-01-01T00:00:00Z', 'receipt', pg_temp.receipt('unfaithful')))$$,
  pg_temp.id('c_unrev')),
  '22023', 'invalid review.receipt.faithfulness: an approval needs a faithful claim', 'an unfaithful claim cannot be approved');
select throws_ok(format($$select public.publisher_review_claim('00000000-0000-0000-0000-0000000000c1', %L,
  jsonb_build_object('decision', 'approved', 'expiresAt', '2040-01-01T00:00:00Z', 'receipt', pg_temp.receipt('faithful')))$$,
  pg_temp.id('c_unrev')),
  '22023', 'invalid review.expiresAt: must be in the future and within five years', 'approvals expire within five years');
select throws_ok(format($$select public.publisher_record_retraction('00000000-0000-0000-0000-0000000000c1', %L,
  '{"origin": "rumour", "reference": "x", "detectedAt": "2026-10-09T12:00:00Z"}')$$, pg_temp.id('s1')),
  '22023', 'invalid notice.origin: must be one of crossref, manual', 'retraction notices are validated');
select pg_temp.reset_role();

-- 33-48: D-07: tenants cannot write global rows; the publisher path checks its actor -----
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c2');
select throws_ok($$select public.publisher_add_claim('00000000-0000-0000-0000-0000000000c1',
  '{"statement": "x", "evidenceLevel": "x", "population": "x", "sourceIds": []}')$$,
  '42501', null, 'a signed-in user cannot call the publisher path, even naming a real publisher');
select throws_ok($$insert into public.claims (statement, evidence_level, population, created_by)
  values ('x', 'x', 'x', '00000000-0000-0000-0000-0000000000c2')$$, '42501', null, 'a signed-in user cannot insert claims');
select throws_ok($$insert into public.courses (id, layer, slug, title, subtitle, description, level, outcomes, updated_by)
  values ('65000000-0000-4000-8000-000000000000', 'base', 'rogue', 'x', 'x', 'x', 'foundation', '[]', '00000000-0000-0000-0000-0000000000c2')$$,
  '42501', null, 'a signed-in user cannot insert global courses');
select throws_ok($$select * from public.claim_reviews$$, '42501', null, 'claim reviews are server-side only');
select throws_ok($$select * from public.binding_reviews$$, '42501', null, 'binding reviews are server-side only');
select throws_ok($$select * from private.content_audit$$, '42501', null, 'the audit log is server-side only');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select throws_ok($$select public.save_course_draft('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  pg_temp.course('65000000-0000-4000-8000-000000000000', 'base',
    jsonb_build_array(pg_temp.lesson('65000000-0000-4000-8000-000000000011', 'xx', jsonb_build_array(pg_temp.prac('x'))))))$$,
  '42501', 'gyms author method courses only; base and modality content is global', 'a lead cannot author base content');
select throws_ok($$select public.save_course_draft(null,
  pg_temp.course('65000000-0000-4000-8000-000000000000', 'base',
    jsonb_build_array(pg_temp.lesson('65000000-0000-4000-8000-000000000011', 'xx', jsonb_build_array(pg_temp.prac('x'))))))$$,
  '42501', 'only owners and leads of this org can author or assign content', 'a lead cannot write a global (null org) course');
select throws_ok($$select public.publish_course('61000000-0000-4000-8000-000000000000')$$,
  '42501', 'only owners and leads of this org can author or assign content', 'a lead cannot publish a global course');
select pg_temp.as_service();
select throws_ok($$select public.publisher_add_source('00000000-0000-0000-0000-0000000000c2',
  '{"kind": "textbook", "title": "x", "url": "https://example.org", "license": "x"}')$$,
  '42501', 'actor is not a content publisher', 'the service path refuses an actor who is not a publisher');
select throws_ok($$select public.publisher_publish_course(null, '61000000-0000-4000-8000-000000000000')$$,
  '42501', 'actor is not a content publisher', 'the service path refuses a missing actor');
select throws_ok($$select public.save_course_draft('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '{}')$$,
  '42501', null, 'the service role cannot call tenant authoring functions');
select throws_ok($$insert into public.courses (id, layer, slug, title, subtitle, description, level, outcomes, updated_by)
  values ('65000000-0000-4000-8000-000000000000', 'base', 'rogue', 'x', 'x', 'x', 'foundation', '[]', '00000000-0000-0000-0000-0000000000c1')$$,
  '42501', null, 'the service role cannot write global rows directly (no audit, no gate)');
select throws_ok(format($$update public.curriculum_versions set snapshot = '{}' where id = %L$$, pg_temp.id('g_v1')),
  '42501', null, 'the service role cannot update a published version');
select pg_temp.reset_role();
set local role anon;
select throws_ok($$select public.complete_lesson('99999999-9999-4999-8999-999999999999', '99999999-9999-4999-8999-999999999999')$$,
  '42501', null, 'anon cannot call learner functions');
select throws_ok($$select * from public.curriculum_versions$$, '42501', null, 'anon cannot read versions');
reset role;

-- 49-56: gym method courses -------------------------------------------------------------
create function pg_temp.method_course(cid text, blocks jsonb) returns jsonb language sql as $$
  select pg_temp.course(cid, 'method', jsonb_build_array(pg_temp.lesson(left(cid, 34) || '11', 'method', blocks)))
$$;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select throws_ok($$select public.save_course_draft('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  pg_temp.method_course('63000000-0000-4000-8000-000000000000',
    jsonb_build_array(pg_temp.sci('Our method is proven.', array[pg_temp.id('c_ok')]))))$$,
  '22023', 'invalid course.parts[0].lessons[0].blocks[0]: method content is practice-based',
  'a gym cannot attach science claims to method content');
select lives_ok($$select public.save_course_draft('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  pg_temp.method_course('63000000-0000-4000-8000-000000000000',
    jsonb_build_array(pg_temp.prac('Greet every client by name.'), pg_temp.quiz('House rule.', 'practice-based', '{}'))))$$,
  'a lead saves a practice-based method course');
select lives_ok($$select pg_temp.keep('m_v1', public.publish_course('63000000-0000-4000-8000-000000000000'))$$,
  'a lead publishes the method course');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select throws_ok($$select public.publish_course('63000000-0000-4000-8000-000000000000')$$,
  '42501', 'only owners and leads of this org can author or assign content', 'a trainer cannot publish');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select throws_ok($$select public.save_course_draft('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  pg_temp.method_course('66000000-0000-4000-8000-000000000000', jsonb_build_array(pg_temp.prac('x'))))$$,
  '42501', 'only owners and leads of this org can author or assign content', 'Bob cannot author in gym A');
select throws_ok($$select public.save_course_draft('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  pg_temp.method_course('63000000-0000-4000-8000-000000000000', jsonb_build_array(pg_temp.prac('Hijack.'))))$$,
  '42501', 'course belongs to another owner or layer', 'Bob cannot take over gym A''s course id');
select public.save_course_draft('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  pg_temp.method_course('64000000-0000-4000-8000-000000000000', jsonb_build_array(pg_temp.prac('Gym B way.'))));
select pg_temp.keep('b_v1', public.publish_course('64000000-0000-4000-8000-000000000000'));
select pg_temp.as_service();
select throws_ok($$select public.publisher_save_course_draft('00000000-0000-0000-0000-0000000000c1',
  pg_temp.course('63000000-0000-4000-8000-000000000000', 'base',
    jsonb_build_array(pg_temp.lesson('63000000-0000-4000-8000-000000000011', 'method', jsonb_build_array(pg_temp.prac('x'))))))$$,
  '42501', 'course belongs to another owner or layer', 'the publisher path cannot take over a gym''s course');
select pg_temp.reset_role();
-- A science block written around the validator still cannot publish as method content.
insert into public.lesson_blocks (lesson_id, org_id, ordinal, kind, support, content, content_hash)
values ('63000000-0000-4000-8000-000000000011', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 9, 'paragraph', 'science',
  '"Proven."', private.block_hash('paragraph', '"Proven."'));
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select throws_ok($$select public.publish_course('63000000-0000-4000-8000-000000000000')$$, 'P0001',
  'publish gate: lesson 63000000-0000-4000-8000-000000000011 is gym method content, which is practice-based',
  'the gate refuses science in method content');
select pg_temp.reset_role();
delete from public.lesson_blocks where lesson_id = '63000000-0000-4000-8000-000000000011' and ordinal = 9;

-- 57-62: who sees what ----------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select is((select count(*) from public.curriculum_versions), 3::bigint, 'Tess sees the global versions (G, N) and her gym''s');
select is((select count(*) from public.courses), 0::bigint, 'a trainer sees no drafts');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select results_eq('select id from public.courses', $$values ('63000000-0000-4000-8000-000000000000'::uuid)$$,
  'a lead sees only her gym''s drafts, not global drafts');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select is((select count(*) from public.curriculum_versions where org_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0::bigint,
  'Bob cannot see gym A''s versions');
select is((select count(*) from public.version_lessons where org_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0::bigint,
  'Bob cannot see gym A''s version lessons');
select is((select count(*) from public.lessons), 1::bigint, 'Bob sees only his own gym''s draft lessons');

-- 63-81: assignments, idempotent completion, credit lineage -----------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select pg_temp.keep('tess_v1', public.assign_version('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', pg_temp.id('g_v1'),
  '00000000-0000-0000-0000-0000000000a3'));
select pg_temp.keep('tom_v1', public.assign_version('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', pg_temp.id('g_v1'),
  '00000000-0000-0000-0000-0000000000a4'));
select is(public.assign_version('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', pg_temp.id('g_v1'), '00000000-0000-0000-0000-0000000000a3'),
  pg_temp.id('tess_v1'), 'assigning twice returns the same assignment');
select throws_ok(format($$select public.assign_version('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', %L, '00000000-0000-0000-0000-0000000000a3')$$,
  pg_temp.id('b_v1')), 'P0002', 'no such version', 'gym A cannot assign gym B''s version');
select throws_ok(format($$select public.assign_version('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', %L, '00000000-0000-0000-0000-0000000000b1')$$,
  pg_temp.id('g_v1')), 'P0002', 'not a member of this org', 'gym A cannot assign to a non-member');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select throws_ok(format($$select public.assign_version('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', %L, '00000000-0000-0000-0000-0000000000a3')$$,
  pg_temp.id('m_v1')), '42501', 'only owners and leads of this org can author or assign content', 'a trainer cannot assign');
select pg_temp.keep('tess_l1', public.complete_lesson(pg_temp.id('tess_v1'), '61000000-0000-4000-8000-000000000011'));
select is(public.complete_lesson(pg_temp.id('tess_v1'), '61000000-0000-4000-8000-000000000011'), pg_temp.id('tess_l1'),
  'completing a lesson twice returns the same completion');
select is((select count(*) from public.lesson_completions where user_id = '00000000-0000-0000-0000-0000000000a3'), 1::bigint,
  'a double completion counts once');
select throws_ok(format($$select public.complete_lesson(%L, '63000000-0000-4000-8000-000000000011')$$, pg_temp.id('tess_v1')),
  'P0002', 'lesson is not in this version', 'a lesson outside the version cannot be completed');
select throws_ok(format($$select public.complete_lesson(%L, '61000000-0000-4000-8000-000000000011')$$, pg_temp.id('tom_v1')),
  'P0002', 'no such assignment', 'Tess cannot complete Tom''s assignment');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a4');
select public.complete_lesson(pg_temp.id('tom_v1'), l) from (values
  ('61000000-0000-4000-8000-000000000011'::uuid), ('61000000-0000-4000-8000-000000000012'), ('61000000-0000-4000-8000-000000000013')) v (l);
select is((select count(*) from public.lesson_completions), 3::bigint, 'Tom sees only his own three completions');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select throws_ok(format($$select public.complete_lesson(%L, '61000000-0000-4000-8000-000000000011')$$, pg_temp.id('tess_v1')),
  'P0002', 'no such assignment', 'Bob cannot complete a gym A assignment');
select is((select count(*) from public.lesson_completions) + (select count(*) from public.assignments), 0::bigint,
  'Bob sees no gym A progress');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select is((select count(*) from public.lesson_completions), 4::bigint, 'a lead sees her gym''s progress');

-- v2: L1 unchanged, L2 rewritten, L3 removed, L4 added.
select pg_temp.as_service();
select public.publisher_save_course_draft('00000000-0000-0000-0000-0000000000c1',
  pg_temp.g_tree('The scapula rotates upward as the arm rises.', false, 'Synthetic course'));
select pg_temp.review_course('61000000-0000-4000-8000-000000000000', 'supported');
select pg_temp.keep('g_v2', public.publisher_publish_course('00000000-0000-0000-0000-0000000000c1', '61000000-0000-4000-8000-000000000000'));
select pg_temp.reset_role();
select is((select array_agg(lesson_id order by lesson_id) from public.version_lessons a
  where a.version_id = pg_temp.id('g_v2') and a.content_hash = (select b.content_hash from public.version_lessons b
    where b.version_id = pg_temp.id('g_v1') and b.lesson_id = a.lesson_id)),
  array['61000000-0000-4000-8000-000000000011'::uuid], 'only the untouched lesson keeps its hash in v2');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select pg_temp.keep('tess_v2', public.assign_version('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', pg_temp.id('g_v2'), '00000000-0000-0000-0000-0000000000a3'));
select pg_temp.keep('tom_v2', public.assign_version('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', pg_temp.id('g_v2'), '00000000-0000-0000-0000-0000000000a4'));
select pg_temp.reset_role();
select results_eq(format($$select lesson_id, origin_completion_id from public.lesson_completions
  where version_id = %L and user_id = '00000000-0000-0000-0000-0000000000a3'$$, pg_temp.id('g_v2')),
  format($$values ('61000000-0000-4000-8000-000000000011'::uuid, %L::uuid)$$, pg_temp.id('tess_l1')),
  'a partial learner keeps credit for the unchanged lesson, linked to the original completion');
select is((select array_agg(lesson_id order by lesson_id) from public.lesson_completions
  where version_id = pg_temp.id('g_v2') and user_id = '00000000-0000-0000-0000-0000000000a4'),
  array['61000000-0000-4000-8000-000000000011'::uuid],
  'a full learner gets credit only for unchanged lessons: the changed one reopens and the removed one drops out');
select is((select count(*) from public.lesson_completions where version_id = pg_temp.id('g_v1')), 4::bigint,
  'v1 completions stay tied to v1');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select is(public.complete_lesson(pg_temp.id('tess_v2'), '61000000-0000-4000-8000-000000000011'),
  (select id from public.lesson_completions where version_id = pg_temp.id('g_v2') and lesson_id = '61000000-0000-4000-8000-000000000011'),
  'completing a carried lesson again returns the carried credit');
select pg_temp.keep('tess_v2_l2', public.complete_lesson(pg_temp.id('tess_v2'), '61000000-0000-4000-8000-000000000012'));

-- v3: only the course title changes, so every lesson hash carries over.
select pg_temp.as_service();
select public.publisher_save_course_draft('00000000-0000-0000-0000-0000000000c1',
  pg_temp.g_tree('The scapula rotates upward as the arm rises.', false, 'Synthetic course, revised'));
select pg_temp.keep('g_v3', public.publisher_publish_course('00000000-0000-0000-0000-0000000000c1', '61000000-0000-4000-8000-000000000000'));
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select pg_temp.keep('tess_v3', public.assign_version('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', pg_temp.id('g_v3'), '00000000-0000-0000-0000-0000000000a3'));
select pg_temp.reset_role();
select results_eq(format($$select lesson_id, origin_completion_id from public.lesson_completions
  where version_id = %L order by lesson_id$$, pg_temp.id('g_v3')),
  format($$values ('61000000-0000-4000-8000-000000000011'::uuid, %L::uuid), ('61000000-0000-4000-8000-000000000012'::uuid, %L::uuid)$$,
    pg_temp.id('tess_l1'), pg_temp.id('tess_v2_l2')),
  'carried credit always points at the original completion, never at another carried row');

-- 82-95: immutability and service-role reassignment -----------------------------------
select throws_ok(format($$update public.curriculum_versions set snapshot = '{}' where id = %L$$, pg_temp.id('g_v1')),
  'P0001', 'curriculum_versions rows are immutable', 'even the table owner cannot change a published version');
select throws_ok(format($$delete from public.curriculum_versions where id = %L$$, pg_temp.id('g_v1')),
  'P0001', 'curriculum_versions rows are immutable', 'a global version cannot be deleted');
select throws_ok(format($$update public.version_lessons set content_hash = repeat('0', 64) where version_id = %L$$, pg_temp.id('g_v1')),
  'P0001', 'version_lessons rows are immutable', 'a published lesson hash cannot change');
select throws_ok($$update public.claims set statement = 'changed'$$, 'P0001', 'claims rows are immutable', 'claims are append-only');
select throws_ok($$delete from public.claim_reviews$$, 'P0001', 'claim_reviews rows are immutable', 'claim reviews are append-only');
select throws_ok($$update public.binding_reviews set verdict = 'supported'$$, 'P0001', 'binding_reviews rows are immutable',
  'binding reviews are append-only');
select throws_ok($$truncate public.claim_reviews cascade$$, 'P0001', null, 'evidence tables cannot be truncated');
select throws_ok($$delete from public.courses where id = '61000000-0000-4000-8000-000000000000'$$, 'P0001',
  'curriculum_versions rows are immutable', 'a global course with versions cannot be deleted');
select throws_ok(format($$update public.lesson_completions set org_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' where id = %L$$, pg_temp.id('tess_l1')),
  'P0001', 'lesson_completions rows are immutable', 'a completion cannot move to another gym');
select throws_ok(format($$update public.assignments set org_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' where id = %L$$, pg_temp.id('tess_v1')),
  'P0001', 'assignments rows are immutable', 'an assignment cannot move to another gym');
select throws_ok(format($$insert into public.assignments (org_id, version_id, user_id, assigned_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', %L, '00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1')$$,
  pg_temp.id('b_v1')), 'P0001', 'an org can only assign global versions or its own', 'no caller can assign another gym''s version');
select throws_ok($$update public.lessons set org_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' where id = '63000000-0000-4000-8000-000000000011'$$,
  '23503', null, 'a draft lesson cannot move to another gym (composite key)');
select pg_temp.as_service();
select throws_ok(format($$update public.lesson_completions set org_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' where id = %L$$, pg_temp.id('tess_l1')),
  '42501', null, 'the service role cannot reassign progress');
select throws_ok($$update public.courses set org_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$, '42501', null,
  'the service role cannot reassign drafts');
select pg_temp.reset_role();

-- 96-97: retraction flags published content -------------------------------------------
select pg_temp.as_service();
select is(public.publisher_record_retraction('00000000-0000-0000-0000-0000000000c1', pg_temp.id('s1'),
  '{"origin": "crossref", "reference": "10.5555/retraction.1", "detectedAt": "2026-10-10T08:00:00Z"}'), 4,
  'retracting a source flags every version that cites it (G v1-v3 and N v1)');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select is((select count(*) from public.version_flags where version_id = pg_temp.id('g_v1') and reason = 'retracted'), 1::bigint,
  'learners can see that their version is flagged');
select pg_temp.as_service();
select public.publisher_save_course_draft('00000000-0000-0000-0000-0000000000c1',
  pg_temp.g_tree('The scapula rotates upward as the arm rises.', false, 'Synthetic course, third edit'));
select throws_ok($$select public.publisher_publish_course('00000000-0000-0000-0000-0000000000c1', '61000000-0000-4000-8000-000000000000')$$,
  'P0001', format('publish gate: lesson 61000000-0000-4000-8000-000000000011 cites claim %s, which is retracted', pg_temp.id('c_ok')),
  'after a retraction the course cannot publish again until it is fixed');
select pg_temp.reset_role();

-- 99-113: storage paths per org --------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select lives_ok($$insert into storage.objects (bucket_id, name) values ('org-media', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/cuff.png')$$,
  'a lead uploads under her gym''s path');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('org-media', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/spy.png')$$,
  '42501', null, 'a lead cannot upload under another gym''s path');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('content-media', 'global/x.png')$$,
  '42501', null, 'a lead cannot write global media');
select throws_ok($$update storage.objects set name = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/cuff.png'
  where name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/cuff.png'$$,
  'P0001', 'media objects cannot move between orgs or buckets', 'a lead cannot move an object to another gym');
select lives_ok($$update storage.objects set name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/cuff-2.png'
  where name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/cuff.png'$$, 'a lead can rename within her gym');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select is((select count(*) from storage.objects where bucket_id = 'org-media'), 1::bigint, 'a trainer can read her gym''s media');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('org-media', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/t.png')$$,
  '42501', null, 'a trainer cannot upload media');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select lives_ok($$insert into storage.objects (bucket_id, name) values ('org-media', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/b.png')$$,
  'Bob uploads under his own gym');
select is((select count(*) from storage.objects where name like 'aaaaaaaa%'), 0::bigint, 'Bob cannot read gym A''s media');
update storage.objects set name = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/stolen.png' where name like 'aaaaaaaa%';
select set_config('storage.allow_delete_query', 'true', true);
delete from storage.objects where name like 'aaaaaaaa%';
select pg_temp.reset_role();
select is((select count(*) from storage.objects where name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/cuff-2.png'), 1::bigint,
  'Bob''s update and delete of gym A''s object changed nothing');
select pg_temp.as_service();
select throws_ok($$update storage.objects set name = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/moved.png'
  where name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/cuff-2.png'$$,
  'P0001', 'media objects cannot move between orgs or buckets', 'the service role cannot move media to another gym');
select throws_ok($$update storage.objects set bucket_id = 'content-media' where name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/cuff-2.png'$$,
  'P0001', 'media objects cannot move between orgs or buckets', 'the service role cannot move gym media into global media');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('org-media', 'loose/x.png')$$,
  'P0001', 'org-media objects must live under an existing org id', 'gym media must sit under an org id');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('org-media', '99999999-9999-4999-8999-999999999999/x.png')$$,
  'P0001', 'org-media objects must live under an existing org id', 'gym media must sit under an existing org');
select pg_temp.reset_role();
set local role anon;
select is((select count(*) from storage.objects where bucket_id in ('org-media', 'content-media')), 0::bigint,
  'anon reads no media');
reset role;

-- 114-118: privilege matrix and hygiene ---------------------------------------------------
create temp table content_tables (name text);
insert into content_tables values ('sources'), ('claims'), ('claim_sources'), ('claim_reviews'), ('source_retractions'),
  ('binding_reviews'), ('courses'), ('course_parts'), ('lessons'), ('lesson_blocks'), ('block_claims'),
  ('curriculum_versions'), ('version_lessons'), ('version_claims'), ('version_flags'), ('assignments'), ('lesson_completions');
select is((select count(*) from content_tables t, (values ('anon'), ('authenticated'), ('service_role')) r (role),
    (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) p (priv)
  where has_table_privilege(r.role, 'public.' || t.name, p.priv)), 0::bigint,
  'no client or service role has any write privilege on content tables');
select is((select count(*) from content_tables t where has_table_privilege('anon', 'public.' || t.name, 'SELECT')), 0::bigint,
  'anon cannot read content tables');
select is((select array_agg(t.name order by t.name) from content_tables t
  where not has_table_privilege('authenticated', 'public.' || t.name, 'SELECT')),
  array['binding_reviews', 'block_claims', 'claim_reviews'], 'reviews and draft claim links are not client-readable');
select ok((select bool_and(c.relrowsecurity) from content_tables t join pg_class c on c.oid = ('public.' || t.name)::regclass),
  'RLS is on for every content table');
select is((select count(*) from pg_proc p where p.prosecdef and p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
  and not coalesce(p.proconfig, '{}') @> array['search_path=""']), 0::bigint,
  'every security-definer function pins an empty search_path');
select is((select count(*) from (values
    ('publisher_save_course_draft(uuid,jsonb)'), ('publisher_publish_course(uuid,uuid)'), ('publisher_add_source(uuid,jsonb)'),
    ('publisher_add_claim(uuid,jsonb)'), ('publisher_review_claim(uuid,uuid,jsonb)'), ('publisher_review_block(uuid,uuid,jsonb)'),
    ('publisher_record_retraction(uuid,uuid,jsonb)')) f (sig), (values ('anon'), ('authenticated'), ('public')) r (role)
  where r.role <> 'public' and has_function_privilege(r.role, 'public.' || f.sig, 'EXECUTE')), 0::bigint,
  'publisher functions are not executable by anon or authenticated');
select is((select count(*) from information_schema.routine_privileges
  where routine_schema = 'public' and grantee in ('anon', 'PUBLIC')
    and routine_name in ('save_course_draft', 'publish_course', 'assign_version', 'complete_lesson')
       or routine_schema = 'public' and grantee in ('anon', 'PUBLIC', 'authenticated') and routine_name like 'publisher\_%'), 0::bigint,
  'no grant exposes content functions to anon or PUBLIC');
select is((select array_agg(distinct action order by action) from private.content_audit
  where actor = '00000000-0000-0000-0000-0000000000c1'),
  array['add_claim', 'add_source', 'publish', 'publish_unchanged', 'record_retraction', 'review_block', 'review_claim', 'save_draft'],
  'every kind of publisher action is audited under the named actor');
select ok(exists (select 1 from private.content_audit where actor = '00000000-0000-0000-0000-0000000000a2' and action = 'publish'
  and org_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'a gym publish is audited under the lead');

-- 123-124: offboarding a gym removes its content and progress; global content stays
select lives_ok($$delete from public.orgs where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  'deleting a gym cascades through its versions, assignments and progress');
select is((select count(*) from public.curriculum_versions where org_id is null), 4::bigint,
  'global versions survive a gym''s deletion');

select * from finish();
rollback;
