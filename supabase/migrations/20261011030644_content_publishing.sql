-- Phase 2: content drafts, the publish gate, immutable versions, assignments
-- and progress. ADR 0005 explains the model.
--
-- Who writes what:
-- - Global content (base and modality layers, claims, sources, reviews) is
--   written only through the publisher_* functions. Only the service role may
--   execute them, and each call names an actor that must be listed in
--   private.content_publishers. Every call is audited.
-- - Gyms author method-layer courses (always practice-based) through
--   save_course_draft and publish_course, as owners or leads.
-- - No client or service-role key has direct INSERT, UPDATE or DELETE on any
--   table here. Triggers repeat the invariants for the table owner too.

-- The nil uuid is the scope key of global rows (see the scope columns below).
alter table public.orgs add constraint orgs_id_not_nil
  check (id <> '00000000-0000-0000-0000-000000000000'::uuid);

-- Publishers and the audit log ---------------------------------------------

/** Users allowed to act on global content. Managed by owner-run SQL only. */
create table private.content_publishers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  granted_at timestamptz not null default now(),
  note text not null default '' check (char_length(note) <= 200)
);

create table private.content_audit (
  id bigint generated always as identity primary key,
  actor uuid not null,
  action text not null,
  org_id uuid,
  target uuid,
  detail jsonb not null default '{}'::jsonb,
  at timestamptz not null default clock_timestamp()
);

create function private.audit(p_actor uuid, p_action text, p_org uuid, p_target uuid, p_detail jsonb default '{}'::jsonb)
returns void
language sql security definer set search_path = ''
as $$
  insert into private.content_audit (actor, action, org_id, target, detail)
  values (p_actor, p_action, p_org, p_target, coalesce(p_detail, '{}'::jsonb))
$$;

/** The service key proves the server is calling; this proves who it acts for. */
create function private.require_publisher(p_actor uuid)
returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_actor is null or not exists (select 1 from private.content_publishers where user_id = p_actor) then
    raise exception 'actor is not a content publisher' using errcode = '42501';
  end if;
end;
$$;

/** Tenant authoring: the signed-in caller must be an owner or lead of the org. */
create function private.require_author(p_org uuid)
returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if p_org is null or coalesce(private.role_in(p_org) not in ('owner', 'lead'), true) then
    raise exception 'only owners and leads of this org can author or assign content' using errcode = '42501';
  end if;
  return uid;
end;
$$;

-- Evidence: sources, claims, reviews (global, append-only) ----------------------

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('textbook', 'position_stand', 'nomenclature', 'systematic_review', 'meta_analysis')),
  title text not null check (char_length(title) between 1 and 500),
  doi text unique check (doi ~ '^10\.[0-9]{4,9}/\S+$' and doi = lower(doi)),
  pmid text check (pmid ~ '^[0-9]{1,9}$'),
  url text check (url ~ '^https://\S+$'),
  locator text check (char_length(locator) <= 200),
  license text not null check (char_length(license) between 1 and 200),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  check (doi is not null or pmid is not null or url is not null)
);

create table public.claims (
  id uuid primary key default gen_random_uuid(),
  statement text not null check (char_length(statement) between 1 and 2000),
  evidence_level text not null check (char_length(evidence_level) between 1 and 100),
  population text not null check (char_length(population) between 1 and 500),
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create table public.claim_sources (
  claim_id uuid not null references public.claims (id),
  source_id uuid not null references public.sources (id),
  primary key (claim_id, source_id)
);
create index claim_sources_source_idx on public.claim_sources (source_id);

/** The latest review of a claim decides. A later rejection withdraws an approval. */
create table public.claim_reviews (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity unique,
  claim_id uuid not null references public.claims (id),
  decision text not null check (decision in ('approved', 'rejected')),
  expires_at timestamptz,
  receipt jsonb not null,
  reviewer uuid not null,
  created_at timestamptz not null default now(),
  check (decision = 'rejected' or expires_at is not null)
);
create index claim_reviews_claim_idx on public.claim_reviews (claim_id, seq desc);

/** A Crossref (or manual) retraction notice. One retracted source retracts every claim citing it. */
create table public.source_retractions (
  source_id uuid primary key references public.sources (id),
  notice jsonb not null,
  recorded_by uuid not null,
  recorded_at timestamptz not null default now()
);

/**
 * A trusted reviewer's verdict that one exact block (kind + content, by hash)
 * is faithfully supported by exactly this claim set. Existence of an approved
 * claim is not enough to publish: the pair must have a 'supported' verdict.
 */
create table public.binding_reviews (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity unique,
  block_hash text not null check (block_hash ~ '^[0-9a-f]{64}$'),
  claim_ids uuid[] not null check (cardinality(claim_ids) between 1 and 50),
  verdict text not null check (verdict in ('supported', 'unsupported')),
  notes text not null default '' check (char_length(notes) <= 2000),
  reviewer uuid not null,
  created_at timestamptz not null default now()
);
create index binding_reviews_key_idx on public.binding_reviews (block_hash, claim_ids, seq desc);

-- Drafts ------------------------------------------------------------------------
-- org_id is null for global courses. scope repeats it with the nil uuid for
-- global rows, so composite foreign keys can keep every child in its parent's
-- tenant (a null would switch the check off).

create table public.courses (
  id uuid primary key,
  org_id uuid references public.orgs (id) on delete cascade,
  scope uuid not null generated always as (coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid)) stored,
  layer text not null check (layer in ('base', 'modality', 'method')),
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,78}[a-z0-9]$'),
  title text not null,
  subtitle text not null,
  description text not null,
  level text not null check (level in ('foundation', 'intermediate', 'advanced')),
  outcomes jsonb not null check (jsonb_typeof(outcomes) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid not null,
  -- Gyms own method courses; base and modality courses are global.
  check ((layer = 'method') = (org_id is not null)),
  unique (scope, slug),
  unique (id, scope)
);
create index courses_org_idx on public.courses (org_id);

create table public.course_parts (
  id uuid primary key,
  course_id uuid not null,
  org_id uuid references public.orgs (id) on delete cascade,
  scope uuid not null generated always as (coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid)) stored,
  ordinal integer not null check (ordinal >= 1),
  title text not null,
  summary text not null,
  foreign key (course_id, scope) references public.courses (id, scope) on delete cascade,
  unique (course_id, ordinal),
  unique (id, course_id, scope)
);
create index course_parts_org_idx on public.course_parts (org_id);

create table public.lessons (
  id uuid primary key,
  course_id uuid not null,
  part_id uuid not null,
  org_id uuid references public.orgs (id) on delete cascade,
  scope uuid not null generated always as (coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid)) stored,
  ordinal integer not null check (ordinal >= 1),
  slug text not null,
  title text not null,
  summary text not null,
  duration_minutes integer not null check (duration_minutes between 1 and 600),
  format text not null check (format in ('article', 'video', 'diagram', 'practice', 'quiz')),
  objectives jsonb not null check (jsonb_typeof(objectives) = 'array'),
  anatomy_ids jsonb not null check (jsonb_typeof(anatomy_ids) = 'array'),
  media jsonb not null check (jsonb_typeof(media) = 'array'),
  resources jsonb not null check (jsonb_typeof(resources) = 'array'),
  foreign key (part_id, course_id, scope) references public.course_parts (id, course_id, scope) on delete cascade,
  unique (part_id, ordinal),
  unique (course_id, slug),
  unique (id, scope)
);
create index lessons_org_idx on public.lessons (org_id);

create table public.lesson_blocks (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null,
  org_id uuid references public.orgs (id) on delete cascade,
  scope uuid not null generated always as (coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid)) stored,
  ordinal integer not null check (ordinal >= 1),
  kind text not null check (kind in ('heading', 'paragraph', 'callout', 'image', 'checklist', 'diagram', 'quiz')),
  support text check (support in ('science', 'practice-based')),
  content jsonb not null,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  foreign key (lesson_id, scope) references public.lessons (id, scope) on delete cascade,
  unique (lesson_id, ordinal),
  -- Only statements about the body say how they are supported.
  check ((support is null) = (kind in ('heading', 'image', 'diagram')))
);
create index lesson_blocks_org_idx on public.lesson_blocks (org_id);

create table public.block_claims (
  block_id uuid not null references public.lesson_blocks (id) on delete cascade,
  claim_id uuid not null references public.claims (id),
  primary key (block_id, claim_id)
);
create index block_claims_claim_idx on public.block_claims (claim_id);

-- Published versions (immutable) --------------------------------------------------

create table public.curriculum_versions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null,
  org_id uuid references public.orgs (id) on delete cascade,
  scope uuid not null generated always as (coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid)) stored,
  layer text not null check (layer in ('base', 'modality', 'method')),
  version_number integer not null check (version_number >= 1),
  snapshot jsonb not null,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  published_by uuid not null,
  published_at timestamptz not null default now(),
  foreign key (course_id, scope) references public.courses (id, scope) on delete cascade,
  unique (course_id, version_number),
  unique (id, scope)
);
create index curriculum_versions_org_idx on public.curriculum_versions (org_id);

create table public.version_lessons (
  version_id uuid not null,
  lesson_id uuid not null,
  org_id uuid references public.orgs (id) on delete cascade,
  scope uuid not null generated always as (coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid)) stored,
  ordinal integer not null check (ordinal >= 1),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  primary key (version_id, lesson_id),
  foreign key (version_id, scope) references public.curriculum_versions (id, scope) on delete cascade,
  unique (version_id, lesson_id, content_hash),
  unique (version_id, ordinal)
);
create index version_lessons_org_idx on public.version_lessons (org_id);

/** Which claims a published lesson cites; drives retraction flags. */
create table public.version_claims (
  version_id uuid not null,
  lesson_id uuid not null,
  claim_id uuid not null references public.claims (id),
  primary key (version_id, lesson_id, claim_id),
  foreign key (version_id, lesson_id) references public.version_lessons (version_id, lesson_id) on delete cascade
);
create index version_claims_claim_idx on public.version_claims (claim_id);

/** A published version cites a claim whose source was retracted after publishing. */
create table public.version_flags (
  version_id uuid not null references public.curriculum_versions (id) on delete cascade,
  claim_id uuid not null references public.claims (id),
  source_id uuid not null references public.sources (id),
  reason text not null check (reason in ('retracted')),
  flagged_at timestamptz not null default now(),
  primary key (version_id, claim_id, source_id)
);

-- Assignments and progress ----------------------------------------------------------

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  version_id uuid not null references public.curriculum_versions (id) on delete cascade,
  user_id uuid not null,
  assigned_by uuid not null,
  assigned_at timestamptz not null default now(),
  foreign key (org_id, user_id) references public.memberships (org_id, user_id) on delete cascade,
  unique (org_id, version_id, user_id)
);
create index assignments_user_idx on public.assignments (user_id);
create index assignments_version_idx on public.assignments (version_id);

/**
 * One row per learner, version and lesson. origin_completion_id is null for a
 * lesson done in this version; for credit carried from an earlier version it
 * points to the original completion (always the root, never a chain).
 */
create table public.lesson_completions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  user_id uuid not null,
  version_id uuid not null,
  lesson_id uuid not null,
  content_hash text not null,
  completed_at timestamptz not null default now(),
  origin_completion_id uuid,
  foreign key (org_id, version_id, user_id) references public.assignments (org_id, version_id, user_id) on delete cascade,
  foreign key (version_id, lesson_id, content_hash)
    references public.version_lessons (version_id, lesson_id, content_hash) on delete cascade,
  foreign key (origin_completion_id, org_id, user_id)
    references public.lesson_completions (id, org_id, user_id) on delete cascade,
  unique (org_id, user_id, version_id, lesson_id),
  unique (id, org_id, user_id)
);
create index lesson_completions_user_idx on public.lesson_completions (user_id);
create index lesson_completions_version_idx on public.lesson_completions (version_id, lesson_id);
create index lesson_completions_origin_idx on public.lesson_completions (origin_completion_id);

-- Invariants for every caller, the table owner included ------------------------------

/**
 * Rows are write-once. A row that carries org_id may disappear only while its
 * org is being deleted (offboarding a gym); global rows never do.
 */
create function private.guard_immutable()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  owner_org uuid;
begin
  if tg_op = 'DELETE' then
    owner_org := (to_jsonb(old) ->> 'org_id')::uuid;
    if owner_org is not null and not exists (select 1 from public.orgs o where o.id = owner_org) then
      return old;
    end if;
  end if;
  raise exception '% rows are immutable', tg_table_name using errcode = 'P0001';
end;
$$;

create function private.guard_truncate()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception '% cannot be truncated', tg_table_name using errcode = 'P0001';
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['sources', 'claims', 'claim_sources', 'claim_reviews', 'source_retractions',
    'binding_reviews', 'curriculum_versions', 'version_lessons', 'version_claims', 'version_flags'] loop
    execute format('create trigger %I before update or delete on public.%I for each row execute function private.guard_immutable()',
      t || '_immutable', t);
    execute format('create trigger %I before truncate on public.%I for each statement execute function private.guard_truncate()',
      t || '_no_truncate', t);
  end loop;
  -- Progress rows never change; they go away only with their membership or org.
  foreach t in array array['assignments', 'lesson_completions'] loop
    execute format('create trigger %I before update on public.%I for each row execute function private.guard_immutable()',
      t || '_immutable', t);
  end loop;
end;
$$;

/** An org may only assign global versions or its own. */
create function private.guard_assignment()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.curriculum_versions v
                 where v.id = new.version_id and (v.org_id is null or v.org_id = new.org_id)) then
    raise exception 'an org can only assign global versions or its own' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger assignments_guard
before insert on public.assignments
for each row execute function private.guard_assignment();

-- JSON boundary validation -----------------------------------------------------------
-- Every jsonb argument from outside is checked here: types, lengths, enums and
-- unknown keys. The validators return a normalized copy (claim ids sorted and
-- de-duplicated, numbers as integers), which is what gets stored and hashed.

create function private.jfail(p_path text, p_msg text)
returns void
language plpgsql immutable set search_path = ''
as $$
begin
  raise exception 'invalid %: %', p_path, p_msg using errcode = '22023';
end;
$$;

create function private.jobject(p_value jsonb, p_path text, p_allowed text[], p_required text[])
returns void
language plpgsql immutable set search_path = ''
as $$
declare
  k text;
begin
  if jsonb_typeof(p_value) is distinct from 'object' then
    perform private.jfail(p_path, 'must be an object');
  end if;
  for k in select jsonb_object_keys(p_value) loop
    if not k = any (p_allowed) then perform private.jfail(p_path, format('unknown key %s', k)); end if;
  end loop;
  foreach k in array p_required loop
    if not p_value ? k then perform private.jfail(p_path || '.' || k, 'is required'); end if;
  end loop;
end;
$$;

create function private.jstr(p_value jsonb, p_path text, p_min integer, p_max integer)
returns text
language plpgsql immutable set search_path = ''
as $$
declare
  s text;
begin
  if jsonb_typeof(p_value) is distinct from 'string' then perform private.jfail(p_path, 'must be a string'); end if;
  s := p_value #>> '{}';
  if char_length(btrim(s)) < p_min or char_length(s) > p_max then
    perform private.jfail(p_path, format('must be %s to %s characters', p_min, p_max));
  end if;
  return s;
end;
$$;

create function private.jstrs(p_value jsonb, p_path text, p_min_items integer, p_max_items integer, p_max_len integer)
returns jsonb
language plpgsql immutable set search_path = ''
as $$
declare
  n integer;
begin
  if jsonb_typeof(p_value) is distinct from 'array' then perform private.jfail(p_path, 'must be an array'); end if;
  n := jsonb_array_length(p_value);
  if n < p_min_items or n > p_max_items then
    perform private.jfail(p_path, format('must have %s to %s items', p_min_items, p_max_items));
  end if;
  for i in 0 .. n - 1 loop
    perform private.jstr(p_value -> i, format('%s[%s]', p_path, i), 1, p_max_len);
  end loop;
  return p_value;
end;
$$;

create function private.jint(p_value jsonb, p_path text, p_min integer, p_max integer)
returns integer
language plpgsql immutable set search_path = ''
as $$
declare
  n numeric;
begin
  if jsonb_typeof(p_value) is distinct from 'number' then perform private.jfail(p_path, 'must be a number'); end if;
  n := (p_value #>> '{}')::numeric;
  if n <> trunc(n) or n < p_min or n > p_max then
    perform private.jfail(p_path, format('must be an integer from %s to %s', p_min, p_max));
  end if;
  return n::integer;
end;
$$;

create function private.jenum(p_value jsonb, p_path text, p_allowed text[])
returns text
language plpgsql immutable set search_path = ''
as $$
begin
  if jsonb_typeof(p_value) is distinct from 'string' or not (p_value #>> '{}') = any (p_allowed) then
    perform private.jfail(p_path, format('must be one of %s', array_to_string(p_allowed, ', ')));
  end if;
  return p_value #>> '{}';
end;
$$;

create function private.juuid(p_value jsonb, p_path text)
returns uuid
language plpgsql immutable set search_path = ''
as $$
begin
  if jsonb_typeof(p_value) is distinct from 'string'
     or (p_value #>> '{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    perform private.jfail(p_path, 'must be a lowercase uuid');
  end if;
  return (p_value #>> '{}')::uuid;
end;
$$;

/** Sorted, de-duplicated uuid array (claim and source id sets). */
create function private.juuids(p_value jsonb, p_path text, p_max_items integer)
returns uuid[]
language plpgsql immutable set search_path = ''
as $$
declare
  ids uuid[] := '{}';
begin
  if jsonb_typeof(p_value) is distinct from 'array' then perform private.jfail(p_path, 'must be an array'); end if;
  if jsonb_array_length(p_value) > p_max_items then perform private.jfail(p_path, format('must have at most %s items', p_max_items)); end if;
  for i in 0 .. jsonb_array_length(p_value) - 1 loop
    ids := ids || private.juuid(p_value -> i, format('%s[%s]', p_path, i));
  end loop;
  return array(select distinct x from unnest(ids) x order by x);
end;
$$;

/** Absolute https URLs or same-site paths; never javascript:, data:, protocol-relative, backslashes or dot segments. */
create function private.jlink(p_value jsonb, p_path text)
returns text
language plpgsql immutable set search_path = ''
as $$
declare
  s text := private.jstr(p_value, p_path, 1, 2048);
begin
  if s !~ '^(https://[^\s/]+(/\S*)?|/[^\s/\\]\S*)$' or strpos(s, '\') > 0 or s ~ '(^|/)\.\.?(/|$|[?#])' then
    perform private.jfail(p_path, 'must be an https URL or a site path');
  end if;
  return s;
end;
$$;

create function private.jtimestamp(p_value jsonb, p_path text)
returns timestamptz
language plpgsql stable set search_path = ''
as $$
declare
  s text := private.jstr(p_value, p_path, 1, 40);
begin
  if s !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$' then
    perform private.jfail(p_path, 'must be an ISO 8601 timestamp with a time zone');
  end if;
  begin
    return s::timestamptz;
  exception when others then
    perform private.jfail(p_path, 'is not a valid timestamp');
  end;
end;
$$;

create function private.validate_media(p_value jsonb, p_path text)
returns jsonb
language plpgsql immutable set search_path = ''
as $$
begin
  perform private.jobject(p_value, p_path, array['kind', 'src', 'alt', 'caption', 'provenanceId'],
    array['kind', 'src', 'alt', 'caption', 'provenanceId']);
  return jsonb_build_object(
    'kind', private.jenum(p_value -> 'kind', p_path || '.kind', array['image', 'video', 'diagram']),
    'src', private.jlink(p_value -> 'src', p_path || '.src'),
    'alt', private.jstr(p_value -> 'alt', p_path || '.alt', 1, 500),
    'caption', private.jstr(p_value -> 'caption', p_path || '.caption', 0, 1000),
    'provenanceId', private.jstr(p_value -> 'provenanceId', p_path || '.provenanceId', 1, 200));
end;
$$;

create function private.validate_block(p_value jsonb, p_path text, p_layer text)
returns jsonb
language plpgsql immutable set search_path = ''
as $$
declare
  kind text;
  content jsonb;
  support text;
  claim_ids uuid[];
  n integer;
begin
  if jsonb_typeof(p_value) is distinct from 'object' then perform private.jfail(p_path, 'must be an object'); end if;
  kind := private.jenum(p_value -> 'kind', p_path || '.kind',
    array['heading', 'paragraph', 'callout', 'image', 'checklist', 'diagram', 'quiz']);
  if kind in ('heading', 'image', 'diagram') then
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
      perform private.jobject(p_value -> 'content', p_path || '.content', array['diagramId', 'caption'], array['diagramId', 'caption']);
      content := jsonb_build_object(
        'diagramId', private.jstr(p_value -> 'content' -> 'diagramId', p_path || '.content.diagramId', 1, 200),
        'caption', private.jstr(p_value -> 'content' -> 'caption', p_path || '.content.caption', 0, 1000));
    when 'quiz' then
      perform private.jobject(p_value -> 'content', p_path || '.content',
        array['prompt', 'options', 'answerIndex', 'explanation'], array['prompt', 'options', 'answerIndex', 'explanation']);
      n := jsonb_array_length(private.jstrs(p_value -> 'content' -> 'options', p_path || '.content.options', 2, 10, 500));
      content := jsonb_build_object(
        'prompt', private.jstr(p_value -> 'content' -> 'prompt', p_path || '.content.prompt', 1, 2000),
        'options', p_value -> 'content' -> 'options',
        'answerIndex', private.jint(p_value -> 'content' -> 'answerIndex', p_path || '.content.answerIndex', 0, n - 1),
        'explanation', private.jstr(p_value -> 'content' -> 'explanation', p_path || '.content.explanation', 1, 5000));
  end case;

  if kind in ('heading', 'image', 'diagram') then
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
  if p_layer = 'base' and kind = 'quiz' and support <> 'science' then
    perform private.jfail(p_path, 'a base-layer quiz explanation must bind claims');
  end if;
  return jsonb_build_object('kind', kind, 'content', content, 'support', support, 'claimIds', to_jsonb(claim_ids));
end;
$$;

/** Validates a whole Course tree (the @spindle/schema shape) and returns it normalized. */
create function private.validate_course(p_course jsonb)
returns jsonb
language plpgsql immutable set search_path = ''
as $$
declare
  layer text;
  part jsonb;
  lesson jsonb;
  pp text;
  lp text;
  parts jsonb := '[]'::jsonb;
  lessons jsonb;
  blocks jsonb;
  media jsonb;
  resources jsonb;
  anatomy jsonb;
  ids uuid[];
  slugs text[] := '{}';
  id uuid;
  slug text;
begin
  if octet_length(p_course::text) > 2000000 then perform private.jfail('course', 'is larger than 2 MB'); end if;
  perform private.jobject(p_course, 'course',
    array['id', 'slug', 'layer', 'title', 'subtitle', 'description', 'level', 'outcomes', 'parts'],
    array['id', 'slug', 'layer', 'title', 'subtitle', 'description', 'level', 'outcomes', 'parts']);
  layer := private.jenum(p_course -> 'layer', 'course.layer', array['base', 'modality', 'method']);
  ids := array[private.juuid(p_course -> 'id', 'course.id')];
  slug := private.jstr(p_course -> 'slug', 'course.slug', 2, 80);
  if slug !~ '^[a-z0-9][a-z0-9-]{0,78}[a-z0-9]$' then perform private.jfail('course.slug', 'must be lowercase kebab-case'); end if;
  if jsonb_typeof(p_course -> 'parts') is distinct from 'array'
     or jsonb_array_length(p_course -> 'parts') not between 1 and 50 then
    perform private.jfail('course.parts', 'must have 1 to 50 parts');
  end if;

  for i in 0 .. jsonb_array_length(p_course -> 'parts') - 1 loop
    part := p_course -> 'parts' -> i;
    pp := format('course.parts[%s]', i);
    perform private.jobject(part, pp, array['id', 'ordinal', 'title', 'summary', 'lessons'],
      array['id', 'ordinal', 'title', 'summary', 'lessons']);
    id := private.juuid(part -> 'id', pp || '.id');
    if id = any (ids) then perform private.jfail(pp || '.id', 'is a duplicate id'); end if;
    ids := ids || id;
    if private.jint(part -> 'ordinal', pp || '.ordinal', 1, 50) <> i + 1 then
      perform private.jfail(pp || '.ordinal', 'must equal the part''s position');
    end if;
    if jsonb_typeof(part -> 'lessons') is distinct from 'array'
       or jsonb_array_length(part -> 'lessons') not between 1 and 100 then
      perform private.jfail(pp || '.lessons', 'must have 1 to 100 lessons');
    end if;
    lessons := '[]'::jsonb;
    for j in 0 .. jsonb_array_length(part -> 'lessons') - 1 loop
      lesson := part -> 'lessons' -> j;
      lp := format('%s.lessons[%s]', pp, j);
      perform private.jobject(lesson, lp,
        array['id', 'slug', 'title', 'summary', 'durationMinutes', 'format', 'objectives', 'anatomyIds', 'blocks', 'media', 'resources'],
        array['id', 'slug', 'title', 'summary', 'durationMinutes', 'format', 'objectives', 'anatomyIds', 'blocks', 'media', 'resources']);
      id := private.juuid(lesson -> 'id', lp || '.id');
      if id = any (ids) then perform private.jfail(lp || '.id', 'is a duplicate id'); end if;
      ids := ids || id;
      slug := private.jstr(lesson -> 'slug', lp || '.slug', 2, 80);
      if slug !~ '^[a-z0-9][a-z0-9-]{0,78}[a-z0-9]$' then perform private.jfail(lp || '.slug', 'must be lowercase kebab-case'); end if;
      if slug = any (slugs) then perform private.jfail(lp || '.slug', 'is a duplicate lesson slug'); end if;
      slugs := slugs || slug;

      anatomy := private.jstrs(lesson -> 'anatomyIds', lp || '.anatomyIds', 0, 50, 20);
      for k in 0 .. jsonb_array_length(anatomy) - 1 loop
        if (anatomy ->> k) !~ '^UBERON:[0-9]{7}$' then
          perform private.jfail(format('%s.anatomyIds[%s]', lp, k), 'must be an Uberon id');
        end if;
      end loop;

      if jsonb_typeof(lesson -> 'blocks') is distinct from 'array'
         or jsonb_array_length(lesson -> 'blocks') not between 1 and 200 then
        perform private.jfail(lp || '.blocks', 'must have 1 to 200 blocks');
      end if;
      blocks := '[]'::jsonb;
      for k in 0 .. jsonb_array_length(lesson -> 'blocks') - 1 loop
        blocks := blocks || jsonb_build_array(
          private.validate_block(lesson -> 'blocks' -> k, format('%s.blocks[%s]', lp, k), layer));
      end loop;

      if jsonb_typeof(lesson -> 'media') is distinct from 'array' or jsonb_array_length(lesson -> 'media') > 50 then
        perform private.jfail(lp || '.media', 'must be an array of at most 50 assets');
      end if;
      media := '[]'::jsonb;
      for k in 0 .. jsonb_array_length(lesson -> 'media') - 1 loop
        media := media || jsonb_build_array(private.validate_media(lesson -> 'media' -> k, format('%s.media[%s]', lp, k)));
      end loop;

      if jsonb_typeof(lesson -> 'resources') is distinct from 'array' or jsonb_array_length(lesson -> 'resources') > 50 then
        perform private.jfail(lp || '.resources', 'must be an array of at most 50 resources');
      end if;
      resources := '[]'::jsonb;
      for k in 0 .. jsonb_array_length(lesson -> 'resources') - 1 loop
        perform private.jobject(lesson -> 'resources' -> k, format('%s.resources[%s]', lp, k),
          array['label', 'href', 'type'], array['label', 'href', 'type']);
        resources := resources || jsonb_build_array(jsonb_build_object(
          'label', private.jstr(lesson -> 'resources' -> k -> 'label', format('%s.resources[%s].label', lp, k), 1, 200),
          'href', private.jlink(lesson -> 'resources' -> k -> 'href', format('%s.resources[%s].href', lp, k)),
          'type', private.jenum(lesson -> 'resources' -> k -> 'type', format('%s.resources[%s].type', lp, k),
            array['worksheet', 'reference', 'transcript'])));
      end loop;

      lessons := lessons || jsonb_build_array(jsonb_build_object(
        'id', id,
        'slug', slug,
        'title', private.jstr(lesson -> 'title', lp || '.title', 1, 200),
        'summary', private.jstr(lesson -> 'summary', lp || '.summary', 0, 2000),
        'durationMinutes', private.jint(lesson -> 'durationMinutes', lp || '.durationMinutes', 1, 600),
        'format', private.jenum(lesson -> 'format', lp || '.format', array['article', 'video', 'diagram', 'practice', 'quiz']),
        'objectives', private.jstrs(lesson -> 'objectives', lp || '.objectives', 0, 20, 500),
        'anatomyIds', anatomy,
        'blocks', blocks,
        'media', media,
        'resources', resources));
    end loop;
    parts := parts || jsonb_build_array(jsonb_build_object(
      'id', (part ->> 'id')::uuid,
      'ordinal', i + 1,
      'title', private.jstr(part -> 'title', pp || '.title', 1, 200),
      'summary', private.jstr(part -> 'summary', pp || '.summary', 0, 2000),
      'lessons', lessons));
  end loop;

  return jsonb_build_object(
    'id', (p_course ->> 'id')::uuid,
    'slug', p_course ->> 'slug',
    'layer', layer,
    'title', private.jstr(p_course -> 'title', 'course.title', 1, 200),
    'subtitle', private.jstr(p_course -> 'subtitle', 'course.subtitle', 0, 300),
    'description', private.jstr(p_course -> 'description', 'course.description', 0, 5000),
    'level', private.jenum(p_course -> 'level', 'course.level', array['foundation', 'intermediate', 'advanced']),
    'outcomes', private.jstrs(p_course -> 'outcomes', 'course.outcomes', 0, 20, 500),
    'parts', parts);
end;
$$;

-- Hashes -----------------------------------------------------------------------------
-- sha256 over Postgres's canonical jsonb text, as 64 lowercase hex characters.
-- Only the database computes them; clients compare them for equality.

create function private.sha256(p_value jsonb)
returns text
language sql immutable set search_path = ''
as $$ select encode(extensions.digest(p_value::text, 'sha256'), 'hex') $$;

create function private.block_hash(p_kind text, p_content jsonb)
returns text
language sql immutable set search_path = ''
as $$ select private.sha256(jsonb_build_object('kind', p_kind, 'content', p_content)) $$;

-- Saving drafts ------------------------------------------------------------------------

/** Replaces a course's whole draft tree. Lesson and part ids are kept as given. */
create function private.save_draft(p_org uuid, p_course jsonb, p_actor uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  n jsonb := private.validate_course(p_course);
  cid uuid := (n ->> 'id')::uuid;
  existing public.courses%rowtype;
  missing text;
begin
  if p_org is null and n ->> 'layer' = 'method' then
    raise exception 'method courses belong to a gym' using errcode = '22023';
  end if;
  if p_org is not null and n ->> 'layer' <> 'method' then
    raise exception 'gyms author method courses only; base and modality content is global' using errcode = '42501';
  end if;
  select c #>> '{}' into missing
  from jsonb_path_query(n, '$.parts[*].lessons[*].blocks[*].claimIds[*]') c
  where not exists (select 1 from public.claims cl where cl.id = (c #>> '{}')::uuid)
  limit 1;
  if missing is not null then
    raise exception 'invalid course: unknown claim %', missing using errcode = '22023';
  end if;

  select * into existing from public.courses where id = cid for update;
  if found then
    if existing.org_id is distinct from p_org or existing.layer <> n ->> 'layer' then
      raise exception 'course belongs to another owner or layer' using errcode = '42501';
    end if;
    update public.courses set slug = n ->> 'slug', title = n ->> 'title', subtitle = n ->> 'subtitle',
      description = n ->> 'description', level = n ->> 'level', outcomes = n -> 'outcomes',
      updated_at = now(), updated_by = p_actor
    where id = cid;
    delete from public.course_parts where course_id = cid;
  else
    insert into public.courses (id, org_id, layer, slug, title, subtitle, description, level, outcomes, updated_by)
    values (cid, p_org, n ->> 'layer', n ->> 'slug', n ->> 'title', n ->> 'subtitle', n ->> 'description',
            n ->> 'level', n -> 'outcomes', p_actor);
  end if;

  insert into public.course_parts (id, course_id, org_id, ordinal, title, summary)
  select (p ->> 'id')::uuid, cid, p_org, po, p ->> 'title', p ->> 'summary'
  from jsonb_array_elements(n -> 'parts') with ordinality as t (p, po);

  insert into public.lessons (id, course_id, part_id, org_id, ordinal, slug, title, summary, duration_minutes,
    format, objectives, anatomy_ids, media, resources)
  select (l ->> 'id')::uuid, cid, (p ->> 'id')::uuid, p_org, lo, l ->> 'slug', l ->> 'title', l ->> 'summary',
    (l ->> 'durationMinutes')::integer, l ->> 'format', l -> 'objectives', l -> 'anatomyIds', l -> 'media', l -> 'resources'
  from jsonb_array_elements(n -> 'parts') as t (p),
       jsonb_array_elements(p -> 'lessons') with ordinality as u (l, lo);

  with src as materialized (
    select gen_random_uuid() as block_id, (l ->> 'id')::uuid as lesson_id, bo, b
    from jsonb_array_elements(n -> 'parts') as t (p),
         jsonb_array_elements(p -> 'lessons') as u (l),
         jsonb_array_elements(l -> 'blocks') with ordinality as v (b, bo)
  ), ins as (
    insert into public.lesson_blocks (id, lesson_id, org_id, ordinal, kind, support, content, content_hash)
    select block_id, lesson_id, p_org, bo, b ->> 'kind', b ->> 'support', b -> 'content',
      private.block_hash(b ->> 'kind', b -> 'content')
    from src
    returning id
  )
  insert into public.block_claims (block_id, claim_id)
  select s.block_id, (c #>> '{}')::uuid
  from src s, jsonb_array_elements(coalesce(s.b -> 'claimIds', '[]'::jsonb)) as c
  where exists (select 1 from ins where ins.id = s.block_id);

  perform private.audit(p_actor, 'save_draft', p_org, cid);
  return cid;
end;
$$;

-- The publish gate ----------------------------------------------------------------------

/** 'approved', or why a claim cannot be cited now: retracted, unsourced, unreviewed, rejected, expired. */
create function private.claim_status(p_claim uuid)
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  latest public.claim_reviews%rowtype;
begin
  if exists (select 1 from public.claim_sources cs join public.source_retractions r on r.source_id = cs.source_id
             where cs.claim_id = p_claim) then
    return 'retracted';
  end if;
  if not exists (select 1 from public.claim_sources where claim_id = p_claim) then return 'unsourced'; end if;
  select * into latest from public.claim_reviews where claim_id = p_claim order by seq desc limit 1;
  if not found then return 'unreviewed'; end if;
  if latest.decision <> 'approved' then return 'rejected'; end if;
  if latest.expires_at <= clock_timestamp() then return 'expired'; end if;
  return 'approved';
end;
$$;

/** True when the latest review of this exact (block hash, claim set) pair says 'supported'. */
create function private.binding_supported(p_block_hash text, p_claims uuid[])
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select verdict = 'supported' from public.binding_reviews
    where block_hash = p_block_hash and claim_ids = p_claims
    order by seq desc limit 1), false)
$$;

create function private.lesson_json(p_lesson uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', l.id, 'slug', l.slug, 'title', l.title, 'summary', l.summary,
    'durationMinutes', l.duration_minutes, 'format', l.format, 'objectives', l.objectives,
    'anatomyIds', l.anatomy_ids,
    'blocks', coalesce((
      select jsonb_agg(case when b.support is null
          then jsonb_build_object('kind', b.kind, 'content', b.content)
          else jsonb_build_object('kind', b.kind, 'content', b.content, 'support', b.support,
            'claimIds', coalesce((select jsonb_agg(bc.claim_id order by bc.claim_id)
                                  from public.block_claims bc where bc.block_id = b.id), '[]'::jsonb))
        end order by b.ordinal)
      from public.lesson_blocks b where b.lesson_id = l.id), '[]'::jsonb),
    'media', l.media, 'resources', l.resources)
  from public.lessons l where l.id = p_lesson
$$;

create function private.course_snapshot(p_course uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id, 'slug', c.slug, 'layer', c.layer, 'title', c.title, 'subtitle', c.subtitle,
    'description', c.description, 'level', c.level, 'outcomes', c.outcomes,
    'parts', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', p.id, 'ordinal', p.ordinal, 'title', p.title, 'summary', p.summary,
          'lessons', coalesce((select jsonb_agg(private.lesson_json(l.id) order by l.ordinal)
                               from public.lessons l where l.part_id = p.id), '[]'::jsonb))
        order by p.ordinal)
      from public.course_parts p where p.course_id = c.id), '[]'::jsonb))
  from public.courses c where c.id = p_course
$$;

/**
 * Checks every block, then freezes the whole tree as a new version. Publishing
 * an unchanged tree returns the latest version instead of making a copy.
 */
create function private.publish(p_course uuid, p_actor uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  c public.courses%rowtype;
  b record;
  claim_set uuid[];
  claim uuid;
  status text;
  snap jsonb;
  hash text;
  latest public.curriculum_versions%rowtype;
  vid uuid;
begin
  select * into c from public.courses where id = p_course for update;
  if not found then raise exception 'no such course' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.lessons where course_id = p_course) then
    raise exception 'publish gate: the course has no lessons' using errcode = 'P0001';
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
    if c.layer = 'base' and b.kind = 'quiz' and b.support <> 'science' then
      raise exception 'publish gate: lesson % has a base-layer quiz without claims', b.lesson_id using errcode = 'P0001';
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

  snap := private.course_snapshot(p_course);
  hash := private.sha256(snap);
  select * into latest from public.curriculum_versions where course_id = p_course order by version_number desc limit 1;
  if found and latest.content_hash = hash then
    perform private.audit(p_actor, 'publish_unchanged', c.org_id, latest.id);
    return latest.id;
  end if;

  insert into public.curriculum_versions (course_id, org_id, layer, version_number, snapshot, content_hash, published_by)
  values (p_course, c.org_id, c.layer, coalesce(latest.version_number, 0) + 1, snap, hash, p_actor)
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

-- Tenant RPCs (role authenticated) ----------------------------------------------------------

create function public.save_course_draft(p_org uuid, p_course jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
begin
  return private.save_draft(p_org, p_course, private.require_author(p_org));
end;
$$;

create function public.publish_course(p_course uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_author((select org_id from public.courses where id = p_course));
begin
  return private.publish(p_course, uid);
end;
$$;

/**
 * Assigns a version to a member. Credit carries forward from the member's
 * earlier completions of the same course in this org when the lesson id and
 * content hash both match; changed lessons stay open; removed lessons drop out.
 */
create function public.assign_version(p_org uuid, p_version uuid, p_user uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_author(p_org);
  v public.curriculum_versions%rowtype;
  aid uuid;
begin
  select * into v from public.curriculum_versions where id = p_version;
  if not found or (v.org_id is not null and v.org_id <> p_org) then
    raise exception 'no such version' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.memberships where org_id = p_org and user_id = p_user) then
    raise exception 'not a member of this org' using errcode = 'P0002';
  end if;

  insert into public.assignments (org_id, version_id, user_id, assigned_by)
  values (p_org, p_version, p_user, uid)
  on conflict (org_id, version_id, user_id) do nothing
  returning id into aid;
  if aid is null then
    select id into aid from public.assignments where org_id = p_org and version_id = p_version and user_id = p_user;
    return aid;
  end if;

  insert into public.lesson_completions (org_id, user_id, version_id, lesson_id, content_hash, origin_completion_id)
  select p_org, p_user, p_version, vl.lesson_id, vl.content_hash, prior.origin
  from public.version_lessons vl
  cross join lateral (
    select coalesce(lc.origin_completion_id, lc.id) as origin
    from public.lesson_completions lc
    join public.curriculum_versions pv on pv.id = lc.version_id
    where lc.org_id = p_org and lc.user_id = p_user and lc.lesson_id = vl.lesson_id
      and lc.content_hash = vl.content_hash and pv.course_id = v.course_id and lc.version_id <> p_version
    order by lc.completed_at, lc.id
    limit 1
  ) prior
  where vl.version_id = p_version
  on conflict (org_id, user_id, version_id, lesson_id) do nothing;

  perform private.audit(uid, 'assign', p_org, aid, jsonb_build_object('version_id', p_version, 'user_id', p_user));
  return aid;
end;
$$;

/** Marks a lesson done for the caller's own assignment. Calling it again returns the same row. */
create function public.complete_lesson(p_assignment uuid, p_lesson uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  a public.assignments%rowtype;
  hash text;
  cid uuid;
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  select * into a from public.assignments where id = p_assignment;
  if not found or a.user_id <> uid then raise exception 'no such assignment' using errcode = 'P0002'; end if;
  select content_hash into hash from public.version_lessons where version_id = a.version_id and lesson_id = p_lesson;
  if not found then raise exception 'lesson is not in this version' using errcode = 'P0002'; end if;

  insert into public.lesson_completions (org_id, user_id, version_id, lesson_id, content_hash)
  values (a.org_id, uid, a.version_id, p_lesson, hash)
  on conflict (org_id, user_id, version_id, lesson_id) do nothing
  returning id into cid;
  if cid is null then
    select id into cid from public.lesson_completions
    where org_id = a.org_id and user_id = uid and version_id = a.version_id and lesson_id = p_lesson;
  end if;
  return cid;
end;
$$;

-- Publisher RPCs (role service_role; p_actor must be a content publisher) ---------------------

create function public.publisher_save_course_draft(p_actor uuid, p_course jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_publisher(p_actor);
  return private.save_draft(null, p_course, p_actor);
end;
$$;

create function public.publisher_publish_course(p_actor uuid, p_course uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_publisher(p_actor);
  if not exists (select 1 from public.courses where id = p_course and org_id is null) then
    raise exception 'no such global course' using errcode = 'P0002';
  end if;
  return private.publish(p_course, p_actor);
end;
$$;

create function public.publisher_add_source(p_actor uuid, p_source jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  sid uuid;
begin
  perform private.require_publisher(p_actor);
  perform private.jobject(p_source, 'source', array['kind', 'title', 'doi', 'pmid', 'url', 'locator', 'license'],
    array['kind', 'title', 'license']);
  if not (p_source ? 'doi' or p_source ? 'pmid' or p_source ? 'url') then
    perform private.jfail('source', 'needs a doi, pmid or url');
  end if;
  insert into public.sources (kind, title, doi, pmid, url, locator, license, created_by)
  values (
    private.jenum(p_source -> 'kind', 'source.kind',
      array['textbook', 'position_stand', 'nomenclature', 'systematic_review', 'meta_analysis']),
    private.jstr(p_source -> 'title', 'source.title', 1, 500),
    case when p_source ? 'doi' then lower(private.jstr(p_source -> 'doi', 'source.doi', 4, 300)) end,
    case when p_source ? 'pmid' then private.jstr(p_source -> 'pmid', 'source.pmid', 1, 9) end,
    case when p_source ? 'url' then private.jlink(p_source -> 'url', 'source.url') end,
    case when p_source ? 'locator' then private.jstr(p_source -> 'locator', 'source.locator', 1, 200) end,
    private.jstr(p_source -> 'license', 'source.license', 1, 200),
    p_actor)
  returning id into sid;
  perform private.audit(p_actor, 'add_source', null, sid);
  return sid;
end;
$$;

create function public.publisher_add_claim(p_actor uuid, p_claim jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  cid uuid;
  source_ids uuid[];
begin
  perform private.require_publisher(p_actor);
  perform private.jobject(p_claim, 'claim', array['statement', 'evidenceLevel', 'population', 'sourceIds'],
    array['statement', 'evidenceLevel', 'population', 'sourceIds']);
  source_ids := private.juuids(p_claim -> 'sourceIds', 'claim.sourceIds', 20);
  if cardinality(source_ids) = 0 then perform private.jfail('claim.sourceIds', 'needs at least one source'); end if;
  if exists (select 1 from unnest(source_ids) as u (sid) where not exists (select 1 from public.sources where id = u.sid)) then
    perform private.jfail('claim.sourceIds', 'names an unknown source');
  end if;
  insert into public.claims (statement, evidence_level, population, created_by)
  values (private.jstr(p_claim -> 'statement', 'claim.statement', 1, 2000),
          private.jstr(p_claim -> 'evidenceLevel', 'claim.evidenceLevel', 1, 100),
          private.jstr(p_claim -> 'population', 'claim.population', 1, 500),
          p_actor)
  returning id into cid;
  insert into public.claim_sources (claim_id, source_id) select cid, s from unnest(source_ids) s;
  perform private.audit(p_actor, 'add_claim', null, cid);
  return cid;
end;
$$;

/**
 * Records a claim review. An approval needs a receipt showing the source
 * exists and the claim is faithful to it, and an expiry within five years.
 */
create function public.publisher_review_claim(p_actor uuid, p_claim uuid, p_review jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  decision text;
  expires timestamptz;
  receipt jsonb;
  rid uuid;
begin
  perform private.require_publisher(p_actor);
  if not exists (select 1 from public.claims where id = p_claim) then
    raise exception 'no such claim' using errcode = 'P0002';
  end if;
  perform private.jobject(p_review, 'review', array['decision', 'expiresAt', 'receipt'], array['decision', 'receipt']);
  decision := private.jenum(p_review -> 'decision', 'review.decision', array['approved', 'rejected']);
  perform private.jobject(p_review -> 'receipt', 'review.receipt',
    array['existenceCheckedAt', 'faithfulness', 'retractionCheckedAt', 'notes'],
    array['existenceCheckedAt', 'faithfulness', 'retractionCheckedAt']);
  receipt := jsonb_build_object(
    'existenceCheckedAt', private.jtimestamp(p_review -> 'receipt' -> 'existenceCheckedAt', 'review.receipt.existenceCheckedAt'),
    'faithfulness', private.jenum(p_review -> 'receipt' -> 'faithfulness', 'review.receipt.faithfulness',
      array['faithful', 'unfaithful']),
    'retractionCheckedAt', private.jtimestamp(p_review -> 'receipt' -> 'retractionCheckedAt', 'review.receipt.retractionCheckedAt'),
    'notes', case when p_review -> 'receipt' ? 'notes'
      then private.jstr(p_review -> 'receipt' -> 'notes', 'review.receipt.notes', 0, 2000) else '' end);
  if decision = 'approved' then
    if receipt ->> 'faithfulness' <> 'faithful' then
      perform private.jfail('review.receipt.faithfulness', 'an approval needs a faithful claim');
    end if;
    expires := private.jtimestamp(p_review -> 'expiresAt', 'review.expiresAt');
    if expires <= clock_timestamp() or expires > clock_timestamp() + interval '5 years' then
      perform private.jfail('review.expiresAt', 'must be in the future and within five years');
    end if;
  elsif p_review ? 'expiresAt' then
    perform private.jfail('review.expiresAt', 'only approvals expire');
  end if;
  insert into public.claim_reviews (claim_id, decision, expires_at, receipt, reviewer)
  values (p_claim, decision, expires, receipt, p_actor)
  returning id into rid;
  perform private.audit(p_actor, 'review_claim', null, p_claim, jsonb_build_object('decision', decision, 'review_id', rid));
  return rid;
end;
$$;

/** Binds a verdict to a global draft block's exact content hash and current claim set. */
create function public.publisher_review_block(p_actor uuid, p_block uuid, p_review jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  b public.lesson_blocks%rowtype;
  claim_set uuid[];
  rid uuid;
begin
  perform private.require_publisher(p_actor);
  select * into b from public.lesson_blocks where id = p_block and org_id is null;
  if not found then raise exception 'no such global block' using errcode = 'P0002'; end if;
  claim_set := array(select claim_id from public.block_claims where block_id = p_block order by claim_id);
  if cardinality(claim_set) = 0 then
    raise exception 'the block cites no claims' using errcode = '22023';
  end if;
  perform private.jobject(p_review, 'review', array['verdict', 'notes'], array['verdict']);
  insert into public.binding_reviews (block_hash, claim_ids, verdict, notes, reviewer)
  values (private.block_hash(b.kind, b.content), claim_set,
          private.jenum(p_review -> 'verdict', 'review.verdict', array['supported', 'unsupported']),
          case when p_review ? 'notes' then private.jstr(p_review -> 'notes', 'review.notes', 0, 2000) else '' end,
          p_actor)
  returning id into rid;
  perform private.audit(p_actor, 'review_block', null, rid,
    jsonb_build_object('block_hash', private.block_hash(b.kind, b.content), 'claim_ids', to_jsonb(claim_set)));
  return rid;
end;
$$;

/** Records a retraction and flags every published version that cites an affected claim. */
create function public.publisher_record_retraction(p_actor uuid, p_source uuid, p_notice jsonb)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  notice jsonb;
  flagged integer;
begin
  perform private.require_publisher(p_actor);
  if not exists (select 1 from public.sources where id = p_source) then
    raise exception 'no such source' using errcode = 'P0002';
  end if;
  perform private.jobject(p_notice, 'notice', array['origin', 'reference', 'detectedAt'], array['origin', 'reference', 'detectedAt']);
  notice := jsonb_build_object(
    'origin', private.jenum(p_notice -> 'origin', 'notice.origin', array['crossref', 'manual']),
    'reference', private.jstr(p_notice -> 'reference', 'notice.reference', 1, 500),
    'detectedAt', private.jtimestamp(p_notice -> 'detectedAt', 'notice.detectedAt'));
  insert into public.source_retractions (source_id, notice, recorded_by)
  values (p_source, notice, p_actor)
  on conflict (source_id) do nothing;

  insert into public.version_flags (version_id, claim_id, source_id, reason)
  select distinct vc.version_id, vc.claim_id, p_source, 'retracted'
  from public.version_claims vc join public.claim_sources cs on cs.claim_id = vc.claim_id
  where cs.source_id = p_source
  on conflict do nothing;

  select count(distinct version_id) into flagged from public.version_flags where source_id = p_source;
  perform private.audit(p_actor, 'record_retraction', null, p_source, jsonb_build_object('versions_flagged', flagged));
  return flagged;
end;
$$;

-- Row level security and grants ----------------------------------------------------------------
-- Clients and the service role get SELECT at most. Every write goes through
-- the functions above. The privilege matrix is asserted in
-- supabase/tests/database/content.test.sql.

do $$
declare
  t text;
begin
  foreach t in array array['sources', 'claims', 'claim_sources', 'claim_reviews', 'source_retractions', 'binding_reviews',
    'courses', 'course_parts', 'lessons', 'lesson_blocks', 'block_claims', 'curriculum_versions', 'version_lessons',
    'version_claims', 'version_flags', 'assignments', 'lesson_completions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', t);
    execute format('grant select on public.%I to service_role', t);
  end loop;
end;
$$;
revoke all on private.content_publishers, private.content_audit from public, anon, authenticated, service_role;

-- Evidence a learner may see next to a lesson. Reviews stay server-side.
grant select on public.sources, public.claims, public.claim_sources, public.source_retractions to authenticated;
create policy sources_select on public.sources for select to authenticated using (true);
create policy claims_select on public.claims for select to authenticated using (true);
create policy claim_sources_select on public.claim_sources for select to authenticated using (true);
create policy source_retractions_select on public.source_retractions for select to authenticated using (true);

-- Drafts: a gym's owners and leads see their own. Global drafts are server-side only.
grant select on public.courses, public.course_parts, public.lessons, public.lesson_blocks to authenticated;
create policy courses_select on public.courses for select to authenticated
  using (private.role_in(org_id) in ('owner', 'lead'));
create policy course_parts_select on public.course_parts for select to authenticated
  using (private.role_in(org_id) in ('owner', 'lead'));
create policy lessons_select on public.lessons for select to authenticated
  using (private.role_in(org_id) in ('owner', 'lead'));
create policy lesson_blocks_select on public.lesson_blocks for select to authenticated
  using (private.role_in(org_id) in ('owner', 'lead'));

-- Published versions: global ones for every signed-in user, gym ones for members.
grant select on public.curriculum_versions, public.version_lessons, public.version_claims, public.version_flags
  to authenticated;
create policy curriculum_versions_select on public.curriculum_versions for select to authenticated
  using (org_id is null or private.is_member(org_id));
create policy version_lessons_select on public.version_lessons for select to authenticated
  using (org_id is null or private.is_member(org_id));
-- Only global versions cite claims or get flagged (method content is practice-based).
create policy version_claims_select on public.version_claims for select to authenticated using (true);
create policy version_flags_select on public.version_flags for select to authenticated using (true);

-- Progress: your own, or your gym's if you are an owner or lead.
grant select on public.assignments, public.lesson_completions to authenticated;
create policy assignments_select on public.assignments for select to authenticated
  using (user_id = (select auth.uid()) or private.role_in(org_id) in ('owner', 'lead'));
create policy lesson_completions_select on public.lesson_completions for select to authenticated
  using (user_id = (select auth.uid()) or private.role_in(org_id) in ('owner', 'lead'));

-- Storage ------------------------------------------------------------------------------------
-- org-media: objects live under '<org_id>/...'. content-media: global media.

insert into storage.buckets (id, name, public)
values ('org-media', 'org-media', false), ('content-media', 'content-media', false)
on conflict (id) do nothing;

/** The org that owns an org-media path, or null when the first segment is not a uuid. */
create function private.path_org(p_name text)
returns uuid
language sql immutable set search_path = ''
as $$
  select case
    when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]'
    then split_part(p_name, '/', 1)::uuid
  end
$$;

create policy org_media_select on storage.objects for select to authenticated
  using (bucket_id = 'org-media' and private.is_member(private.path_org(name)));
create policy org_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'org-media' and private.role_in(private.path_org(name)) in ('owner', 'lead'));
create policy org_media_update on storage.objects for update to authenticated
  using (bucket_id = 'org-media' and private.role_in(private.path_org(name)) in ('owner', 'lead'))
  with check (bucket_id = 'org-media' and private.role_in(private.path_org(name)) in ('owner', 'lead'));
create policy org_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'org-media' and private.role_in(private.path_org(name)) in ('owner', 'lead'));
create policy content_media_select on storage.objects for select to authenticated
  using (bucket_id = 'content-media');

/**
 * For every caller, the service role included: an org-media object must sit
 * under an existing org, and no object moves between orgs or in or out of
 * these buckets.
 */
create function private.guard_media_objects()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (old.bucket_id in ('org-media', 'content-media') or new.bucket_id in ('org-media', 'content-media'))
     and (new.bucket_id is distinct from old.bucket_id
          or private.path_org(new.name) is distinct from private.path_org(old.name)) then
    raise exception 'media objects cannot move between orgs or buckets' using errcode = 'P0001';
  end if;
  if new.bucket_id = 'org-media'
     and not exists (select 1 from public.orgs o where o.id = private.path_org(new.name)) then
    raise exception 'org-media objects must live under an existing org id' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger spindle_guard_media_objects
before insert or update on storage.objects
for each row execute function private.guard_media_objects();

-- Function privileges ------------------------------------------------------------------------

revoke all on all functions in schema private from public, anon, authenticated, service_role;
grant execute on function private.role_in(uuid), private.is_member(uuid), private.path_org(text) to authenticated;

revoke all on function public.save_course_draft(uuid, jsonb), public.publish_course(uuid),
  public.assign_version(uuid, uuid, uuid), public.complete_lesson(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.save_course_draft(uuid, jsonb), public.publish_course(uuid),
  public.assign_version(uuid, uuid, uuid), public.complete_lesson(uuid, uuid) to authenticated;

revoke all on function public.publisher_save_course_draft(uuid, jsonb), public.publisher_publish_course(uuid, uuid),
  public.publisher_add_source(uuid, jsonb), public.publisher_add_claim(uuid, jsonb),
  public.publisher_review_claim(uuid, uuid, jsonb), public.publisher_review_block(uuid, uuid, jsonb),
  public.publisher_record_retraction(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.publisher_save_course_draft(uuid, jsonb), public.publisher_publish_course(uuid, uuid),
  public.publisher_add_source(uuid, jsonb), public.publisher_add_claim(uuid, jsonb),
  public.publisher_review_claim(uuid, uuid, jsonb), public.publisher_review_block(uuid, uuid, jsonb),
  public.publisher_record_retraction(uuid, uuid, jsonb) to service_role;
