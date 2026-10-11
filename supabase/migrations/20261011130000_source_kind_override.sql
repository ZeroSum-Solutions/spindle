-- D-12: a publisher may record a source-type override, stored with its justification and
-- the publisher who recorded it, audited, and still subject to Sol's review of every claim:
--   1. a guideline or position stand that PubMed mislabels (for example a position stand
--      tagged only "Review") is admitted as a position stand;
--   2. an open (CC BY, CC0 or public-domain) anatomy or nomenclature reference, such as a
--      narrative anatomy review, is admitted as a foundation reference. Plan v3 section 4:
--      foundations come from consensus references. Only claims tagged `foundation` may cite
--      one; applied claims (effects, risks, treatments) still need a systematic review,
--      meta-analysis, position stand or guideline. Every writer is held to that rule.
-- Overrides are refused for any other kind and for records whose publication types name a
-- study or a notice. ADR 0004 amendment.

alter table public.sources drop constraint sources_kind_check;
alter table public.sources add constraint sources_kind_check
  check (kind in ('textbook', 'position_stand', 'nomenclature', 'systematic_review', 'meta_analysis', 'foundation_reference'));

alter table public.claims add column domain text not null default 'applied' check (domain in ('foundation', 'applied'));

create table public.source_kind_overrides (
  source_id uuid primary key references public.sources (id),
  kind text not null check (kind in ('position_stand', 'foundation_reference')),
  document_type text not null check (
    (kind = 'position_stand' and document_type in ('position_stand', 'clinical_guideline', 'consensus_statement', 'care_pathway'))
    or (kind = 'foundation_reference' and document_type in ('anatomy_reference', 'nomenclature_reference'))),
  justification text not null check (char_length(justification) between 40 and 2000),
  publication_types text[] not null check (cardinality(publication_types) between 1 and 30),
  recorded_by uuid not null,
  recorded_at timestamptz not null default now()
);

-- Written only by publisher_add_source; frozen once written; its kind is the source's kind.
create function private.guard_source_kind_override()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'source_kind_overrides rows are immutable' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.sources s where s.id = new.source_id and s.kind = new.kind) then
    raise exception 'an override must match its source kind' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger source_kind_overrides_guard
before insert or update or delete on public.source_kind_overrides
for each row execute function private.guard_source_kind_override();
create trigger source_kind_overrides_no_truncate
before truncate on public.source_kind_overrides
for each statement execute function private.guard_truncate();

-- Only foundation claims cite foundation references, whoever writes the rows; a claim's
-- domain never changes once it has sources.
create function private.guard_claim_domain()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_table_name = 'claims' then
    if new.domain is distinct from old.domain then
      raise exception 'a claim''s domain is fixed when it is created' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if exists (select 1 from public.claims c join public.sources s on s.id = new.source_id
             where c.id = new.claim_id and c.domain <> 'foundation' and s.kind = 'foundation_reference') then
    raise exception 'only a foundation claim can cite a foundation reference' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger claims_domain_guard before update on public.claims
for each row execute function private.guard_claim_domain();
create trigger claim_sources_domain_guard before insert or update on public.claim_sources
for each row execute function private.guard_claim_domain();

alter table public.source_kind_overrides enable row level security;
revoke all on public.source_kind_overrides from public, anon, authenticated, service_role;
grant select on public.source_kind_overrides to service_role;

create or replace function private.claim_hash(p_claim uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select private.sha256(jsonb_build_object('id', c.id, 'statement', c.statement, 'evidenceLevel', c.evidence_level,
    'population', c.population,
    'sourceIds', coalesce((select jsonb_agg(cs.source_id order by cs.source_id) from public.claim_sources cs
                           where cs.claim_id = c.id), '[]'::jsonb))
    -- D-12: a foundation claim's hash covers its domain; applied claims keep their earlier hashes.
    || case when c.domain = 'foundation' then '{"domain": "foundation"}'::jsonb else '{}'::jsonb end)
  from public.claims c where c.id = p_claim
$$;

/**
 * The whole licence value names CC BY (any version), CC0 or public domain; the only text
 * allowed after it is the matching Creative Commons URL in parentheses. Mirrors
 * packages/evidence ingest.ts OPEN_LICENSE.
 */
create function private.license_is_open(p_license text)
returns boolean
language sql immutable set search_path = ''
as $$
  select coalesce(p_license ~* ('^\s*(?:(cc[\s_-]?by(?:[\s_-]?\d(?:\.\d)?)?)(?:\s*\(\s*https?://creativecommons\.org/licenses/by/\d\.\d/?\s*\))?'
    || '|(cc0(?:[\s_-]?1\.0)?)(?:\s*\(\s*https?://creativecommons\.org/publicdomain/zero/1\.0/?\s*\))?|public[\s_-]domain)\s*$'), false)
$$;

/** Sources, with an optional D-12 kind override. */
create or replace function public.publisher_add_source(p_actor uuid, p_source jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  sid uuid;
  url text;
  kind text;
  ov jsonb;
  doc_type text;
  pub_types jsonb;
begin
  perform private.require_publisher(p_actor);
  perform private.jobject(p_source, 'source', array['kind', 'title', 'doi', 'pmid', 'url', 'locator', 'license', 'kindOverride'],
    array['kind', 'title', 'license']);
  kind := private.jenum(p_source -> 'kind', 'source.kind',
    array['textbook', 'position_stand', 'nomenclature', 'systematic_review', 'meta_analysis', 'foundation_reference']);
  -- D-12: a recorded override. Guidance documents PubMed mislabels become position stands;
  -- open anatomy or nomenclature references become foundation references, which only
  -- foundation claims may cite. Nothing else can be admitted by override.
  if kind = 'foundation_reference' and not p_source ? 'kindOverride' then
    perform private.jfail('source.kindOverride', 'a foundation reference is admitted only by a recorded override');
  end if;
  if p_source ? 'kindOverride' then
    ov := p_source -> 'kindOverride';
    perform private.jobject(ov, 'source.kindOverride', array['documentType', 'justification', 'publicationTypes'],
      array['documentType', 'justification', 'publicationTypes']);
    if kind not in ('position_stand', 'foundation_reference') then
      perform private.jfail('source.kindOverride', 'only a guideline, position stand or open foundation reference can be recorded by override');
    end if;
    doc_type := private.jenum(ov -> 'documentType', 'source.kindOverride.documentType',
      case kind when 'position_stand' then array['position_stand', 'clinical_guideline', 'consensus_statement', 'care_pathway']
                else array['anatomy_reference', 'nomenclature_reference'] end);
    perform private.jstr(ov -> 'justification', 'source.kindOverride.justification', 40, 2000);
    pub_types := private.jstrs(ov -> 'publicationTypes', 'source.kindOverride.publicationTypes', 1, 30, 200);
    if exists (select 1 from jsonb_array_elements_text(pub_types) t
               where t ~* '(trial|stud(y|ies)|observational|cohort|case.control|case reports?|cross-sectional|letter|comment|editorial|news|interview|retract|erratum|correct|expression of concern|preprint|dataset)') then
      perform private.jfail('source.kindOverride.publicationTypes', 'name a study or notice type; only guidance documents and open references can be overridden');
    end if;
    -- Only CC BY (any version), CC0 and public domain, judged on the whole value (Sol R2 PR26-01).
    if kind = 'foundation_reference' and not private.license_is_open(p_source ->> 'license') then
      perform private.jfail('source.license', 'a foundation reference must carry an open licence (CC BY, CC0 or public domain)');
    end if;
  end if;
  if not (p_source ? 'doi' or p_source ? 'pmid' or p_source ? 'url') then
    perform private.jfail('source', 'needs a doi, pmid or url');
  end if;
  case p_source ->> 'kind'
    when 'textbook' then
      if not p_source ? 'locator' then perform private.jfail('source.locator', 'a textbook needs its edition and page'); end if;
    when 'position_stand' then
      if not p_source ? 'doi' then perform private.jfail('source.doi', 'a position stand needs a DOI'); end if;
    when 'systematic_review', 'meta_analysis' then
      if not (p_source ? 'doi' or p_source ? 'pmid') then
        perform private.jfail('source', format('a %s needs a DOI or PMID', p_source ->> 'kind'));
      end if;
    else null;
  end case;
  if p_source ? 'url' then
    url := private.jlink(p_source -> 'url', 'source.url');
    if private.is_video_host_url(url) then
      perform private.jfail('source.url', 'a video is never a claim source; use the practice-media registry');
    end if;
  end if;
  insert into public.sources (kind, title, doi, pmid, url, locator, license, created_by)
  values (
    kind,
    private.jstr(p_source -> 'title', 'source.title', 1, 500),
    case when p_source ? 'doi' then lower(private.jstr(p_source -> 'doi', 'source.doi', 4, 300)) end,
    case when p_source ? 'pmid' then private.jstr(p_source -> 'pmid', 'source.pmid', 1, 9) end,
    url,
    case when p_source ? 'locator' then private.jstr(p_source -> 'locator', 'source.locator', 1, 200) end,
    private.jstr(p_source -> 'license', 'source.license', 1, 200),
    p_actor)
  returning id into sid;
  perform private.audit(p_actor, 'add_source', null, sid);
  if ov is not null then
    insert into public.source_kind_overrides (source_id, kind, document_type, justification, publication_types, recorded_by)
    values (sid, kind, doc_type, ov ->> 'justification', array(select jsonb_array_elements_text(pub_types)), p_actor);
    perform private.audit(p_actor, 'source_kind_override', null, sid,
      jsonb_build_object('kind', kind, 'document_type', doc_type, 'publication_types', pub_types));
  end if;
  return sid;
end;
$$;

/** Claims, with an optional domain (D-12): foundation or applied (the default). */
create or replace function public.publisher_add_claim(p_actor uuid, p_claim jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  cid uuid;
  source_ids uuid[];
begin
  perform private.require_publisher(p_actor);
  perform private.jobject(p_claim, 'claim', array['statement', 'evidenceLevel', 'population', 'sourceIds', 'domain'],
    array['statement', 'evidenceLevel', 'population', 'sourceIds']);
  source_ids := private.juuids(p_claim -> 'sourceIds', 'claim.sourceIds', 20);
  if cardinality(source_ids) = 0 then perform private.jfail('claim.sourceIds', 'needs at least one source'); end if;
  if exists (select 1 from unnest(source_ids) as u (sid) where not exists (select 1 from public.sources where id = u.sid)) then
    perform private.jfail('claim.sourceIds', 'names an unknown source');
  end if;
  if exists (select 1 from public.sources where id = any (source_ids) and private.is_video_host_url(url)) then
    perform private.jfail('claim.sourceIds', 'a video is never a claim source; use the practice-media registry');
  end if;
  insert into public.claims (statement, evidence_level, population, created_by, domain)
  values (private.jstr(p_claim -> 'statement', 'claim.statement', 1, 2000),
          private.jstr(p_claim -> 'evidenceLevel', 'claim.evidenceLevel', 1, 100),
          private.jstr(p_claim -> 'population', 'claim.population', 1, 500),
          p_actor,
          case when p_claim ? 'domain' then private.jenum(p_claim -> 'domain', 'claim.domain', array['foundation', 'applied']) else 'applied' end)
  returning id into cid;
  insert into public.claim_sources (claim_id, source_id) select cid, s from unnest(source_ids) s;
  perform private.audit(p_actor, 'add_claim', null, cid);
  return cid;
end;
$$;

/** The claim target now names the claim's domain. */
create or replace function public.publisher_claim_target(p_actor uuid, p_claim uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  out jsonb;
begin
  perform private.require_publisher(p_actor);
  select jsonb_build_object('claimId', c.id, 'hash', private.claim_hash(c.id), 'statement', c.statement,
    'evidenceLevel', c.evidence_level, 'population', c.population, 'domain', c.domain,
    'sourceIds', coalesce((select jsonb_agg(cs.source_id order by cs.source_id) from public.claim_sources cs
                           where cs.claim_id = c.id), '[]'::jsonb),
    'status', private.claim_status(c.id))
  into out from public.claims c where c.id = p_claim;
  if out is null then raise exception 'no such claim' using errcode = 'P0002'; end if;
  return out;
end;
$$;

revoke all on function private.guard_source_kind_override(), private.guard_claim_domain(), private.license_is_open(text) from public, anon, authenticated, service_role;
revoke all on function public.publisher_add_source(uuid, jsonb), public.publisher_add_claim(uuid, jsonb),
  public.publisher_claim_target(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.publisher_add_source(uuid, jsonb), public.publisher_add_claim(uuid, jsonb),
  public.publisher_claim_target(uuid, uuid) to service_role;
revoke all on function private.claim_hash(uuid) from public, anon, authenticated, service_role;
