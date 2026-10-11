# DESIGN.md — Spindle

Status: placeholder. No brand has been chosen. Until it has, the UI uses neutral tokens only: the `--background` / `--foreground` pair in `apps/web/src/app/globals.css` and Tailwind's neutral scale. Do not invent a palette, typeface or logo.

When a brand is chosen, this file becomes the design contract: tokens in YAML front matter, exported to Tailwind v4 `@theme`, with prose rationale.

## Fixed now
- Accessibility: WCAG 2.2 AA. Every interactive element is keyboard reachable with a visible focus ring. Lesson diagrams are SVG with a `<title>` and `<desc>`.
- Evidence is visible: science blocks show an evidence-level badge, and practice-based blocks show a "practice-based" badge.
