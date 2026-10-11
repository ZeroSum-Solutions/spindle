-- T21, part 2: learners read published versions through learner_snapshot only.
-- The raw snapshot (answer keys included) stays readable by the service role
-- (publisher tooling) and by SECURITY DEFINER functions (scoring). Land with
-- the player's switch from `snapshot` to `learner_snapshot` (W2 note).

revoke select on public.curriculum_versions from authenticated;
grant select (id, course_id, org_id, scope, layer, version_number, content_hash, published_by, published_at,
  rules, question_set_hash, learner_snapshot) on public.curriculum_versions to authenticated;
