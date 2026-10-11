# Spindle design record

The design contract is the root [DESIGN.md](../../../DESIGN.md). The app's tokens live in `apps/web/src/app/globals.css`. This folder keeps the inputs and the record behind them.

| Path | What | Status |
|---|---|---|
| (private) | The generated original of the selected wordmark (Cut 03, corrected: d cut, solid l, cut i dot) | Kept privately: it carries the generator's C2PA metadata and no redistribution right is recorded |
| `assets/r2-logo-03*.svg` | Potrace traces of the original (black, ink, cobalt, white) | Historical: source for the superseded `build-brand.py` (Atlas) |
| `asset-provenance.json` | Generator, model, task ids and prompts for the wordmark | Provenance, not trademark clearance |
| `asset-provenance.json` › `illustrations` | Original SVG line art: shoulder complex, scapular upward rotation, layer stack | Hand-written geometry, AI-assisted, never traced; CC BY-SA 4.0 |
| `assets/geist*-OFL.txt` | SIL Open Font License for Geist and Geist Mono | Fonts load through `next/font` |
| `assets/barlow-condensed-OFL.txt`, `assets/fraunces-OFL.txt` | SIL Open Font License (with copyright notices) for the two bundled tenant fonts | Self-hosted by `next/font`; used only by tenant themes |
| `build-wordmark.py` | Draws the Lab wordmark and cut-d symbol from Archivo's outlines (wght 900, wdth 125) and writes `components/brand-mark/wordmark-path.ts` | Current; steps below |
| `build-icons.sh` | Renders `icon.svg`, `favicon.ico` (16/32/48), `apple-icon.png` (180) and the manifest icons (192, 512) from the symbol SVGs | Current; steps below |
| `assets/archivo-OFL.txt`, `assets/ibm-plex-sans-OFL.txt`, `assets/ibm-plex-mono-OFL.txt` | SIL Open Font License for Spindle's Lab faces | Fonts load through `next/font` |
| `build-brand.py` | Writes the Atlas brand SVGs from the trace | Superseded (Atlas); kept for the record |
| `proposal/` | The revision-2 Atlas proposal as delivered (design notes, components, motion, generated tokens, shadcn adapter) | Historical. Superseded by the root DESIGN.md where they differ |

## Current direction

Lab, in two themes (Lab Light and Lab Dark), chosen by the owner on 2026-10-11; the root DESIGN.md describes it. The Atlas notes below are history: they record how the first proposal was integrated, and Lab replaces their colours, type and dark-theme decision.

## What changed from the proposal (Atlas, historical)

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

## Rebuild the wordmark and icons

Run from the repo root (needs uv and ImageMagick 7). The font is fetched from google/fonts at a pinned commit into a fresh folder; it is not committed.

```sh
mkdir -p /tmp/spindle-font
curl -sSfL -o /tmp/spindle-font/archivo.ttf \
  "https://raw.githubusercontent.com/google/fonts/bd8f81ddb5c74d5c8897b36ad88b440266245103/ofl/archivo/Archivo%5Bwdth,wght%5D.ttf"
uv run --with fonttools --with uharfbuzz --with skia-pathops python -I docs/design/spindle/build-wordmark.py \
  /tmp/spindle-font/archivo.ttf apps/web/public/brand apps/web/src/components/brand-mark/wordmark-path.ts
docs/design/spindle/build-icons.sh
```

Then look at the favicon at 16, 32 and 180px on a light and a dark tab before committing: the cut must stay open at 16px.

## Sources

The proposal's reference lock (Alpine Bio for imagery role and restrained sans, Attio for flat bordered surfaces and rare blue, Microsoft Learn for ordered lesson structure) informed patterns only. No third-party art, logo, screenshot or code is in this repository. The private research archive, account notes and alternate studies were not imported.
