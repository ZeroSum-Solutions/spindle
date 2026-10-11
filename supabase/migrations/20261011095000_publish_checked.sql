-- Sol N01 / R15: a publish after a retraction recheck is bound to the exact
-- sources that were rechecked. The caller passes the source ids it verified;
-- under the course lock the database compares them with the sources the draft
-- cites now, and publishes in the same transaction only if they are equal.

/** Sorted, distinct sources cited by a draft course's claims. */
create function private.cited_sources(p_course uuid)
returns uuid[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(distinct cs.source_id order by cs.source_id), '{}')
  from public.lessons l join public.lesson_blocks b on b.lesson_id = l.id
  join public.block_claims bc on bc.block_id = b.id join public.claim_sources cs on cs.claim_id = bc.claim_id
  where l.course_id = p_course
$$;

create function public.publisher_publish_course_checked(p_actor uuid, p_course uuid, p_checked jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  checked uuid[];
begin
  perform private.require_publisher(p_actor);
  if jsonb_typeof(p_checked) is distinct from 'array' then perform private.jfail('checkedSources', 'must be an array'); end if;
  checked := private.juuids(p_checked, 'checkedSources', 1000);
  perform private.lock_publishing(false);
  perform 1 from public.courses where id = p_course and org_id is null for update;
  if not found then raise exception 'no such global course' using errcode = 'P0002'; end if;
  if private.cited_sources(p_course) <> checked then
    raise exception 'stale recheck: course % cites sources that were not rechecked', p_course using errcode = 'P0001';
  end if;
  return private.publish(p_course, p_actor);
end;
$$;

revoke all on function private.cited_sources(uuid) from public, anon, authenticated, service_role;
revoke all on function public.publisher_publish_course_checked(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.publisher_publish_course_checked(uuid, uuid, jsonb) to service_role;
