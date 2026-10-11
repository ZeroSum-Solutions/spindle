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
- Light theme only. A dark theme is deferred until it is designed and checked; the OS dark setting must not half-invert the app.

## Typography

Geist for everything readable, Geist Mono only for identifiers and versions (`v2`, lesson numbers, DOIs). Both load through `next/font`, which self-hosts them (SIL OFL; licences in `docs/design/spindle/assets/`). Lesson text is 18px/1.65 at most 68ch. Labels are 14px; source details that a learner must read stay at 16px. Headings: 32px desktop, 28px mobile. **Lesson titles use their own step, `heading-lesson`: 40px/1.1 from 768px, 28px/1.15 below** (token `--text-heading-lesson`; added 2026-10-11 after the design audit, so the lesson opener has presence). Sentence case everywhere, including callout labels.

## Layout

- App frame up to 1440px; content columns up to 768px for lists and overviews, centred in the frame on wide screens (`LearnShell`, asserted at 1024, 1280 and 1440px in `e2e/player.spec.ts` by measuring the column itself, with displaced-layout negatives).
- The player's outline and reading column are centred together as one 1008px frame (240px outline, 32px gap, 736px reading track).
- The signed-out home page (`components/landing/`) is a brand surface: 1200px frame, the 64px display step, one ink primary action (Sign in) in the hero, and a reverse ink band at the end. It renders from a `Brand` object (`lib/brand.ts`): the brand name fills the brand-dependent copy, and the wordmark keeps the supplied proportions (fixed width, automatic height). Copy stays honest: no testimonials, counts, or science statements without a claim; layers are separate courses, and course authoring is labelled planned until it ships. Focus on the ink band uses a white outline (16:1 on ink); the cobalt ring is only 2.5:1 there.
- Player at 1024px and wider: a 240px course outline beside the reading column. Below 1024px the same outline, in the same order with the same current item, sits in a native disclosure above the lesson.
- One column below 768px, 16px gutters. No horizontal scrolling at 320px (asserted in `e2e/player.spec.ts`).
- The course list leads with a single "Resume lesson" action, taken from the newest assigned version of each course. Older versions of a course stay reachable from its row.
- Curriculum layer (Base, Modality, Gym method) labels a course. Science or practice-based labels a block. They are separate axes and never stand in for each other.
- **Support runs.** Back-to-back blocks with the same support share one label at the start of the run; a heading, image or diagram ends the run. From 1024px every supported block also carries a 2px rule in the left margin, `science` green or `practice` brown, so support stays visible without repeating the chip. Words and colour both remain.
- **Header frame.** The app header's inner frame is the page's content frame (`LearnShell` frame, or the form column on sign-in), so the wordmark lines up with the content. The bar is 64px tall so the focus ring never touches the window edge. A gym name beside the wordmark truncates (full name in its title); it never overlaps the mark.
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
| ClaimDisclosure | `components/learn/claim-disclosure.tsx` | closed, open; claim record missing; source retracted. Shows only what the claim record holds (statement, evidence level, population, sources); review receipts are not readable by learners, so none are implied |
| VersionNotice | `components/learn/version-notice.tsx` | changed, added, removed lessons; nothing changed |
| CompletionView | `components/learn/complete-lesson.tsx` | idle, pending (button disabled, "Saving…"), saved for vN (after server confirmation only), failed with retry, done or credited on load (static) |
| QuizSelfCheck | `components/learn/quiz-self-check.tsx` | unanswered, selected, feedback after "Check answer". Says it is not saved or graded; graded quizzes are phase 3 |
| MediaImage, MediaVideo | `components/learn/media-image.tsx` | loaded; not available (missing, refused or failed object), never a broken image or player. Stored video plays through a signed Storage URL that lives at most 60 s |
| CourseRow, LessonOutline | `components/learn/` | progress as literal text plus a decorative bar; current lesson; earlier versions |
| IntegrityAlert, VersionUnavailable | `components/learn/` | caution; failure |

`/design` in development renders every component above with synthetic props, plus a replayable motion board. Production builds answer 404 there (asserted in `e2e/player.spec.ts`).

## Do's and Don'ts

Do show what changed between assigned versions. Do say "unavailable" rather than show nothing or zero. Do keep sources reachable by keyboard and touch. Do keep the message when an animation does not run.

Do not use streaks, leaderboards or confetti. Do not animate lesson text, hijack scrolling or loop anything inside a lesson. Do not show "saved" before the server confirms it. Do not add a motion library for an effect CSS or SVG can do. Do not commit third-party screenshots, logos or component source.

## Brand

**Tenant brand (planned, phase 4).** A gym or coach-creator brand will replace Spindle's in four jobs only: the header mark, links, the current-lesson marker and the focus ring, through three tokens (`tenant-mark`, `tenant-accent`, `tenant-on-accent`). They are checked when uploaded (4.5:1 for links, 3:1 for the focus ring, darkened automatically if they fail). Science, practice, caution and danger colours are never brandable. The schema and contrast validator exist as presentation only (`lib/theme/tenant-theme.ts`): a plain-text name, a text mark or a PNG/WebP logo from the gym's brand folder, `accent` and `onAccent` as literal hex, and a bundled font (Geist, Barlow Condensed or Fraunces, all SIL OFL, self-hosted by next/font). Every rendered pair and state (default, hover, selected, focus, error) must pass WCAG 2.2 AA or the theme is refused; nothing else is overridable, and the line "Base curriculum by Spindle, cited" stays fixed. The development-only `/design` page shows a brand preview. Storage, uploads and the learner shell come in phase 4.

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

WCAG 2.2 AA. Keyboard reachable with a 3px cobalt focus ring offset 4px. On ink surfaces the ring is white: the surface sets `--focus-ring` (the global rule is unlayered CSS, so a Tailwind outline utility cannot recolour it). The rule also removes outline colour from transitions, so the ring appears at once rather than fading in with `transition-colors` (asserted in `globals.test.ts` and `e2e/player-landing.spec.ts`). One live region stays mounted and announces saving, saved and failed; focus moves to the confirmation after a save. Icon-only controls have names. Future lesson diagrams are SVG with `<title>` and `<desc>`; until a diagram asset exists, the block says it is not available.
