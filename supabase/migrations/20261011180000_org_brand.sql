-- P4-A2, brand-schema part (on the #34 core): a gym's stored brand, the AA contrast checks repeated
-- in SQL so a direct RPC call cannot skip them, the header band tokens, and the member DTOs that
-- W2's components read. The brand name is not part of the stored brand: it is a held tenant text
-- (brand_name), shown only once LEAD admits it. Logo marks wait for P4-A3 (tenant raster admission).

-- WCAG 2.2 contrast, mirroring packages/engine/src/contrast.ts in double precision ---------------

create function private.hex_channel(p_hex text, p_index integer)
returns float8
language sql immutable set search_path = ''
as $$ select ('x' || substr(p_hex, 2 + 2 * p_index, 2))::bit(8)::integer::float8 $$;

/** Relative luminance (WCAG 2.2, sRGB threshold 0.04045). */
create function private.luminance(p_hex text)
returns float8
language sql immutable set search_path = ''
as $$
  select 0.2126::float8 * l[1] + 0.7152::float8 * l[2] + 0.0722::float8 * l[3]
  from (select array(select case when s <= 0.04045::float8 then s / 12.92::float8
                                 else power((s + 0.055::float8) / 1.055::float8, 2.4::float8) end
                     from (select private.hex_channel(p_hex, i) / 255::float8 as s, i from generate_series(0, 2) i) c order by i) as l) x
$$;

/** Contrast ratio, never rounded: pass and fail use this exact value. */
create function private.contrast(p_a text, p_b text)
returns float8
language sql immutable set search_path = ''
as $$
  select (greatest(a, b) + 0.05::float8) / (least(a, b) + 0.05::float8)
  from (select private.luminance(p_a) as a, private.luminance(p_b) as b) x
$$;

/** `a` mixed toward `b` by `t`, in sRGB, rounded half up (as Math.round) to lower-case hex. */
create function private.mix(p_a text, p_b text, p_t float8)
returns text
language sql immutable set search_path = ''
as $$
  select '#' || string_agg(lpad(to_hex(floor(ca + (cb - ca) * p_t + 0.5::float8)::integer), 2, '0'), '' order by i)
  from (select i, private.hex_channel(p_a, i) as ca, private.hex_channel(p_b, i) as cb from generate_series(0, 2) i) c
$$;

/** The tokens a brand's colours become (mirrors brandTokens in @spindle/engine). */
create function private.brand_tokens(p_colors jsonb)
returns jsonb
language sql immutable set search_path = ''
as $$
  select jsonb_build_object('accent', accent, 'accentHover', private.mix(accent, '#000000', 0.15::float8),
    'accentSoft', private.mix(accent, '#ffffff', 0.9::float8), 'onAccent', lower(p_colors ->> 'onAccent'),
    'band', band, 'onBand', on_band, 'bandTint', private.mix(band, on_band, 0.12::float8),
    'bandEdge', private.mix(band, on_band, 0.2::float8))
  from (select lower(p_colors ->> 'accent') as accent, band,
          case when private.contrast('#17232b', band) >= private.contrast('#ffffff', band) then '#17232b' else '#ffffff' end as on_band
        from (select lower(coalesce(p_colors ->> 'band', '#ffffff')) as band) b) t
$$;

/** Every pair a brand's colours are drawn in, in the order brandChecks lists them. */
create function private.brand_checks(p_brand jsonb)
returns table (n integer, role text, state text, foreground text, background text, minimum numeric, ratio float8, pass boolean)
language sql immutable set search_path = ''
as $$
  with t as (select private.brand_tokens(p_brand -> 'colors') as k),
  pairs (n, role, state, fg, bg, minimum) as (
    select v.* from t, lateral (values
      (1, 'Link on surface', 'default', k ->> 'accent', '#ffffff', 4.5),
      (2, 'Link on canvas', 'default', k ->> 'accent', '#f6f8fb', 4.5),
      (3, 'Link on a muted panel', 'default', k ->> 'accent', '#edf1f5', 4.5),
      (4, 'Link on surface', 'hover', k ->> 'accentHover', '#ffffff', 4.5),
      (5, 'Link on canvas', 'hover', k ->> 'accentHover', '#f6f8fb', 4.5),
      (6, 'Link on a muted panel', 'hover', k ->> 'accentHover', '#edf1f5', 4.5),
      (7, 'Current lesson marker', 'selected', k ->> 'accent', k ->> 'accentSoft', 4.5),
      (8, 'Muted text on the current lesson marker', 'selected', '#52616d', k ->> 'accentSoft', 4.5),
      (9, 'Text on the current lesson marker', 'selected', '#17232b', k ->> 'accentSoft', 4.5),
      (10, 'Selected control', 'selected', k ->> 'onAccent', k ->> 'accent', 4.5),
      (11, 'Selected control', 'hover', k ->> 'onAccent', k ->> 'accentHover', 4.5),
      (12, 'Selected control edge', 'selected', k ->> 'accent', '#ffffff', 3),
      (13, 'Focus ring on canvas', 'focus', k ->> 'accent', '#f6f8fb', 3),
      (14, 'Focus ring on surface', 'focus', k ->> 'accent', '#ffffff', 3),
      (15, 'Focus ring on a muted panel', 'focus', k ->> 'accent', '#edf1f5', 3),
      (16, 'Focus ring on the current lesson', 'focus', k ->> 'accent', k ->> 'accentSoft', 3),
      (17, 'Focus ring on a field in error', 'focus', k ->> 'accent', '#fff0ee', 3),
      (18, 'Error text on its panel', 'error', '#b42318', '#fff0ee', 4.5),
      (19, 'Error text on surface', 'error', '#b42318', '#ffffff', 4.5),
      (20, 'Brand name on the band', 'default', k ->> 'onBand', k ->> 'band', 4.5),
      (21, 'Nav link on the band', 'default', k ->> 'onBand', k ->> 'band', 4.5),
      (22, 'Chip text on the band tint', 'default', k ->> 'onBand', k ->> 'bandTint', 4.5),
      (23, 'Focus ring on the band', 'focus', k ->> 'onBand', k ->> 'band', 3)) as v (n, role, state, fg, bg, minimum)
    union all
    select 24, 'Text mark in the header', 'default', k ->> 'accent', '#ffffff', 3 from t where p_brand -> 'mark' ->> 'kind' = 'text'
  )
  select n, role, state, fg, bg, minimum, private.contrast(fg, bg), private.contrast(fg, bg) >= minimum::float8
  from pairs order by n
$$;

-- The stored brand ---------------------------------------------------------------------------

/** One brand per gym: text mark, literal colours, one bundled font. Server-side only; members read the DTO. */
create table private.org_brand (
  org_id uuid primary key references public.orgs (id) on delete cascade,
  brand jsonb not null,
  updated_by uuid not null,
  updated_at timestamptz not null default clock_timestamp()
);
alter table private.org_brand enable row level security;

/**
 * The brand-output revision of a gym, for cache keys (org:{id}:brand:{revision}). It moves in the
 * same transaction as any brand save and any decision or revocation of a gym-scope held text.
 */
create table private.org_brand_revision (
  org_id uuid primary key references public.orgs (id) on delete cascade,
  revision bigint not null default 0
);
alter table private.org_brand_revision enable row level security;

create function private.bump_brand_revision(p_org uuid)
returns bigint
language sql security definer set search_path = ''
as $$
  insert into private.org_brand_revision as r (org_id, revision) values (p_org, 1)
  on conflict (org_id) do update set revision = r.revision + 1
  returning revision
$$;

create function private.bump_brand_revision_on_text()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  t private.tenant_texts%rowtype;
begin
  select * into t from private.tenant_texts where id = new.text_id;
  if private.held_slot_scope(t.slot) = 'org' then perform private.bump_brand_revision(t.org_id); end if;
  return new;
end;
$$;
create trigger tenant_text_admissions_brand_revision after insert on private.tenant_text_admissions
  for each row execute function private.bump_brand_revision_on_text();
create trigger tenant_text_revocations_brand_revision after insert on private.tenant_text_revocations
  for each row execute function private.bump_brand_revision_on_text();

/**
 * Validates a brand document and returns it normalized (lower-case colours), or raises 22023. The
 * shape mirrors orgBrandInputSchema in @spindle/schema; the checks mirror brandChecks.
 */
create function private.validate_org_brand(p_brand jsonb)
returns jsonb
language plpgsql immutable set search_path = ''
as $$
declare
  k text;
  colors jsonb;
  failing record;
begin
  if jsonb_typeof(p_brand) = 'object' and p_brand ? 'name' then
    perform private.jfail('brand.name', 'the brand name is a held tenant text; save it with save_tenant_text');
  end if;
  perform private.jobject(p_brand, 'brand', array['mark', 'colors', 'font'], array['mark', 'colors', 'font']);
  if jsonb_typeof(p_brand -> 'mark') = 'object' and p_brand -> 'mark' ->> 'kind' = 'logo' then
    perform private.jfail('brand.mark', 'logo marks wait for tenant raster admission (P4-A3); use the text mark');
  end if;
  perform private.jobject(p_brand -> 'mark', 'brand.mark', array['kind'], array['kind']);
  perform private.jenum(p_brand -> 'mark' -> 'kind', 'brand.mark.kind', array['text']);
  perform private.jobject(p_brand -> 'colors', 'brand.colors', array['accent', 'onAccent', 'band'], array['accent', 'onAccent']);
  foreach k in array array['accent', 'onAccent', 'band'] loop
    if (p_brand -> 'colors') ? k and (jsonb_typeof(p_brand -> 'colors' -> k) is distinct from 'string'
        or p_brand -> 'colors' ->> k !~ '^#[0-9a-fA-F]{6}$') then
      perform private.jfail('brand.colors.' || k, 'must be a #RRGGBB colour');
    end if;
  end loop;
  perform private.jenum(p_brand -> 'font', 'brand.font', array['geist', 'barlow-condensed', 'fraunces']);
  colors := jsonb_build_object('accent', lower(p_brand -> 'colors' ->> 'accent'), 'onAccent', lower(p_brand -> 'colors' ->> 'onAccent'))
    || case when (p_brand -> 'colors') ? 'band' then jsonb_build_object('band', lower(p_brand -> 'colors' ->> 'band')) else '{}' end;
  select * into failing from private.brand_checks(p_brand) c where not c.pass order by c.n limit 1;
  if found then
    perform private.jfail('brand', format('%s (%s): %s:1, needs %s:1', failing.role, failing.state,
      to_char(floor(failing.ratio * 100) / 100, 'FM990.00'), failing.minimum));
  end if;
  return jsonb_build_object('mark', jsonb_build_object('kind', 'text'), 'colors', colors, 'font', p_brand ->> 'font');
end;
$$;

/** Saves the gym's brand (owner only; spec revision 2a). Every AA check runs here, not only in the editor. */
create function public.save_org_brand(p_org uuid, p_brand jsonb)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  b jsonb;
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if p_org is null or private.role_in(p_org) is distinct from 'owner' then
    raise exception 'only the owner of this gym can change its brand' using errcode = '42501';
  end if;
  b := private.validate_org_brand(p_brand);
  perform 1 from public.orgs where id = p_org for update;
  insert into private.org_brand (org_id, brand, updated_by) values (p_org, b, uid)
  on conflict (org_id) do update set brand = excluded.brand, updated_by = excluded.updated_by, updated_at = clock_timestamp();
  perform private.audit(uid, 'save_org_brand', p_org, p_org, jsonb_build_object('brand', b));
  return private.bump_brand_revision(p_org);
end;
$$;

-- Member DTOs ----------------------------------------------------------------------------------

/**
 * MemberBrandDto: what a member's pages may show of the gym. The name is the admitted brand name or
 * the fixed fallback; catalog texts appear only while admitted. `brand` is null until the owner
 * saves one (the app then uses Spindle's own look). Members only; never anonymous.
 */
create function public.member_brand(p_org uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  texts jsonb;
begin
  if (select auth.uid()) is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if not private.is_member(p_org) then raise exception 'not a member of this gym' using errcode = '42501'; end if;
  select coalesce(jsonb_object_agg(case x.slot when 'catalog_headline' then 'headline' when 'catalog_tagline' then 'tagline'
      when 'coach_name' then 'coachName' when 'coach_role' then 'coachRole' end, a.text), '{}')
  into texts
  from unnest(array['catalog_headline', 'catalog_tagline', 'coach_name', 'coach_role']) as x (slot),
       lateral private.admitted_tenant_text(p_org, x.slot, null) a;
  return jsonb_build_object(
    'orgId', p_org,
    'revision', coalesce((select r.revision from private.org_brand_revision r where r.org_id = p_org), 0),
    'name', coalesce((select a.text from private.admitted_tenant_text(p_org, 'brand_name', null) a), private.tt_rules() -> 'fallbacks' ->> 'brand_name'),
    'nameAdmitted', exists (select 1 from private.admitted_tenant_text(p_org, 'brand_name', null)),
    'brand', (select b.brand from private.org_brand b where b.org_id = p_org),
    'texts', texts);
end;
$$;

/**
 * CourseCardDto list for a member's catalog: the latest version of every global course and of this
 * gym's method courses. Gym titles and blurbs are shown only while their receipts are live; a
 * revoked title reads as the fallback and a revoked blurb is left out. Base and modality courses
 * use Spindle's cover (cover null); only gym method courses carry a tenant cover.
 */
create function public.member_course_cards(p_org uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if not private.is_member(p_org) then raise exception 'not a member of this gym' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'versionId', v.id, 'courseId', v.course_id, 'layer', v.layer,
        'layerLabel', case v.layer when 'base' then 'Base' when 'modality' then 'Modality' else 'Gym method' end,
        'title', case when v.org_id is null or private.receipt_live((s ->> 'titleReceiptId')::uuid) then s ->> 'title'
                      else private.tt_rules() -> 'fallbacks' ->> 'course_title' end,
        'summary', case when v.org_id is null then nullif(s ->> 'subtitle', '')
                        when private.receipt_live((s -> 'blurb' ->> 'receiptId')::uuid) then s -> 'blurb' ->> 'text' end,
        'cover', case when v.org_id is null then null else s -> 'cover' end,
        'tags', coalesce(s -> 'tags', '[]'),
        'lessonCount', (select count(*) from jsonb_path_query(s, '$.parts[*].lessons[*]')),
        'durationMinutes', (select coalesce(sum((d #>> '{}')::integer), 0) from jsonb_path_query(s, '$.parts[*].lessons[*].durationMinutes') d),
        'publishedBySpindle', v.org_id is null,
        'seal', v.layer = 'base')
      order by (v.org_id is null), v.layer desc, s ->> 'title')
    from (select distinct on (cv.course_id) cv.* from public.curriculum_versions cv
          where cv.org_id is null or cv.org_id = p_org
          order by cv.course_id, cv.version_number desc) v,
         lateral (select v.snapshot as s) x), '[]'::jsonb);
end;
$$;

-- Privileges -----------------------------------------------------------------------------------

revoke all on table private.org_brand, private.org_brand_revision from public, anon, authenticated, service_role;
revoke all on function private.hex_channel(text, integer), private.luminance(text), private.contrast(text, text),
  private.mix(text, text, float8), private.brand_tokens(jsonb), private.brand_checks(jsonb), private.bump_brand_revision(uuid),
  private.bump_brand_revision_on_text(), private.validate_org_brand(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.save_org_brand(uuid, jsonb), public.member_brand(uuid), public.member_course_cards(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.save_org_brand(uuid, jsonb), public.member_brand(uuid), public.member_course_cards(uuid) to authenticated;
