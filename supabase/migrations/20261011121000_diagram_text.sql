-- Sol R16: diagram teaching text moves into the reviewed lesson data. A diagram
-- block carries alt text, a caption and legend items, and says how it is
-- supported (science diagrams bind claims and need a binding review, like
-- paragraphs). The block is hashed with the lesson, so changed text needs a
-- new review. Code supplies only the drawing geometry, keyed by diagramId.
-- Legacy {diagramId, caption} rows stay readable in old snapshots but cannot
-- be saved or published.

/** Strict legend item: exactly key, label and text. */
create function private.legend_item_ok(p_item jsonb, p_path text)
returns boolean
language plpgsql immutable set search_path = ''
as $$
begin
  perform private.jobject(p_item, p_path, array['key', 'label', 'text'], array['key', 'label', 'text']);
  return true;
end;
$$;

alter table public.lesson_blocks drop constraint lesson_blocks_check;
-- New rows only: diagrams now carry support; legacy diagram rows are refused by the publish gate.
alter table public.lesson_blocks add constraint lesson_blocks_check
  check ((support is null) = (kind in ('heading', 'image', 'video'))) not valid;

create or replace function private.validate_block(p_value jsonb, p_path text, p_layer text)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  kind text;
  content jsonb;
  support text;
  claim_ids uuid[];
  n integer;
  video_id text;
begin
  if jsonb_typeof(p_value) is distinct from 'object' then perform private.jfail(p_path, 'must be an object'); end if;
  kind := private.jenum(p_value -> 'kind', p_path || '.kind',
    array['heading', 'paragraph', 'callout', 'image', 'checklist', 'diagram', 'quiz', 'video']);
  if kind in ('heading', 'image', 'video') then
    perform private.jobject(p_value, p_path, array['kind', 'content'], array['kind', 'content']);
  else
    perform private.jobject(p_value, p_path, array['kind', 'content', 'support', 'claimIds'],
      array['kind', 'content', 'support', 'claimIds']);
  end if;

  case kind
    when 'heading' then content := to_jsonb(private.jstr(p_value -> 'content', p_path || '.content', 1, 300));
    when 'paragraph' then content := to_jsonb(private.jstr(p_value -> 'content', p_path || '.content', 1, 20000));
    when 'callout' then
      perform private.jobject(p_value -> 'content', p_path || '.content', array['label', 'text'], array['label', 'text']);
      content := jsonb_build_object(
        'label', private.jstr(p_value -> 'content' -> 'label', p_path || '.content.label', 1, 100),
        'text', private.jstr(p_value -> 'content' -> 'text', p_path || '.content.text', 1, 5000));
    when 'image' then content := private.validate_media(p_value -> 'content', p_path || '.content');
    when 'checklist' then content := private.jstrs(p_value -> 'content', p_path || '.content', 1, 50, 1000);
    when 'diagram' then
      -- R16: the teaching text (alt, caption, legend) lives here and is hashed and reviewed; code draws geometry only.
      perform private.jobject(p_value -> 'content', p_path || '.content', array['diagramId', 'alt', 'caption', 'legend'],
        array['diagramId', 'alt', 'caption', 'legend']);
      if jsonb_typeof(p_value -> 'content' -> 'legend') is distinct from 'array' or jsonb_array_length(p_value -> 'content' -> 'legend') > 20 then
        perform private.jfail(p_path || '.content.legend', 'must be an array of at most 20 items');
      end if;
      content := jsonb_build_object(
        'diagramId', private.jid(p_value -> 'content' -> 'diagramId', p_path || '.content.diagramId'),
        'alt', private.jstr(p_value -> 'content' -> 'alt', p_path || '.content.alt', 1, 500),
        'caption', private.jstr(p_value -> 'content' -> 'caption', p_path || '.content.caption', 0, 1000),
        'legend', coalesce((
          select jsonb_agg(jsonb_build_object(
              'key', private.jid(item -> 'key', format('%s.content.legend[%s].key', p_path, i - 1)),
              'label', private.jstr(item -> 'label', format('%s.content.legend[%s].label', p_path, i - 1), 1, 100),
              'text', private.jstr(item -> 'text', format('%s.content.legend[%s].text', p_path, i - 1), 0, 1000))
            order by i)
          from jsonb_array_elements(p_value -> 'content' -> 'legend') with ordinality as l (item, i)
          where private.legend_item_ok(item, format('%s.content.legend[%s]', p_path, i - 1))), '[]'::jsonb));
    when 'quiz' then
      perform private.jobject(p_value -> 'content', p_path || '.content',
        array['prompt', 'options', 'answerIndex', 'explanation'], array['prompt', 'options', 'answerIndex', 'explanation']);
      n := jsonb_array_length(private.jstrs(p_value -> 'content' -> 'options', p_path || '.content.options', 2, 10, 500));
      content := jsonb_build_object(
        'prompt', private.jstr(p_value -> 'content' -> 'prompt', p_path || '.content.prompt', 1, 2000),
        'options', p_value -> 'content' -> 'options',
        'answerIndex', private.jint(p_value -> 'content' -> 'answerIndex', p_path || '.content.answerIndex', 0, n - 1),
        'explanation', private.jstr(p_value -> 'content' -> 'explanation', p_path || '.content.explanation', 1, 5000));
    when 'video' then
      if p_layer = 'method' then perform private.jfail(p_path, 'gym method courses cannot embed registry videos'); end if;
      perform private.jobject(p_value -> 'content', p_path || '.content',
        array['mediaId', 'provider', 'videoId', 'startSeconds', 'endSeconds', 'rationale', 'caption'],
        array['mediaId', 'provider', 'videoId', 'startSeconds', 'endSeconds', 'rationale', 'caption']);
      video_id := private.jstr(p_value -> 'content' -> 'videoId', p_path || '.content.videoId', 11, 11);
      if video_id !~ '^[A-Za-z0-9_-]{11}$' then perform private.jfail(p_path || '.content.videoId', 'must be a YouTube video id'); end if;
      content := jsonb_build_object(
        'mediaId', private.juuid(p_value -> 'content' -> 'mediaId', p_path || '.content.mediaId'),
        'provider', private.jenum(p_value -> 'content' -> 'provider', p_path || '.content.provider', array['youtube']),
        'videoId', video_id,
        'startSeconds', private.jint(p_value -> 'content' -> 'startSeconds', p_path || '.content.startSeconds', 0, 86399),
        'endSeconds', private.jint(p_value -> 'content' -> 'endSeconds', p_path || '.content.endSeconds', 1, 86400),
        'rationale', private.jstr(p_value -> 'content' -> 'rationale', p_path || '.content.rationale', 1, 1000),
        'caption', private.jstr(p_value -> 'content' -> 'caption', p_path || '.content.caption', 0, 1000));
      if (content ->> 'endSeconds')::integer <= (content ->> 'startSeconds')::integer then
        perform private.jfail(p_path || '.content.endSeconds', 'must be after startSeconds');
      end if;
  end case;

  if kind in ('heading', 'image', 'video') then
    return jsonb_build_object('kind', kind, 'content', content);
  end if;

  support := private.jenum(p_value -> 'support', p_path || '.support', array['science', 'practice-based']);
  claim_ids := private.juuids(p_value -> 'claimIds', p_path || '.claimIds', 50);
  if support = 'science' and cardinality(claim_ids) = 0 then
    perform private.jfail(p_path, 'a science block needs at least one claim');
  end if;
  if support = 'practice-based' and cardinality(claim_ids) > 0 then
    perform private.jfail(p_path, 'a practice-based block cannot carry claims');
  end if;
  if p_layer = 'method' and support = 'science' then
    perform private.jfail(p_path, 'method content is practice-based');
  end if;
  -- Phase 3: a base lesson may hold a claim-free practice quiz as an ungraded discussion
  -- exercise; only science quizzes are graded (private.graded_questions).
  return jsonb_build_object('kind', kind, 'content', content, 'support', support, 'claimIds', to_jsonb(claim_ids));
end;
$function$

;
create or replace function private.publish(p_course uuid, p_actor uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  c public.courses%rowtype;
  b record;
  les record;
  claim_set uuid[];
  claim uuid;
  status text;
  snap jsonb;
  hash text;
  latest public.curriculum_versions%rowtype;
  vid uuid;
  graded bigint;
begin
  perform private.lock_publishing(false);
  select * into c from public.courses where id = p_course for update;
  if not found then raise exception 'no such course' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.lessons where course_id = p_course) then
    raise exception 'publish gate: the course has no lessons' using errcode = 'P0001';
  end if;
  -- A learner submits every graded question at once (private.normalize_answers takes at most 1000).
  graded := (select count(*) from public.lesson_blocks lb join public.lessons l on l.id = lb.lesson_id
             where l.course_id = p_course and lb.kind = 'quiz' and lb.support = 'science');
  if graded > 1000 then
    raise exception 'publish gate: course % has % graded questions; the limit is 1000', p_course, graded using errcode = 'P0001';
  end if;

  for b in
    select lb.id, lb.lesson_id, lb.kind, lb.support, lb.content, lb.content_hash
    from public.lesson_blocks lb join public.lessons l on l.id = lb.lesson_id
    where l.course_id = p_course
    order by l.id, lb.ordinal
  loop
    -- Recompute rather than trust the stored hash.
    if b.content_hash <> private.block_hash(b.kind, b.content) then
      raise exception 'publish gate: lesson % has a block whose hash does not match its content', b.lesson_id
        using errcode = 'P0001';
    end if;
    claim_set := array(select bc.claim_id from public.block_claims bc where bc.block_id = b.id order by bc.claim_id);
    -- Media saved before this migration is not re-validated on save, so check here too.
    if b.kind = 'image' and private.is_video_host_url(b.content ->> 'src') then
      raise exception 'publish gate: lesson % has media on a video host; use a registry video block', b.lesson_id
        using errcode = 'P0001';
    end if;
    -- P18-06: media must be a stored file of the course's owner (rows saved before the rule included).
    if b.kind = 'image' and not private.media_src_ok(b.content ->> 'src', c.org_id) then
      raise exception 'publish gate: lesson % has media that is not a stored file of its owner', b.lesson_id
        using errcode = 'P0001';
    end if;
    if b.kind = 'video' then
      if c.org_id is not null then
        raise exception 'publish gate: lesson % is gym method content, which cannot embed registry videos', b.lesson_id
          using errcode = 'P0001';
      end if;
      status := private.video_block_status(b.content, b.lesson_id);
      if status <> 'ok' then
        raise exception 'publish gate: lesson % has a video whose registry entry is %', b.lesson_id, status
          using errcode = 'P0001';
      end if;
    end if;
    if b.kind = 'diagram' and (b.support is null or not (b.content ? 'legend') or not (b.content ? 'alt')) then
      raise exception 'publish gate: lesson % has a diagram without reviewable text (alt, caption, legend and support)', b.lesson_id
        using errcode = 'P0001';
    end if;
    if b.support is null then
      if cardinality(claim_set) > 0 then
        raise exception 'publish gate: lesson % has a % block carrying claims', b.lesson_id, b.kind using errcode = 'P0001';
      end if;
      continue;
    end if;
    if c.layer = 'method' and (b.support = 'science' or cardinality(claim_set) > 0) then
      raise exception 'publish gate: lesson % is gym method content, which is practice-based', b.lesson_id
        using errcode = 'P0001';
    end if;
    if b.support = 'practice-based' then
      if cardinality(claim_set) > 0 then
        raise exception 'publish gate: lesson % has a practice-based block carrying claims', b.lesson_id
          using errcode = 'P0001';
      end if;
      continue;
    end if;
    if cardinality(claim_set) = 0 then
      raise exception 'publish gate: lesson % has a science block without a claim', b.lesson_id using errcode = 'P0001';
    end if;
    foreach claim in array claim_set loop
      status := private.claim_status(claim);
      if status <> 'approved' then
        raise exception 'publish gate: lesson % cites claim %, which is %', b.lesson_id, claim, status
          using errcode = 'P0001';
      end if;
    end loop;
    if not private.binding_supported(b.content_hash, claim_set) then
      raise exception 'publish gate: lesson % has a % block with no supporting binding review for its exact content and claims',
        b.lesson_id, b.kind using errcode = 'P0001';
    end if;
  end loop;

  if exists (select 1 from public.lessons l, jsonb_array_elements(l.media) m
             where l.course_id = p_course and private.is_video_host_url(m ->> 'src')) then
    raise exception 'publish gate: course % has lesson media on a video host; use a registry video block', p_course
      using errcode = 'P0001';
  end if;
  if exists (select 1 from public.lessons l, jsonb_array_elements(l.media) m
             where l.course_id = p_course and not private.media_src_ok(m ->> 'src', c.org_id)) then
    raise exception 'publish gate: course % has lesson media that is not a stored file of its owner', p_course
      using errcode = 'P0001';
  end if;

  -- Founder (global) content: a clean lesson receipt on the exact lesson hash,
  -- practice text and frozen video fields included, and a clean course receipt
  -- on the course and part text. Gym method content keeps the phase-2 rules.
  if c.org_id is null then
    for les in select id from public.lessons where course_id = p_course order by id loop
      if not private.lesson_review_clean(les.id, private.lesson_hash(les.id), private.lesson_claims(les.id)) then
        raise exception 'publish gate: lesson % has no clean lesson review for its exact content', les.id
          using errcode = 'P0001';
      end if;
    end loop;
    if not private.course_review_clean(p_course, private.sha256(private.course_shell(p_course))) then
      raise exception 'publish gate: course % has no clean course review for its exact text', p_course
        using errcode = 'P0001';
    end if;
  end if;

  snap := private.course_snapshot(p_course);
  hash := private.sha256(snap);
  select * into latest from public.curriculum_versions where course_id = p_course order by version_number desc limit 1;
  -- Global content last published under the phase-2 rules gets a new phase-3 version.
  -- Gym method courses stay idempotent whatever rules their latest version used.
  if found and latest.content_hash = hash and (latest.rules = 'phase3' or c.org_id is not null) then
    perform private.audit(p_actor, 'publish_unchanged', c.org_id, latest.id);
    return latest.id;
  end if;

  insert into public.curriculum_versions (course_id, org_id, layer, version_number, snapshot, content_hash, published_by,
    rules, question_set_hash)
  values (p_course, c.org_id, c.layer, coalesce(latest.version_number, 0) + 1, snap, hash, p_actor,
    'phase3', private.question_set_hash(snap))
  returning id into vid;

  insert into public.version_lessons (version_id, lesson_id, org_id, ordinal, content_hash)
  select vid, (l ->> 'id')::uuid, c.org_id, o, private.sha256(l)
  from jsonb_path_query(snap, '$.parts[*].lessons[*]') with ordinality as t (l, o);

  insert into public.version_claims (version_id, lesson_id, claim_id)
  select distinct vid, (l ->> 'id')::uuid, (ci #>> '{}')::uuid
  from jsonb_path_query(snap, '$.parts[*].lessons[*]') as t (l),
       jsonb_path_query(l, '$.blocks[*].claimIds[*]') as u (ci);

  perform private.audit(p_actor, 'publish', c.org_id, vid,
    jsonb_build_object('course_id', p_course, 'version_number', coalesce(latest.version_number, 0) + 1, 'content_hash', hash));
  return vid;
end;
$function$

;

revoke all on function private.legend_item_ok(jsonb, text) from public, anon, authenticated, service_role;
