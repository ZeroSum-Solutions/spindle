---
version: 3
name: Spindle Lab
description: Design contract for Spindle's learner app. A performance lab in two themes, Lab Light and Lab Dark, with one signal colour (magenta) for place and key moments; Archivo at its widest for display, IBM Plex Sans for reading and UI, IBM Plex Mono for data; a measurement layer of ticks, readouts and numeric progress. Each colour has a light value and a -dark value.
colors:
  primary: "#12151C"
  ink: "#12151C"
  ink-hover: "#2A2F3A"
  on-ink: "#FFFFFF"
  canvas: "#F4F5F7"
  surface: "#FFFFFF"
  surface-muted: "#EBEDF1"
  sheet: "#FFFFFF"
  text: "#12151C"
  text-muted: "#4A5160"
  border: "#D7DBE2"
  control: "#737A89"
  signal: "#C8195F"
  signal-hover: "#AA1551"
  on-signal: "#FFFFFF"
  brand: "#C8195F"
  brand-hover: "#AA1551"
  brand-soft: "#FAE8EF"
  on-brand: "#FFFFFF"
  band: "#F4F5F7"
  on-band: "#12151C"
  band-tint: "#D9DADD"
  band-edge: "#C7C8CB"
  science: "#0B6B50"
  science-soft: "#E6F4EE"
  practice: "#8A4B10"
  practice-soft: "#FFF1E0"
  caution: "#6B5300"
  caution-soft: "#FFF6D1"
  caution-border: "#A88600"
  danger: "#B42318"
  danger-soft: "#FDECEA"
  stop-panel: "#12151C"
  on-stop-panel: "#F2F4F8"
  stop-panel-muted: "#B4BAC6"
  stop: "#FF6B5F"
  media: "#0B0D12"
  on-media: "#F2F4F8"
  primary-dark: "#F2F4F8"
  ink-dark: "#F2F4F8"
  ink-hover-dark: "#D9DDE4"
  on-ink-dark: "#0B0D12"
  canvas-dark: "#0B0D12"
  surface-dark: "#181C25"
  surface-muted-dark: "#20242F"
  sheet-dark: "#161A22"
  text-dark: "#F2F4F8"
  text-muted-dark: "#B4BAC6"
  border-dark: "#2A2F3A"
  control-dark: "#6B7385"
  signal-dark: "#FF3B8E"
  signal-hover-dark: "#FF589F"
  on-signal-dark: "#0B0D12"
  brand-dark: "#FF3B8E"
  brand-hover-dark: "#FF589F"
  brand-soft-dark: "#2F1F30"
  on-brand-dark: "#0B0D12"
  band-dark: "#0B0D12"
  on-band-dark: "#F2F4F8"
  band-tint-dark: "#27292E"
  band-edge-dark: "#393B40"
  science-dark: "#3DDC97"
  science-soft-dark: "#192A2B"
  practice-dark: "#FFB547"
  practice-soft-dark: "#292625"
  caution-dark: "#E9D55B"
  caution-soft-dark: "#272927"
  caution-border-dark: "#8F7F2E"
  danger-dark: "#FF6B5F"
  danger-soft-dark: "#34252C"
  stop-panel-dark: "#F2F4F8"
  on-stop-panel-dark: "#0B0D12"
  stop-panel-muted-dark: "#3A3F4B"
  stop-dark: "#D92D20"
  media-dark: "#0B0D12"
  on-media-dark: "#F2F4F8"
typography:
  display:
    fontFamily: Archivo
    fontSize: 4.75rem
    fontWeight: 800
    lineHeight: 0.98
    letterSpacing: -0.03em
  title:
    fontFamily: Archivo
    fontSize: 3.5rem
    fontWeight: 800
    lineHeight: 1
    letterSpacing: -0.015em
  heading:
    fontFamily: Archivo
    fontSize: 2.5rem
    fontWeight: 800
    lineHeight: 1.04
    letterSpacing: -0.015em
  heading-lesson:
    fontFamily: Archivo
    fontSize: 3rem
    fontWeight: 800
    lineHeight: 1.04
    letterSpacing: -0.015em
  section:
    fontFamily: Archivo
    fontSize: 1.75rem
    fontWeight: 800
    lineHeight: 1.12
    letterSpacing: -0.01em
  subhead:
    fontFamily: Archivo
    fontSize: 1.1875rem
    fontWeight: 700
    lineHeight: 1.25
  reading:
    fontFamily: IBM Plex Sans
    fontSize: 1.125rem
    fontWeight: 400
    lineHeight: 1.65
  ui:
    fontFamily: IBM Plex Sans
    fontSize: 1rem
    fontWeight: 500
    lineHeight: 1.5
  label:
    fontFamily: IBM Plex Sans
    fontSize: 0.875rem
    fontWeight: 500
    lineHeight: 1.45
  eyebrow:
    fontFamily: IBM Plex Mono
    fontSize: 0.75rem
    fontWeight: 500
    lineHeight: 1.35
    letterSpacing: 0.12em
  code:
    fontFamily: IBM Plex Mono
    fontSize: 0.8125rem
    fontWeight: 400
    lineHeight: 1.5
rounded:
  small: 4px
  control: 6px
  card: 8px
  plate: 10px
  pill: 9999px
spacing:
  unit: 4px
  hair: 4px
  tight: 8px
  attach: 12px
  stack: 16px
  block: 24px
  group: 32px
  safety: 40px
  section: 56px
  page: 64px
  hero: 96px
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
  selected-control:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.on-brand}"
    rounded: "{rounded.control}"
  signal-action:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.on-signal}"
    typography: "{typography.ui}"
    rounded: "{rounded.control}"
  signal-readout:
    textColor: "{colors.signal}"
    typography: "{typography.eyebrow}"
  stop-panel:
    backgroundColor: "{colors.stop-panel}"
    textColor: "{colors.on-stop-panel}"
    typography: "{typography.ui}"
    rounded: "{rounded.card}"
  stop-stripe:
    backgroundColor: "{colors.stop}"
  section-heading:
    textColor: "{colors.text}"
    typography: "{typography.section}"
  eyebrow:
    textColor: "{colors.text-muted}"
    typography: "{typography.eyebrow}"
  plate:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.plate}"
  segmented-control:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.text}"
    rounded: "{rounded.pill}"
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
    typography: "{typography.reading}"
  reading-sheet:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.text}"
    typography: "{typography.reading}"
  media-panel:
    backgroundColor: "{colors.media}"
    textColor: "{colors.on-media}"
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
  code:
    textColor: "{colors.text-muted}"
    typography: "{typography.code}"
  heading:
    textColor: "{colors.text}"
    typography: "{typography.heading}"
  lesson-title:
    textColor: "{colors.text}"
    typography: "{typography.heading-lesson}"
  subhead:
    textColor: "{colors.text}"
    typography: "{typography.subhead}"
  button-primary-dark:
    backgroundColor: "{colors.primary-dark}"
    textColor: "{colors.on-ink-dark}"
    typography: "{typography.ui}"
    rounded: "{rounded.control}"
    height: 48px
  button-primary-hover-dark:
    backgroundColor: "{colors.ink-hover-dark}"
    textColor: "{colors.on-ink-dark}"
  button-secondary-dark:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.text-dark}"
    rounded: "{rounded.control}"
    height: 44px
  link-dark:
    textColor: "{colors.brand-dark}"
  link-hover-dark:
    textColor: "{colors.brand-hover-dark}"
  current-lesson-dark:
    backgroundColor: "{colors.brand-soft-dark}"
    textColor: "{colors.brand-dark}"
    rounded: "{rounded.small}"
  selected-control-dark:
    backgroundColor: "{colors.brand-dark}"
    textColor: "{colors.on-brand-dark}"
    rounded: "{rounded.control}"
  signal-action-dark:
    backgroundColor: "{colors.signal-dark}"
    textColor: "{colors.on-signal-dark}"
    typography: "{typography.ui}"
    rounded: "{rounded.control}"
  signal-readout-dark:
    textColor: "{colors.signal-dark}"
    typography: "{typography.eyebrow}"
  stop-panel-dark:
    backgroundColor: "{colors.stop-panel-dark}"
    textColor: "{colors.on-stop-panel-dark}"
    typography: "{typography.ui}"
    rounded: "{rounded.card}"
  stop-stripe-dark:
    backgroundColor: "{colors.stop-dark}"
  section-heading-dark:
    textColor: "{colors.text-dark}"
    typography: "{typography.section}"
  eyebrow-dark:
    textColor: "{colors.text-muted-dark}"
    typography: "{typography.eyebrow}"
  plate-dark:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.text-dark}"
    rounded: "{rounded.plate}"
  segmented-control-dark:
    backgroundColor: "{colors.surface-muted-dark}"
    textColor: "{colors.text-dark}"
    rounded: "{rounded.pill}"
  science-label-dark:
    backgroundColor: "{colors.science-soft-dark}"
    textColor: "{colors.science-dark}"
    typography: "{typography.label}"
    rounded: "{rounded.small}"
  practice-label-dark:
    backgroundColor: "{colors.practice-soft-dark}"
    textColor: "{colors.practice-dark}"
    typography: "{typography.label}"
    rounded: "{rounded.small}"
  integrity-caution-dark:
    backgroundColor: "{colors.caution-soft-dark}"
    textColor: "{colors.caution-dark}"
    rounded: "{rounded.card}"
  integrity-caution-outline-dark:
    backgroundColor: "{colors.caution-border-dark}"
  progress-bar-dark:
    backgroundColor: "{colors.ink-dark}"
  error-note-dark:
    backgroundColor: "{colors.danger-soft-dark}"
    textColor: "{colors.danger-dark}"
    rounded: "{rounded.small}"
  card-dark:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.text-dark}"
    rounded: "{rounded.card}"
  page-dark:
    backgroundColor: "{colors.canvas-dark}"
    textColor: "{colors.text-dark}"
    typography: "{typography.reading}"
  reading-sheet-dark:
    backgroundColor: "{colors.sheet-dark}"
    textColor: "{colors.text-dark}"
    typography: "{typography.reading}"
  media-panel-dark:
    backgroundColor: "{colors.media-dark}"
    textColor: "{colors.on-media-dark}"
  muted-panel-dark:
    backgroundColor: "{colors.surface-muted-dark}"
    textColor: "{colors.text-muted-dark}"
  divider-dark:
    backgroundColor: "{colors.border-dark}"
  control-outline-dark:
    backgroundColor: "{colors.control-dark}"
  tenant-header-dark:
    backgroundColor: "{colors.band-dark}"
    textColor: "{colors.on-band-dark}"
  tenant-hero-chip-dark:
    backgroundColor: "{colors.band-tint-dark}"
    textColor: "{colors.on-band-dark}"
    typography: "{typography.label}"
    rounded: "{rounded.small}"
  tenant-band-divider-dark:
    backgroundColor: "{colors.band-edge-dark}"
  code-dark:
    textColor: "{colors.text-muted-dark}"
    typography: "{typography.code}"
  heading-dark:
    textColor: "{colors.text-dark}"
    typography: "{typography.heading}"
  lesson-title-dark:
    textColor: "{colors.text-dark}"
    typography: "{typography.heading-lesson}"
  subhead-dark:
    textColor: "{colors.text-dark}"
    typography: "{typography.subhead}"
  signal-action-hover:
    backgroundColor: "{colors.signal-hover}"
    textColor: "{colors.on-signal}"
  stop-panel-note:
    backgroundColor: "{colors.stop-panel}"
    textColor: "{colors.stop-panel-muted}"
    typography: "{typography.label}"
  signal-action-hover-dark:
    backgroundColor: "{colors.signal-hover-dark}"
    textColor: "{colors.on-signal-dark}"
  stop-panel-note-dark:
    backgroundColor: "{colors.stop-panel-dark}"
    textColor: "{colors.stop-panel-muted-dark}"
    typography: "{typography.label}"
---

# DESIGN.md — Spindle

This is the design contract. `apps/web/src/app/globals.css` carries the same token values as Tailwind v4 `@theme` variables; change both together. The selected proposal, its provenance and the research behind it are in [docs/design/spindle/](docs/design/spindle/README.md). Where they differ, this file wins.

## Overview

Spindle teaches personal trainers how the body works, and every science claim is cited. The interface makes three things easy to find: the assigned lesson, how each statement is supported, and the sources behind it. The direction is **Lab** (owner decision, 2026-10-11, after the three-direction exploration in `~/Inbox/html/spindle-redesign-gallery/directions/`, which is private and not in this repo): a performance lab. It ships as two first-class themes, **Lab Light** (soft grey and white, graphite ink) and **Lab Dark** (midnight and graphite, light ink). One signal colour, **magenta**, marks where you are and the moments that matter; everything else is measured: ticks, mono readouts, numeric progress. Reading stays calm: IBM Plex Sans at 18px with a 66-character measure. It replaces Pressroom and Atlas; the landed contracts below are unchanged except where a section says so.

## Themes

- **Both themes are the product.** The reader's system setting (`prefers-color-scheme`) decides until they press the theme toggle ("Switch light or dark theme", in every header and the /design nav). The choice is kept in `localStorage` (`spindle-theme`) and set as `data-theme` on `<html>` by an inline script in `<head>` before first paint (`components/theme/`), so a page never shows the wrong theme, server-rendered or not. `?theme=light` or `?theme=dark` on any URL sets and keeps the theme (the /design Screens links use it).
- **One token set.** Every colour token is `light-dark(light, dark)` in `@theme`; `color-scheme` on `<html>` picks the half (`light dark` by default, pinned by `data-theme`). A container may pin `color-scheme` itself: the /design kit shows each component in both themes side by side this way.
- **Theme-only files.** A raster or SVG file that cannot take a token (a gym's wordmark files) ships in two versions with `.theme-light-only` and `.theme-dark-only`, which follow the toggle, else the system setting. Spindle's own wordmark draws inline in `currentColor`.
- **Follow-up (not built):** a "System" choice in account settings that clears the stored theme, and a paper reading mode for long lessons.

## Colors

Each token has a light and a dark value (the front matter lists the dark value as `<name>-dark`).

- **Surfaces.** Light: canvas `#F4F5F7`, surface and reading sheet `#FFFFFF`, muted panel `#EBEDF1`. Dark: canvas (midnight) `#0B0D12`, surface `#181C25`, reading sheet `#161A22`, muted panel `#20242F`. **Ink** (`ink`, also `primary`) is graphite `#12151C` in light and `#F2F4F8` in dark; it carries text and the primary action, so the primary action inverts with the theme (`on-ink` is white in light, midnight in dark). One primary action per screen.
- **Signal magenta** `#C8195F` (light, deepened to pass AA as text: 4.76:1 on the muted panel) and `#FF3B8E` (dark, 4.63:1 on the muted panel). It marks the current place (lesson segment, chapter number, current outline item), key readouts and the seal. It never marks evidence, correctness or reward, and a gym brand never recolours it. As the default `brand` accent it also marks links, the current lesson, selected controls and the focus ring; a gym's accent pair replaces it in those jobs only. Text on a signal fill is white in light and midnight in dark (`on-signal`).
- **Support types** use colour plus words plus shape, never colour alone: `science` green `#0B6B50` / mint `#3DDC97`; `practice` brown `#8A4B10` / amber `#FFB547`.
- **Caution** (`#6B5300` / `#E9D55B`) marks a retracted source: the content stays readable and credit stays. **Danger** (`#B42318` / `#FF6B5F`) is for failures only.
- **Stop and refer** is the loudest element in each theme, by inversion rather than hue: an ink panel in light (`stop-panel` `#12151C`, text `#F2F4F8`), the only light panel in dark (`#F2F4F8`, text `#0B0D12`), each with a red **stop** stripe (`#FF6B5F` on ink, 6.5:1; `#D92D20` on the light panel, 4.4:1). Red is otherwise reserved for danger. It never animates.
- **Media panels** (the video facade) stay midnight `#0B0D12` with `#F2F4F8` text in both themes.
- Checked contrast (WCAG 2.2, both themes; the /design Colour part prints them live): `text` on canvas 16.7:1 light, 17.6:1 dark; `text-muted` on the muted panel 6.7:1 light, 7.9:1 dark (AAA in both); reading text on the dark sheet 14.3:1; `on-ink` on ink 18.2:1 / 17.6:1; science on its soft panel 5.7:1 / 8.4:1; practice 6.1:1 / 8.5:1; danger 5.7:1 / 5.1:1; `control` boundaries at least 3.2:1 on every surface; the default focus ring (signal) at least 4.6:1 on every surface. Pale `border` (1.3:1) is for structure only, never a control's only edge.
- **Tenant tokens (P4-A2).** A gym's brand maps onto `brand`, `brand-hover`, `brand-soft`, `on-brand` (P4-A core) and `band` (the tenant band). `band` defaults to the theme's canvas, so an unbranded header matches the page. Three tokens derive from it, and the tenant never sets them directly:
  - `on-band` is light ink `#F2F4F8` or graphite `#12151C`, whichever has more contrast on the band (light on a tie). A band whose best `on-band` is under 4.5:1 is refused (`#707070`: light ink 4.497:1, graphite 3.69:1).
  - `band-tint` is `on-band` mixed 12% into the band.
  - `band-edge` is `on-band` mixed 20% into the band.

  A gym's band is one colour in both themes. The defaults in `@theme` follow this derivation in each theme (`lib/theme/atlas-sync.test.ts`). The accent is never drawn on the band.
- **Checked tenant contrast (P4-A2, both themes).** One accent cannot be link text on both white and graphite, so a gym sets an accent pair per theme: `accent`/`onAccent` for light and `accentDark`/`onAccentDark` for dark. `brandChecks` in the engine and `private.brand_checks` in SQL run every pair in **both themes** against that theme's surfaces, decide on the unrounded ratio, and refuse a brand that fails any row in either theme; `org_brand.test.sql` carries the engine's exact rows for the shared fixtures (`lib/brand-sync.test.ts`). Each theme also checks that the accent stays at least **0.10 apart (Euclidean distance in OKLab)** from that theme's signal, science and practice colours, so a gym colour never reads as Spindle's place colour or an evidence colour. Migration `20261012090000_lab_palette.sql` holds the SQL side. A stored brand is re-checked by the app on every render (`validateOrgBrand`); one without a dark pair, or one that no longer passes, renders the standard Spindle look until its owner saves a passing brand. Nothing is adjusted.

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
  | Accent distance | accent / signal, science, practice | 0.10 OKLab | per theme |

  Every row applies in both themes. Exempt, because they are decorative: pattern covers, `band-edge`, `border` hairlines and the cover edge. The catalog render test fails on any computed colour that is neither in `brandTokens` nor in the fixed palette (`e2e/helpers/catalog.ts`).

## Typography

Three faces, all SIL OFL 1.1, self-hosted by `next/font/google` (licences in `docs/design/spindle/assets/`: `archivo-OFL.txt`, `ibm-plex-sans-OFL.txt`, `ibm-plex-mono-OFL.txt`):

- **Archivo** carries display steps and headings at its widest (`font-stretch: 125%` through its width axis), weight 800; `subhead` uses width 112%. The wide face makes long words long, so headings break words (`overflow-wrap: break-word`, `hyphens: auto`) rather than scroll sideways at 320px. It is never used for paragraphs.
- **IBM Plex Sans** carries the interface and long reading text (`text-reading`): 18px with 1.65 line height, at most **66ch** (`--measure-reading`). A reading column may be wider for figures; its prose (`p`, `li`, `blockquote`, `dd` inside `.text-reading`) keeps the measure.
- **IBM Plex Mono** carries numerals, eyebrows, readouts, identifiers and versions (`v2`, `03 / 08`, DOIs), with tabular figures.

The scale (phone, then from 768px):

| Step | Phone | Desktop | Weight | Use |
|---|---|---|---|---|
| `display` | 36px | 76px | 800, widest | Landing hero |
| `title` | 32px | 56px | 800, widest | Page titles |
| `heading-lesson` | 28px | 48px | 800, widest | Lesson titles |
| `heading` | 28px | 40px | 800, widest | Page and section openers |
| `section` | 21px | 28px | 800, widest | Chapter headings in lessons, catalog sections |
| `subhead` | 17px | 19px | 700, width 112 | Card titles, panel titles, quiz prompts |
| `reading` | 18px / 1.65 | 18px / 1.65 | 400, Plex Sans | Lesson prose, 66ch |
| `ui` | 16px | 16px | 500, Plex Sans | Controls, rows |
| `label` | 14px | 14px | 500, Plex Sans | Meta, captions, chips |
| `eyebrow` | 12px | 12px | 500, Plex Mono, caps, +0.12em | Section numbers, readouts |
| `code` | 13px | 13px | 400, Plex Mono | Versions, DOIs, numbers |

Source details that a learner must read stay at 16px. **A gym's brand font (P4-A2) applies only to display text of 20px or more:** the header name, the hero headline and the titles of the gym's own (method) course cards. Base and Modality cards are Spindle's and keep Archivo. The tagline, coach note, coach name, labels, captions and lesson text stay in Spindle's faces. Geist stays bundled only as a tenant font option. Sentence case everywhere, including callout labels.

## Layout

- App frame up to 1440px; content columns up to 768px for lists and overviews, centred in the frame on wide screens (`LearnShell`, asserted at 1024, 1280 and 1440px in `e2e/player.spec.ts` by measuring the column itself, with displaced-layout negatives).
- The player's outline and reading column are centred together as one 1008px frame (240px outline, 32px gap, 736px reading track).
- **Spacing** is an 8-point scale with named steps (`--spacing-*`, so `gap-block`, `mt-section` and so on). Related things sit at 16px or less; unrelated things at 48px or more.

  | Step | Phone | Desktop | Use |
  |---|---|---|---|
  | `hair` | 4 | 4 | Icon to word |
  | `tight` | 8 | 8 | Eyebrow to heading, chip to chip |
  | `attach` | 12 | 12 | A block to its sources tray, a label to its field |
  | `stack` | 16 | 16 | A heading to its own content; paragraph to paragraph; phone gutter |
  | `block` | 24 | 28 | Block to block in a section; card padding |
  | `group` | 32 | 32 | Groups inside a card; a tray to the next block |
  | `safety` | 40 | 40 | Air around a stop-and-refer panel |
  | `section` | 56 | 80 | Section to section |
  | `page` | 64 | 112 | Landing bands |
  | `hero` | 96 | 128 | Hero top padding |
- The signed-out home page (`components/landing/`) is a brand surface: 1200px frame, the display step, one ink primary action (Sign in) in the hero, and an ink band at the end, which inverts with the theme. It renders from a `Brand` object (`lib/brand.ts`): the brand name fills the brand-dependent copy, and the wordmark keeps the supplied proportions, one file for light surfaces and one for dark (`ThemedWordmark`). Copy stays honest: no testimonials, counts, or science statements without a claim; layers are separate courses, and course authoring is labelled planned until it ships. Focus on the ink band uses an `on-ink` outline (17.6:1 or more in both themes).
- Player at 1024px and wider: a 240px course outline beside the reading column. Below 1024px the same outline, in the same order with the same current item, sits in a native disclosure above the lesson.
- One column below 768px, 16px gutters. No horizontal scrolling at 320px (asserted in `e2e/player.spec.ts`).
- The course list leads with a single "Resume lesson" action, taken from the newest assigned version of each course. Older versions of a course stay reachable from its row.
- Curriculum layer (Base, Modality, Gym method) labels a course. Science or practice-based labels a block. They are separate axes and never stand in for each other.
- **Support runs.** Back-to-back blocks with the same support share one label at the start of the run; a heading, an image or a legacy diagram (one without support) ends the run. A reviewed diagram carries support, so it joins or starts a run like any other supported block. From 1024px every supported block also carries a 2px rule in the left margin, `science` green or `practice` brown, so support stays visible without repeating the chip. Words and colour both remain.
- **Header frame.** The app header's inner frame is the page's content frame (`LearnShell` frame, or the form column on sign-in), so the wordmark lines up with the content. The bar is at least 64px tall, with automatic height because a tenant name may wrap, so the focus ring never touches the window edge. The tenant name wraps (at most 60 characters, `overflow-wrap: anywhere`); it never truncates and never overlaps the mark. On member pages of a branded gym (P4-A2) the header is the tenant band: the name in the brand font (20px, `on-band`) and up to two nav links (`on-band`, always underlined, thicker underline on hover). It is one row from a 480px container; below that, the name row sits above the link row, and each link is 44px tall. A 60-character unbroken name with two links never scrolls sideways at 320 or 390px. The header is not sticky.
- **Catalog hero (P4-A2).** The member catalog has a second branded surface directly under the header: the band colour, holding the headline (brand font, display step, `on-band`), the tagline (IBM Plex Sans 18px, `on-band`) and up to three modality chips (`on-band` on `band-tint`). It carries text only, never an image. Copy sits left from a 720px container and stacks below that. The one ink primary action ("Continue where you left off" or "Start your first course", 48px) sits on canvas directly below the hero, never on the band. After the hero come the Gym method courses, then a "Base curriculum" section with the base seal.
- **Lesson navigation.** Below 768px, previous is a small link above a full-width 48px "Next lesson" button that names the lesson; from 768px they share a row.
- **Completion card.** Once a lesson is done the card says it once ("Lesson complete · v2 · 11 Oct 2026", or "Credited · v3 · from your completion on … in v1") and holds the one ink action: the next lesson, or back to the course.
- **Course overview.** "Resume lesson" comes before the version notice. The notice is a compact list (Pencil, Plus, Minus beside the words Changed, Added, Removed) with one muted line of explanation.

## Elevation & Depth

Surfaces layer by tone, not by shadow: canvas, surface, muted panel (and in dark a 1px top light edge on raised layers). No glow, glass or gradient behind lesson text. Two shadow tokens with fixed jobs, each a light-dark pair:

| Token | Value | Use |
|---|---|---|
| `--shadow-raise` | `inset 0 1px 0 light-dark(rgb(255 255 255 / 0), rgb(255 255 255 / 0.05)), 0 8px 24px -16px light-dark(rgb(18 21 28 / 0.22), rgb(0 0 0 / 0.8))` | The header once the page scrolls under it; a focal continue card |
| `--shadow-float` | `inset 0 1px 0 light-dark(rgb(255 255 255 / 0), rgb(255 255 255 / 0.06)), 0 -12px 32px -12px light-dark(rgb(18 21 28 / 0.18), rgb(0 0 0 / 0.85))` | The bottom lesson dock and sheets |

**Bordered cards are for things you interact with** (course rows, claim disclosures, quizzes, completion, the outline disclosure). Explanations and lists that are only read (the support legend, the version notice, diagram panels, completed-course notes) are `surface-muted` panels; resources and objectives are open sections between rules.

## Shapes

Lab is tight and instrument-like: chips, badges and segments 4px, controls 6px, cards and blocks 8px, sheets, plates and the dock 10px, pills only for segmented controls. Every touch target is at least 44×44px; primary actions are 48px tall. Pressable controls (`.pressable`) scale to 0.97 for 120ms when pressed; none under reduced motion.

**The measurement layer.** Ticks (`.measure-ticks`: a hairline every 8px, a taller one every 40px), mono readouts (`03 / 08`, `63%`), and segment tracks where done segments are ink (`.measure-done`), the current one is the signal (`.measure-current`) and the rest are `control` hairlines (`.measure-rest`). Decorative marks carry no meaning alone: the numbers beside them do. It works in both themes from the same tokens.

## Components

Native elements first; no component library is installed. Lucide (ISC) is the only icon family, 1.75px stroke, always next to a word: FileText for science, Clipboard for practice, Check for completion, TriangleAlert for caution and errors. shadcn/Radix stay the choice for composite widgets (dialog, sheet, select) when a later phase needs them.

| Component | File | States |
|---|---|---|
| Button, Field, ErrorNote, Eyebrow, AppHeader, Page, ThemedWordmark | `components/ui/` (`index.ts` re-exports) | Button: primary (ink, inverts with the theme), secondary, ghost; hover, press (scale 0.97), focus, disabled, loading (`aria-busy`; the label keeps its box, transparent, under the spinner, so the width never changes). Field: hint, error (`aria-invalid`, described by the hint and error, value kept). Eyebrow: Plex Mono caps with tabular figures. AppHeader: wordmark, gym context, theme toggle |
| ThemeToggle, ThemeScript | `components/theme/` | toggle: "Switch light or dark theme", shows the theme you will get; works before hydration. Script: `?theme=`, else the stored choice, else the system setting, before first paint |
| SpindleWordmark, SpindleSymbol | `components/brand-mark/wordmark.tsx` | inline SVG in `currentColor` (paths generated by `build-wordmark.py`) |
| SupportLabel, SupportLegend | `components/learn/labels.tsx` | science, practice-based; the legend explains, once per lesson, only the types that lesson uses |
| LayerLabel, VersionTag, LessonStateLabel | `components/learn/labels.tsx` | Base/Modality/Gym method; done, credited, updated, new, to do |
| Evidence states (science blocks) | `components/learn/blocks.tsx`, `lib/learning/evidence.ts` | From `version_integrity`: current (Science label); recheck due (Science label plus "Evidence due for recheck"); withdrawn or unreported (no Science label: "Claim withdrawn" with a one-line explanation, text and sources kept as history); retracted ("Source retracted", as before). If the report cannot be read, the lesson says so once and shows labels as published |
| ClaimDisclosure | `components/learn/claim-disclosure.tsx` | closed, open; claim record missing; source retracted. Shows only what the claim record holds (statement, evidence level, population, sources); review receipts are not readable by learners, so none are implied |
| VersionNotice | `components/learn/version-notice.tsx` | changed, added, removed lessons; nothing changed |
| CompletionView | `components/learn/complete-lesson.tsx` | idle, pending (button disabled, "Saving…"), saved for vN (after server confirmation only), failed with retry, done or credited on load (static) |
| QuizSelfCheck | `components/learn/quiz-self-check.tsx` | unanswered, selected, feedback after "Check answer". Says it is not saved or graded; graded quizzes are phase 3 |
| MediaImage, MediaVideo | `components/learn/media-image.tsx` | loaded; not available (missing, refused or failed object), never a broken image or player. Stored video plays through a signed Storage URL that lives at most 60 s |
| ModuleStatusCard, ModuleQuiz (QuizView) | `components/learn/module-status.tsx`, `module-quiz.tsx` | status: unavailable (never zero), not complete with the quiz not taken or not passed (best attempt and the number needed), complete (check), carried credit. Quiz: not submitted, pending ("Submitting…"), failed (nothing saved), scored (server's numbers and "passed" only; per-question feedback after submit, withheld if the app's explanation disagrees). The answer key is never sent before submitting. No celebration effects |
| YouTubeSegment, YouTubePlayer | `components/learn/youtube-segment.tsx`, `youtube-player.tsx` | From the lesson's frozen `video` block plus `version_media`. off (the registry did not report the clip, or switched it off: a muted note, nothing from YouTube offered), idle (our own midnight facade, the same in both themes: the clip title, channel and range, a light Play button, and the YouTube notice linking Google's privacy policy and YouTube's terms; no thumbnail or YouTube request), loading, ready (privacy-enhanced player with official controls, at least 200×200px, origin-only referrer), unavailable (provider says unavailable, a player error, a failed script or a 15 s ready timeout, with a Watch on YouTube link), blocked (play rechecked the registry and the clip is no longer allowed: nothing loads). The play notice links Spindle's own `/privacy` page as well as Google's and YouTube's. Rationale below the player in 16px muted text. A clip the registry reports as model-described (D-11) says so beside the label: "Clip described by a model; human check pending". Always practice-based and optional. The CSP (`lib/csp.ts`) frames only `youtube-nocookie.com` |
| CourseRow, LessonOutline | `components/learn/` | progress as literal text plus a decorative bar; current lesson; earlier versions |
| IntegrityAlert, VersionUnavailable | `components/learn/` | caution; failure |
| BrandHeader (P4-A2) | `components/brand/brand-header.tsx` | no brand: not rendered; the parent keeps the standard Spindle header (parent-owned, wired with the member routes). Branded (name on `band`), name pending admission (fixed fallback "Your gym"), link hover, link focus (`on-band` ring); 1 row from 480px, 2 rows below |
| CatalogHero (P4-A2) | `components/brand/catalog-hero.tsx` | no brand: not rendered (parent-owned, as for the header). Admitted (headline, tagline, chips), headline pending (the brand name, or "Your gym" while the name is pending, stands in), tagline pending (omitted); chip focus is never a stop (chips are not links) |
| CourseCard (P4-A2) | `components/brand/course-card.tsx` | default, hover (`control` edge), focus (accent ring checked on canvas, outside the card edge); title admitted, title pending (the fixed fallback "Untitled course"), summary pending (omitted). Footer: the fixed `LayerLabel`. Base cards add the seal; Modality cards add "Published by Spindle" and no seal. One link per card. 1 column under 640px, 2 at 640 to 1023px, 3 from 1024px |
| CourseCover (P4-A2) | `components/brand/course-cover.tsx` | pattern `solid`, `diagonal`, `grid`, `dots`, `rings` or `waves` in two validated literal colours (background, and a foreground drawn faintly over it), drawn by Spindle as a 16:9 SVG. Decorative (`alt=""`). Base and Modality cards always use Spindle's neutral cover (ink dots on `surface-muted`). No tenant image |
| CoachNote (P4-A2) | `components/brand/coach-note.tsx` | admitted (shown above the lesson list of a Gym method course); pending or edited since admission (omitted). `surface` with a `border` and a `practice` left rule. The name row is the frozen coach name (IBM Plex Sans 16px semibold) with the fixed Practice-based chip. Label "Note from {name}": the admitted coach name, else the admitted brand name, else "Your gym". Fixed caption: "Coach's note. Based on coaching practice, not a research claim." |
| BaseSeal (P4-A2) | `components/brand/base-seal.tsx` | one state: the Spindle symbol (16px signal tile, `spindle-symbol-small.svg`) and the fixed line "Base curriculum by Spindle, cited" (14px, `text-muted`) on a hairline strip. Only where cited base curriculum appears (the catalog's Base section, base cards, base lesson footers); never on the band, method or modality content. No check-shield and no "evidence" wording; no review claim until a recorded PT review exists (D-08) |
| ModalityChip (P4-A2) | `components/brand/modality-chip.tsx` | default only (not interactive). On the hero, `on-band` on `band-tint`; on cards, `text` on `surface-muted`. The youth tag reads "Youth coaching education" |

`/design` in development is the **living kit**, organised like this: a masthead, a sticky section nav (one row that scrolls sideways on phones, with the theme toggle) and eleven numbered parts, Lab · 01 to 11: Direction, Logo, Colour, Type, Tokens, Components (numbered cards with every state), Screens, Motion, Brand in use, Progress and Checks. Each component renders twice, in Lab Light and Lab Dark side by side (a pane pins `color-scheme`), whatever the page theme. Screens links the key routes in both themes with `?theme=`: landing, coaches, sign-in, the synthetic member catalog (`/brand-preview`), and the lesson player, module quiz and module-complete screens under `/design/screens/*` (synthetic data). The P4-A2 member components are wired to member routes (#45) and also render on the test-only `/brand-preview` page for two synthetic brands, a pending scene (fallbacks) and a 60-character name. In production `/design` and `/design/screens/*` answer 404 (asserted in `e2e/player.spec.ts`). `/brand-preview` answers 404 unless the server runs with `SPINDLE_PREVIEW_PAGES=1`: the proxy gate and the page's own request-time guard are covered by unit tests (`src/proxy.test.ts`, `src/lib/preview-pages.test.ts`), not yet by a production browser test.

## Do's and Don'ts

Do show what changed between assigned versions. Do say "unavailable" rather than show nothing or zero. Do keep sources reachable by keyboard and touch. Do keep the message when an animation does not run.

Do not use streaks, leaderboards or confetti. Do not animate lesson text, hijack scrolling or loop anything inside a lesson. Do not show "saved" before the server confirms it. Do not add a motion library for an effect CSS or SVG can do. Do not commit third-party screenshots, logos or component source.

## Brand

**Tenant brand (phase 4, P4-A core).** A gym brand changes only what this section lists (P4-A core below, P4-A2 after it). The brand is plain data (`TenantBrand` in `@spindle/schema`): a plain-text name, a text mark or a PNG/WebP logo given only as a file name in the gym's own brand folder (with intrinsic size, at most 512 KB and an aspect ratio between 1:8 and 8:1; no SVG, no URL, no path), an accent pair per theme as literal hex colours (`accent` and `onAccent` for Lab Light, `accentDark` and `onAccentDark` for Lab Dark; one colour cannot be link text on both white and graphite) and one bundled font (Geist, Barlow Condensed or Fraunces, all SIL OFL, self-hosted by next/font). The schema is strict: semantic colours, review status, practice labels, attribution and CSS are refused, not ignored. `validateBrand` (`@spindle/engine`) derives, per theme, the hover (the accent mixed 15% away from the surface: toward black in light, toward white in dark) and the tint (the accent at 10% over the surface) and checks every pair a brand colour is drawn in, in both themes, on that theme's fixed backgrounds (canvas, surface, muted panel) and in every state: links and hovered links on surface, canvas and muted panels; the current-lesson marker and the text on it; selected controls and their hover; the focus ring on canvas, surface, muted panels, the current lesson and error panels; error text; the text mark; and the accent's OKLab distance from the theme's signal, science and practice colours (at least 0.10). Text needs 4.5:1 and rings and large marks 3:1, decided on the exact ratio (shown rounded down). A brand that fails any pair is refused, never adjusted. `brandToCssVars` accepts only a brand returned by `validateBrand` and emits `--color-brand`, `--color-brand-hover`, `--color-brand-soft`, `--color-on-brand` and `--focus-ring` as `light-dark(light, dark)` pairs for the element that scopes the brand, so the learner components theme through their ordinary utilities (`text-brand`, `bg-brand-soft`, the global focus rule). Science, practice, caution and danger colours never change, and the line "Base curriculum by Spindle, cited" stays fixed. `PALETTE.light` and `PALETTE.dark` in the engine must equal the two halves of the `@theme` values (asserted in `lib/theme/atlas-sync.test.ts`). The test-only `/brand-preview` page shows two made-up brands on the real shell, outline, lesson, quiz card, selected control and error; the proxy answers 404 for it unless the server runs with `SPINDLE_PREVIEW_PAGES=1` (only the Playwright server does). The owner's brand editor and per-org rendering come in P4-A2. Tenant images and anonymous brand delivery are deferred (below).

**Brand presence (P4-A2).** On member pages a gym brand has these jobs, and no others:
- the header mark: the gym name as a text mark on the tenant band;
- links;
- the current-lesson marker;
- selected controls (from P4-A core);
- the focus ring;
- the catalog hero band;
- pattern course covers;
- display text in the brand font (20px and up).

The tokens are those above plus `band` (with the derived `on-band`, `band-tint` and `band-edge`). Primary actions stay ink, reading copy stays in Spindle's faces, and the accent marks links, the current lesson, selected controls and focus only.

A brand that fails a check is refused, never adjusted. "Base curriculum by Spindle, cited" stays fixed.

These things stay Spindle's and never sit in a tenant slot:
- the colours `science`, `practice`, `caution` and `danger`, with their soft and border variants;
- the labels Science, Practice-based and Stop and refer;
- review chips, source drawers, citations, and retracted or withdrawn states;
- quiz feedback, errors and layer labels;
- the base seal;
- Spindle's faces (Archivo, IBM Plex Sans, IBM Plex Mono), the canvas, surface, text and border tokens in both themes, the signal colour, the theme toggle and the ink action.

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

**The Cut motif.** The cut rises **1 in 2 (26.57° from horizontal)** through the d ascender and the i dot. That is the angle of the shipped Cut wordmark and of Devin's concept 03 original (measured 25.6° on the earlier trace and 26.5° on the concept 03 PNG, `docs/design/spindle/` and the private design bundle; the earlier "12 degrees from vertical" here was wrong and is corrected). It recurs as the slash that leads section headings (`.cut-tick`, a band rising 1 in 2), the chamfered top-left corner of the current-lesson marker (`.cut-marker`, 1rem across and 0.5rem down), the edge of the logo reveal, and the sheets of the layer-stack drawing. Never on lesson text.

**Illustrations.** Original line art drawn as inline SVG from simple geometry, never traced: 1.75px strokes at any size (`vector-effect: non-scaling-stroke`), round caps and joins, ink lines, `control` grey for context structures, dashed lines for structures behind others, and one `brand-soft` fill on the structure under discussion. Every drawing has a `<title>`, a `<desc>` and a text legend, and says "Schematic, not to scale". Any text a reader must read (marker numbers, notes) is HTML at the 14px label size over or beside the drawing, never SVG text that shrinks with it; SVG text is kept for large labels that stay at least 16px at 320px. Laterality follows the subject: the shoulder complex is the subject's left shoulder seen from the front. Diagrams are placed by id (`components/learn/diagrams.tsx`); unknown ids show the "not available yet" state. Provenance is in `docs/design/spindle/asset-provenance.json`.


The wordmark is the lowercase Cut mark (Devin's concept 03) redrawn in the Lab face: Archivo at weight 900 and its widest width (125), a cut through the **d** ascender, a **solid l**, and a square **i** dot (as wide as the stem, ending where Archivo's own dot ends) with a parallel cut through it. Never move the cut to the l, stretch, outline or decorate the mark.

- Files: `apps/web/public/brand/spindle-wordmark.svg` (currentColor), `-graphite` (light surfaces), `-light` (dark surfaces), and the inline `SpindleWordmark` component (paths in `components/brand-mark/wordmark-path.ts`). Built by `docs/design/spindle/build-wordmark.py` from Archivo's outlines (shaped with HarfBuzz; cuts are boolean differences): clean vector geometry, no tracing and no generated image. Aspect ratio 4.37:1. Rebuild steps are in `docs/design/spindle/README.md`.
- Minimum height 24px; the app header uses 27px (118px wide). Clear space at least a quarter of the mark's height on every side.
- Symbol and favicon: the cut d in midnight on a signal-magenta tile (`spindle-symbol.svg`; `spindle-symbol-small.svg` doubles the cut so it stays open at 16 and 32px and is `src/app/icon.svg` and `favicon.ico` 16/32/48; `spindle-symbol-square.svg` is the full-bleed tile behind `apple-icon.png` 180 and the manifest icons 192 and 512; `spindle-symbol-graphite.svg` is the light d on a graphite tile). Checked at 16, 32 and 180px on light and dark browser chrome. The Pressroom cut-disc symbol is retired.
- Archivo is SIL OFL 1.1; the wordmark is a logo drawn from its outlines, not a font. Provenance is recorded in `asset-provenance.json`, but provenance is not trademark clearance.

## Motion

| Token | Value | Use |
|---|---|---|
| `--duration-press` | 120ms | press feedback (scale 0.97) |
| `--duration-feedback` | 160ms | hover, colour, appear |
| `--duration-disclosure` | 200ms | chevron of a native disclosure, sources tray (content opens without sliding) |
| `--duration-route` | 260ms | route entry: the new page rises 12px and fades in |
| `--duration-drawer` | 300ms | sheets and the dock (200ms on exit) |
| `--duration-confirm` | 320ms | completion check stroke and a progress segment filling, once, after server success |
| `--duration-reveal` | 480ms | a scan line or ring drawing, or a support rule when its block first enters the view; lesson text never moves |
| `--duration-step` | 640ms | one step of a stepped anatomy sequence |
| `--duration-logo` | 720ms | the wordmark reveal on brand surfaces |
| `--duration-celebrate` | 1000ms | the most a module-complete sequence may take, plays once |
| `--ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` | entries, reveals, feedback (never ease-in on UI) |
| `--ease-in-out` | `cubic-bezier(0.77, 0, 0.175, 1)` | on-screen moves: progress fills, anatomy steps |
| `--ease-drawer` | `cubic-bezier(0.32, 0.72, 0, 1)` | sheets and the dock |

Values come from the motion-craft standards (UI motion under 300ms; explanatory and rare moments may run longer). `--ease-interface` and `--ease-exit` remain as aliases of `--ease-out` while components move over. Lab motion is kinetic but purposeful: it confirms and orients (segments fill, the place marker moves, a scan line passes once) and never loops. Safety panels never animate. The logo reveal (`--duration-logo`, an edge rising along the cut) is for brand surfaces only and never delays the app. Reduced motion sets every duration to 0 and removes animation; every state stays visible as text. Focus appears immediately. Measured in the rendered app: 320ms check with motion, 0s and fully drawn with reduced motion.

The completion check is a custom inline SVG stroke (a few hundred bytes of markup, token colours, no dependency). The LottieFiles candidate "Success check" (Lan Jean, after "Checkmark green" by Andrew Vilchez, Lottie Simple License, 1.1–6 KB) was rejected without download: it needs a Lottie player runtime for an effect CSS already does, and adds a derivative licence chain to track.

## Accessibility

WCAG 2.2 AA in both themes, and AAA for body and muted text where the palette allows (it does in both). Keyboard reachable with a 3px focus ring offset 4px, the signal by default (at least 4.6:1 on every surface in both themes). On a tenant's header band and catalog hero the ring is `on-band` (still 3px, offset 4px, from the same global rule); everywhere else in a branded gym it is the gym's accent for the theme in effect (P4-A2). On ink surfaces the ring is `on-ink`, which inverts with the theme: the surface sets `--focus-ring` (the global rule is unlayered CSS, so a Tailwind outline utility cannot recolour it). The rule also removes outline colour from transitions, so the ring appears at once rather than fading in with `transition-colors` (asserted in `globals.test.ts` and `e2e/player-landing.spec.ts`). The theme toggle has a name and works before hydration; the theme is in place before first paint. One live region stays mounted and announces saving, saved and failed; focus moves to the confirmation after a save. Icon-only controls have names. Lesson diagrams are SVG with `<title>` and `<desc>`; until a diagram asset exists, the block says it is not available. `e2e/theme.spec.ts` runs axe (WCAG 2.2 AA) and computed-contrast checks in both themes at 320, 390 and 1440px.
