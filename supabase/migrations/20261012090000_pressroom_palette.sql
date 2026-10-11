-- Pressroom palette (redesign M1, LEAD decision 2026-10-11): Spindle's fixed light tokens change from
-- Atlas (cool white, ink #17232b) to Pressroom (bone #f3efe6 canvas, paper #fffdf8 surface, #eee9de muted
-- panels, ink #111111, muted text #4a463f). The brand AA checks must use the backgrounds the app now draws
-- (D-16: the engine and SQL check identically), so brand_tokens and brand_checks are redefined with the
-- new constants. Evidence, caution and danger colours are unchanged. Stored brands are re-checked by the
-- app on every render (validateOrgBrand), so a brand that no longer passes renders unbranded until its
-- owner saves a passing one; nothing is adjusted.

/** The tokens a brand's colours become (mirrors brandTokens in @spindle/engine). */
create or replace function private.brand_tokens(p_colors jsonb)
returns jsonb
language sql immutable set search_path = ''
as $$
  select jsonb_build_object('accent', accent, 'accentHover', private.mix(accent, '#000000', 0.15::float8),
    'accentSoft', private.mix(accent, '#ffffff', 0.9::float8), 'onAccent', lower(p_colors ->> 'onAccent'),
    'band', band, 'onBand', on_band, 'bandTint', private.mix(band, on_band, 0.12::float8),
    'bandEdge', private.mix(band, on_band, 0.2::float8))
  from (select lower(p_colors ->> 'accent') as accent, band,
          case when private.contrast('#111111', band) >= private.contrast('#ffffff', band) then '#111111' else '#ffffff' end as on_band
        from (select lower(coalesce(p_colors ->> 'band', '#fffdf8')) as band) b) t
$$;

/** Every pair a brand's colours are drawn in, in the order brandChecks lists them. */
create or replace function private.brand_checks(p_brand jsonb)
returns table (n integer, role text, state text, foreground text, background text, minimum numeric, ratio float8, pass boolean)
language sql immutable set search_path = ''
as $$
  with t as (select private.brand_tokens(p_brand -> 'colors') as k),
  pairs (n, role, state, fg, bg, minimum) as (
    select v.* from t, lateral (values
      (1, 'Link on surface', 'default', k ->> 'accent', '#fffdf8', 4.5),
      (2, 'Link on canvas', 'default', k ->> 'accent', '#f3efe6', 4.5),
      (3, 'Link on a muted panel', 'default', k ->> 'accent', '#eee9de', 4.5),
      (4, 'Link on surface', 'hover', k ->> 'accentHover', '#fffdf8', 4.5),
      (5, 'Link on canvas', 'hover', k ->> 'accentHover', '#f3efe6', 4.5),
      (6, 'Link on a muted panel', 'hover', k ->> 'accentHover', '#eee9de', 4.5),
      (7, 'Current lesson marker', 'selected', k ->> 'accent', k ->> 'accentSoft', 4.5),
      (8, 'Muted text on the current lesson marker', 'selected', '#4a463f', k ->> 'accentSoft', 4.5),
      (9, 'Text on the current lesson marker', 'selected', '#111111', k ->> 'accentSoft', 4.5),
      (10, 'Selected control', 'selected', k ->> 'onAccent', k ->> 'accent', 4.5),
      (11, 'Selected control', 'hover', k ->> 'onAccent', k ->> 'accentHover', 4.5),
      (12, 'Selected control edge', 'selected', k ->> 'accent', '#fffdf8', 3),
      (13, 'Focus ring on canvas', 'focus', k ->> 'accent', '#f3efe6', 3),
      (14, 'Focus ring on surface', 'focus', k ->> 'accent', '#fffdf8', 3),
      (15, 'Focus ring on a muted panel', 'focus', k ->> 'accent', '#eee9de', 3),
      (16, 'Focus ring on the current lesson', 'focus', k ->> 'accent', k ->> 'accentSoft', 3),
      (17, 'Focus ring on a field in error', 'focus', k ->> 'accent', '#fff0ee', 3),
      (18, 'Error text on its panel', 'error', '#b42318', '#fff0ee', 4.5),
      (19, 'Error text on surface', 'error', '#b42318', '#fffdf8', 4.5),
      (20, 'Brand name on the band', 'default', k ->> 'onBand', k ->> 'band', 4.5),
      (21, 'Nav link on the band', 'default', k ->> 'onBand', k ->> 'band', 4.5),
      (22, 'Chip text on the band tint', 'default', k ->> 'onBand', k ->> 'bandTint', 4.5),
      (23, 'Focus ring on the band', 'focus', k ->> 'onBand', k ->> 'band', 3)) as v (n, role, state, fg, bg, minimum)
    union all
    select 24, 'Text mark in the header', 'default', k ->> 'accent', '#fffdf8', 3 from t where p_brand -> 'mark' ->> 'kind' = 'text'
  )
  select n, role, state, fg, bg, minimum, private.contrast(fg, bg), private.contrast(fg, bg) >= minimum::float8
  from pairs order by n
$$;
