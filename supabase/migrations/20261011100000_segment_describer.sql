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
  add column described_at timestamptz;

-- New rows only (NOT VALID): a passing segment review names the description it reviewed,
-- and the describer fields come as a set.
alter table public.practice_media_checks
  add constraint practice_media_checks_describer_check check (
    (describer_run_id is null) = (describer_model is null)
    and (describer_run_id is null) = (describer_cost_usd is null)
    and (describer_run_id is null) = (described_at is null)
    and (kind = 'segment' or describer_run_id is null)
    and (kind <> 'segment' or outcome <> 'pass' or describer_run_id is not null)
  ) not valid;

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
  cid uuid;
begin
  perform private.require_publisher(p_actor);
  perform private.lock_media(p_media);
  if private.media_status(p_media) = 'retired' then
    raise exception 'media % is retired', p_media using errcode = 'P0001';
  end if;
  perform private.jobject(p_check, 'check', array['kind', 'outcome', 'checkedAt', 'run', 'notes', 'describer'],
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
  insert into public.practice_media_checks (media_id, kind, outcome, checked_at, run_id, notes, recorded_by,
    describer_model, describer_run_id, describer_cost_usd, described_at)
  values (p_media, kind, outcome, checked, run,
    case when p_check ? 'notes' then private.jstr(p_check -> 'notes', 'check.notes', 0, 2000) else '' end, p_actor,
    describer_model, describer, cost, described)
  returning id into cid;
  perform private.audit(p_actor, 'check_media', null, p_media,
    jsonb_build_object('kind', kind, 'outcome', outcome, 'describer_cost_usd', cost));
  return cid;
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
      case when private.media_publishable(m.id) = 'ok' then 'playable' else 'disabled' end,
      case when private.media_publishable(m.id) = 'ok' then 'model-described' end,
      md.title, md.channel, md.available
    from public.practice_media m
    left join public.practice_media_metadata md
      on md.media_id = m.id and md.fetched_at > clock_timestamp() - interval '30 days'
         and private.media_publishable(m.id) = 'ok'
    where m.id in (select (x #>> '{}')::uuid
                   from jsonb_path_query(v.snapshot, '$.parts[*].lessons[*].blocks[*] ? (@.kind == "video").content.mediaId') x)
    order by m.id;
end;
$$;

revoke all on function public.version_media(uuid) from public, anon, authenticated, service_role;
grant execute on function public.version_media(uuid) to authenticated;
revoke all on function public.publisher_record_media_check(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.publisher_record_media_check(uuid, uuid, jsonb) to service_role;
