-- P4-A2 tenant text admission (spec revision 3, section 7): the authoritative SQL function on the
-- fixture list the TypeScript mirror uses (packages/engine/src/tenant-text-fixtures.ts; a unit test
-- checks the block below is that list), LEAD overrides, and the rule set in force. Synthetic text only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(112);

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'alice@a.test', now()),
  ('00000000-0000-0000-0000-0000000000a3', 'tess@a.test', now()),
  ('00000000-0000-0000-0000-0000000000c1', 'pat@spindle.test', now());
insert into public.orgs (id, name, slug) values
  ('a0000000-0000-4000-8000-000000000001', 'Gym A', 'gym-a'),
  ('b0000000-0000-4000-8000-000000000002', 'Gym B', 'gym-b');
insert into public.memberships (org_id, user_id, role) values
  ('a0000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'owner'),
  ('a0000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-0000000000a3', 'trainer');
insert into private.content_publishers (user_id, note) values ('00000000-0000-0000-0000-0000000000c1', 'test publisher');

create function pg_temp.act_as(uid text) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.as_service() returns void language sql as $$
  select set_config('role', 'service_role', true), set_config('request.jwt.claims', '{"role":"service_role"}', true);
$$;
create function pg_temp.reset_role() returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;
/** "ok:<stored text>", or the reason, with the reserved term for "denied" and the pattern for "claim". */
create function pg_temp.outcome(a jsonb) returns text language sql as $$
  select case when (a ->> 'ok')::boolean then 'ok:' || (a ->> 'text')
    else (a ->> 'reason') || case when a ->> 'reason' in ('denied', 'claim') then ':' || (a ->> 'detail') else '' end end
$$;
create function pg_temp.admit(slot text, txt text, org uuid default 'a0000000-0000-4000-8000-000000000001') returns text
language sql as $$ select pg_temp.outcome(private.admit_tenant_text(org, slot, txt)) $$;

-- 1. The shared fixtures ----------------------------------------------------------------------
create temp table fx (n integer, slot text, txt text, expect text, detail text);
insert into fx values
-- fixtures:begin
  (1, E'brand_name', E'Andrew Fitness', E'ok', null),
  (2, E'course_title', E'Quadriceps cues', E'ok', null),
  (3, E'welcome', E'We start with drills for the hips.', E'ok', null),
  (4, E'welcome', E'I''m excited to coach you.', E'ok', null),
  (5, E'welcome', E'Extra resources are in each lesson.', E'ok', null),
  (6, E'coach_role', E'Acclaimed strength coach', E'ok', null),
  (7, E'course_summary', E'Hard rows, then easy rows.', E'ok', null),
  (8, E'welcome', E'Coaching here since 2015. Work at 70% of your best set, 3 times a week.', E'ok', null),
  (9, E'welcome', E'Week 1: squats at 10:30, sets of 5.', E'ok', null),
  (10, E'welcome', E'Address the bar, then drive.', E'ok', null),
  (11, E'coach_name', E'Dr\u00e9 Adams', E'ok', null),
  (12, E'course_summary', E'', E'ok', null),
  (13, E'brand_name', E'  Andrew Fitness \u000a', E'ok', E'Andrew Fitness'),
  (14, E'brand_name', E'Cafe\u0301 Barbell', E'ok', E'Caf\u00e9 Barbell'),
  (15, E'brand_name', E'Iron\u3164Yard', E'ok', null),
  (16, E'catalog_tagline', E'Strong at 40, 50 and 60+.', E'ok', null),
  (17, E'welcome', E'Coaching since 2012.', E'ok', null),
  (18, E'brand_name', E'Est. 2015 Barbell', E'ok', null),
  (19, E'course_summary', E'Work up to 80% of 1RM.', E'ok', null),
  (20, E'catalog_tagline', E'Open 24/7', E'ok', null),
  (21, E'welcome', E'Lower the bar by 2 inches.', E'ok', null),
  (22, E'brand_name', E'Stra\u00dfe Barbell', E'ok', null),
  (23, E'brand_name', E'\u0141\u00f3d\u017a Strength', E'ok', null),
  (24, E'welcome', E'I\u2019m excited. Note: bring water.', E'ok', null),
  (25, E'catalog_tagline', E'h a r d rows', E'ok', null),
  (26, E'catalog_tagline', E'Backed by science', E'denied', E'backed by'),
  (27, E'brand_name', E'PT reviewed', E'denied', E'reviewed'),
  (28, E'brand_name', E'Spindle certified', E'denied', E'spindle'),
  (29, E'catalog_headline', E'Sc1ence first', E'denied', E'science'),
  (30, E'catalog_headline', E'5cience first', E'denied', E'science'),
  (31, E'catalog_headline', E'$CIENCE', E'denied', E'science'),
  (32, E'catalog_headline', E'Science!', E'denied', E'science'),
  (33, E'catalog_headline', E's c i e n c e', E'denied', E'science'),
  (34, E'catalog_headline', E's.c.i.e.n.c.e', E'denied', E'science'),
  (35, E'catalog_headline', E'\uff53\uff43\uff49\uff45\uff4e\uff43\uff45', E'denied', E'science'),
  (36, E'catalog_headline', E'\u0455\u0441\u0456\u0435n\u0441\u0435', E'denied', E'science'),
  (37, E'catalog_headline', E'Sc\u00edenc\u00e9', E'denied', E'science'),
  (38, E'catalog_headline', E'Sci\u3164ence', E'denied', E'science'),
  (39, E'catalog_headline', E'BackedByScience', E'denied', E'backed by'),
  (40, E'catalog_tagline', E'Evidence-based plans', E'denied', E'evidence'),
  (41, E'catalog_tagline', E'Peer-reviewed programs', E'denied', E'peer reviewed'),
  (42, E'catalog_tagline', E'Practice-based only', E'denied', E'practice based'),
  (43, E'welcome', E'If it hurts, stop and refer.', E'denied', E'stop and refer'),
  (44, E'coach_role', E'Physical therapist', E'denied', E'physical therapist'),
  (45, E'welcome', E'As Smith et al showed', E'denied', E'et al'),
  (46, E'coach_name', E'Dr. Lee', E'denied', E'dr'),
  (47, E'coach_name', E'D R Lee', E'denied', E'dr'),
  (48, E'course_title', E'We cure back pain', E'denied', E'cure'),
  (49, E'course_title', E'Treat knee pain', E'denied', E'treat'),
  (50, E'welcome', E'See pmid 12345', E'denied', E'pmid'),
  (51, E'catalog_tagline', E'Clinically proven', E'denied', E'clinically'),
  (52, E'brand_name', E'Base Curriculum Gym', E'denied', E'base curriculum'),
  (53, E'welcome', E'Independent experts checked every lesson', E'denied', E'independent experts'),
  (54, E'catalog_tagline', E'Every plan reviewed by coaches', E'denied', E'reviewed'),
  (55, E'catalog_tagline', E'Programs checked by experts', E'denied', E'checked by'),
  (56, E'catalog_headline', E'S C I E N C E B A S E D', E'denied', E'science'),
  (57, E'catalog_headline', E'PT r e v i e w e d b y e x p e r t s', E'denied', E'reviewed'),
  (58, E'catalog_headline', E'S\u1d04ience', E'denied', E'science'),
  (59, E'catalog_headline', E'Sci\u0435\u0578ce', E'denied', E'science'),
  (60, E'catalog_headline', E'r\u025bviewed', E'denied', E'reviewed'),
  (61, E'catalog_headline', E'Sci\u0436nce', E'denied', E'mixed script'),
  (62, E'welcome', E'javascript:alert(1)', E'link', null),
  (63, E'welcome', E'javascript: alert(1)', E'link', null),
  (64, E'welcome', E'mailto: coach', E'link', null),
  (65, E'welcome', E'[Visit](/learn)', E'link', null),
  (66, E'welcome', E'![badge](/a.png)', E'link', null),
  (67, E'welcome', E'mailto:coach', E'link', null),
  (68, E'welcome', E'\uff4a\uff41\uff56\uff41\uff53\uff43\uff52\uff49\uff50\uff54\uff1ax', E'link', null),
  (69, E'welcome', E'Visit www.example.org', E'link', null),
  (70, E'welcome', E'Visit example.org today', E'link', null),
  (71, E'welcome', E'//example', E'link', null),
  (72, E'welcome', E'coach@example', E'link', null),
  (73, E'brand_name', E'<b>Gym</b>', E'link', null),
  (74, E'welcome', E'See doi 10.1000/182', E'link', null),
  (75, E'welcome', E'Squats help (Smith, 2019).', E'claim', E'citation'),
  (76, E'welcome', E'As shown (2019), squats help.', E'claim', E'citation'),
  (77, E'course_summary', E'This reduces pain by 30%', E'claim', E'outcome claim'),
  (78, E'catalog_tagline', E'Clients get 30% stronger in 8 weeks', E'claim', E'outcome claim'),
  (79, E'welcome', E'Improves your squat by 12.5 %', E'claim', E'outcome claim'),
  (80, E'welcome', E'(2019)', E'claim', E'citation'),
  (81, E'welcome', E'Reduces pain by 30%', E'claim', E'outcome claim'),
  (82, E'brand_name', E'Sci\u200bence', E'control', null),
  (83, E'brand_name', E'Gym\u202e', E'control', null),
  (84, E'brand_name', E'Gym\u2060Yard', E'control', null),
  (85, E'brand_name', E'Gym\u00adYard', E'control', null),
  (86, E'welcome', E'Line\u2028break', E'control', null),
  (87, E'welcome', E'Tab\u0009inside', E'control', null),
  (88, E'brand_name', E'\ufeffGym', E'ok', E'Gym'),
  (89, E'brand_name', E'G\ufeffym', E'control', null),
  (90, E'brand_name', E'\u3164', E'blank', null),
  (91, E'brand_name', E'\u2800\u2800', E'blank', null),
  (92, E'brand_name', E'\u0301', E'blank', null),
  (93, E'brand_name', E'', E'length', null),
  (94, E'brand_name', E'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', E'length', null),
  (95, E'brand_name', E'\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb\U0001f3cb', E'ok', null),
  (96, E'welcome', E'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', E'length', null),
  (97, E'welcome', E'a                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                a', E'length', null),
  (98, E'nope', E'Andrew Fitness', E'unknown-slot', null)
-- fixtures:end
;
select is(pg_temp.admit(slot, txt),
  case when expect = 'ok' then 'ok:' || coalesce(detail, txt) else expect || case when expect in ('denied', 'claim') then ':' || detail else '' end end,
  format('fixture %s: %s', n, expect))
from fx order by n;

-- 2. The rule set in force ----------------------------------------------------------------------
select is(private.tt_rules() ->> 'version', 'tt-2026-10-11.1', 'the rule set in force is the one the engine mirror carries');
select is(private.admit_tenant_text(null, 'welcome', 'Hello') ->> 'version', 'tt-2026-10-11.1', 'every admission names its rule set version');
select is(pg_temp.admit('welcome', null), 'required', 'a missing text is refused');
select throws_ok($$update private.tenant_text_rules set rules = rules$$, 'P0001', 'tenant_text_rules rows are immutable',
  'a rule set never changes in place');

-- 3. LEAD overrides: one exact text, one gym, one slot; never the character or link rules ------------
select pg_temp.as_service();
select lives_ok($$select public.publisher_record_text_override('00000000-0000-0000-0000-0000000000c1', '{"orgId": "a0000000-0000-4000-8000-000000000001",
  "slot": "brand_name", "text": " Sports Science Lab ", "reason": "The gym''s registered name."}')$$, 'LEAD records an override');
select pg_temp.reset_role();
select is(pg_temp.admit('brand_name', 'Sports Science Lab'), 'ok:Sports Science Lab', 'the overridden text is admitted');
select is(private.admit_tenant_text('a0000000-0000-4000-8000-000000000001', 'brand_name', 'Sports Science Lab') ->> 'overridden', 'true',
  'and says it was overridden');
select is(pg_temp.admit('brand_name', 'Sports Science Lab!'), 'denied:science', 'any other text is still refused');
select is(pg_temp.admit('catalog_headline', 'Sports Science Lab'), 'denied:science', 'the override covers one slot');
select is(pg_temp.admit('brand_name', 'Sports Science Lab', 'b0000000-0000-4000-8000-000000000002'), 'denied:science', 'and one gym');
select pg_temp.as_service();
select throws_ok($$select public.publisher_record_text_override('00000000-0000-0000-0000-0000000000c1', '{"orgId": "a0000000-0000-4000-8000-000000000001",
  "slot": "brand_name", "text": "science.lab", "reason": "x"}')$$, '22023',
  'invalid override.text: must be plain text, without links, addresses or markup (link); only a reserved word can be overridden',
  'a link cannot be overridden');
select throws_ok($$select public.publisher_record_text_override('00000000-0000-0000-0000-0000000000c1', '{"orgId": "a0000000-0000-4000-8000-000000000001",
  "slot": "brand_name", "text": "Andrew Fitness", "reason": "x"}')$$, '22023',
  'invalid override.text: it is admitted without an override', 'an admitted text needs no override');
select throws_ok($$select public.publisher_record_text_override('00000000-0000-0000-0000-0000000000a1', '{"orgId": "a0000000-0000-4000-8000-000000000001",
  "slot": "brand_name", "text": "Science Gym", "reason": "x"}')$$, '42501', 'actor is not a content publisher',
  'only a content publisher records an override');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$select public.publisher_record_text_override('00000000-0000-0000-0000-0000000000a1', '{"orgId": "a0000000-0000-4000-8000-000000000001",
  "slot": "brand_name", "text": "Science Gym", "reason": "x"}')$$, '42501', null, 'a gym owner cannot call the publisher RPC');

select * from finish();
rollback;
