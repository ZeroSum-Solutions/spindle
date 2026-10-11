-- P18-06 (LEAD decision): lesson media is storage-only. An image block's src
-- and every lesson media src must be a stored file: /media/content/... for any
-- content, or /media/org/<the course's own gym>/... for gym content. Registry
-- clips stay video blocks; resource links are unaffected. New authoring is
-- refused by triggers for every writer; the publish gate refuses rows saved
-- before the rule. Snapshot parsing stays lenient; the player already renders
-- non-storage media as unavailable.

/** True for a stored-file path the content's owner may use. */
create function private.media_src_ok(p_src text, p_org uuid)
returns boolean
language sql immutable set search_path = ''
as $$
  select coalesce(
    p_src !~ '/\.\.?(/|$)'
    and (p_src ~ '^/media/content/[A-Za-z0-9._~-]+(/[A-Za-z0-9._~-]+)*$'
         or (p_org is not null and p_src ~ ('^/media/org/' || p_org::text || '/[A-Za-z0-9._~-]+(/[A-Za-z0-9._~-]+)*$'))),
    false)
$$;

create function private.media_error(p_src text)
returns void
language plpgsql immutable set search_path = ''
as $$
begin
  raise exception 'invalid course: media must be a stored file under /media/content/ or the gym''s own /media/org/<gym id>/ (got %)', p_src
    using errcode = '22023';
end;
$$;

create function private.guard_block_media()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.kind = 'image' and not private.media_src_ok(new.content ->> 'src', new.org_id) then
    perform private.media_error(new.content ->> 'src');
  end if;
  return new;
end;
$$;

create trigger lesson_blocks_media_storage
before insert or update of content, kind on public.lesson_blocks
for each row execute function private.guard_block_media();

create function private.guard_lesson_media()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  bad text;
begin
  select m ->> 'src' into bad from jsonb_array_elements(new.media) m
  where not private.media_src_ok(m ->> 'src', new.org_id) limit 1;
  if found then perform private.media_error(bad); end if;
  return new;
end;
$$;

create trigger lessons_media_storage
before insert or update of media on public.lessons
for each row execute function private.guard_lesson_media();

-- The publish gate (every earlier check kept) gains the storage rule.
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
$function$;


revoke all on function private.media_src_ok(text, uuid), private.media_error(text), private.guard_block_media(),
  private.guard_lesson_media() from public, anon, authenticated, service_role;
