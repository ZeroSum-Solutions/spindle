-- Publishes synthetic courses through the real RPCs and probes link ingress,
-- then rolls everything back. content-contract.spec.ts fills in the three
-- JSON placeholders (base course, method course, URL list) and reads the
-- @@-prefixed lines. Nothing persists.
begin;

-- A publisher, and a gym owned by a synthetic user.
insert into auth.users (id, email, email_confirmed_at) values
  ('c2c2c2c2-0000-4000-8000-0000000000a1', 'contract-publisher@spindle.test', now()),
  ('c2c2c2c2-0000-4000-8000-0000000000a2', 'contract-owner@a.test', now());
insert into public.orgs (id, name, slug) values ('c2c2c2c2-0000-4000-8000-0000000000b1', 'Contract Gym', 'c2-contract-gym');
insert into public.memberships (org_id, user_id, role)
values ('c2c2c2c2-0000-4000-8000-0000000000b1', 'c2c2c2c2-0000-4000-8000-0000000000a2', 'owner');
insert into private.content_publishers (user_id, note) values ('c2c2c2c2-0000-4000-8000-0000000000a1', 'contract fixture');

create temp table c2_urls (ord integer primary key, url text not null, accepted boolean not null, error text);
grant insert on c2_urls to service_role;

-- Global base course: evidence, synthetic review receipts (ADR 0007; no model
-- is called) and publication as the service role.
select set_config('role', 'service_role', true), set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('c2.source', public.publisher_add_source('c2c2c2c2-0000-4000-8000-0000000000a1',
  '{"kind": "systematic_review", "title": "Synthetic contract review", "doi": "10.5555/C2.CONTRACT", "license": "CC BY 4.0"}')::text, true);
select set_config('c2.claim', public.publisher_add_claim('c2c2c2c2-0000-4000-8000-0000000000a1', jsonb_build_object(
  'statement', 'Synthetic contract claim.', 'evidenceLevel', 'synthetic', 'population', 'synthetic adults',
  'sourceIds', jsonb_build_array(current_setting('c2.source'))))::text, true);
select set_config('c2.run', '{"model": "synthetic-fixture", "session": "ci-contract",
  "packetDigest": "0000000000000000000000000000000000000000000000000000000000000003", "reviewedAt": "2026-10-01T00:00:00Z"}', true);
select public.publisher_review_claim('c2c2c2c2-0000-4000-8000-0000000000a1', current_setting('c2.claim')::uuid,
  jsonb_build_object('decision', 'approved', 'expiresAt', to_char(now() + interval '1 year', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'expectedHash', public.publisher_claim_target('c2c2c2c2-0000-4000-8000-0000000000a1', current_setting('c2.claim')::uuid) ->> 'hash',
    'run', current_setting('c2.run')::jsonb,
    'receipt', jsonb_build_object('existenceCheckedAt', '2026-10-01T00:00:00Z', 'faithfulness', 'faithful',
      'retractionCheckedAt', '2026-10-01T00:00:00Z')));
select public.publisher_save_course_draft('c2c2c2c2-0000-4000-8000-0000000000a1',
  replace($c2json$__BASE__$c2json$, '__CLAIM__', current_setting('c2.claim'))::jsonb);
do $$
declare
  l jsonb;
  b jsonb;
begin
  for l in select * from jsonb_array_elements(public.publisher_review_targets('c2c2c2c2-0000-4000-8000-0000000000a1',
           'c2c2c2c2-0000-4000-8000-000000000c01') -> 'lessons') loop
    for b in select * from jsonb_array_elements(l -> 'blocks') loop
      if jsonb_array_length(b -> 'claimIds') > 0 then
        perform public.publisher_review_block('c2c2c2c2-0000-4000-8000-0000000000a1', (b ->> 'blockId')::uuid,
          jsonb_build_object('verdict', 'supported', 'expectedHash', b -> 'hash', 'claimIds', b -> 'claimIds',
            'run', current_setting('c2.run')::jsonb));
      end if;
    end loop;
    perform public.publisher_review_lesson('c2c2c2c2-0000-4000-8000-0000000000a1', (l ->> 'lessonId')::uuid,
      jsonb_build_object('verdict', 'clean', 'expectedHash', l -> 'hash', 'claimIds', l -> 'claimIds',
        'checks', '{"safety": "pass", "originality": "pass"}'::jsonb, 'findings', '[]'::jsonb, 'run', current_setting('c2.run')::jsonb));
  end loop;
  perform public.publisher_review_course('c2c2c2c2-0000-4000-8000-0000000000a1', 'c2c2c2c2-0000-4000-8000-000000000c01',
    jsonb_build_object('verdict', 'clean', 'expectedHash', public.publisher_review_targets('c2c2c2c2-0000-4000-8000-0000000000a1',
      'c2c2c2c2-0000-4000-8000-000000000c01') -> 'course' -> 'hash',
      'checks', '{"safety": "pass", "originality": "pass"}'::jsonb, 'findings', '[]'::jsonb, 'run', current_setting('c2.run')::jsonb));
end;
$$;
select set_config('c2.base_version', public.publisher_publish_course('c2c2c2c2-0000-4000-8000-0000000000a1',
  'c2c2c2c2-0000-4000-8000-000000000c01')::text, true);

-- Link ingress: each URL as an image source in a draft, in its own savepoint.
do $$
declare
  item record;
begin
  for item in select ord, value as url from jsonb_array_elements_text($c2json$__URLS__$c2json$::jsonb) with ordinality as t(value, ord) loop
    begin
      perform public.publisher_save_course_draft('c2c2c2c2-0000-4000-8000-0000000000a1', jsonb_build_object(
        'id', 'c2c2c2c2-0000-4000-8000-000000000c03', 'slug', 'c2-contract-urls', 'layer', 'base', 'title', 'URL probe',
        'subtitle', '', 'description', '', 'level', 'foundation', 'outcomes', '[]'::jsonb,
        'parts', jsonb_build_array(jsonb_build_object('id', 'c2c2c2c2-0000-4000-8000-000000000c31', 'ordinal', 1,
          'title', 'Probe', 'summary', '', 'lessons', jsonb_build_array(jsonb_build_object(
            'id', 'c2c2c2c2-0000-4000-8000-000000000c32', 'slug', 'probe', 'title', 'Probe', 'summary', '',
            'durationMinutes', 1, 'format', 'article', 'objectives', '[]'::jsonb, 'anatomyIds', '[]'::jsonb,
            'blocks', jsonb_build_array(jsonb_build_object('kind', 'image', 'content', jsonb_build_object(
              'kind', 'image', 'src', item.url, 'alt', 'Probe', 'caption', '', 'provenanceId', 'c2-probe'))),
            'media', '[]'::jsonb, 'resources', '[]'::jsonb))))));
      insert into c2_urls values (item.ord, item.url, true, null);
    exception when others then
      insert into c2_urls values (item.ord, item.url, false, sqlerrm);
    end;
  end loop;
end;
$$;

-- Gym method course: authored and published by the owner.
select set_config('role', 'authenticated', true),
  set_config('request.jwt.claims', '{"sub": "c2c2c2c2-0000-4000-8000-0000000000a2", "role": "authenticated"}', true);
select public.save_course_draft('c2c2c2c2-0000-4000-8000-0000000000b1', $c2json$__METHOD__$c2json$::jsonb);
select set_config('c2.method_version', public.publish_course('c2c2c2c2-0000-4000-8000-000000000c02')::text, true);

select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
select '@@CLAIM@@' || current_setting('c2.claim');
select '@@SNAPSHOT@@' || snapshot::text from public.curriculum_versions
where id in (current_setting('c2.base_version')::uuid, current_setting('c2.method_version')::uuid)
order by snapshot ->> 'layer';
select '@@URL@@' || jsonb_build_object('url', url, 'accepted', accepted, 'error', error)::text from c2_urls order by ord;

rollback;
