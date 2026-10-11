# Spindle design record

The design contract is the root [DESIGN.md](../../../DESIGN.md). The app's tokens live in `apps/web/src/app/globals.css`. This folder keeps the inputs and the record behind them.

| Path | What | Status |
|---|---|---|
| (private) | The generated original of the selected wordmark (Cut 03, corrected: d cut, solid l, cut i dot) | Kept privately: it carries the generator's C2PA metadata and no redistribution right is recorded |
| `assets/r2-logo-03*.svg` | Potrace traces of the original (black, ink, cobalt, white) | Source for `build-brand.py`; the only form of the mark in this repository |
| `asset-provenance.json` | Generator, model, task ids and prompts for the wordmark | Provenance, not trademark clearance |
| `asset-provenance.json` › `illustrations` | Original SVG line art: shoulder complex, scapular upward rotation, layer stack | Hand-written geometry, AI-assisted, never traced; CC BY-SA 4.0 |
| `assets/geist*-OFL.txt` | SIL Open Font License for Geist and Geist Mono | Fonts load through `next/font` |
| `build-brand.py` | Writes the app's brand SVGs and icon from the trace; prints the raster commands | Run from the repo root |
| `proposal/` | The revision-2 Atlas proposal as delivered (design notes, components, motion, generated tokens, shadcn adapter) | Historical. Superseded by the root DESIGN.md where they differ |

## What changed from the proposal

Decided during integration, after rendering the real app at 1440, 390 and 320px, with keyboard and reduced motion:

- **Kept:** Atlas colours, Geist type, flat surfaces, ink primary actions, cobalt for brand, links, current lesson and focus; the corrected Cut 03 wordmark.
- **Token names:** one set of names (`ink`, `brand`, `text-muted`, …). The proposal's two meanings of `accent` (cobalt in `tokens.css`, a soft surface in the shadcn adapter) are gone.
- **Lesson states** use ink with an icon instead of cobalt, which read as links in the renders. The version notice is neutral for the same reason.
- **Caution role** added for retracted sources (content readable, credit kept); red is kept for failures.
- **Support legend** once per lesson, instead of the practice note repeated under every block.
- **Course list** groups versions of one course and resumes in the newest; an early render resumed into a lesson that v2 had removed.
- **Display size** 64px is kept in the contract for brand surfaces; app pages use the 32px heading step.
- **Dark theme** deferred. The old `prefers-color-scheme` override and the Arial body font were removed.
- **Components:** native elements and Lucide; no shadcn install yet. The proposal's 21st.dev candidates were not adopted and no third-party component source was copied.
- **Motion:** custom SVG completion check instead of the LottieFiles candidate (reason in DESIGN.md › Motion). The replayable motion board is the development-only `/design` route.
- **Favicon:** cut d on an ink tile. The cut i dot read as a "no entry" sign at 16px.

## Sources

The proposal's reference lock (Alpine Bio for imagery role and restrained sans, Attio for flat bordered surfaces and rare blue, Microsoft Learn for ordered lesson structure) informed patterns only. No third-party art, logo, screenshot or code is in this repository. The private research archive, account notes and alternate studies were not imported.
