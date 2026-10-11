#!/usr/bin/env python3
"""Builds Spindle's Pressroom wordmark and cut-disc symbol as clean vector geometry.

The Cut wordmark (Devin's concept 03: a cut through the d ascender, a solid l, a cut through the i dot)
redrawn in the Pressroom face. Glyph outlines come from Archivo Italic (SIL OFL 1.1;
docs/design/spindle/assets/archivo-OFL.txt) at wght 900 and wdth 75, shaped with HarfBuzz. The cuts are
boolean differences (Skia PathOps), so every file is plain filled paths: no masks, no tracing, no AI.
The cut rises 1 in 2 (26.57 degrees from horizontal), the angle measured on the shipped Cut wordmark.

Run from the repo root (the font is fetched from google/fonts at a pinned commit, not committed here):
  curl -sSfL -o /tmp/archivo-italic.ttf \
    "https://raw.githubusercontent.com/google/fonts/bd8f81ddb5c74d5c8897b36ad88b440266245103/ofl/archivo/Archivo-Italic%5Bwdth,wght%5D.ttf"
  uv run --with fonttools==4.* --with uharfbuzz --with skia-pathops python docs/design/spindle/build-wordmark.py /tmp/archivo-italic.ttf apps/web/public/brand
Then render the raster icons as the README in this folder lists (ImageMagick).
"""
import math, sys, pathlib
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.transformPen import TransformPen
import uharfbuzz as hb
import pathops

font_path, out = sys.argv[1], pathlib.Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
WGHT, WDTH = 900, 75
vf = TTFont(font_path)
inst = instantiateVariableFont(vf, {"wght": WGHT, "wdth": WDTH})
gs = inst.getGlyphSet()
upem = inst["head"].unitsPerEm
blob = hb.Blob.from_file_path(font_path); face = hb.Face(blob); hbfont = hb.Font(face)
hbfont.set_variations({"wght": WGHT, "wdth": WDTH})
SLOPE = 0.5  # rise over run of the cut

def glyph_path(name, dx, dy=0):
    rec = RecordingPen(); gs[name].draw(TransformPen(rec, (1, 0, 0, -1, dx, dy)))  # flip y: SVG coords
    p = pathops.Path(); pen = p.getPen()
    for op, args in rec.value:
        getattr(pen, op)(*args)
    return p

def bbox(p):
    return p.bounds  # (xmin, ymin, xmax, ymax)

def band(cx, cy, half_len, thick):
    """A parallelogram band centred on (cx, cy), rising 1 in 2 to the right, `thick` measured vertically."""
    dx = half_len; dy = -half_len * SLOPE  # SVG y grows downward, so rising = negative dy
    t = thick / 2
    p = pathops.Path(); pen = p.getPen()
    pen.moveTo((cx - dx, cy - dy - t)); pen.lineTo((cx + dx, cy + dy - t)); pen.lineTo((cx + dx, cy + dy + t)); pen.lineTo((cx - dx, cy - dy + t)); pen.closePath()
    return p

def circle(cx, cy, r, n=64):
    p = pathops.Path(); pen = p.getPen(); k = 0.5522847498 * r
    pen.moveTo((cx + r, cy)); pen.curveTo((cx + r, cy + k), (cx + k, cy + r), (cx, cy + r)); pen.curveTo((cx - k, cy + r), (cx - r, cy + k), (cx - r, cy))
    pen.curveTo((cx - r, cy - k), (cx - k, cy - r), (cx, cy - r)); pen.curveTo((cx + k, cy - r), (cx + r, cy - k), (cx + r, cy)); pen.closePath()
    return p

def union(paths):
    acc = pathops.Path()
    for p in paths: acc = pathops.op(acc, p, pathops.PathOp.UNION)
    return acc

def svg_d(p):
    from fontTools.pens.svgPathPen import SVGPathPen
    pen = SVGPathPen(None, ntos=lambda v: f"{v:.1f}".rstrip("0").rstrip("."))
    p.draw(pen); return pen.getCommands()

# Shape "spındle" (dotless i); the dot is drawn as a disc so it can carry the cut.
buf = hb.Buffer(); buf.add_str("spındle"); buf.guess_segment_properties(); hb.shape(hbfont, buf, {"kern": True, "liga": False})
x = 0; glyphs = []
for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
    name = inst.getGlyphOrder()[info.codepoint]
    glyphs.append((name, x + pos.x_offset)); x += pos.x_advance
paths = {i: glyph_path(n, gx) for i, (n, gx) in enumerate(glyphs)}
# Reference: the dotted i's dot gives the disc's height and italic offset.
idot_name = inst["cmap"].getBestCmap()[ord("i")]
ref_i = glyph_path(idot_name, glyphs[2][1]); ref_dotless = paths[2]
dl = bbox(ref_dotless)
# The dot is the part of the dotted i above the dotless stem.
dot = pathops.op(ref_i, ref_dotless, pathops.PathOp.DIFFERENCE); db = bbox(dot)
dot_cx, dot_cy = (db[0] + db[2]) / 2, (db[1] + db[3]) / 2
r = max(db[2] - db[0], db[3] - db[1]) * 0.62
xh = dl[1]  # top of the dotless stem (x-height), in SVG y
dot_cy = min(dot_cy, xh - r * 1.25)
disc = circle(dot_cx, dot_cy, r)
cut_t = upem * 0.034  # cut thickness
disc_cut = pathops.op(disc, band(dot_cx, dot_cy, r * 1.6, cut_t), pathops.PathOp.DIFFERENCE)
# The d: cut its ascender above the bowl, across the stem only.
d_idx = [i for i, (n, _) in enumerate(glyphs) if n == "d"][0]
dp = paths[d_idx]; dbb = bbox(dp)
asc_top = dbb[1]
# Above the bowl only the stem has ink, so a band across the whole glyph cuts the stem alone.
cut_y = asc_top + (xh - asc_top) * 0.5
probe = pathops.Path(); pp = probe.getPen()
pp.moveTo((dbb[0], cut_y - 1)); pp.lineTo((dbb[2], cut_y - 1)); pp.lineTo((dbb[2], cut_y + 1)); pp.lineTo((dbb[0], cut_y + 1)); pp.closePath()
sb = bbox(pathops.op(dp, probe, pathops.PathOp.INTERSECTION))  # the stem's extent at the cut height
stem_cx, stem_w = (sb[0] + sb[2]) / 2, sb[2] - sb[0]
d_cut = pathops.op(dp, band(stem_cx, cut_y, stem_w * 0.8, cut_t), pathops.PathOp.DIFFERENCE)
parts = [paths[i] for i in paths if i != d_idx] + [d_cut, disc_cut]
word = union(parts)
wb = bbox(word); pad = upem * 0.02
vb = (wb[0] - pad, wb[1] - pad, wb[2] - wb[0] + 2 * pad, wb[3] - wb[1] + 2 * pad)
d_word = svg_d(word)
COLORS = {"": "currentColor", "-ink": "#111111", "-white": "#FFFFFF", "-blue": "#1D2BE6"}
for suffix, fill in COLORS.items():
    (out / f"spindle-wordmark{suffix}.svg").write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb[0]:.1f} {vb[1]:.1f} {vb[2]:.1f} {vb[3]:.1f}" role="img" aria-label="Spindle"><path fill="{fill}" d="{d_word}"/></svg>\n')
# Symbol: the cut disc on a tile (favicon, app icon) and bare (seal, small marks).
R = 100; disc_s = circle(0, 0, R * 0.62); sym = pathops.op(disc_s, band(0, 0, R * 0.62 * 1.6, R * 0.62 * 2 * (cut_t / (2 * r))), pathops.PathOp.DIFFERENCE)
d_sym = svg_d(sym)
def tile(fg, bg, rx=22):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-100 -100 200 200" role="img" aria-label="Spindle"><rect x="-100" y="-100" width="200" height="200" rx="{rx}" fill="{bg}"/><path fill="{fg}" d="{d_sym}"/></svg>\n'
(out / "spindle-symbol.svg").write_text(tile("#F3EFE6", "#1D2BE6"))
(out / "spindle-symbol-ink.svg").write_text(tile("#F3EFE6", "#111111"))
# Favicon variant: the cut is doubled in thickness so it survives at 16 and 32 px.
sym_small = pathops.op(disc_s, band(0, 0, R * 0.62 * 1.6, R * 0.62 * 4 * (cut_t / (2 * r))), pathops.PathOp.DIFFERENCE)
(out / "spindle-symbol-small.svg").write_text(tile("#F3EFE6", "#1D2BE6").replace(d_sym, svg_d(sym_small)))
# Full-bleed tile for raster app icons (iOS and Android mask their own corners).
(out / "spindle-symbol-square.svg").write_text(tile("#F3EFE6", "#1D2BE6", rx=0))
(out / "spindle-disc.svg").write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-64 -64 128 128" role="img" aria-label="Spindle"><path fill="currentColor" d="{d_sym}"/></svg>\n')
print({"viewBox": [round(v, 1) for v in vb], "aspect": round(vb[2] / vb[3], 4), "glyphs": [g for g, _ in glyphs]})
