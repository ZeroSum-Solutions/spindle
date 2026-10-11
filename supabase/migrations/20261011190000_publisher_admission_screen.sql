-- P4-A2: the publisher admission screen ("a LEAD tool, not tenant UI"). A signed-in content
-- publisher (private.content_publishers) reads held texts and decides them as themselves, so the app
-- never needs the service key: these wrappers take the actor from auth.uid(), never from a
-- parameter. Everyone else is refused with 42501. They are not named publisher_*: that prefix is
-- reserved for functions only the service role may run (content.test.sql's privilege hygiene).

/** True when the signed-in caller is a content publisher. The app uses it to answer 404 for everyone else. */
create function public.is_content_publisher()
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'not signed in' using errcode = '42501'; end if;
  return exists (select 1 from private.content_publishers where user_id = (select auth.uid()));
end;
$$;

/**
 * Every saved held text with its gym, slot, course, full text, hash and decision state, newest
 * first, for review by a content publisher. `superseded` marks a value a newer save replaced (it can
 * no longer be decided). At most 500 rows.
 */
create function public.admission_tenant_texts()
returns table (
  text_id uuid, org_id uuid, org_name text, org_slug text, slot text, course_id uuid, course_title text,
  text text, text_hash text, rules_version text, saved_at timestamptz, status text, superseded boolean,
  decided_by uuid, decided_at timestamptz, reason text, revoked_at timestamptz, revocation_reason text
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not exists (select 1 from private.content_publishers p where p.user_id = (select auth.uid())) then
    raise exception 'not a content publisher' using errcode = '42501';
  end if;
  return query
    select t.id, t.org_id, o.name, o.slug, t.slot, t.course_id, c.title, t.text, t.text_hash, t.rules_version, t.saved_at,
           private.tenant_text_status(t.id),
           exists (select 1 from private.tenant_texts n where n.org_id = t.org_id and n.slot = t.slot
                   and n.course_id is not distinct from t.course_id and n.seq > t.seq),
           a.decided_by, a.decided_at, a.reason, r.revoked_at, r.reason
    from private.tenant_texts t
    join public.orgs o on o.id = t.org_id
    left join public.courses c on c.id = t.course_id
    left join private.tenant_text_admissions a on a.text_id = t.id
    left join private.tenant_text_revocations r on r.text_id = t.id
    where t.text is not null
    order by t.seq desc
    limit 500;
end;
$$;

/**
 * The signed-in publisher admits or rejects one held text, through publisher_decide_tenant_text
 * with the hash they reviewed (a stale hash, a replaced value or a second decision is refused there).
 */
create function public.admission_decide_tenant_text(p_text uuid, p_decision jsonb)
returns text
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'not signed in' using errcode = '28000'; end if;
  return public.publisher_decide_tenant_text((select auth.uid()), p_text, p_decision);
end;
$$;

revoke all on function public.is_content_publisher(), public.admission_tenant_texts(), public.admission_decide_tenant_text(uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.is_content_publisher(), public.admission_tenant_texts(), public.admission_decide_tenant_text(uuid, jsonb)
  to authenticated;
