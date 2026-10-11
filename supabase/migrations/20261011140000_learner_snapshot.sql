-- T21 (closes the S04 risk in ADR 0007): learners get a projection of each
-- published snapshot with the answer key and explanation removed from graded
-- (science) quizzes. Practice self-checks keep theirs. Scoring still uses the
-- full stored snapshot. Explanations come back after a passing attempt, through
-- quiz_attempt_review. Additive: this migration only adds; the companion
-- migration revokes learner access to the raw column.

/** The snapshot as learners receive it: graded quizzes keep prompt and options only. */
create function private.redact_snapshot(p_snapshot jsonb)
returns jsonb
language plpgsql immutable set search_path = ''
as $$
declare
  s jsonb := p_snapshot;
  b jsonb;
begin
  for pi in 0 .. coalesce(jsonb_array_length(s -> 'parts'), 0) - 1 loop
    for li in 0 .. coalesce(jsonb_array_length(s -> 'parts' -> pi -> 'lessons'), 0) - 1 loop
      for bi in 0 .. coalesce(jsonb_array_length(s -> 'parts' -> pi -> 'lessons' -> li -> 'blocks'), 0) - 1 loop
        b := s -> 'parts' -> pi -> 'lessons' -> li -> 'blocks' -> bi;
        if b ->> 'kind' = 'quiz' and b ->> 'support' = 'science' then
          s := jsonb_set(s, array['parts', pi::text, 'lessons', li::text, 'blocks', bi::text, 'content'],
            (b -> 'content') - 'answerIndex' - 'explanation');
        end if;
      end loop;
    end loop;
  end loop;
  return s;
end;
$$;

-- Stored and generated, so every version (old ones included) has its projection and it can never drift.
alter table public.curriculum_versions
  add column learner_snapshot jsonb generated always as (private.redact_snapshot(snapshot)) stored;

/**
 * The answer review for one attempt: each graded question with the learner's
 * choice, the answer and the explanation. It opens only for a passing attempt,
 * so a learner cannot harvest the key with a throwaway attempt (retries are
 * unlimited). Only the learner who made the attempt may read it: the answer key
 * is never shown to gym owners or leads (Sol R1 PR22-02).
 */
create function public.quiz_attempt_review(p_attempt uuid)
returns table (question_id text, chosen integer, answer_index integer, correct boolean, explanation text)
language plpgsql stable security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  qa public.quiz_attempts%rowtype;
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  select * into qa from public.quiz_attempts where id = p_attempt;
  if not found or qa.user_id <> uid then
    raise exception 'no such attempt' using errcode = 'P0002';
  end if;
  if not qa.passed then
    raise exception 'the answer review opens after a passing attempt' using errcode = 'P0001';
  end if;
  return query
    select q ->> 'questionId', (a ->> 'answerIndex')::integer, (q ->> 'answerIndex')::integer,
      (a -> 'answerIndex') = (q -> 'answerIndex'), q ->> 'explanation'
    from jsonb_array_elements(private.graded_questions((select v.snapshot from public.curriculum_versions v where v.id = qa.version_id))) q
    join jsonb_array_elements(qa.answers) a on a ->> 'questionId' = q ->> 'questionId'
    order by q ->> 'questionId';
end;
$$;

revoke all on function private.redact_snapshot(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.quiz_attempt_review(uuid) from public, anon, authenticated, service_role;
grant execute on function public.quiz_attempt_review(uuid) to authenticated;
