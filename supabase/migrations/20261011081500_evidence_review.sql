-- Phase 3: review receipts, the claim lifecycle, the practice-media registry
-- and graded quizzes. ADR 0007 explains the model; it supersedes the receipt
-- and publish rules of ADR 0005.
--
-- Additive: new tables and columns, plus replacements of phase-2 functions that
-- only tighten them. Every rule fails closed:
-- - A positive review (approved claim, supported block, clean lesson) needs a
--   model run receipt and the exact database-computed hash (and sorted claim
--   set) the reviewer saw. A stale packet is refused, never re-stamped.
-- - Global (founder) content needs a clean lesson receipt for every lesson and
--   a clean course receipt for its course and part text. The gym method path
--   keeps its phase-2 rules: practice-based, no receipts.
-- - Claim approvals last at most 24 months, whatever an older row says.
-- - Videos live in a practice-media registry, never in `sources`.
-- - Quiz attempts are scored here, from the assigned immutable version.

-- Review runs ----------------------------------------------------------------------
-- The model and session that produced a review, kept apart from the publisher
-- actor who records it (the `reviewer` column of each review table).

create table public.review_runs (
  id uuid primary key default gen_random_uuid(),
  model text not null check (model ~ '^[a-z0-9][a-z0-9._:-]{0,99}$'),
  session_id text not null check (session_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'),
  packet_digest text not null check (packet_digest ~ '^[0-9a-f]{64}$'),
  reviewed_at timestamptz not null,
  recorded_by uuid not null,
  recorded_at timestamptz not null default now(),
  unique (model, session_id, packet_digest)
);

alter table public.claim_reviews
  add column run_id uuid references public.review_runs (id),
  add column claim_hash text check (claim_hash ~ '^[0-9a-f]{64}$');
alter table public.binding_reviews
  add column run_id uuid references public.review_runs (id);

/**
 * A trusted reviewer's verdict on one exact lesson (its normalized snapshot
 * JSON, practice text and frozen video fields included) and its claim set.
 * Global content needs a clean one for every lesson before it can publish.
 */
create table public.lesson_reviews (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity unique,
  lesson_id uuid not null,
  lesson_hash text not null check (lesson_hash ~ '^[0-9a-f]{64}$'),
  claim_ids uuid[] not null check (cardinality(claim_ids) <= 1000),
  verdict text not null check (verdict in ('clean', 'changes_required')),
  safety text not null check (safety in ('pass', 'fail')),
  originality text not null check (originality in ('pass', 'fail')),
  findings jsonb not null check (jsonb_typeof(findings) = 'array'),
  notes text not null default '' check (char_length(notes) <= 2000),
  run_id uuid references public.review_runs (id),
  reviewer uuid not null,
  created_at timestamptz not null default now(),
  -- Clean means: a model receipt, both checks pass and nothing above NIT.
  check (verdict <> 'clean' or (run_id is not null and safety = 'pass' and originality = 'pass'
    and not jsonb_path_exists(findings, '$[*] ? (@.severity == "BLOCK" || @.severity == "WARN")')))
);
create index lesson_reviews_key_idx on public.lesson_reviews (lesson_id, lesson_hash, seq desc);

/**
 * The same verdict for a global course's own text: title, subtitle,
 * description, outcomes, part titles and summaries, and the lesson order
 * (the snapshot without lesson bodies, see private.course_shell).
 */
create table public.course_reviews (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity unique,
  course_id uuid not null,
  shell_hash text not null check (shell_hash ~ '^[0-9a-f]{64}$'),
  verdict text not null check (verdict in ('clean', 'changes_required')),
  safety text not null check (safety in ('pass', 'fail')),
  originality text not null check (originality in ('pass', 'fail')),
  findings jsonb not null check (jsonb_typeof(findings) = 'array'),
  notes text not null default '' check (char_length(notes) <= 2000),
  run_id uuid references public.review_runs (id),
  reviewer uuid not null,
  created_at timestamptz not null default now(),
  check (verdict <> 'clean' or (run_id is not null and safety = 'pass' and originality = 'pass'
    and not jsonb_path_exists(findings, '$[*] ? (@.severity == "BLOCK" || @.severity == "WARN")')))
);
create index course_reviews_key_idx on public.course_reviews (course_id, shell_hash, seq desc);

-- Practice-media registry ---------------------------------------------------------
-- Coaching clips. Never a `sources` row and never evidence for a claim. The
-- segment fields are frozen (rows are immutable) and copied into lessons, so a
-- lesson hash seals our reference. Status and checks are append-only (latest
-- decides). Provider metadata is refreshable and deleted when a clip retires.

create table public.practice_media (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider = 'youtube'),
  video_id text not null check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  start_seconds integer not null check (start_seconds between 0 and 86399),
  end_seconds integer not null check (end_seconds between 1 and 86400),
  rationale text not null check (char_length(rationale) between 1 and 1000),
  admitted_by uuid not null,
  admitted_at timestamptz not null default now(),
  check (end_seconds > start_seconds)
);

/** Embed preflight (oEmbed) and segment review (a model receipt) results. */
create table public.practice_media_checks (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity unique,
  media_id uuid not null references public.practice_media (id),
  kind text not null check (kind in ('embed', 'segment')),
  outcome text not null check (outcome in ('pass', 'fail')),
  checked_at timestamptz not null,
  run_id uuid references public.review_runs (id),
  notes text not null default '' check (char_length(notes) <= 2000),
  recorded_by uuid not null,
  recorded_at timestamptz not null default now(),
  check (kind <> 'segment' or outcome <> 'pass' or run_id is not null)
);
create index practice_media_checks_idx on public.practice_media_checks (media_id, kind, seq desc);

/** Disable takes effect at once for every version, without a new content version. */
create table public.practice_media_status (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity unique,
  media_id uuid not null references public.practice_media (id),
  status text not null check (status in ('active', 'disabled', 'retired')),
  reason text not null check (char_length(reason) between 1 and 500),
  recorded_by uuid not null,
  recorded_at timestamptz not null default now()
);
create index practice_media_status_idx on public.practice_media_status (media_id, seq desc);

/** Refreshable provider data, kept out of the immutable lesson. Served only while fresh (30 days). */
create table public.practice_media_metadata (
  media_id uuid primary key references public.practice_media (id),
  title text not null check (char_length(title) between 1 and 500),
  channel text not null check (char_length(channel) between 1 and 200),
  available boolean not null,
  fetched_at timestamptz not null,
  recorded_by uuid not null
);

-- Graded quizzes --------------------------------------------------------------------
-- Phase-3 versions record the hash of their graded question set (the science
-- quiz blocks). Older versions keep the phase-2 rule: lessons only.

alter table public.curriculum_versions
  add column rules text not null default 'phase2' check (rules in ('phase2', 'phase3')),
  add column question_set_hash text check (question_set_hash ~ '^[0-9a-f]{64}$');
alter table public.curriculum_versions alter column rules drop default;
alter table public.curriculum_versions
  add constraint curriculum_versions_quiz_rules_check check (rules = 'phase3' or question_set_hash is null);

/**
 * One scored submission. Scores are computed in the database from the
 * version's snapshot (a trigger recomputes them for every caller), so a client
 * can only send answers. Retries are unlimited and the best attempt counts.
 */
create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  user_id uuid not null,
  version_id uuid not null,
  attempt_key uuid not null,
  question_set_hash text not null check (question_set_hash ~ '^[0-9a-f]{64}$'),
  answers jsonb not null check (jsonb_typeof(answers) = 'array'),
  correct integer not null check (correct >= 0),
  total integer not null check (total >= 1),
  passed boolean not null generated always as (correct * 100 >= total * 80) stored,
  submitted_at timestamptz not null default clock_timestamp(),
  foreign key (org_id, version_id, user_id) references public.assignments (org_id, version_id, user_id) on delete cascade,
  unique (org_id, user_id, version_id, attempt_key),
  check (correct <= total)
);
create index quiz_attempts_user_idx on public.quiz_attempts (user_id);
create index quiz_attempts_version_idx on public.quiz_attempts (version_id);

-- Lesson blocks: the video kind -------------------------------------------------------
-- A video block carries no support or claims (structurally practice-only).

alter table public.lesson_blocks drop constraint lesson_blocks_kind_check;
alter table public.lesson_blocks add constraint lesson_blocks_kind_check
  check (kind in ('heading', 'paragraph', 'callout', 'image', 'checklist', 'diagram', 'quiz', 'video'));
alter table public.lesson_blocks drop constraint lesson_blocks_check;
alter table public.lesson_blocks add constraint lesson_blocks_check
  check ((support is null) = (kind in ('heading', 'image', 'diagram', 'video')));

-- Invariants for every caller --------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['review_runs', 'lesson_reviews', 'course_reviews', 'practice_media', 'practice_media_checks',
    'practice_media_status'] loop
    execute format('create trigger %I before update or delete on public.%I for each row execute function private.guard_immutable()',
      t || '_immutable', t);
    execute format('create trigger %I before truncate on public.%I for each statement execute function private.guard_truncate()',
      t || '_no_truncate', t);
  end loop;
end;
$$;
create trigger quiz_attempts_immutable before update on public.quiz_attempts
  for each row execute function private.guard_immutable();

/** True for a YouTube-family URL. Such a URL is never a claim source or a plain media src. */
create function private.is_video_host_url(p_url text)
returns boolean
language sql immutable set search_path = ''
as $$
  select coalesce(p_url ~* '^https://([a-z0-9-]+\.)*(youtube\.com|youtu\.be|youtube-nocookie\.com|ytimg\.com|googlevideo\.com)(:[0-9]+)?([/?#]|$)', false)
$$;

/** A video block must sit in global content and match its registry entry exactly. */
create function private.guard_video_block()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.kind <> 'video' then return new; end if;
  if new.org_id is not null then
    raise exception 'invalid course: gym method courses cannot embed registry videos' using errcode = '22023';
  end if;
  if not exists (select 1 from public.practice_media m
                 where m.id::text = new.content ->> 'mediaId' and m.provider = new.content ->> 'provider'
                   and m.video_id = new.content ->> 'videoId'
                   and m.start_seconds = (new.content ->> 'startSeconds')::integer
                   and m.end_seconds = (new.content ->> 'endSeconds')::integer
                   and m.rationale = new.content ->> 'rationale') then
    raise exception 'invalid course: video block % does not match its practice-media registry entry', new.content ->> 'mediaId'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger lesson_blocks_video_guard
before insert or update on public.lesson_blocks
for each row execute function private.guard_video_block();

-- JSON boundary: video blocks and media sources ---------------------------------------

create or replace function private.validate_media(p_value jsonb, p_path text)
returns jsonb
language plpgsql immutable set search_path = ''
as $$
declare
  src text;
begin
  perform private.jobject(p_value, p_path, array['kind', 'src', 'alt', 'caption', 'provenanceId'],
    array['kind', 'src', 'alt', 'caption', 'provenanceId']);
  src := private.jlink(p_value -> 'src', p_path || '.src');
  if private.is_video_host_url(src) then
    perform private.jfail(p_path || '.src', 'YouTube media must use a video block from the practice-media registry');
  end if;
  return jsonb_build_object(
    'kind', private.jenum(p_value -> 'kind', p_path || '.kind', array['image', 'video', 'diagram']),
    'src', src,
    'alt', private.jstr(p_value -> 'alt', p_path || '.alt', 1, 500),
    'caption', private.jstr(p_value -> 'caption', p_path || '.caption', 0, 1000),
    'provenanceId', private.jid(p_value -> 'provenanceId', p_path || '.provenanceId'));
end;
$$;

create or replace function private.validate_block(p_value jsonb, p_path text, p_layer text)
returns jsonb
language plpgsql immutable set search_path = ''
as $$
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
  if kind in ('heading', 'image', 'diagram', 'video') then
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
        'diagramId', private.jid(p_value -> 'content' -> 'diagramId', p_path || '.content.diagramId'),
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

  if kind in ('heading', 'image', 'diagram', 'video') then
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
$$;

-- Receipt helpers ----------------------------------------------------------------------

/** Validates a run object and returns its id, creating the row on first use. */
create function private.record_run(p_actor uuid, p_run jsonb, p_path text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_model text;
  session text;
  digest text;
  at timestamptz;
  existing public.review_runs%rowtype;
  rid uuid;
begin
  perform private.jobject(p_run, p_path, array['model', 'session', 'packetDigest', 'reviewedAt'],
    array['model', 'session', 'packetDigest', 'reviewedAt']);
  v_model := private.jstr(p_run -> 'model', p_path || '.model', 1, 100);
  if v_model !~ '^[a-z0-9][a-z0-9._:-]{0,99}$' then perform private.jfail(p_path || '.model', 'must be a lowercase model id'); end if;
  session := private.jstr(p_run -> 'session', p_path || '.session', 1, 200);
  if session !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$' then perform private.jfail(p_path || '.session', 'must be a plain identifier'); end if;
  digest := private.jstr(p_run -> 'packetDigest', p_path || '.packetDigest', 64, 64);
  if digest !~ '^[0-9a-f]{64}$' then perform private.jfail(p_path || '.packetDigest', 'must be a lowercase sha256 hex digest'); end if;
  at := private.jtimestamp(p_run -> 'reviewedAt', p_path || '.reviewedAt');
  if at > clock_timestamp() + interval '5 minutes' then perform private.jfail(p_path || '.reviewedAt', 'is in the future'); end if;

  select * into existing from public.review_runs where review_runs.model = v_model
    and session_id = session and packet_digest = digest;
  if found then
    if existing.reviewed_at <> at then
      perform private.jfail(p_path || '.reviewedAt', 'differs from the recorded run');
    end if;
    return existing.id;
  end if;
  insert into public.review_runs (model, session_id, packet_digest, reviewed_at, recorded_by)
  values (v_model, session, digest, at, p_actor)
  on conflict (model, session_id, packet_digest) do nothing
  returning id into rid;
  if rid is null then
    -- A concurrent recorder created it first; it must agree.
    select * into existing from public.review_runs where review_runs.model = v_model
      and session_id = session and packet_digest = digest;
    if existing.reviewed_at <> at then
      perform private.jfail(p_path || '.reviewedAt', 'differs from the recorded run');
    end if;
    rid := existing.id;
  end if;
  return rid;
end;
$$;

/** A 64-hex expected hash from a review body. */
create function private.jhash(p_value jsonb, p_path text)
returns text
language plpgsql immutable set search_path = ''
as $$
declare
  s text := private.jstr(p_value, p_path, 64, 64);
begin
  if s !~ '^[0-9a-f]{64}$' then perform private.jfail(p_path, 'must be a lowercase sha256 hex digest'); end if;
  return s;
end;
$$;

/** sha256 over the claim's immutable content and its sorted source set. */
create function private.claim_hash(p_claim uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select private.sha256(jsonb_build_object('id', c.id, 'statement', c.statement, 'evidenceLevel', c.evidence_level,
    'population', c.population,
    'sourceIds', coalesce((select jsonb_agg(cs.source_id order by cs.source_id) from public.claim_sources cs
                           where cs.claim_id = c.id), '[]'::jsonb)))
  from public.claims c where c.id = p_claim
$$;

/** Sorted, distinct claims cited anywhere in a draft lesson. */
create function private.lesson_claims(p_lesson uuid)
returns uuid[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(distinct bc.claim_id order by bc.claim_id), '{}')
  from public.block_claims bc join public.lesson_blocks b on b.id = bc.block_id
  where b.lesson_id = p_lesson
$$;

/** The hash a lesson will have in a snapshot published now (ADR 0005 lesson hash). */
create function private.lesson_hash(p_lesson uuid)
returns text
language sql stable security definer set search_path = ''
as $$ select private.sha256(private.lesson_json(p_lesson)) $$;

/** The course snapshot without lesson bodies: course and part text plus each part's lesson order. */
create function private.course_shell(p_course uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select (s - 'parts') || jsonb_build_object('parts', coalesce((
    select jsonb_agg((p - 'lessons') || jsonb_build_object('lessonIds', coalesce((
        select jsonb_agg(l -> 'id' order by lo) from jsonb_array_elements(p -> 'lessons') with ordinality as ls (l, lo)), '[]'::jsonb))
      order by po)
    from jsonb_array_elements(s -> 'parts') with ordinality as ps (p, po)), '[]'::jsonb))
  from (select private.course_snapshot(p_course) as s) t
$$;

/**
 * Validates the shared body of a lesson or course review and returns it
 * normalized: verdict, safety, originality, findings, notes. 'clean' needs a
 * run, both checks passing and no BLOCK or WARN finding.
 */
create function private.review_body(p_review jsonb)
returns jsonb
language plpgsql immutable set search_path = ''
as $$
declare
  verdict text;
  safety text;
  originality text;
  findings jsonb := '[]'::jsonb;
  f jsonb;
  worst text := 'none';
begin
  verdict := private.jenum(p_review -> 'verdict', 'review.verdict', array['clean', 'changes_required']);
  perform private.jobject(p_review -> 'checks', 'review.checks', array['safety', 'originality'], array['safety', 'originality']);
  safety := private.jenum(p_review -> 'checks' -> 'safety', 'review.checks.safety', array['pass', 'fail']);
  originality := private.jenum(p_review -> 'checks' -> 'originality', 'review.checks.originality', array['pass', 'fail']);
  if jsonb_typeof(p_review -> 'findings') is distinct from 'array' then
    perform private.jfail('review.findings', 'must be an array of at most 200 findings');
  end if;
  if jsonb_array_length(p_review -> 'findings') > 200 then
    perform private.jfail('review.findings', 'must be an array of at most 200 findings');
  end if;
  for i in 0 .. jsonb_array_length(p_review -> 'findings') - 1 loop
    f := p_review -> 'findings' -> i;
    perform private.jobject(f, format('review.findings[%s]', i), array['severity', 'item', 'note'], array['severity', 'item', 'note']);
    f := jsonb_build_object(
      'severity', private.jenum(f -> 'severity', format('review.findings[%s].severity', i), array['BLOCK', 'WARN', 'NIT']),
      'item', private.jstr(f -> 'item', format('review.findings[%s].item', i), 1, 200),
      'note', private.jstr(f -> 'note', format('review.findings[%s].note', i), 1, 2000));
    if f ->> 'severity' in ('BLOCK', 'WARN') then worst := f ->> 'severity'; end if;
    findings := findings || jsonb_build_array(f);
  end loop;
  if verdict = 'clean' then
    if worst <> 'none' then perform private.jfail('review.verdict', 'a clean review has no BLOCK or WARN finding'); end if;
    if safety <> 'pass' or originality <> 'pass' then
      perform private.jfail('review.verdict', 'a clean review passes the safety and originality checks');
    end if;
    if not p_review ? 'run' then perform private.jfail('review.run', 'a clean review needs a model run receipt'); end if;
  end if;
  return jsonb_build_object('verdict', verdict, 'safety', safety, 'originality', originality, 'findings', findings,
    'notes', case when p_review ? 'notes' then private.jstr(p_review -> 'notes', 'review.notes', 0, 2000) else '' end);
end;
$$;

-- The claim lifecycle ------------------------------------------------------------------

/**
 * An approval is valid for 24 months at most from both its recording and its
 * model review, whatever expiry the row carries.
 */
create function private.approval_expiry(p_review public.claim_reviews)
returns timestamptz
language sql stable security definer set search_path = ''
as $$
  select least(p_review.expires_at, p_review.created_at + interval '24 months',
    (select r.reviewed_at + interval '24 months' from public.review_runs r where r.id = p_review.run_id))
$$;

/**
 * 'approved', or why a claim cannot be cited in a new publish: retracted,
 * unsourced, video-backed, unreviewed, rejected, expired, unreceipted.
 */
create or replace function private.claim_status(p_claim uuid)
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
  if exists (select 1 from public.claim_sources cs join public.sources s on s.id = cs.source_id
             where cs.claim_id = p_claim and private.is_video_host_url(s.url)) then
    return 'video-backed';
  end if;
  select * into latest from public.claim_reviews where claim_id = p_claim order by seq desc limit 1;
  if not found then return 'unreviewed'; end if;
  if latest.decision <> 'approved' then return 'rejected'; end if;
  if private.approval_expiry(latest) <= clock_timestamp() then return 'expired'; end if;
  if latest.run_id is null or latest.claim_hash is distinct from private.claim_hash(p_claim) then
    return 'unreceipted';
  end if;
  return 'approved';
end;
$$;

/**
 * What a learner may see about a cited claim now. No receipt detail.
 * current | recheck_due (approval expired) | withdrawn (rejected after
 * approval) | retracted (a source was retracted).
 */
create function private.claim_integrity(p_claim uuid)
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
  select * into latest from public.claim_reviews where claim_id = p_claim order by seq desc limit 1;
  if not found or latest.decision <> 'approved' then return 'withdrawn'; end if;
  if private.approval_expiry(latest) <= clock_timestamp() then return 'recheck_due'; end if;
  return 'current';
end;
$$;

/** True when the latest review of this exact (block hash, claim set) pair says 'supported' with a model receipt. */
create or replace function private.binding_supported(p_block_hash text, p_claims uuid[])
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select verdict = 'supported' and run_id is not null from public.binding_reviews
    where block_hash = p_block_hash and claim_ids = p_claims
    order by seq desc limit 1), false)
$$;

/** True when the latest review of this exact lesson hash and claim set is clean. */
create function private.lesson_review_clean(p_lesson uuid, p_hash text, p_claims uuid[])
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select verdict = 'clean' and run_id is not null from public.lesson_reviews
    where lesson_id = p_lesson and lesson_hash = p_hash and claim_ids = p_claims
    order by seq desc limit 1), false)
$$;

/** True when the latest review of this exact course shell is clean. */
create function private.course_review_clean(p_course uuid, p_hash text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select verdict = 'clean' and run_id is not null from public.course_reviews
    where course_id = p_course and shell_hash = p_hash
    order by seq desc limit 1), false)
$$;

-- Registry state ------------------------------------------------------------------------

create function private.media_status(p_media uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce((select status from public.practice_media_status where media_id = p_media order by seq desc limit 1), 'active')
$$;

/**
 * Serializes every mutation of one clip (status, checks, metadata): the row
 * lock is taken first, and the status read after it sees any committed
 * retirement. Read committed, so later statements see the winner's writes.
 */
create function private.lock_media(p_media uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_read_committed();
  perform 1 from public.practice_media where id = p_media for update;
  if not found then raise exception 'no such media' using errcode = 'P0002'; end if;
end;
$$;

/** 'ok', or why a registry clip cannot go into a new publish. */
create function private.media_publishable(p_media uuid)
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
    if not found or latest.outcome <> 'pass' or latest.checked_at <= clock_timestamp() - interval '90 days' then
      return k || '-unchecked';
    end if;
  end loop;
  return 'ok';
end;
$$;

-- Quiz scoring --------------------------------------------------------------------------

/**
 * The graded questions of a snapshot, in course order: every quiz block that
 * binds science. Question ids are '<lesson id>:q<n>', n counting graded
 * quizzes within the lesson from 1. Practice quizzes are ungraded.
 */
create function private.graded_questions(p_snapshot jsonb)
returns jsonb
language sql immutable set search_path = ''
as $$
  select coalesce(jsonb_agg(q.question order by q.po, q.lo, q.bo), '[]'::jsonb)
  from (
    select po, lo, bo, jsonb_build_object(
      'questionId', (l ->> 'id') || ':q' || row_number() over (partition by po, lo order by bo),
      'lessonId', l ->> 'id',
      'prompt', b -> 'content' -> 'prompt',
      'options', b -> 'content' -> 'options',
      'answerIndex', b -> 'content' -> 'answerIndex',
      'explanation', b -> 'content' -> 'explanation') as question
    from jsonb_array_elements(p_snapshot -> 'parts') with ordinality as p (part, po),
         jsonb_array_elements(part -> 'lessons') with ordinality as ls (l, lo),
         jsonb_array_elements(l -> 'blocks') with ordinality as bs (b, bo)
    where b ->> 'kind' = 'quiz' and b ->> 'support' = 'science'
  ) q
$$;

create function private.question_set_hash(p_snapshot jsonb)
returns text
language sql immutable set search_path = ''
as $$
  select case when jsonb_array_length(gq) = 0 then null else private.sha256(gq) end
  from (select private.graded_questions(p_snapshot) as gq) t
$$;

/**
 * Validates answers against the graded questions and returns them normalized
 * (sorted by question id). Every question needs exactly one answer.
 */
create function private.normalize_answers(p_questions jsonb, p_answers jsonb)
returns jsonb
language plpgsql immutable set search_path = ''
as $$
declare
  item jsonb;
  qid text;
  question jsonb;
  seen text[] := '{}';
  answers jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_answers) is distinct from 'array' then perform private.jfail('answers', 'must be an array'); end if;
  if jsonb_array_length(p_answers) > 1000 then perform private.jfail('answers', 'must have at most 1000 items'); end if;
  for i in 0 .. jsonb_array_length(p_answers) - 1 loop
    item := p_answers -> i;
    perform private.jobject(item, format('answers[%s]', i), array['questionId', 'answerIndex'], array['questionId', 'answerIndex']);
    qid := private.jstr(item -> 'questionId', format('answers[%s].questionId', i), 1, 200);
    select q into question from jsonb_array_elements(p_questions) q where q ->> 'questionId' = qid;
    if question is null then perform private.jfail(format('answers[%s].questionId', i), 'is not a graded question in this version'); end if;
    if qid = any (seen) then perform private.jfail(format('answers[%s].questionId', i), 'is answered twice'); end if;
    seen := seen || qid;
    answers := answers || jsonb_build_array(jsonb_build_object('questionId', qid,
      'answerIndex', private.jint(item -> 'answerIndex', format('answers[%s].answerIndex', i), 0,
        jsonb_array_length(question -> 'options') - 1)));
  end loop;
  if cardinality(seen) <> jsonb_array_length(p_questions) then
    perform private.jfail('answers', 'every graded question needs exactly one answer');
  end if;
  return (select jsonb_agg(a order by a ->> 'questionId') from jsonb_array_elements(answers) a);
end;
$$;

/**
 * For every caller: an attempt belongs to a phase-3 version with a graded
 * quiz, uses that version's question set, and is scored here from the
 * snapshot. Submitted scores are ignored.
 */
create function private.guard_quiz_attempt()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v public.curriculum_versions%rowtype;
  questions jsonb;
begin
  select * into v from public.curriculum_versions where id = new.version_id;
  if not found or v.rules <> 'phase3' or v.question_set_hash is null then
    raise exception 'this version has no graded quiz' using errcode = 'P0001';
  end if;
  if new.question_set_hash is distinct from v.question_set_hash then
    raise exception 'the attempt does not match the version''s question set' using errcode = 'P0001';
  end if;
  questions := private.graded_questions(v.snapshot);
  new.answers := private.normalize_answers(questions, new.answers);
  new.total := jsonb_array_length(questions);
  new.correct := (select count(*) from jsonb_array_elements(new.answers) a
                  join jsonb_array_elements(questions) q on q ->> 'questionId' = a ->> 'questionId'
                  where (a -> 'answerIndex') = (q -> 'answerIndex'));
  return new;
end;
$$;

create trigger quiz_attempts_guard
before insert on public.quiz_attempts
for each row execute function private.guard_quiz_attempt();

-- The publish gate (replaces phase 2; every phase-2 check is kept) ---------------------------

/** 'ok', or why a video block cannot publish. */
create function private.video_block_status(p_content jsonb)
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  m public.practice_media%rowtype;
begin
  select * into m from public.practice_media where id::text = p_content ->> 'mediaId';
  if not found then return 'unknown'; end if;
  if m.provider is distinct from p_content ->> 'provider' or m.video_id is distinct from p_content ->> 'videoId'
     or m.start_seconds is distinct from (p_content ->> 'startSeconds')::integer
     or m.end_seconds is distinct from (p_content ->> 'endSeconds')::integer
     or m.rationale is distinct from p_content ->> 'rationale' then
    return 'mismatched';
  end if;
  return private.media_publishable(m.id);
end;
$$;

/**
 * Checks every block (and, for global content, every lesson receipt), then
 * freezes the whole tree as a new version. Publishing an unchanged tree
 * returns the latest version instead of making a copy.
 */
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
      status := private.video_block_status(b.content);
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

-- Publisher RPCs: evidence (role service_role; p_actor must be a content publisher) -----------

/** Sources: a video URL is never evidence. Otherwise unchanged from phase 2. */
create or replace function public.publisher_add_source(p_actor uuid, p_source jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  sid uuid;
  url text;
begin
  perform private.require_publisher(p_actor);
  perform private.jobject(p_source, 'source', array['kind', 'title', 'doi', 'pmid', 'url', 'locator', 'license'],
    array['kind', 'title', 'license']);
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
    private.jenum(p_source -> 'kind', 'source.kind',
      array['textbook', 'position_stand', 'nomenclature', 'systematic_review', 'meta_analysis']),
    private.jstr(p_source -> 'title', 'source.title', 1, 500),
    case when p_source ? 'doi' then lower(private.jstr(p_source -> 'doi', 'source.doi', 4, 300)) end,
    case when p_source ? 'pmid' then private.jstr(p_source -> 'pmid', 'source.pmid', 1, 9) end,
    url,
    case when p_source ? 'locator' then private.jstr(p_source -> 'locator', 'source.locator', 1, 200) end,
    private.jstr(p_source -> 'license', 'source.license', 1, 200),
    p_actor)
  returning id into sid;
  perform private.audit(p_actor, 'add_source', null, sid);
  return sid;
end;
$$;

/** Claims: refuses a source set that includes a video URL (rows written around add_source). */
create or replace function public.publisher_add_claim(p_actor uuid, p_claim jsonb)
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
  if exists (select 1 from public.sources where id = any (source_ids) and private.is_video_host_url(url)) then
    perform private.jfail('claim.sourceIds', 'a video is never a claim source; use the practice-media registry');
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

/** What a reviewer needs to build a claim packet, with the hash to send back. */
create function public.publisher_claim_target(p_actor uuid, p_claim uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  out jsonb;
begin
  perform private.require_publisher(p_actor);
  select jsonb_build_object('claimId', c.id, 'hash', private.claim_hash(c.id), 'statement', c.statement,
    'evidenceLevel', c.evidence_level, 'population', c.population,
    'sourceIds', coalesce((select jsonb_agg(cs.source_id order by cs.source_id) from public.claim_sources cs
                           where cs.claim_id = c.id), '[]'::jsonb),
    'status', private.claim_status(c.id))
  into out from public.claims c where c.id = p_claim;
  if out is null then raise exception 'no such claim' using errcode = 'P0002'; end if;
  return out;
end;
$$;

/**
 * Records a claim review against the hash the reviewer saw. An approval needs
 * a faithful receipt, a model run, and an expiry in the future and at most 24
 * months away. A rejection after an approval withdraws the claim.
 */
create or replace function public.publisher_review_claim(p_actor uuid, p_claim uuid, p_review jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  decision text;
  expires timestamptz;
  receipt jsonb;
  expected text;
  run uuid;
  rid uuid;
begin
  perform private.require_publisher(p_actor);
  if not exists (select 1 from public.claims where id = p_claim) then
    raise exception 'no such claim' using errcode = 'P0002';
  end if;
  perform private.jobject(p_review, 'review', array['decision', 'expiresAt', 'receipt', 'expectedHash', 'run'],
    array['decision', 'receipt', 'expectedHash']);
  decision := private.jenum(p_review -> 'decision', 'review.decision', array['approved', 'rejected']);
  expected := private.jhash(p_review -> 'expectedHash', 'review.expectedHash');
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
    if not p_review ? 'run' then perform private.jfail('review.run', 'an approval needs a model run receipt'); end if;
    expires := private.jtimestamp(p_review -> 'expiresAt', 'review.expiresAt');
    if expires <= clock_timestamp() then
      perform private.jfail('review.expiresAt', 'must be in the future');
    end if;
    if expires > clock_timestamp() + interval '24 months' then
      perform private.jfail('review.expiresAt', 'must be at most 24 months away');
    end if;
  elsif p_review ? 'expiresAt' then
    perform private.jfail('review.expiresAt', 'only approvals expire');
  end if;
  if p_review ? 'run' then run := private.record_run(p_actor, p_review -> 'run', 'review.run'); end if;
  if decision = 'approved' and expires > (select reviewed_at + interval '24 months' from public.review_runs where id = run) then
    perform private.jfail('review.expiresAt', 'must be at most 24 months after the model review');
  end if;
  -- Claims are immutable, but the reviewer must still have seen this exact claim.
  if expected <> private.claim_hash(p_claim) then
    raise exception 'stale review: claim % does not match the reviewed hash', p_claim using errcode = 'P0001';
  end if;
  insert into public.claim_reviews (claim_id, decision, expires_at, receipt, reviewer, run_id, claim_hash)
  values (p_claim, decision, expires, receipt, p_actor, run, expected)
  returning id into rid;
  perform private.audit(p_actor, 'review_claim', null, p_claim, jsonb_build_object('decision', decision, 'review_id', rid));
  return rid;
end;
$$;

/**
 * Everything a reviewer needs to build course, lesson and block packets for a
 * global draft: the course shell and its hash, each lesson's snapshot JSON,
 * hash and claim set, and each block's id, hash and claim set. Send the
 * hashes and claim sets back with the review.
 */
create function public.publisher_review_targets(p_actor uuid, p_course uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  out jsonb;
begin
  perform private.require_publisher(p_actor);
  if not exists (select 1 from public.courses where id = p_course and org_id is null) then
    raise exception 'no such global course' using errcode = 'P0002';
  end if;
  select jsonb_build_object('courseId', p_course,
    'course', jsonb_build_object('hash', private.sha256(private.course_shell(p_course)), 'shell', private.course_shell(p_course)),
    'lessons', coalesce(jsonb_agg(jsonb_build_object(
      'lessonId', l.id,
      'hash', private.lesson_hash(l.id),
      'claimIds', to_jsonb(private.lesson_claims(l.id)),
      'lesson', private.lesson_json(l.id),
      'blocks', coalesce((select jsonb_agg(jsonb_build_object(
          'blockId', b.id, 'ordinal', b.ordinal, 'kind', b.kind, 'support', b.support,
          'hash', private.block_hash(b.kind, b.content),
          'claimIds', coalesce((select jsonb_agg(bc.claim_id order by bc.claim_id) from public.block_claims bc
                                where bc.block_id = b.id), '[]'::jsonb))
        order by b.ordinal) from public.lesson_blocks b where b.lesson_id = l.id), '[]'::jsonb))
    order by p.ordinal, l.ordinal), '[]'::jsonb))
  into out
  from public.lessons l join public.course_parts p on p.id = l.part_id
  where l.course_id = p_course;
  return out;
end;
$$;

/**
 * Binds a verdict to the block content and claim set the reviewer saw. The
 * course row is locked against a concurrent save, then the current block is
 * compared with the expected hash and claims; a mismatch is a stale review.
 */
create or replace function public.publisher_review_block(p_actor uuid, p_block uuid, p_review jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  b public.lesson_blocks%rowtype;
  course uuid;
  claim_set uuid[];
  expected_hash text;
  expected_claims uuid[];
  verdict text;
  run uuid;
  rid uuid;
begin
  perform private.require_publisher(p_actor);
  perform private.jobject(p_review, 'review', array['verdict', 'notes', 'expectedHash', 'claimIds', 'run'],
    array['verdict', 'expectedHash', 'claimIds']);
  verdict := private.jenum(p_review -> 'verdict', 'review.verdict', array['supported', 'unsupported']);
  expected_hash := private.jhash(p_review -> 'expectedHash', 'review.expectedHash');
  expected_claims := private.juuids(p_review -> 'claimIds', 'review.claimIds', 50);
  if verdict = 'supported' and not p_review ? 'run' then
    perform private.jfail('review.run', 'a supported verdict needs a model run receipt');
  end if;

  select l.course_id into course from public.lesson_blocks lb join public.lessons l on l.id = lb.lesson_id
  where lb.id = p_block and lb.org_id is null;
  if not found then raise exception 'no such global block' using errcode = 'P0002'; end if;
  perform private.require_read_committed();
  perform 1 from public.courses where id = course for share;
  -- A later statement sees anything a concurrent save committed before the lock.
  select * into b from public.lesson_blocks where id = p_block and org_id is null;
  if not found then raise exception 'no such global block' using errcode = 'P0002'; end if;
  claim_set := array(select claim_id from public.block_claims where block_id = p_block order by claim_id);
  if cardinality(claim_set) = 0 then
    raise exception 'the block cites no claims' using errcode = '22023';
  end if;
  if private.block_hash(b.kind, b.content) <> expected_hash or claim_set <> expected_claims then
    raise exception 'stale review: block % changed after its review packet was built', p_block using errcode = 'P0001';
  end if;
  if p_review ? 'run' then run := private.record_run(p_actor, p_review -> 'run', 'review.run'); end if;
  insert into public.binding_reviews (block_hash, claim_ids, verdict, notes, reviewer, run_id)
  values (expected_hash, claim_set, verdict,
          case when p_review ? 'notes' then private.jstr(p_review -> 'notes', 'review.notes', 0, 2000) else '' end,
          p_actor, run)
  returning id into rid;
  perform private.audit(p_actor, 'review_block', null, rid,
    jsonb_build_object('block_hash', expected_hash, 'claim_ids', to_jsonb(claim_set)));
  return rid;
end;
$$;

/**
 * Records a whole-lesson review (safety, originality, findings) against the
 * lesson hash and claim set the reviewer saw. 'clean' needs a model run, both
 * checks passing and no BLOCK or WARN finding.
 */
create function public.publisher_review_lesson(p_actor uuid, p_lesson uuid, p_review jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  course uuid;
  expected_hash text;
  expected_claims uuid[];
  body jsonb;
  run uuid;
  rid uuid;
begin
  perform private.require_publisher(p_actor);
  perform private.jobject(p_review, 'review',
    array['verdict', 'expectedHash', 'claimIds', 'checks', 'findings', 'notes', 'run'],
    array['verdict', 'expectedHash', 'claimIds', 'checks', 'findings']);
  expected_hash := private.jhash(p_review -> 'expectedHash', 'review.expectedHash');
  expected_claims := private.juuids(p_review -> 'claimIds', 'review.claimIds', 1000);
  body := private.review_body(p_review);

  select course_id into course from public.lessons where id = p_lesson and org_id is null;
  if not found then raise exception 'no such global lesson' using errcode = 'P0002'; end if;
  perform private.require_read_committed();
  perform 1 from public.courses where id = course for share;
  -- A later statement sees anything a concurrent save committed before the lock.
  if not exists (select 1 from public.lessons where id = p_lesson and org_id is null) then
    raise exception 'no such global lesson' using errcode = 'P0002';
  end if;
  if private.lesson_hash(p_lesson) <> expected_hash or private.lesson_claims(p_lesson) <> expected_claims then
    raise exception 'stale review: lesson % changed after its review packet was built', p_lesson using errcode = 'P0001';
  end if;
  if p_review ? 'run' then run := private.record_run(p_actor, p_review -> 'run', 'review.run'); end if;
  insert into public.lesson_reviews (lesson_id, lesson_hash, claim_ids, verdict, safety, originality, findings, notes,
    run_id, reviewer)
  values (p_lesson, expected_hash, expected_claims, body ->> 'verdict', body ->> 'safety', body ->> 'originality',
    body -> 'findings', body ->> 'notes', run, p_actor)
  returning id into rid;
  perform private.audit(p_actor, 'review_lesson', null, p_lesson,
    jsonb_build_object('review_id', rid, 'lesson_hash', expected_hash, 'verdict', body ->> 'verdict'));
  return rid;
end;
$$;

/**
 * Records a review of a global course's own text (private.course_shell)
 * against the shell hash the reviewer saw, with the same rules as a lesson review.
 */
create function public.publisher_review_course(p_actor uuid, p_course uuid, p_review jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  expected_hash text;
  body jsonb;
  run uuid;
  rid uuid;
begin
  perform private.require_publisher(p_actor);
  perform private.jobject(p_review, 'review', array['verdict', 'expectedHash', 'checks', 'findings', 'notes', 'run'],
    array['verdict', 'expectedHash', 'checks', 'findings']);
  expected_hash := private.jhash(p_review -> 'expectedHash', 'review.expectedHash');
  body := private.review_body(p_review);
  if not exists (select 1 from public.courses where id = p_course and org_id is null) then
    raise exception 'no such global course' using errcode = 'P0002';
  end if;
  perform private.require_read_committed();
  perform 1 from public.courses where id = p_course for share;
  if private.sha256(private.course_shell(p_course)) <> expected_hash then
    raise exception 'stale review: course % changed after its review packet was built', p_course using errcode = 'P0001';
  end if;
  if p_review ? 'run' then run := private.record_run(p_actor, p_review -> 'run', 'review.run'); end if;
  insert into public.course_reviews (course_id, shell_hash, verdict, safety, originality, findings, notes, run_id, reviewer)
  values (p_course, expected_hash, body ->> 'verdict', body ->> 'safety', body ->> 'originality', body -> 'findings',
    body ->> 'notes', run, p_actor)
  returning id into rid;
  perform private.audit(p_actor, 'review_course', null, p_course,
    jsonb_build_object('review_id', rid, 'shell_hash', expected_hash, 'verdict', body ->> 'verdict'));
  return rid;
end;
$$;

-- Publisher RPCs: the practice-media registry ----------------------------------------------

/** Admits a clip after an embed (oEmbed) preflight. The segment fields are frozen. */
create function public.publisher_admit_media(p_actor uuid, p_media jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  video_id text;
  start_s integer;
  end_s integer;
  checked timestamptz;
  mid uuid;
begin
  perform private.require_publisher(p_actor);
  perform private.jobject(p_media, 'media', array['provider', 'videoId', 'startSeconds', 'endSeconds', 'rationale', 'embedCheckedAt'],
    array['provider', 'videoId', 'startSeconds', 'endSeconds', 'rationale', 'embedCheckedAt']);
  perform private.jenum(p_media -> 'provider', 'media.provider', array['youtube']);
  video_id := private.jstr(p_media -> 'videoId', 'media.videoId', 11, 11);
  if video_id !~ '^[A-Za-z0-9_-]{11}$' then perform private.jfail('media.videoId', 'must be a YouTube video id'); end if;
  start_s := private.jint(p_media -> 'startSeconds', 'media.startSeconds', 0, 86399);
  end_s := private.jint(p_media -> 'endSeconds', 'media.endSeconds', 1, 86400);
  if end_s <= start_s then perform private.jfail('media.endSeconds', 'must be after startSeconds'); end if;
  checked := private.jtimestamp(p_media -> 'embedCheckedAt', 'media.embedCheckedAt');
  if checked > clock_timestamp() + interval '5 minutes' then perform private.jfail('media.embedCheckedAt', 'is in the future'); end if;
  insert into public.practice_media (provider, video_id, start_seconds, end_seconds, rationale, admitted_by)
  values ('youtube', video_id, start_s, end_s, private.jstr(p_media -> 'rationale', 'media.rationale', 1, 1000), p_actor)
  returning id into mid;
  insert into public.practice_media_checks (media_id, kind, outcome, checked_at, recorded_by)
  values (mid, 'embed', 'pass', checked, p_actor);
  perform private.audit(p_actor, 'admit_media', null, mid);
  return mid;
end;
$$;

/** Records an embed recheck or a segment review. A passing segment review needs a model run. */
create function public.publisher_record_media_check(p_actor uuid, p_media uuid, p_check jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  kind text;
  outcome text;
  checked timestamptz;
  run uuid;
  cid uuid;
begin
  perform private.require_publisher(p_actor);
  perform private.lock_media(p_media);
  if private.media_status(p_media) = 'retired' then
    raise exception 'media % is retired', p_media using errcode = 'P0001';
  end if;
  perform private.jobject(p_check, 'check', array['kind', 'outcome', 'checkedAt', 'run', 'notes'], array['kind', 'outcome', 'checkedAt']);
  kind := private.jenum(p_check -> 'kind', 'check.kind', array['embed', 'segment']);
  outcome := private.jenum(p_check -> 'outcome', 'check.outcome', array['pass', 'fail']);
  checked := private.jtimestamp(p_check -> 'checkedAt', 'check.checkedAt');
  if checked > clock_timestamp() + interval '5 minutes' then perform private.jfail('check.checkedAt', 'is in the future'); end if;
  if kind = 'segment' and outcome = 'pass' and not p_check ? 'run' then
    perform private.jfail('check.run', 'a passing segment review needs a model run receipt');
  end if;
  if p_check ? 'run' then run := private.record_run(p_actor, p_check -> 'run', 'check.run'); end if;
  insert into public.practice_media_checks (media_id, kind, outcome, checked_at, run_id, notes, recorded_by)
  values (p_media, kind, outcome, checked, run,
    case when p_check ? 'notes' then private.jstr(p_check -> 'notes', 'check.notes', 0, 2000) else '' end, p_actor)
  returning id into cid;
  perform private.audit(p_actor, 'check_media', null, p_media, jsonb_build_object('kind', kind, 'outcome', outcome));
  return cid;
end;
$$;

/** Activates, disables or retires a clip at once, for every version. Retiring deletes provider metadata. */
create function public.publisher_set_media_status(p_actor uuid, p_media uuid, p_status jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  status text;
  sid uuid;
begin
  perform private.require_publisher(p_actor);
  perform private.lock_media(p_media);
  perform private.jobject(p_status, 'status', array['status', 'reason'], array['status', 'reason']);
  status := private.jenum(p_status -> 'status', 'status.status', array['active', 'disabled', 'retired']);
  if private.media_status(p_media) = 'retired' then
    raise exception 'media % is retired', p_media using errcode = 'P0001';
  end if;
  insert into public.practice_media_status (media_id, status, reason, recorded_by)
  values (p_media, status, private.jstr(p_status -> 'reason', 'status.reason', 1, 500), p_actor)
  returning id into sid;
  if status = 'retired' then delete from public.practice_media_metadata where media_id = p_media; end if;
  perform private.audit(p_actor, 'set_media_status', null, p_media, jsonb_build_object('status', status));
  return sid;
end;
$$;

/** Replaces a clip's provider metadata (title, channel, availability). Not part of any lesson hash. */
create function public.publisher_refresh_media_metadata(p_actor uuid, p_media uuid, p_metadata jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  fetched timestamptz;
begin
  perform private.require_publisher(p_actor);
  perform private.lock_media(p_media);
  if private.media_status(p_media) = 'retired' then
    raise exception 'media % is retired', p_media using errcode = 'P0001';
  end if;
  perform private.jobject(p_metadata, 'metadata', array['title', 'channel', 'available', 'fetchedAt'],
    array['title', 'channel', 'available', 'fetchedAt']);
  if jsonb_typeof(p_metadata -> 'available') is distinct from 'boolean' then
    perform private.jfail('metadata.available', 'must be a boolean');
  end if;
  fetched := private.jtimestamp(p_metadata -> 'fetchedAt', 'metadata.fetchedAt');
  if fetched > clock_timestamp() + interval '5 minutes' then perform private.jfail('metadata.fetchedAt', 'is in the future'); end if;
  insert into public.practice_media_metadata (media_id, title, channel, available, fetched_at, recorded_by)
  values (p_media, private.jstr(p_metadata -> 'title', 'metadata.title', 1, 500),
    private.jstr(p_metadata -> 'channel', 'metadata.channel', 1, 200), (p_metadata ->> 'available')::boolean, fetched, p_actor)
  on conflict (media_id) do update set title = excluded.title, channel = excluded.channel, available = excluded.available,
    fetched_at = excluded.fetched_at, recorded_by = excluded.recorded_by;
  perform private.audit(p_actor, 'refresh_media_metadata', null, p_media);
end;
$$;

-- Learner RPCs (role authenticated) ------------------------------------------------------

/** The caller may read this version: global, or published by a gym they belong to. */
create function private.require_version_reader(p_version uuid)
returns public.curriculum_versions
language plpgsql stable security definer set search_path = ''
as $$
declare
  v public.curriculum_versions%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'not signed in' using errcode = '28000'; end if;
  select * into v from public.curriculum_versions where id = p_version;
  if not found or (v.org_id is not null and not private.is_member(v.org_id)) then
    raise exception 'no such version' using errcode = 'P0002';
  end if;
  return v;
end;
$$;

/**
 * The evidence state of every claim a version cites, for the learner view:
 * current, recheck_due, withdrawn or retracted. A withdrawn claim loses the
 * Science presentation. No receipt or reviewer detail is exposed.
 */
create function public.version_integrity(p_version uuid)
returns table (lesson_id uuid, claim_id uuid, state text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.require_version_reader(p_version);
  return query
    select vc.lesson_id, vc.claim_id, private.claim_integrity(vc.claim_id)
    from public.version_claims vc where vc.version_id = p_version
    order by vc.lesson_id, vc.claim_id;
end;
$$;

/**
 * Playback state of the registry clips a version embeds. Playable only while
 * the clip is active and its latest embed and segment checks passed within 90
 * days (the same rule as a new publish); otherwise disabled. Provider title,
 * channel and availability are returned only for a playable clip and only
 * while fresh (fetched within 30 days).
 */
create function public.version_media(p_version uuid)
returns table (media_id uuid, state text, title text, channel text, available boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v public.curriculum_versions%rowtype := private.require_version_reader(p_version);
begin
  return query
    select m.id,
      case when private.media_publishable(m.id) = 'ok' then 'playable' else 'disabled' end,
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

/**
 * Scores the caller's answers against their assigned version. The client sends
 * answers only; the database grades them. The same attempt key returns the
 * same attempt, so a double submit counts once.
 */
create function public.submit_quiz_attempt(p_assignment uuid, p_attempt_key uuid, p_answers jsonb)
returns table (attempt_id uuid, correct integer, total integer, passed boolean)
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  a public.assignments%rowtype;
  v public.curriculum_versions%rowtype;
  answers jsonb;
  qa public.quiz_attempts%rowtype;
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  select * into a from public.assignments where id = p_assignment;
  if not found or a.user_id <> uid then raise exception 'no such assignment' using errcode = 'P0002'; end if;
  if p_attempt_key is null then perform private.jfail('attemptKey', 'is required'); end if;
  perform private.lock_learner(a.org_id, uid);
  select * into v from public.curriculum_versions where id = a.version_id;
  if v.rules <> 'phase3' or v.question_set_hash is null then
    raise exception 'this version has no graded quiz' using errcode = 'P0001';
  end if;
  answers := private.normalize_answers(private.graded_questions(v.snapshot), p_answers);

  select * into qa from public.quiz_attempts q
  where q.org_id = a.org_id and q.user_id = uid and q.version_id = a.version_id and q.attempt_key = p_attempt_key;
  if found then
    if qa.answers <> answers then
      perform private.jfail('attemptKey', 'was already used for different answers');
    end if;
  else
    insert into public.quiz_attempts (org_id, user_id, version_id, attempt_key, question_set_hash, answers, correct, total)
    values (a.org_id, uid, a.version_id, p_attempt_key, v.question_set_hash, answers, 0, 1)
    returning * into qa;
  end if;
  return query select qa.id, qa.correct, qa.total, qa.passed;
end;
$$;

/**
 * Module completion, worked out by the server: every lesson complete and, for
 * a phase-3 version with graded questions, a passing attempt (at least 80%).
 * The best attempt counts. A pass carries from another version of the course
 * in the same gym only when its question-set hash is unchanged. Versions
 * published before phase 3 keep the lessons-only rule.
 */
create function public.module_status(p_assignment uuid)
returns table (
  assignment_id uuid, version_id uuid, lessons_total integer, lessons_completed integer, quiz_required boolean,
  questions_total integer, best_attempt_id uuid, best_correct integer, best_total integer,
  quiz_passed boolean, quiz_credit_attempt_id uuid, quiz_carried boolean, complete boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  a public.assignments%rowtype;
  v public.curriculum_versions%rowtype;
  best public.quiz_attempts%rowtype;
  credit public.quiz_attempts%rowtype;
  n_lessons integer;
  n_done integer;
  required boolean;
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  select * into a from public.assignments where id = p_assignment;
  if not found or (a.user_id <> uid and coalesce(private.role_in(a.org_id) not in ('owner', 'lead'), true)) then
    raise exception 'no such assignment' using errcode = 'P0002';
  end if;
  select * into v from public.curriculum_versions where id = a.version_id;
  n_lessons := (select count(*) from public.version_lessons vl where vl.version_id = v.id);
  n_done := (select count(*) from public.lesson_completions lc
             where lc.org_id = a.org_id and lc.user_id = a.user_id and lc.version_id = v.id);
  required := v.rules = 'phase3' and v.question_set_hash is not null;

  select * into best from public.quiz_attempts q
  where q.org_id = a.org_id and q.user_id = a.user_id and q.version_id = v.id
  order by q.correct desc, q.submitted_at, q.id limit 1;
  if best.passed then
    credit := best;
  elsif required then
    select q.* into credit from public.quiz_attempts q join public.curriculum_versions qv on qv.id = q.version_id
    where q.org_id = a.org_id and q.user_id = a.user_id and q.version_id <> v.id and q.passed
      and qv.course_id = v.course_id and q.question_set_hash = v.question_set_hash
    order by q.submitted_at, q.id limit 1;
  end if;

  return query select a.id, v.id, n_lessons, n_done, required,
    case when required then jsonb_array_length(private.graded_questions(v.snapshot)) else 0 end,
    best.id, best.correct, best.total,
    required and credit.id is not null,
    case when required then credit.id end,
    required and credit.id is not null and credit.version_id <> v.id,
    n_lessons > 0 and n_done = n_lessons and (not required or credit.id is not null);
end;
$$;

-- Row level security and grants --------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['review_runs', 'lesson_reviews', 'course_reviews', 'practice_media', 'practice_media_checks',
    'practice_media_status', 'practice_media_metadata', 'quiz_attempts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', t);
    execute format('grant select on public.%I to service_role', t);
  end loop;
end;
$$;

-- Attempts: your own, or your gym's if you are an owner or lead.
grant select on public.quiz_attempts to authenticated;
create policy quiz_attempts_select on public.quiz_attempts for select to authenticated
  using (user_id = (select auth.uid()) or private.role_in(org_id) in ('owner', 'lead'));

-- Identity sequences of the new tables: no client needs them (inserts run in definer functions).
revoke all on sequence public.lesson_reviews_seq_seq, public.course_reviews_seq_seq, public.practice_media_checks_seq_seq,
  public.practice_media_status_seq_seq from public, anon, authenticated, service_role;

revoke all on all functions in schema private from public, anon, authenticated, service_role;
grant execute on function private.role_in(uuid), private.is_member(uuid), private.path_org(text) to authenticated;

revoke all on function public.version_integrity(uuid), public.version_media(uuid),
  public.submit_quiz_attempt(uuid, uuid, jsonb), public.module_status(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.version_integrity(uuid), public.version_media(uuid),
  public.submit_quiz_attempt(uuid, uuid, jsonb), public.module_status(uuid) to authenticated;

revoke all on function public.publisher_claim_target(uuid, uuid), public.publisher_review_targets(uuid, uuid),
  public.publisher_review_lesson(uuid, uuid, jsonb), public.publisher_review_course(uuid, uuid, jsonb),
  public.publisher_admit_media(uuid, jsonb),
  public.publisher_record_media_check(uuid, uuid, jsonb), public.publisher_set_media_status(uuid, uuid, jsonb),
  public.publisher_refresh_media_metadata(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.publisher_claim_target(uuid, uuid), public.publisher_review_targets(uuid, uuid),
  public.publisher_review_lesson(uuid, uuid, jsonb), public.publisher_review_course(uuid, uuid, jsonb),
  public.publisher_admit_media(uuid, jsonb),
  public.publisher_record_media_check(uuid, uuid, jsonb), public.publisher_set_media_status(uuid, uuid, jsonb),
  public.publisher_refresh_media_metadata(uuid, uuid, jsonb) to service_role;
