-- Lab palette, light and dark (redesign M1; LEAD decisions 2026-10-11): Spindle's fixed tokens move from
-- Atlas (one light theme) to Lab, which has a light and a dark theme. The brand AA checks (D-16: the
-- engine and SQL check identically) now run in both themes against each theme's own surfaces, and a gym
-- sets one accent pair per theme (accent/onAccent for light, accentDark/onAccentDark for dark): one
-- colour cannot be link text on both white and graphite, and a brand is refused, never adjusted. A gym
-- accent must also stay at least 0.10 apart (OKLab distance) from Spindle's signal magenta and the two
-- evidence colours of each theme. The header band stays one colour in both themes.
-- Stored brands are re-checked by the app on every render (validateOrgBrand), so a stored brand without
-- a dark pair, or one that no longer passes, renders unbranded until its owner saves a passing one.

-- OKLab (Ottosson 2020), mirroring oklab/oklabDistance in packages/engine/src/contrast.ts ----------------

/** One sRGB channel (0 to 255) to linear light. */
create function private.srgb_linear(p_channel float8)
returns float8
language sql immutable set search_path = ''
as $$
  select case when s <= 0.04045::float8 then s / 12.92::float8 else power((s + 0.055::float8) / 1.055::float8, 2.4::float8) end
  from (select p_channel / 255::float8 as s) x
$$;

/** OKLab coordinates of a #rrggbb colour. */
create function private.oklab(p_hex text)
returns float8[]
language sql immutable set search_path = ''
as $$
  select array[
    0.2104542553::float8 * l + 0.793617785::float8 * m - 0.0040720468::float8 * s,
    1.9779984951::float8 * l - 2.428592205::float8 * m + 0.4505937099::float8 * s,
    0.0259040371::float8 * l + 0.7827717662::float8 * m - 0.808675766::float8 * s]
  from (select cbrt(0.4122214708::float8 * r + 0.5363325363::float8 * g + 0.0514459929::float8 * b) as l,
               cbrt(0.2119034982::float8 * r + 0.6806995451::float8 * g + 0.1073969566::float8 * b) as m,
               cbrt(0.0883024619::float8 * r + 0.2817188376::float8 * g + 0.6299787005::float8 * b) as s
        from (select private.srgb_linear(private.hex_channel(p_hex, 0)) as r, private.srgb_linear(private.hex_channel(p_hex, 1)) as g,
                     private.srgb_linear(private.hex_channel(p_hex, 2)) as b) c) lms
$$;

/** Euclidean distance between two colours in OKLab. */
create function private.oklab_distance(p_a text, p_b text)
returns float8
language sql immutable set search_path = ''
as $$
  select sqrt(power(a[1] - b[1], 2) + power(a[2] - b[2], 2) + power(a[3] - b[3], 2))
  from (select private.oklab(p_a) as a, private.oklab(p_b) as b) x
$$;

-- The Lab palette per theme (mirrors PALETTE in packages/engine/src/brand.ts) ---------------------------

/** The fixed colours a brand is checked against, for 'light' or 'dark'. */
create function private.lab_palette(p_theme text)
returns jsonb
language sql immutable set search_path = ''
as $$
  select case p_theme
    when 'light' then '{"label": "Light theme", "canvas": "#f4f5f7", "surface": "#ffffff", "surfaceMuted": "#ebedf1",
      "text": "#12151c", "textMuted": "#4a5160", "signal": "#c8195f", "science": "#0b6b50", "practice": "#8a4b10",
      "danger": "#b42318", "dangerSoft": "#fdecea", "hoverToward": "#000000", "softWeight": 0.9}'::jsonb
    when 'dark' then '{"label": "Dark theme", "canvas": "#0b0d12", "surface": "#181c25", "surfaceMuted": "#20242f",
      "text": "#f2f4f8", "textMuted": "#b4bac6", "signal": "#ff3b8e", "science": "#3ddc97", "practice": "#ffb547",
      "danger": "#ff6b5f", "dangerSoft": "#34252c", "hoverToward": "#ffffff", "softWeight": 0.9}'::jsonb
  end
$$;

-- Brand tokens and checks ------------------------------------------------------------------------------

drop function private.brand_tokens(jsonb);

/** The tokens a brand's colours become in one theme (mirrors brandTokens in @spindle/engine). */
create function private.brand_tokens(p_colors jsonb, p_theme text)
returns jsonb
language sql immutable set search_path = ''
as $$
  select jsonb_build_object('accent', accent, 'accentHover', private.mix(accent, p ->> 'hoverToward', 0.15::float8),
    'accentSoft', private.mix(accent, p ->> 'surface', (p ->> 'softWeight')::float8), 'onAccent', on_accent,
    'band', band, 'onBand', on_band, 'bandTint', private.mix(band, on_band, 0.12::float8),
    'bandEdge', private.mix(band, on_band, 0.2::float8))
  from (select p, accent, on_accent, band,
          case when private.contrast('#f2f4f8', band) >= private.contrast('#12151c', band) then '#f2f4f8' else '#12151c' end as on_band
        from (select p,
                lower(p_colors ->> case p_theme when 'light' then 'accent' else 'accentDark' end) as accent,
                lower(p_colors ->> case p_theme when 'light' then 'onAccent' else 'onAccentDark' end) as on_accent,
                lower(coalesce(p_colors ->> 'band', p ->> 'canvas')) as band
              from (select private.lab_palette(p_theme) as p) pal) b) t
$$;

/**
 * Every pair a brand's colours are drawn in, then the accent's distance from Spindle's colours: the light
 * theme's list, then the dark theme's, in the order brandChecks lists them. For 'distinct' rows `ratio`
 * holds the OKLab distance.
 */
create or replace function private.brand_checks(p_brand jsonb)
returns table (n integer, role text, state text, foreground text, background text, minimum numeric, ratio float8, pass boolean)
language sql immutable set search_path = ''
as $$
  with t as (
    select th.ord, private.lab_palette(th.theme) as p, private.brand_tokens(p_brand -> 'colors', th.theme) as k
    from (values (0, 'light'), (1, 'dark')) as th (ord, theme)
  ),
  pairs (ord, i, role, state, fg, bg, minimum) as (
    select t.ord, v.* from t, lateral (values
      (1, 'Link on surface', 'default', k ->> 'accent', p ->> 'surface', 4.5),
      (2, 'Link on canvas', 'default', k ->> 'accent', p ->> 'canvas', 4.5),
      (3, 'Link on a muted panel', 'default', k ->> 'accent', p ->> 'surfaceMuted', 4.5),
      (4, 'Link on surface', 'hover', k ->> 'accentHover', p ->> 'surface', 4.5),
      (5, 'Link on canvas', 'hover', k ->> 'accentHover', p ->> 'canvas', 4.5),
      (6, 'Link on a muted panel', 'hover', k ->> 'accentHover', p ->> 'surfaceMuted', 4.5),
      (7, 'Current lesson marker', 'selected', k ->> 'accent', k ->> 'accentSoft', 4.5),
      (8, 'Muted text on the current lesson marker', 'selected', p ->> 'textMuted', k ->> 'accentSoft', 4.5),
      (9, 'Text on the current lesson marker', 'selected', p ->> 'text', k ->> 'accentSoft', 4.5),
      (10, 'Selected control', 'selected', k ->> 'onAccent', k ->> 'accent', 4.5),
      (11, 'Selected control', 'hover', k ->> 'onAccent', k ->> 'accentHover', 4.5),
      (12, 'Selected control edge', 'selected', k ->> 'accent', p ->> 'surface', 3),
      (13, 'Focus ring on canvas', 'focus', k ->> 'accent', p ->> 'canvas', 3),
      (14, 'Focus ring on surface', 'focus', k ->> 'accent', p ->> 'surface', 3),
      (15, 'Focus ring on a muted panel', 'focus', k ->> 'accent', p ->> 'surfaceMuted', 3),
      (16, 'Focus ring on the current lesson', 'focus', k ->> 'accent', k ->> 'accentSoft', 3),
      (17, 'Focus ring on a field in error', 'focus', k ->> 'accent', p ->> 'dangerSoft', 3),
      (18, 'Error text on its panel', 'error', p ->> 'danger', p ->> 'dangerSoft', 4.5),
      (19, 'Error text on surface', 'error', p ->> 'danger', p ->> 'surface', 4.5),
      (20, 'Brand name on the band', 'default', k ->> 'onBand', k ->> 'band', 4.5),
      (21, 'Nav link on the band', 'default', k ->> 'onBand', k ->> 'band', 4.5),
      (22, 'Chip text on the band tint', 'default', k ->> 'onBand', k ->> 'bandTint', 4.5),
      (23, 'Focus ring on the band', 'focus', k ->> 'onBand', k ->> 'band', 3),
      (25, 'Accent distinct from Spindle signal', 'distinct', k ->> 'accent', p ->> 'signal', 0.1),
      (26, 'Accent distinct from Science', 'distinct', k ->> 'accent', p ->> 'science', 0.1),
      (27, 'Accent distinct from Practice-based', 'distinct', k ->> 'accent', p ->> 'practice', 0.1)) as v (i, role, state, fg, bg, minimum)
    union all
    select t.ord, 24, 'Text mark in the header', 'default', k ->> 'accent', p ->> 'surface', 3 from t where p_brand -> 'mark' ->> 'kind' = 'text'
  ),
  labelled as (
    select pairs.*, (select private.lab_palette(case pairs.ord when 0 then 'light' else 'dark' end) ->> 'label') as label,
      case when pairs.state = 'distinct' then private.oklab_distance(fg, bg) else private.contrast(fg, bg) end as r
    from pairs
  )
  select (row_number() over (order by ord, i))::integer, label || ': ' || labelled.role, labelled.state, fg, bg, labelled.minimum, r,
    r >= labelled.minimum::float8
  from labelled order by ord, i
$$;

/**
 * Validates a brand document and returns it normalized (lower-case colours), or raises 22023. The
 * shape mirrors orgBrandInputSchema in @spindle/schema; the checks mirror brandChecks (both themes).
 */
create or replace function private.validate_org_brand(p_brand jsonb)
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
  perform private.jobject(p_brand -> 'colors', 'brand.colors', array['accent', 'onAccent', 'accentDark', 'onAccentDark', 'band'],
    array['accent', 'onAccent', 'accentDark', 'onAccentDark']);
  foreach k in array array['accent', 'onAccent', 'accentDark', 'onAccentDark', 'band'] loop
    if (p_brand -> 'colors') ? k and (jsonb_typeof(p_brand -> 'colors' -> k) is distinct from 'string'
        or p_brand -> 'colors' ->> k !~ '^#[0-9a-fA-F]{6}$') then
      perform private.jfail('brand.colors.' || k, 'must be a #RRGGBB colour');
    end if;
  end loop;
  perform private.jenum(p_brand -> 'font', 'brand.font', array['geist', 'barlow-condensed', 'fraunces']);
  colors := jsonb_build_object('accent', lower(p_brand -> 'colors' ->> 'accent'), 'onAccent', lower(p_brand -> 'colors' ->> 'onAccent'),
      'accentDark', lower(p_brand -> 'colors' ->> 'accentDark'), 'onAccentDark', lower(p_brand -> 'colors' ->> 'onAccentDark'))
    || case when (p_brand -> 'colors') ? 'band' then jsonb_build_object('band', lower(p_brand -> 'colors' ->> 'band')) else '{}' end;
  select * into failing from private.brand_checks(p_brand) c where not c.pass order by c.n limit 1;
  if found then
    if failing.state = 'distinct' then
      perform private.jfail('brand', format('%s: distance %s, needs %s', failing.role,
        to_char(floor(failing.ratio * 1000) / 1000, 'FM990.000'), to_char(failing.minimum, 'FM990.000')));
    else
      perform private.jfail('brand', format('%s (%s): %s:1, needs %s:1', failing.role, failing.state,
        to_char(floor(failing.ratio * 100) / 100, 'FM990.00'), failing.minimum));
    end if;
  end if;
  return jsonb_build_object('mark', jsonb_build_object('kind', 'text'), 'colors', colors, 'font', p_brand ->> 'font');
end;
$$;

revoke all on function private.srgb_linear(float8), private.oklab(text), private.oklab_distance(text, text),
  private.lab_palette(text), private.brand_tokens(jsonb, text), private.brand_checks(jsonb), private.validate_org_brand(jsonb)
  from public, anon, authenticated, service_role;
