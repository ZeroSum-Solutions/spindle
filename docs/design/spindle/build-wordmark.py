#!/usr/bin/env python3
"""Builds Spindle's Lab wordmark and cut-d symbol as clean vector geometry.

The Cut wordmark (concept 03: a cut through the d ascender, a solid l, a cut through the i dot) redrawn
in the Lab face: Archivo (SIL OFL 1.1; docs/design/spindle/assets/archivo-OFL.txt) at wght 900 and its
widest width, wdth 125, shaped with HarfBuzz. The i dot is a square as wide as the i stem, ending where
Archivo's own dot ends, so both cuts sit on square ends. The cuts are boolean differences (Skia PathOps), so
every file is plain filled paths: no masks, no tracing, no AI. Both cuts rise 1 in 2 (26.57 degrees from
horizontal), the angle measured on the shipped Cut wordmark, and are parallel.

Outputs (in <out>): wordmark SVGs (currentColor, graphite, light), the cut-d symbol on tiles, and
<ts-out>, a TypeScript module with the wordmark and symbol paths for inline, theme-coloured use.
"""
import sys, pathlib
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.svgPathPen import SVGPathPen
import uharfbuzz as hb
import pathops

font_path, out, ts_out = sys.argv[1], pathlib.Path(sys.argv[2]), pathlib.Path(sys.argv[3])
out.mkdir(parents=True, exist_ok=True)
WGHT, WDTH = 900, 125
SLOPE = 0.5  # rise over run of both cuts
GRAPHITE, LIGHT, MIDNIGHT, SIGNAL, TILE_DARK = "#12151C", "#F2F4F8", "#0B0D12", "#FF3B8E", "#181C25"

vf = TTFont(font_path)
inst = instantiateVariableFont(vf, {"wght": WGHT, "wdth": WDTH})
gs = inst.getGlyphSet()
upem = inst["head"].unitsPerEm
face = hb.Face(hb.Blob.from_file_path(font_path)); hbfont = hb.Font(face)
hbfont.set_variations({"wght": WGHT, "wdth": WDTH})


def glyph_path(name, dx):
    rec = RecordingPen(); gs[name].draw(TransformPen(rec, (1, 0, 0, -1, dx, 0)))  # flip y: SVG coordinates
    p = pathops.Path(); pen = p.getPen()
    for op, args in rec.value:
        getattr(pen, op)(*args)
    return p


def rect(x0, y0, x1, y1):
    p = pathops.Path(); pen = p.getPen()
    pen.moveTo((x0, y0)); pen.lineTo((x1, y0)); pen.lineTo((x1, y1)); pen.lineTo((x0, y1)); pen.closePath()
    return p


def band(cx, cy, half_len, thick):
    """A parallelogram centred on (cx, cy), rising 1 in 2 to the right, `thick` measured vertically."""
    dx, dy, t = half_len, -half_len * SLOPE, thick / 2  # SVG y grows downward, so rising is negative dy
    p = pathops.Path(); pen = p.getPen()
    pen.moveTo((cx - dx, cy - dy - t)); pen.lineTo((cx + dx, cy + dy - t)); pen.lineTo((cx + dx, cy + dy + t)); pen.lineTo((cx - dx, cy - dy + t)); pen.closePath()
    return p


def op(a, b, kind):
    return pathops.op(a, b, kind)


def union(paths):
    acc = pathops.Path()
    for p in paths:
        acc = op(acc, p, pathops.PathOp.UNION)
    return acc


def svg_d(p):
    pen = SVGPathPen(None, ntos=lambda v: f"{v:.1f}".rstrip("0").rstrip("."))
    p.draw(pen)
    return pen.getCommands()


def stem_at(p, y):
    """The horizontal extent of a glyph's ink at height y (a 2-unit probe)."""
    b = p.bounds
    return op(p, rect(b[0], y - 1, b[2], y + 1), pathops.PathOp.INTERSECTION).bounds


# Shape "spındle" (dotless i); the dot is drawn as a square so it can carry the cut.
buf = hb.Buffer(); buf.add_str("spındle"); buf.guess_segment_properties(); hb.shape(hbfont, buf, {"kern": True, "liga": False})
x = 0; glyphs = []
for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
    glyphs.append((inst.getGlyphOrder()[info.codepoint], x + pos.x_offset)); x += pos.x_advance
paths = {i: glyph_path(n, gx) for i, (n, gx) in enumerate(glyphs)}

# The i: a square dot, as wide as the stem, whose bottom sits where Archivo's own dot ends.
i_idx = 2
dotless = paths[i_idx]; dl = dotless.bounds
xh = dl[1]  # top of the stem (x-height), SVG y
ref_i = glyph_path(inst["cmap"].getBestCmap()[ord("i")], glyphs[i_idx][1])
font_dot = op(ref_i, dotless, pathops.PathOp.DIFFERENCE).bounds
sb = stem_at(dotless, (xh + dl[3]) / 2)
stem_w = sb[2] - sb[0]
cut_t = stem_w * 0.16  # cut thickness, measured vertically
# The d first (its bounds place the cut below).
d_idx = next(i for i, (n, _) in enumerate(glyphs) if n == "d")
dp = paths[d_idx]; dbb = dp.bounds
# A square dot: the wide face's ascender is short, so a square rises a little above the d. That keeps the
# two cut pieces large enough to read at the 24px minimum height.
dot = rect(sb[0], font_dot[3] - stem_w, sb[2], font_dot[3])
dot_cx, dot_cy = (sb[0] + sb[2]) / 2, font_dot[3] - stem_w / 2
dot_cut = op(dot, band(dot_cx, dot_cy, stem_w, cut_t), pathops.PathOp.DIFFERENCE)

# The d: a parallel cut through the ascender, halfway between its top and the x-height (the stem alone has ink there).
cut_y = dbb[1] + (xh - dbb[1]) * 0.5
db = stem_at(dp, cut_y)
d_cut = op(dp, band((db[0] + db[2]) / 2, cut_y, (db[2] - db[0]) * 0.8, cut_t), pathops.PathOp.DIFFERENCE)

word = union([paths[i] for i in paths if i != d_idx] + [d_cut, dot_cut])
wb = word.bounds; pad = upem * 0.02
vb = (wb[0] - pad, wb[1] - pad, wb[2] - wb[0] + 2 * pad, wb[3] - wb[1] + 2 * pad)
d_word = svg_d(word)
vb_s = f"{vb[0]:.1f} {vb[1]:.1f} {vb[2]:.1f} {vb[3]:.1f}"
for suffix, fill in {"": "currentColor", "-graphite": GRAPHITE, "-light": LIGHT}.items():
    (out / f"spindle-wordmark{suffix}.svg").write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb_s}" role="img" aria-label="Spindle"><path fill="{fill}" d="{d_word}"/></svg>\n')

# Symbol: the cut d alone, centred on a 200-unit tile. The favicon variant doubles the cut so it survives 16px.
def symbol(thick):
    g = op(dp, band((db[0] + db[2]) / 2, cut_y, (db[2] - db[0]) * 0.8, thick), pathops.PathOp.DIFFERENCE)
    b = g.bounds; s = 128 / max(b[2] - b[0], b[3] - b[1])
    rec = RecordingPen(); g.draw(TransformPen(rec, (s, 0, 0, s, -(b[0] + b[2]) / 2 * s, -(b[1] + b[3]) / 2 * s)))
    q = pathops.Path(); pen = q.getPen()
    for o, a in rec.value:
        getattr(pen, o)(*a)
    return svg_d(q)


d_sym, d_sym_small = symbol(cut_t), symbol(cut_t * 2)
def tile(path, fg, bg, rx=40):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-100 -100 200 200" role="img" aria-label="Spindle">'
            f'<rect x="-100" y="-100" width="200" height="200" rx="{rx}" fill="{bg}"/><path fill="{fg}" d="{path}"/></svg>\n')
(out / "spindle-symbol.svg").write_text(tile(d_sym, MIDNIGHT, SIGNAL))
(out / "spindle-symbol-graphite.svg").write_text(tile(d_sym, LIGHT, TILE_DARK))
(out / "spindle-symbol-small.svg").write_text(tile(d_sym_small, MIDNIGHT, SIGNAL, rx=36))
# Full-bleed tile for raster app icons (iOS and Android mask their own corners).
(out / "spindle-symbol-square.svg").write_text(tile(d_sym, MIDNIGHT, SIGNAL, rx=0))

ts_out.write_text(
    "// Generated by docs/design/spindle/build-wordmark.py (Archivo wght 900, wdth 125; SIL OFL 1.1). Do not edit by hand.\n"
    f'export const WORDMARK_VIEWBOX = "{vb_s}";\n'
    f"export const WORDMARK_ASPECT = {vb[2] / vb[3]:.4f};\n"
    f'export const WORDMARK_PATH = "{d_word}";\n'
    'export const SYMBOL_VIEWBOX = "-100 -100 200 200";\n'
    f'export const SYMBOL_PATH = "{d_sym}";\n'
)
print({"viewBox": [round(v, 1) for v in vb], "aspect": round(vb[2] / vb[3], 4), "glyphs": [g for g, _ in glyphs], "stem": round(stem_w, 1)})
