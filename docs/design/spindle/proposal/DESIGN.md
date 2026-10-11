---
version: alpha
name: Spindle Atlas
description: Working design for evidence-cited trainer education. Preferred wordmark selected; remaining design choices open.
colors:
  primary: "#17232B"
  on-primary: "#FFFFFF"
  canvas: "#F6F8FB"
  surface: "#FFFFFF"
  muted-surface: "#EDF1F5"
  text: "#17232B"
  muted: "#52616D"
  border: "#D8E0E7"
  control-border: "#758491"
  accent: "#2453D4"
  accent-hover: "#1B40A6"
  on-accent: "#FFFFFF"
  accent-soft: "#EAF0FF"
  science: "#0B6B50"
  science-soft: "#EAF5F0"
  practice: "#8A4B10"
  practice-soft: "#FFF3E6"
  danger: "#B42318"
  danger-soft: "#FFF0EE"
typography:
  display:
    fontFamily: Geist
    fontSize: 4rem
    fontWeight: 500
    lineHeight: 1.05
    letterSpacing: -0.045em
  heading:
    fontFamily: Geist
    fontSize: 2rem
    fontWeight: 500
    lineHeight: 1.15
    letterSpacing: -0.03em
  body:
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
  pill: 999px
spacing:
  unit: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  section: 64px
components:
  section-surface:
    backgroundColor: "{colors.muted-surface}"
  divider:
    backgroundColor: "{colors.border}"
  control-outline:
    backgroundColor: "{colors.control-border}"
  action-link-hover:
    textColor: "{colors.accent-hover}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.ui}"
    rounded: "{rounded.control}"
    height: 48px
    padding: "{spacing.md}"
  button-primary-hover:
    backgroundColor: "#2C3C47"
    textColor: "{colors.on-primary}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    height: 48px
  action-link:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.accent}"
    typography: "{typography.ui}"
  current-lesson:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
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
  error-note:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
    rounded: "{rounded.small}"
  lesson:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    padding: "{spacing.xl}"
  meta:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.muted}"
    typography: "{typography.code}"
---

## Overview

Spindle teaches personal trainers how the body works. This proposal makes the assigned lesson, its support type and its sources easy to find. It follows the current Spindle plan and schema, not the earlier trainer-academy visual identity.

Status: working design packet with remaining research, motion and component selection. Devin prefers the corrected Cut wordmark and has asked Claude Code to finish routine design choices. The accompanying specimen uses illustrative data and never records learning progress. Finish and verify the system before app integration under the repo's ownership rules.

Reference lock: Alpine Bio supplies the scientific imagery role and restrained sans typography; Attio supplies bordered flat surfaces, dark primary actions and rare interactive blue; Microsoft Learn supplies ordered lesson structure. Spindle's cobalt and semantic colors are original proposals. Alpine's decorative pale blue is not an action token here. Integrated Biosciences informs only the separate dark exploration. Do not average all three palettes.

## Colors

Cool white supports long reading. Ink carries text and primary actions. Cobalt identifies the brand mark, links, current lesson and focus; it never indicates evidence strength or quiz correctness. Green and brown label science and practice respectively, always with words. Completion uses an ink check and a version label.

Use 1px pale borders for noninteractive structure. Inputs and outline controls use the darker control-border token. Text on every actual background must meet 4.5:1; control boundaries and focus indicators must meet 3:1. Pale borders are not adequate input boundaries. Review warnings use words and dates; retracted/unavailable content receives an integrity alert.

## Typography

Geist is the display, UI and reading face. Geist Mono is restricted to identifiers and versions. Both already appear in Spindle's Next font setup. The specimen self-hosts font files and includes SIL OFL licenses. Production must retain needed language subsets. Fallback: system-ui for Geist, ui-monospace for Geist Mono.

Body: 18px/1.65, 62–68ch on desktop, left aligned. UI: 16px/1.5. Supplementary labels: 14px/1.5; essential source details use 16px. Identifiers: 13px/1.5. Display: 64px desktop, 40px mobile, with fluid scaling. Lesson h1: 32px desktop, 28px mobile. Use sentence case. Do not condense body text or use monospace for paragraphs.

## Layout

Desktop: 240px course outline, 32px gap, reading column up to 68ch, optional source panel only when space allows. App frame max 1440px. At less than 1024px move the course outline into a keyboard-accessible drawer; preserve the same order and current item. At less than 768px use one column with 20px gutters (16px at 320px). Do not hide lesson figures automatically; place each figure near the text that explains it.

Trainer home prioritizes the assigned lesson and a single Resume action. A gym lead sees assignments and member status, not a learner's decorative dashboard. Module list uses ordered rows with title, duration, format and literal progress. Base, modality and method are curriculum layers; science and practice-based are block support types. These are separate dimensions.

On phones, title, lesson position and current task precede illustration. Keep sticky navigation below 56px tall. Account for safe areas; sticky controls must not cover text or focused elements. Reflow without horizontal page scrolling at 320px and at 200% text zoom. Tables may scroll within labeled regions.

## Elevation & Depth

Use surface changes and 1px borders for structure. Cards and buttons are flat. A menu, drawer or modal may use 0 12px 36px rgba(23,35,43,.12). Do not put glow or glass effects behind lesson copy. The abstract brand sculpture belongs on the cover and promotional surfaces; it is not an anatomical teaching figure.

## Shapes

Controls 8px, content cards 12px, badges 4px. Use pills for compact optional filters only. Touch controls at least 44×44px; principal actions 48px tall. Original generated logo candidates have vector traces plus black, cobalt and white SVG variants. Do not treat a candidate as approved. Preserve original PNGs and provenance.

Round two replaces the original three logo concepts with six KIE-generated studies: Aperture, Parallax, Cut wordmark, Humanist wordmark, Link / SP and Offset. The user prefers the Cut wordmark; its diagonal cut belongs on the d ascender, never the l, which must stay solid to avoid reading as another i. Preserve the cut in the i dot. SVGs are editable traces of generated originals. A selected preview is local state, not a saved brand approval. Use a full wordmark at 120px wide or larger and inspect each symbol at 16, 24 and 32px before choosing a favicon. Keep clear space at least a quarter of symbol height. Never stretch or decorate the mark.

Alternate palettes were revised after user feedback. Observatory uses midnight ink (#121526), periwinkle (#A8B8FF) and silver-white (#F4F5FF). Fieldnotes uses white (#FFFFFF), graphite (#272334) and violet (#6139B5), with a pale lavender secondary canvas. Teal, cream and rust are retired from those alternatives. Atlas tokens are unchanged. These alternatives remain comparison studies, not promised app features.

## Components

Use shadcn/Radix for Button, Input, Select, Dialog, Sheet, Accordion, Tabs, Alert and Progress. Apply Spindle tokens. Use Lucide at 20px with a consistent 1.75px stroke. Give icon-only buttons accessible names. Library membership does not prove keyboard or contrast behavior; verify each adapted component.

Product components: CourseRow, LessonOutline, ResumeLesson, SupportLabel, EvidenceLevel, ClaimDisclosure, VersionNotice, QuizOption, CompletionReceipt, AssignmentRow and InviteStatus. Core screens: trainer home, module overview, lesson, knowledge check, lead assignments and method editor. The specimen covers representative states, not the whole product.

Evidence has four independent axes: (1) support type Science/Practice-based; (2) evidence level or source type from the approved claim, never guessed; (3) integrity/review state with date; (4) completion linked to curriculum version. A citation link alone does not justify an Approved or Verified label. Method blocks have no claim bindings. An authoring gate failure is not an invented runtime completion policy.

ClaimDisclosure contains original claim text, source title/DOI/PMID, population where relevant, evidence level, verification receipt, reviewer/approval date, expiry and retraction state. Render only metadata the record actually provides. Source loading failure must retain support and integrity state; show Retry rather than an empty green badge.

QuizOption states: unanswered, selected, submitting, correct/incorrect feedback after response, and save failed. Reveal the cited explanation after submission. Selection alone is not success. Completion states: saving, saved for version, failed with retry, previous version completed, unchanged credit carried forward, changed lessons assigned, removed review item retired. Never show saved before the server confirms it.

InviteStatus separates link created, delivery confirmed, pending acceptance, accepted, expired and failed. Never claim an email was sent merely because an invitation row exists. Access denied must not expose another gym's method title or member list.

## Do's and Don'ts

Do show one primary task per screen. Do keep sources available by touch and keyboard. Do state what changed between assigned versions. Do preserve reading position on disclosure. Do distinguish unavailable from zero. Do label every field. Do retain submitted form values after an error. Do show the gym context when switching tenants.

Do not use streaks, leaderboards or confetti as evidence of trainer competence. Do not use kinetic headlines, scroll hijacking, shaders or looping backgrounds inside lessons. Do not borrow gallery art, third-party logos or screenshots into the public repo. Do not call generated anatomical art a teaching asset until a PT checks it and a provenance record exists. Do not add cohort analytics, spaced review or interactive anatomy viewing to the pilot through design scope.

## Iconography

Lucide is the sole UI icon family. A source uses FileText; a practice block uses Clipboard; completion uses Check; integrity warning uses AlertTriangle. Icons accompany plain labels. A logo is a brand asset, not an interface icon. Keep source, progress and content-type symbols visibly different.

## Voice

Use short active sentences and familiar words. Introduce anatomical terms with a plain-language definition. Button labels name actions: Resume lesson, Show sources, Save method. Error copy states the problem and the next step: “We could not save your progress. Try again.” Use Krug's clear-task principle and ASD-STE100 as writing references; do not claim STE certification.

## Motion

Fast feedback 120ms; disclosure 180ms; drawer 240ms; ease cubic-bezier(.2,.8,.2,1). Transform/opacity for overlays. No count-up of progress, spring overshoot on reading content or entrance delay on lesson text. Focus appears immediately. No automatic moving content inside lessons. Reduced motion: remove transitions and animation; keep every state change visible and functional. Native disclosure is preferred over adding a library for one effect.

## Source ledger

Research: [Vercel workbook](https://claude-design-blueprint.vercel.app/), [Alpine Bio](https://alpbio.com), [Attio](https://attio.com), [Microsoft Learn module reference](https://refero.design/pages/14c43ec8-d00c-4461-be8b-2c25d178ffd6), [Motion Primitives](https://motion-primitives.com), [Logo System](https://logosystem.co), [Fonts In Use](https://fontsinuse.com), [Krug](https://sensible.com/dont-make-me-think/), [ASD-STE100](https://www.asd-ste100.org). Sources inform patterns; no third-party brand or art is licensed by being listed here.
