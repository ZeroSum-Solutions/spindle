#!/usr/bin/env bash
# Renders the raster icons from the symbol SVGs that build-wordmark.py writes (ImageMagick 7).
# Run from the repo root after build-wordmark.py. Checked by eye at 16, 32 and 180px on light and dark tabs.
set -euo pipefail
B=apps/web/public/brand
A=apps/web/src/app
# icon.svg: the doubled-cut symbol, so the cut survives at 16px.
cp "$B/spindle-symbol-small.svg" "$A/icon.svg"
tmp=$(mktemp -d)
for s in 16 32 48; do magick -background none -density 600 "$B/spindle-symbol-small.svg" -resize ${s}x${s} "$tmp/f$s.png"; done
magick "$tmp/f16.png" "$tmp/f32.png" "$tmp/f48.png" "$A/favicon.ico"
# Apple and Android crop their own corners: full-bleed tile, no transparency.
magick -background none -density 600 "$B/spindle-symbol-square.svg" -resize 180x180 -strip "$A/apple-icon.png"
magick -background none -density 600 "$B/spindle-symbol-square.svg" -resize 192x192 -strip "$B/icon-192.png"
magick -background none -density 600 "$B/spindle-symbol-square.svg" -resize 512x512 -strip "$B/icon-512.png"
rm -r "$tmp"
