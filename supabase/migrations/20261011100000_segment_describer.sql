-- D-11: model-described video segments. A Gemini model (metered, approved
-- lane) describes a public, embeddable segment; it approves nothing. GPT-6.1
-- Sol reviews that description against SAFETY.md and the lesson, and its run
-- is the segment check's receipt. The describer run is stored next to it.
-- Every admitted clip is spot-checked by a human in the D-08 launch review and
-- is reported as model-described until then. Additive (ADR 0007 amendment).

alter table public.practice_media_checks
  add column describer_model text check (describer_model ~ '^[a-z0-9][a-z0-9._:-]{0,99}$'),
  add column describer_run_id uuid references public.review_runs (id),
  add column describer_cost_usd numeric(12, 6) check (describer_cost_usd between 0 and 100),
  add column described_at timestamptz,
  -- The lessons the reviewer saw with the clip: [{lessonId, hash}] in lesson id order (Sol PR20-10).
  add column context jsonb check (context is null or (jsonb_typeof(context) = 'array' and jsonb_array_length(context) > 0));

-- New rows only (NOT VALID): a passing segment review names the description it reviewed,
-- and the describer fields come as a set.
alter table public.practice_media_checks
  add constraint practice_media_checks_describer_check check (
    (describer_run_id is null) = (describer_model is null)
    and (describer_run_id is null) = (describer_cost_usd is null)
    and (describer_run_id is null) = (described_at is null)
    and (kind = 'segment' or describer_run_id is null)
    and (kind <> 'segment' or outcome <> 'pass' or describer_run_id is not null)
    and (kind = 'segment' or context is null)
    and (kind <> 'segment' or outcome <> 'pass' or context is not null)
  ) not valid;

/**
 * The global lessons that embed a clip, each with its current lesson hash, in
 * lesson id order. A passing segment review is bound to this exact set.
 */
create function private.segment_context(p_media uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('lessonId', x.lesson_id, 'hash', private.lesson_hash(x.lesson_id)) order by x.lesson_id), '[]'::jsonb)
  from (select distinct b.lesson_id from public.lesson_blocks b
        where b.kind = 'video' and b.org_id is null and b.content ->> 'mediaId' = p_media::text) x
$$;

/**
 * Records an embed recheck or a segment review. A passing segment review needs
 * Sol's run and the describer run whose description it reviewed:
 *   "describer": {"run": {model, session, packetDigest, reviewedAt}, "costUsd": 0.0067}
 * The describer's reviewedAt is when the description was produced.
 */
create or replace function public.publisher_record_media_check(p_actor uuid, p_media uuid, p_check jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  kind text;
  outcome text;
  checked timestamptz;
  run uuid;
  describer uuid;
  describer_model text;
  described timestamptz;
  cost numeric;
  reviewer_model text;
  context jsonb;
  cid uuid;
begin
  perform private.require_publisher(p_actor);
  perform private.lock_media(p_media);
  if private.media_status(p_media) = 'retired' then
    raise exception 'media % is retired', p_media using errcode = 'P0001';
  end if;
  perform private.jobject(p_check, 'check', array['kind', 'outcome', 'checkedAt', 'run', 'notes', 'describer', 'context'],
    array['kind', 'outcome', 'checkedAt']);
  kind := private.jenum(p_check -> 'kind', 'check.kind', array['embed', 'segment']);
  outcome := private.jenum(p_check -> 'outcome', 'check.outcome', array['pass', 'fail']);
  checked := private.jtimestamp(p_check -> 'checkedAt', 'check.checkedAt');
  if checked > clock_timestamp() + interval '5 minutes' then perform private.jfail('check.checkedAt', 'is in the future'); end if;
  if kind = 'segment' and outcome = 'pass' and not p_check ? 'run' then
    perform private.jfail('check.run', 'a passing segment review needs a model run receipt');
  end if;
  if kind <> 'segment' and p_check ? 'describer' then
    perform private.jfail('check.describer', 'only segment reviews have a describer');
  end if;
  if kind = 'segment' and outcome = 'pass' and not p_check ? 'describer' then
    perform private.jfail('check.describer', 'a passing segment review needs the describer run it reviewed');
  end if;
  if kind <> 'segment' and p_check ? 'context' then
    perform private.jfail('check.context', 'only segment reviews have a lesson context');
  end if;
  if kind = 'segment' and outcome = 'pass' and not p_check ? 'context' then
    perform private.jfail('check.context', 'a passing segment review needs the lessons it was reviewed with');
  end if;
  if p_check ? 'context' then
    if jsonb_typeof(p_check -> 'context') is distinct from 'array' or jsonb_array_length(p_check -> 'context') = 0 then
      perform private.jfail('check.context', 'must list the lessons the reviewer saw');
    end if;
    -- Saves take the course row for update, so no embedding lesson changes until commit. A
    -- later statement sees anything a concurrent save committed before the lock. A lesson
    -- that starts embedding the clip afterwards is not in the context, and the publish gate
    -- refuses it until the clip is reviewed with it.
    perform 1 from public.courses where id in (
      select l.course_id from public.lessons l join public.lesson_blocks b on b.lesson_id = l.id
      where b.kind = 'video' and b.org_id is null and b.content ->> 'mediaId' = p_media::text) order by id for share;
    context := private.segment_context(p_media);
    if context is distinct from p_check -> 'context' then
      raise exception 'stale review: the lessons that embed media % changed after its segment packet was built', p_media
        using errcode = 'P0001';
    end if;
  end if;
  if p_check ? 'describer' then
    perform private.jobject(p_check -> 'describer', 'check.describer', array['run', 'costUsd'], array['run', 'costUsd']);
    if jsonb_typeof(p_check -> 'describer' -> 'costUsd') is distinct from 'number'
       or (p_check -> 'describer' ->> 'costUsd')::numeric not between 0 and 100 then
      perform private.jfail('check.describer.costUsd', 'must be a number from 0 to 100');
    end if;
    cost := round((p_check -> 'describer' ->> 'costUsd')::numeric, 6);
    describer := private.record_run(p_actor, p_check -> 'describer' -> 'run', 'check.describer.run');
    select r.model, r.reviewed_at into describer_model, described from public.review_runs r where r.id = describer;
  end if;
  if p_check ? 'run' then run := private.record_run(p_actor, p_check -> 'run', 'check.run'); end if;
  if run is not null and run = describer then
    perform private.jfail('check.describer.run', 'must differ from the reviewing run');
  end if;
  -- The describer only describes: no Gemini run reviews a segment, whatever its session (Sol PR20-04).
  if kind = 'segment' and run is not null then
    select r.model into reviewer_model from public.review_runs r where r.id = run;
    if reviewer_model like 'gemini%' or reviewer_model = describer_model then
      perform private.jfail('check.run', 'a describer model cannot review a segment');
    end if;
  end if;
  insert into public.practice_media_checks (media_id, kind, outcome, checked_at, run_id, notes, recorded_by,
    describer_model, describer_run_id, describer_cost_usd, described_at, context)
  values (p_media, kind, outcome, checked, run,
    case when p_check ? 'notes' then private.jstr(p_check -> 'notes', 'check.notes', 0, 2000) else '' end, p_actor,
    describer_model, describer, cost, described, context)
  returning id into cid;
  perform private.audit(p_actor, 'check_media', null, p_media,
    jsonb_build_object('kind', kind, 'outcome', outcome, 'describer_cost_usd', cost));
  return cid;
end;
$$;

-- Sol PR20-07 and PR20-10: what a passing segment review must carry to count ---------------

/**
 * 'ok', or why a registry clip cannot go into a new publish. A segment review
 * counts only with its describer run and the lessons it was reviewed with:
 * an older pass without them leaves the clip segment-unchecked.
 */
create or replace function private.media_publishable(p_media uuid)
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  k text;
  latest public.practice_media_checks%rowtype;
  status text;
begin
  if not exists (select 1 from public.practice_media where id = p_media) then return 'unknown'; end if;
  status := private.media_status(p_media);
  if status <> 'active' then return status; end if;
  foreach k in array array['embed', 'segment'] loop
    select * into latest from public.practice_media_checks where media_id = p_media and kind = k order by seq desc limit 1;
    if not found or latest.outcome <> 'pass' or latest.checked_at <= clock_timestamp() - interval '90 days'
       or (k = 'segment' and (latest.describer_run_id is null or latest.context is null
                              or latest.described_at <= clock_timestamp() - interval '90 days')) then
      return k || '-unchecked';
    end if;
  end loop;
  return 'ok';
end;
$$;

/** True when the clip's latest segment review saw this lesson exactly as it is now. */
create function private.segment_covers(p_media uuid, p_lesson uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select c.context @> jsonb_build_array(jsonb_build_object('lessonId', p_lesson, 'hash', private.lesson_hash(p_lesson)))
    from public.practice_media_checks c where c.media_id = p_media and c.kind = 'segment' order by c.seq desc limit 1), false)
$$;

/**
 * True when the clip's latest segment review saw every lesson of this version that embeds
 * it, exactly as the version froze it (Sol R2 PR20-10). Snapshot lessons are lesson_json,
 * so their hash is the lesson hash the review recorded.
 */
create function private.segment_covers_version(p_media uuid, p_snapshot jsonb)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select c.context is not null and not exists (
      select 1 from jsonb_path_query(p_snapshot, '$.parts[*].lessons[*]') l
      where jsonb_path_exists(l, '$.blocks[*] ? (@.kind == "video" && @.content.mediaId == $m)', jsonb_build_object('m', p_media::text))
        and not c.context @> jsonb_build_array(jsonb_build_object('lessonId', l ->> 'id', 'hash', private.sha256(l))))
    from public.practice_media_checks c where c.media_id = p_media and c.kind = 'segment' order by c.seq desc limit 1), false)
$$;

/** 'ok', or why a video block in this lesson cannot publish. */
create function private.video_block_status(p_content jsonb, p_lesson uuid)
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  status text := private.video_block_status(p_content);
begin
  if status = 'ok' and not private.segment_covers((p_content ->> 'mediaId')::uuid, p_lesson) then
    return 'not segment-reviewed with this lesson';
  end if;
  return status;
end;
$$;

/** The phase-3 gate, unchanged except that a video must be segment-reviewed with its lesson. */
create or replace function private.publish(p_course uuid, p_actor uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
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
$$;


-- version_media gains a review column, so it is dropped and recreated.
drop function public.version_media(uuid);

/**
 * Playback state of the registry clips a version embeds (see ADR 0007).
 * `review` is 'model-described' for a playable clip: its segment was described
 * by a model and reviewed by Sol, and no human has checked it yet (D-11). The
 * player must not claim a human check. Null for a disabled clip.
 */
create function public.version_media(p_version uuid)
returns table (media_id uuid, state text, review text, title text, channel text, available boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v public.curriculum_versions%rowtype := private.require_version_reader(p_version);
begin
  return query
    select m.id,
      case when private.media_publishable(m.id) = 'ok' and private.segment_covers_version(m.id, v.snapshot) then 'playable' else 'disabled' end,
      case when private.media_publishable(m.id) = 'ok' and private.segment_covers_version(m.id, v.snapshot) then 'model-described' end,
      md.title, md.channel, md.available
    from public.practice_media m
    left join public.practice_media_metadata md
      on md.media_id = m.id and md.fetched_at > clock_timestamp() - interval '30 days'
         and private.media_publishable(m.id) = 'ok' and private.segment_covers_version(m.id, v.snapshot)
    where m.id in (select (x #>> '{}')::uuid
                   from jsonb_path_query(v.snapshot, '$.parts[*].lessons[*].blocks[*] ? (@.kind == "video").content.mediaId') x)
    order by m.id;
end;
$$;

revoke all on function public.version_media(uuid) from public, anon, authenticated, service_role;
grant execute on function public.version_media(uuid) to authenticated;
revoke all on function public.publisher_record_media_check(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.publisher_record_media_check(uuid, uuid, jsonb) to service_role;
revoke all on function private.segment_context(uuid), private.segment_covers(uuid, uuid), private.segment_covers_version(uuid, jsonb),
  private.video_block_status(jsonb, uuid) from public, anon, authenticated, service_role;
