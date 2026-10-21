#!/usr/bin/env python3
"""Builds the app's brand files from the traced Cut 03 wordmark. SUPERSEDED (2026-10-11) by build-wordmark.py (Pressroom); kept as Atlas history.

Run from the repo root: python3 docs/design/spindle/build-brand.py
Writes apps/web/public/brand/*.svg and apps/web/src/app/icon.svg. Raster icons
(favicon.ico, apple-icon.png) are rendered from icon.svg with ImageMagick; see
the commands printed at the end. The trace itself is not redrawn: the d cut,
the solid l and the cut i dot come straight from assets/r2-logo-03.svg.
"""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[3]
SRC = ROOT / "docs/design/spindle/assets/r2-logo-03.svg"
OUT = ROOT / "apps/web/public/brand"
APP = ROOT / "apps/web/src/app"

paths = re.findall(r'<path d="(.*?)"/>', SRC.read_text(), re.S)
assert len(paths) == 10, "unexpected trace"
paths = [" ".join(p.split()) for p in paths]
TRANSFORM = 'transform="translate(-83 802) scale(0.1 -0.1)"'
# Indices in the trace: 1 and 3 are the d (cap above the cut, then bowl and stem).
D = [1, 3]

WORDMARK_BOX = "0 0 1089 299.03"
# Square box around the d with room for the tile (measured from a render of the trace).
D_X, D_Y, D_W = 637.5, 0.0, 186.0
D_H = 244.5


def group(fill, idx):
    body = "".join(f'<path d="{paths[i]}"/>' for i in idx)
    return f'<g {TRANSFORM} fill="{fill}">{body}</g>'


def wordmark(fill, label=True):
    aria = 'role="img" aria-label="Spindle"' if label else 'aria-hidden="true"'
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{WORDMARK_BOX}" {aria}>{group(fill, range(10))}</svg>\n'


def tile(bg="#17232B", fg="#FFFFFF"):
    side = D_H * 1.5
    x = D_X + D_W / 2 - side / 2
    y = D_Y + D_H / 2 - side / 2
    rect = f'<rect x="{x:.2f}" y="{y:.2f}" width="{side:.2f}" height="{side:.2f}" rx="{side * 0.22:.2f}" fill="{bg}"/>'
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x:.2f} {y:.2f} {side:.2f} {side:.2f}">{rect}{group(fg, D)}</svg>\n'


OUT.mkdir(parents=True, exist_ok=True)
(OUT / "spindle-wordmark.svg").write_text(wordmark("currentColor"))
(OUT / "spindle-wordmark-ink.svg").write_text(wordmark("#17232B"))
(OUT / "spindle-wordmark-white.svg").write_text(wordmark("#FFFFFF"))
(OUT / "spindle-wordmark-cobalt.svg").write_text(wordmark("#2453D4"))
(OUT / "spindle-symbol.svg").write_text(tile())
(APP / "icon.svg").write_text(tile())
print("wrote", *sorted(p.name for p in OUT.iterdir()), "and src/app/icon.svg")
print("raster: magick -background none -density 1200 apps/web/src/app/icon.svg -define icon:auto-resize=48,32,16 apps/web/src/app/favicon.ico")
print("        magick -background none -density 1200 apps/web/src/app/icon.svg -resize 180x180 -background '#17232B' -flatten apps/web/src/app/apple-icon.png")
