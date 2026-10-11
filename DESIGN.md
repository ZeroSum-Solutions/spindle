---
version: 1
name: Spindle Atlas
description: Design contract for Spindle's learner app. Light theme; ink actions, cobalt for brand, links and focus.
colors:
  primary: "#17232B"
  ink: "#17232B"
  ink-hover: "#2C3C47"
  on-ink: "#FFFFFF"
  canvas: "#F6F8FB"
  surface: "#FFFFFF"
  surface-muted: "#EDF1F5"
  text: "#17232B"
  text-muted: "#52616D"
  border: "#D8E0E7"
  control: "#758491"
  brand: "#2453D4"
  brand-hover: "#1B40A6"
  brand-soft: "#EAF0FF"
  on-brand: "#FFFFFF"
  band: "#FFFFFF"
  on-band: "#17232B"
  band-tint: "#E3E5E6"
  band-edge: "#D1D3D5"
  science: "#0B6B50"
  science-soft: "#EAF5F0"
  practice: "#8A4B10"
  practice-soft: "#FFF3E6"
  caution: "#6B5300"
  caution-soft: "#FFF6D1"
  caution-border: "#A88600"
  danger: "#B42318"
  danger-soft: "#FFF0EE"
typography:
  display:
    fontFamily: Geist
    fontSize: 4rem
    fontWeight: 500
    lineHeight: 1.08
    letterSpacing: -0.04em
  heading-lesson:
    fontFamily: Geist
    fontSize: 2.5rem
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: -0.035em
  heading:
    fontFamily: Geist
    fontSize: 2rem
    fontWeight: 500
    lineHeight: 1.15
    letterSpacing: -0.03em
  reading:
    fontFamily: Geist
    fontSize: 1.125rem
    fontWeight: 400
    lineHeight: 1.65
  ui:
    fontFamily: Geist
    fontSize: 1rem
    fontWeight: 500
    lineHeight: 1.5
  label:
    fontFamily: Geist
    fontSize: 0.875rem
    fontWeight: 500
    lineHeight: 1.5
  code:
    fontFamily: Geist Mono
    fontSize: 0.8125rem
    fontWeight: 400
    lineHeight: 1.5
rounded:
  small: 4px
  control: 8px
  card: 12px
spacing:
  unit: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  section: 64px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-ink}"
    typography: "{typography.ui}"
    rounded: "{rounded.control}"
    height: 48px
  button-primary-hover:
    backgroundColor: "{colors.ink-hover}"
    textColor: "{colors.on-ink}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    height: 44px
  link:
    textColor: "{colors.brand}"
  link-hover:
    textColor: "{colors.brand-hover}"
  current-lesson:
    backgroundColor: "{colors.brand-soft}"
    textColor: "{colors.brand}"
    rounded: "{rounded.small}"
  science-label:
    backgroundColor: "{colors.science-soft}"
    textColor: "{colors.science}"
    typography: "{typography.label}"
    rounded: "{rounded.small}"
  practice-label:
    backgroundColor: "{colors.practice-soft}"
    textColor: "{colors.practice}"
    typography: "{typography.label}"
    rounded: "{rounded.small}"
  integrity-caution:
    backgroundColor: "{colors.caution-soft}"
    textColor: "{colors.caution}"
    rounded: "{rounded.card}"
  integrity-caution-outline:
    backgroundColor: "{colors.caution-border}"
  progress-bar:
    backgroundColor: "{colors.ink}"
  error-note:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
    rounded: "{rounded.small}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.card}"
  page:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.text}"
  muted-panel:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.text-muted}"
  divider:
    backgroundColor: "{colors.border}"
  control-outline:
    backgroundColor: "{colors.control}"
  tenant-header:
    backgroundColor: "{colors.band}"
    textColor: "{colors.on-band}"
  tenant-hero-chip:
    backgroundColor: "{colors.band-tint}"
    textColor: "{colors.on-band}"
    typography: "{typography.label}"
    rounded: "{rounded.small}"
  tenant-band-divider:
    backgroundColor: "{colors.band-edge}"
---

# DESIGN.md — Spindle

This is the design contract. `apps/web/src/app/globals.css` carries the same token values as Tailwind v4 `@theme` variables; change both together. The selected proposal, its provenance and the research behind it are in [docs/design/spindle/](docs/design/spindle/README.md). Where they differ, this file wins.

## Overview

Spindle teaches personal trainers how the body works, and every science claim is cited. The interface makes three things easy to find: the assigned lesson, how each statement is supported, and the sources behind it. The direction is **Atlas**: cool white for long reading, ink for text and main actions, and one rare cobalt for the brand, links, the current lesson and focus.

## Colors

- **Ink** (`ink`, also the `primary` role) carries text and every primary action. One primary action per screen.
- **Cobalt** (`brand`) marks the wordmark, links, the current lesson and the focus ring. It never means progress, evidence strength or quiz correctness. Lesson states (done, credited, updated, new) use ink with an icon, so they do not read as links.
- **Support types** use colour plus words, never colour alone: green `science`, brown `practice`.
- **Caution** marks a retracted source: the content stays readable and credit stays, so it is not an error. **Danger** is for failures only: a version that cannot be displayed, a save that failed, a page that did not load.
- Checked contrast (WCAG 2.2): text on its backgrounds is at least 5.6:1 (`text-muted` on `surface-muted` is the lowest), `control` boundaries 3.6:1 on canvas, focus ring 6:1. Pale `border` (1.3:1) is for structure only, never a control outline.
- **Tenant tokens (P4-A2).** A gym's brand maps onto `brand`, `brand-hover`, `brand-soft`, `on-brand` (P4-A core) and `band` (the tenant band). `band` defaults to `surface`, so an unbranded header looks as it does today. Three tokens derive from it, and the tenant never sets them directly:
  - `on-band` is ink `#17232b` or white, whichever has more contrast on the band. A band whose best `on-band` is under 4.5:1 is refused.
  - `band-tint` is `on-band` mixed 12% into the band.
  - `band-edge` is `on-band` mixed 20% into the band.

  The defaults in `@theme` are `#ffffff`, `#17232b`, `#e3e5e6` and `#d1d3d5`; `lib/theme/atlas-sync.test.ts` asserts that they follow this derivation. The accent is never drawn on the band: on a dark band it can fall to about 1.5:1.
- **Checked tenant contrast (P4-A2, planned).** These are acceptance requirements for the W1 validator and the W2 components, not checks that exist yet. `brandChecks` will decide on the unrounded ratio and refuse a brand that fails any row. A unit test will assert that every fixed pair (Atlas only) meets its minimum, so an Atlas edit cannot silently break one.

  | Role | Foreground / background | Min | States |
  |---|---|---|---|
  | Header name | `on-band` / `band` | 4.5 | default |
  | Nav link | `on-band` / `band` | 4.5 | default, hover |
  | Focus ring, header and hero | `on-band` / `band` | 3 | focus |
  | Hero headline, tagline | `on-band` / `band` | 4.5 | default |
  | Hero chip | `on-band` / `band-tint` | 4.5 | default |
  | Ink action | `on-ink` / `ink`, `ink-hover` | 4.5 | default, hover |
  | Ink action focus ring | accent / `canvas` | 3 | focus |
  | Card title, meta, chip | `text`, `text-muted` / `surface`, `surface-muted` | 4.5 | default, hover |
  | Card focus ring | accent / `canvas` | 3 | focus |
  | Card hover edge | `control` / `surface` | 3 | hover |
  | Coach note name, body | `text` / `surface` | 4.5 | default |
  | Coach note caption | `text-muted` / `surface` | 4.5 | default |
  | Practice chip | `practice` / `practice-soft` | 4.5 | default |
  | Practice rule | `practice` / `surface` | 3 | default |
  | Seal text | `text-muted` / `surface`, `canvas` | 4.5 | default |
  | P4-A core pairs (links, selected, current lesson, error) | as `validateBrand` | 4.5 / 3 | default, hover, selected, focus, error |

  Exempt, because they are decorative: pattern covers, `band-edge`, `border` hairlines and the cover edge. Planned (W2 acceptance): the renderer draws only the colours `brandTokens` returns plus the fixed Atlas palette, and a render test fails on any other computed colour.
- Light theme only. A dark theme is deferred until it is designed and checked; the OS dark setting must not half-invert the app.

## Typography

Geist for everything readable. **A gym's brand font (P4-A2) applies only to display text of 20px or more:** the header name, the hero headline and course card titles. The tagline, coach note, coach name, labels, captions and lesson text stay Geist. Geist Mono only for identifiers and versions (`v2`, lesson numbers, DOIs). Both load through `next/font`, which self-hosts them (SIL OFL; licences in `docs/design/spindle/assets/`). Lesson text is 18px/1.65 at most 68ch. Labels are 14px; source details that a learner must read stay at 16px. Headings: 32px desktop, 28px mobile. **Lesson titles use their own step, `heading-lesson`: 40px/1.1 from 768px, 28px/1.15 below** (token `--text-heading-lesson`; added 2026-10-11 after the design audit, so the lesson opener has presence). Sentence case everywhere, including callout labels.

## Layout

- App frame up to 1440px; content columns up to 768px for lists and overviews, centred in the frame on wide screens (`LearnShell`, asserted at 1024, 1280 and 1440px in `e2e/player.spec.ts` by measuring the column itself, with displaced-layout negatives).
- The player's outline and reading column are centred together as one 1008px frame (240px outline, 32px gap, 736px reading track).
- The signed-out home page (`components/landing/`) is a brand surface: 1200px frame, the 64px display step, one ink primary action (Sign in) in the hero, and a reverse ink band at the end. It renders from a `Brand` object (`lib/brand.ts`): the brand name fills the brand-dependent copy, and the wordmark keeps the supplied proportions (fixed width, automatic height). Copy stays honest: no testimonials, counts, or science statements without a claim; layers are separate courses, and course authoring is labelled planned until it ships. Focus on the ink band uses a white outline (16:1 on ink); the cobalt ring is only 2.5:1 there.
- Player at 1024px and wider: a 240px course outline beside the reading column. Below 1024px the same outline, in the same order with the same current item, sits in a native disclosure above the lesson.
- One column below 768px, 16px gutters. No horizontal scrolling at 320px (asserted in `e2e/player.spec.ts`).
- The course list leads with a single "Resume lesson" action, taken from the newest assigned version of each course. Older versions of a course stay reachable from its row.
- Curriculum layer (Base, Modality, Gym method) labels a course. Science or practice-based labels a block. They are separate axes and never stand in for each other.
- **Support runs.** Back-to-back blocks with the same support share one label at the start of the run; a heading, image or diagram ends the run. From 1024px every supported block also carries a 2px rule in the left margin, `science` green or `practice` brown, so support stays visible without repeating the chip. Words and colour both remain.
- **Header frame.** The app header's inner frame is the page's content frame (`LearnShell` frame, or the form column on sign-in), so the wordmark lines up with the content. The bar is at least 64px tall, with automatic height because a tenant name may wrap, so the focus ring never touches the window edge. The tenant name wraps (at most 60 characters, `overflow-wrap: anywhere`); it never truncates and never overlaps the mark. On member pages of a branded gym (P4-A2) the header is the tenant band: the name in the brand font (20px, `on-band`) and up to two nav links (`on-band`, always underlined, thicker underline on hover). It is one row from a 480px container; below that, the name row sits above the link row, and each link is 44px tall. A 60-character unbroken name with two links never scrolls sideways at 320 or 390px. The header is not sticky.
- **Catalog hero (P4-A2).** The member catalog has a second branded surface directly under the header: the band colour, holding the headline (brand font, display step, `on-band`), the tagline (Geist 18px, `on-band`) and up to three modality chips (`on-band` on `band-tint`). It carries text only, never an image. Copy sits left from a 720px container and stacks below that. The one ink primary action ("Continue where you left off" or "Start your first course", 48px) sits on canvas directly below the hero, never on the band. After the hero come the Gym method courses, then a "Base curriculum" section with the base seal.
- **Lesson navigation.** Below 768px, previous is a small link above a full-width 48px "Next lesson" button that names the lesson; from 768px they share a row.
- **Completion card.** Once a lesson is done the card says it once ("Lesson complete · v2 · 11 Oct 2026", or "Credited · v3 · from your completion on … in v1") and holds the one ink action: the next lesson, or back to the course.
- **Course overview.** "Resume lesson" comes before the version notice. The notice is a compact list (Pencil, Plus, Minus beside the words Changed, Added, Removed) with one muted line of explanation.

## Elevation & Depth

Flat: surfaces and 1px borders, no shadows on cards or buttons. No glow, glass or gradient behind lesson text. **Bordered cards are for things you interact with** (course rows, claim disclosures, quizzes, completion, the outline disclosure). Explanations and lists that are only read (the support legend, the version notice, diagram panels, completed-course notes) are `surface-muted` panels; resources and objectives are open sections between rules.

## Shapes

Controls 8px radius, cards 12px, labels 4px. Every touch target is at least 44×44px; primary actions are 48px tall.

## Components

Native elements first; no component library is installed. Lucide (ISC) is the only icon family, 1.75px stroke, always next to a word: FileText for science, Clipboard for practice, Check for completion, TriangleAlert for caution and errors. shadcn/Radix stay the choice for composite widgets (dialog, sheet, select) when a later phase needs them.

| Component | File | States |
|---|---|---|
| SupportLabel, SupportLegend | `components/learn/labels.tsx` | science, practice-based; the legend explains, once per lesson, only the types that lesson uses |
| LayerLabel, VersionTag, LessonStateLabel | `components/learn/labels.tsx` | Base/Modality/Gym method; done, credited, updated, new, to do |
| Evidence states (science blocks) | `components/learn/blocks.tsx`, `lib/learning/evidence.ts` | From `version_integrity`: current (Science label); recheck due (Science label plus "Evidence due for recheck"); withdrawn or unreported (no Science label: "Claim withdrawn" with a one-line explanation, text and sources kept as history); retracted ("Source retracted", as before). If the report cannot be read, the lesson says so once and shows labels as published |
| ClaimDisclosure | `components/learn/claim-disclosure.tsx` | closed, open; claim record missing; source retracted. Shows only what the claim record holds (statement, evidence level, population, sources); review receipts are not readable by learners, so none are implied |
| VersionNotice | `components/learn/version-notice.tsx` | changed, added, removed lessons; nothing changed |
| CompletionView | `components/learn/complete-lesson.tsx` | idle, pending (button disabled, "Saving…"), saved for vN (after server confirmation only), failed with retry, done or credited on load (static) |
| QuizSelfCheck | `components/learn/quiz-self-check.tsx` | unanswered, selected, feedback after "Check answer". Says it is not saved or graded; graded quizzes are phase 3 |
| MediaImage, MediaVideo | `components/learn/media-image.tsx` | loaded; not available (missing, refused or failed object), never a broken image or player. Stored video plays through a signed Storage URL that lives at most 60 s |
| ModuleStatusCard, ModuleQuiz (QuizView) | `components/learn/module-status.tsx`, `module-quiz.tsx` | status: unavailable (never zero), not complete with the quiz not taken or not passed (best attempt and the number needed), complete (check), carried credit. Quiz: not submitted, pending ("Submitting…"), failed (nothing saved), scored (server's numbers and "passed" only; per-question feedback after submit, withheld if the app's explanation disagrees). The answer key is never sent before submitting. No celebration effects |
| YouTubeSegment, YouTubePlayer | `components/learn/youtube-segment.tsx`, `youtube-player.tsx` | From the lesson's frozen `video` block plus `version_media`. off (the registry did not report the clip, or switched it off: a muted note, nothing from YouTube offered), idle (our own ink facade: the clip title, channel and range, a white Play button, and the YouTube notice linking Google's privacy policy and YouTube's terms; no thumbnail or YouTube request), loading, ready (privacy-enhanced player with official controls, at least 200×200px, origin-only referrer), unavailable (provider says unavailable, a player error, a failed script or a 15 s ready timeout, with a Watch on YouTube link), blocked (play rechecked the registry and the clip is no longer allowed: nothing loads). The play notice links Spindle's own `/privacy` page as well as Google's and YouTube's. Rationale below the player in 16px muted text. A clip the registry reports as model-described (D-11) says so beside the label: "Clip described by a model; human check pending". Always practice-based and optional. The CSP (`lib/csp.ts`) frames only `youtube-nocookie.com` |
| CourseRow, LessonOutline | `components/learn/` | progress as literal text plus a decorative bar; current lesson; earlier versions |
| IntegrityAlert, VersionUnavailable | `components/learn/` | caution; failure |
| BrandHeader (P4-A2, planned) | `components/brand/` | default (Spindle wordmark on `surface` when there is no brand), branded (name on `band`), name pending admission (fixed fallback "Your gym"), link hover, link focus (`on-band` ring); 1 row from 480px, 2 rows below |
| CatalogHero (P4-A2, planned) | `components/brand/` | default (no hero without a brand), admitted (headline, tagline, chips), headline pending (the brand name, or "Your gym" while the name is pending, stands in), tagline pending (omitted); chip focus is never a stop (chips are not links) |
| CourseCard (P4-A2, planned) | `components/brand/` | default, hover (`control` edge), focus (accent ring checked on canvas, outside the card edge); title admitted, title pending (the fixed fallback "Untitled course"), summary pending (omitted). Footer: the fixed `LayerLabel`. Base cards add the seal; Modality cards add "Published by Spindle" and no seal. One link per card. 1 column under 640px, 2 at 640 to 1023px, 3 from 1024px |
| CourseCover (P4-A2, planned) | `components/brand/` | pattern `solid`, `diagonal`, `grid`, `dots`, `rings` or `waves` in tone `accent`, `band` or `soft`, drawn by Spindle as a 16:9 SVG (strokes `on-accent`, `on-band` or the accent at 18%). Decorative (`alt=""`). Base and Modality cards always use Spindle's neutral cover (an ink pattern on `surface-muted`). No tenant image |
| CoachNote (P4-A2, planned) | `components/brand/` | admitted (shown above the lesson list of a Gym method course); pending or edited since admission (omitted). `surface` with a `border` and a `practice` left rule. The name row is the frozen coach name (Geist 16px semibold) with the fixed Practice-based chip. Label "Note from {name}": the admitted coach name, else the admitted brand name, else "Your gym". Fixed caption: "Coach's note. Based on coaching practice, not a research claim." |
| BaseSeal (P4-A2, planned) | `components/brand/` | one state: the Spindle symbol (16px ink tile) and the fixed line "Base curriculum by Spindle, cited" (14px, `text-muted`) on a hairline strip. Only where cited base curriculum appears (the catalog's Base section, base cards, base lesson footers); never on the band, method or modality content. No check-shield and no "evidence" wording; no review claim until a recorded PT review exists (D-08) |
| ModalityChip (P4-A2, planned) | `components/brand/` | default only (not interactive). On the hero, `on-band` on `band-tint`; on cards, `text` on `surface-muted`. The youth tag reads "Youth coaching education" |

`/design` in development renders the existing learner components above with synthetic props, a replayable motion board, and the three P4-A2 token specimens (header band, catalog hero, pattern covers). The planned P4-A2 components are not on it yet. Production builds answer 404 there (asserted in `e2e/player.spec.ts`).

## Do's and Don'ts

Do show what changed between assigned versions. Do say "unavailable" rather than show nothing or zero. Do keep sources reachable by keyboard and touch. Do keep the message when an animation does not run.

Do not use streaks, leaderboards or confetti. Do not animate lesson text, hijack scrolling or loop anything inside a lesson. Do not show "saved" before the server confirms it. Do not add a motion library for an effect CSS or SVG can do. Do not commit third-party screenshots, logos or component source.

## Brand

**Tenant brand (phase 4, P4-A core).** A gym brand changes only what this section lists (P4-A core below, P4-A2 after it). The brand is plain data (`TenantBrand` in `@spindle/schema`): a plain-text name, a text mark or a PNG/WebP logo given only as a file name in the gym's own brand folder (with intrinsic size, at most 512 KB and an aspect ratio between 1:8 and 8:1; no SVG, no URL, no path), two literal hex colours (`accent`, `onAccent`) and one bundled font (Geist, Barlow Condensed or Fraunces, all SIL OFL, self-hosted by next/font). The schema is strict: semantic colours, review status, practice labels, attribution and CSS are refused, not ignored. `validateBrand` (`@spindle/engine`) derives the hover (accent mixed 15% toward black) and the tint (90% toward white) and checks every pair a brand colour is drawn in, on the real Atlas backgrounds and in every state: links and hovered links on surface, canvas and muted panels; the current-lesson marker and the text on it; selected controls and their hover; the focus ring on canvas, surface, muted panels, the current lesson and error panels; error text; the text mark. Text needs 4.5:1 and rings and large marks 3:1, decided on the exact ratio (shown rounded down). A brand that fails any pair is refused, never adjusted. `brandToCssVars` accepts only a brand returned by `validateBrand` and emits `--color-brand`, `--color-brand-hover`, `--color-brand-soft`, `--color-on-brand` and `--focus-ring` for the element that scopes the brand, so the learner components theme through their ordinary utilities (`text-brand`, `bg-brand-soft`, the global focus rule). Science, practice, caution and danger colours never change, and the line "Base curriculum by Spindle, cited" stays fixed. `ATLAS` in the engine must equal the `@theme` values (asserted in `lib/theme/atlas-sync.test.ts`). The test-only `/brand-preview` page shows two made-up brands on the real shell, outline, lesson, quiz card, selected control and error; the proxy answers 404 for it unless the server runs with `SPINDLE_PREVIEW_PAGES=1` (only the Playwright server does). The owner's brand editor and per-org rendering come in P4-A2. Tenant images and anonymous brand delivery are deferred (below).

**Brand presence (P4-A2).** On member pages a gym brand has these jobs, and no others:
- the header mark: the gym name as a text mark on the tenant band;
- links;
- the current-lesson marker;
- selected controls (from P4-A core);
- the focus ring;
- the catalog hero band;
- pattern course covers;
- display text in the brand font (20px and up).

The tokens are those above plus `band` (with the derived `on-band`, `band-tint` and `band-edge`). Primary actions stay ink, reading copy stays Geist, and the accent marks links, the current lesson, selected controls and focus only.

A brand that fails a check is refused, never adjusted. "Base curriculum by Spindle, cited" stays fixed.

These things stay Spindle's and never sit in a tenant slot:
- the colours `science`, `practice`, `caution` and `danger`, with their soft and border variants;
- the labels Science, Practice-based and Stop and refer;
- review chips, source drawers, citations, and retracted or withdrawn states;
- quiz feedback, errors and layer labels;
- the base seal;
- Geist body type, the canvas, surface, text and border tokens, and the ink action.

Spindle draws every tenant shape itself, from an enum plus validated literal hex. Text never sits on a tenant surface the validator has not checked. P4-A2 refuses the logo mark (`mark.kind` must be `text`).

**Held identity text (P4-A2).** Member-visible free text from a gym is untrusted until a publisher records an admission receipt for that exact text. The held slots are:
- the brand name;
- a method course's title and summary;
- the hero headline and tagline;
- the coach name and role;
- the coach's welcome note.

A pending slot never shows its text. Each surface either omits it or shows a fixed Spindle fallback:
- "Your gym" for the brand name;
- "Untitled course" for a course title;
- the brand name (or "Your gym") as the hero headline.

Editing admitted text makes it pending again. A method course cannot publish without an admitted title. Lesson bodies and subtitles stay draft content under the practice-based method rules.

**Deferred.** Every tenant image (logo, coach photo, raster cover: P4-A3) and all anonymous delivery of brand data (P4-A4). Until P4-A4, no anonymous page or payload shows a tenant's brand.

**Cut 03 motif.** The d cut leans 12 degrees from vertical (horizontal run = 0.2126 x height). It recurs as the slanted tick that leads landing section headings (`.cut-tick`), the leading edge of the current-lesson marker (`.cut-marker`), and the sheets of the layer-stack drawing. Never on lesson text.

**Illustrations.** Original line art drawn as inline SVG from simple geometry, never traced: 1.75px strokes at any size (`vector-effect: non-scaling-stroke`), round caps and joins, ink lines, `control` grey for context structures, dashed lines for structures behind others, and one `brand-soft` fill on the structure under discussion. Every drawing has a `<title>`, a `<desc>` and a text legend, and says "Schematic, not to scale". Any text a reader must read (marker numbers, notes) is HTML at the 14px label size over or beside the drawing, never SVG text that shrinks with it; SVG text is kept for large labels that stay at least 16px at 320px. Laterality follows the subject: the shoulder complex is the subject's left shoulder seen from the front. Diagrams are placed by id (`components/learn/diagrams.tsx`); unknown ids show the "not available yet" state. Provenance is in `docs/design/spindle/asset-provenance.json`.


The wordmark is the lowercase Cut 03 mark: a diagonal cut through the **d** ascender, a **solid l**, and a cut through the **i** dot. Never move the cut to the l, stretch, outline or decorate the mark.

- Files: `apps/web/public/brand/spindle-wordmark.svg` (currentColor), `-ink`, `-white` (reverse on ink), `-cobalt`. Built by `docs/design/spindle/build-brand.py` from the traced original.
- Minimum width 120px. Clear space at least a quarter of the mark's height on every side.
- Symbol and favicon: the cut **d** in white on an ink tile (`spindle-symbol.svg`, `src/app/icon.svg`, `favicon.ico` 16/32/48, `apple-icon.png` 180). Checked at 16, 24 and 32px: the d stays legible. The cut i dot alone was rejected because it reads as a "no entry" sign at 16px.
- The mark is a generated design asset; its provenance is recorded, but provenance is not trademark clearance.

## Motion

| Token | Value | Use |
|---|---|---|
| `--duration-feedback` | 120ms | hover, colour, appear |
| `--duration-disclosure` | 180ms | chevron of a native disclosure (content opens without sliding) |
| `--duration-drawer` | 240ms | reserved for a future sheet |
| `--duration-confirm` | 320ms | completion check stroke, once, after server success |
| `--ease-interface` | cubic-bezier(.2,.8,.2,1) | entry |
| `--ease-exit` | cubic-bezier(.4,0,1,1) | exit |

The logo reveal (560ms, along the d cut's slant) is for brand surfaces only and never delays the app. Reduced motion sets every duration to 0 and removes animation; every state stays visible as text. Focus appears immediately. Measured in the rendered app: 320ms check with motion, 0s and fully drawn with reduced motion.

The completion check is a custom inline SVG stroke (a few hundred bytes of markup, token colours, no dependency). The LottieFiles candidate "Success check" (Lan Jean, after "Checkmark green" by Andrew Vilchez, Lottie Simple License, 1.1–6 KB) was rejected without download: it needs a Lottie player runtime for an effect CSS already does, and adds a derivative licence chain to track.

## Accessibility

WCAG 2.2 AA. Keyboard reachable with a 3px cobalt focus ring offset 4px. On a tenant's header band and catalog hero the ring is `on-band` (still 3px, offset 4px, from the same global rule); everywhere else in a branded gym it is the gym's accent (P4-A2). On ink surfaces the ring is white: the surface sets `--focus-ring` (the global rule is unlayered CSS, so a Tailwind outline utility cannot recolour it). The rule also removes outline colour from transitions, so the ring appears at once rather than fading in with `transition-colors` (asserted in `globals.test.ts` and `e2e/player-landing.spec.ts`). One live region stays mounted and announces saving, saved and failed; focus moves to the confirmation after a save. Icon-only controls have names. Future lesson diagrams are SVG with `<title>` and `<desc>`; until a diagram asset exists, the block says it is not available.
