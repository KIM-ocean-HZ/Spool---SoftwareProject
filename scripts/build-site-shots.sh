#!/usr/bin/env bash
# Rebuild the WebP copies of the site screenshots that back the <picture> blocks
# in site/*.html. The .png files stay in the repo: they are the originals, and
# they are what a browser without WebP support falls back to.
#
# Two things this script knows that are easy to get wrong with UI screenshots:
#
# 1. Lossless WebP is a large, free win — the pixels come out bit-identical and
#    the whole set drops from ~2.4 MB to ~0.9 MB. Lossy WebP is *worse* here:
#    screenshots are synthetic images, and q92 came out 3x bigger than lossless
#    on capture-page.
# 2. Serving a smaller copy usually makes things worse, not better. These shots
#    are pixel-aligned UI, so resampling smears every crisp edge into new
#    intermediate colours and destroys the flat runs the codec relies on —
#    capture-page goes 64K → 176K on the way *down* to 760px. So a narrow
#    candidate is emitted only when it measures smaller than the full-size file,
#    which in practice is only the two shots that already carry resampling noise.
#
# Re-run after replacing any screenshot, then paste the srcset lines it prints
# into the matching <source> in site/index.html or site/story.html.
#
# Needs cwebp (brew install webp) and sips (built into macOS).
set -euo pipefail

cd "$(dirname "$0")/../site/assets/shots"

# original                widths the layout could ask for (1x and 2x of its slot)
slots=(
  # SHOT S1 / S2, taken 2026-08-12 against the isolated demo library. Both are 3600px
  # retina grabs, so the narrow candidates below are real wins rather than the usual
  # resampling loss this script warns about.
  "capture-page.png        580 1160"
  "project-window.png      580 1160"
  "app-thread-after.png    860 1720"
  "app-thread-before.png   760 1520"
  "capture-toast.png       340 680"
  "growth-day1.png         660 1320"
  "growth-week6.png        660 1320"
  "mcp-digest.png          840 1680"
  "mcp-filed-detail.png    860 1720"
  "mcp-library.png         840 1680"
  "mcp-search.png          840 1680"
  "mcp-write.png           840 1680"
  "pack-dialog.png         380 760"
)

rm -f ./*.webp
total_png=0
total_webp=0

for spec in "${slots[@]}"; do
  read -r src widths <<< "$spec"
  base="${src%.png}"
  full_w=$(sips -g pixelWidth "$src" | awk '/pixelWidth/ {print $2}')

  cwebp -quiet -lossless -z 9 "$src" -o "${base}.webp"
  full_bytes=$(stat -f%z "${base}.webp")

  srcset=""
  for w in $widths; do
    [ "$w" -ge "$full_w" ] && continue
    sips --resampleWidth "$w" "$src" --out "/tmp/shot-$base-$w.png" >/dev/null
    cwebp -quiet -lossless -z 9 "/tmp/shot-$base-$w.png" -o "/tmp/shot-$base-$w.webp"
    bytes=$(stat -f%z "/tmp/shot-$base-$w.webp")
    # only keep a narrow copy that is a real win — a few percent is not worth
    # another file to regenerate every time the screenshot changes
    if [ "$bytes" -lt $((full_bytes * 9 / 10)) ]; then
      cp "/tmp/shot-$base-$w.webp" "${base}-${w}.webp"
      srcset="${srcset}assets/shots/${base}-${w}.webp ${w}w, "
    fi
    rm -f "/tmp/shot-$base-$w.png" "/tmp/shot-$base-$w.webp"
  done
  srcset="${srcset}assets/shots/${base}.webp ${full_w}w"

  png_bytes=$(stat -f%z "$src")
  kept=$(du -ck "${base}"*.webp | tail -1 | cut -f1)
  total_png=$((total_png + png_bytes / 1024))
  total_webp=$((total_webp + kept))
  printf '%-24s png %5sK -> webp %5sK\n    srcset="%s"\n' \
    "$base" "$((png_bytes / 1024))" "$kept" "$srcset"
done

printf '\ntotal  png %sK -> webp %sK\n' "$total_png" "$total_webp"
