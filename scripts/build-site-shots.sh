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

# The whole-window grabs establish context, but their UI text cannot survive at
# website width. These are art-directed crops from those same real grabs: no
# pixels are redrawn, and every crop is regenerated whenever its source changes.
#
# Keep the website copies tied to the documented originals before making any
# crops. S1 is the complete SAVE scene (browser + confirmation); S2 is the
# complete KEEP project window.
cp ../../../docs/screenshots/S1.png capture-page.png
cp ../../../docs/screenshots/S2.png project-window.png

# Story evidence is intentionally a small, current set rather than a second
# screenshot gallery. All three files come from the isolated demo build used for
# the current repository close-out: one capture scene, one project context view,
# and one readable excerpt proving an attributed AI append with a citation.
cp ../../../docs/screenshots/app-capture.png story-capture.png
cp ../../../docs/screenshots/app-project.png story-project.png
cp ../../../docs/screenshots/mcp-filed-detail.png story-ai-writeback.png

# SAVE: browser tab/address and capture toast, both from the complete S1 scene.
# Row 78 is where the screen's top band ends: the browser window and the overlay
# card both start there, so both crops are offset past it.
sips -c 260 800 --cropOffset 79 1 capture-page.png \
  --out capture-page-source-detail.png >/dev/null
sips -c 430 680 --cropOffset 78 2880 capture-page.png \
  --out capture-toast.png >/dev/null
# KEEP: two in-place magnifiers over the complete project window. The narrower
# S2 wraps the long notes so each crop can keep every sentence to its full stop.
sips -c 410 1465 --cropOffset 660 570 project-window.png \
  --out project-window-source-detail.png >/dev/null
sips -c 370 1465 --cropOffset 1160 570 project-window.png \
  --out project-window-ai-detail.png >/dev/null
# Story: readable excerpts for the two otherwise very wide project grabs.
sips -c 430 1900 --cropOffset 1 1 mcp-filed-detail.png \
  --out mcp-filed-detail-readable.png >/dev/null
sips -c 700 1930 --cropOffset 800 1 app-thread-after.png \
  --out app-thread-after-detail.png >/dev/null

# original                widths the layout could ask for (1x and 2x of its slot)
slots=(
  # SHOT S1 / S2, taken against the isolated demo library. They are Retina grabs,
  # so the narrow candidates below can be real wins rather than the usual
  # resampling loss this script warns about.
  "capture-page.png        580 1160"
  "capture-page-source-detail.png"
  "project-window.png      736"
  "project-window-source-detail.png"
  "project-window-ai-detail.png"
  "app-thread-after.png    860 1720"
  "app-thread-after-detail.png"
  "app-thread-before.png   760 1520"
  "capture-toast.png       340 680"
  "growth-day1.png         660 1320"
  "growth-week6.png        660 1320"
  "mcp-digest.png          840 1680"
  "mcp-filed-detail.png    860 1720"
  "mcp-filed-detail-readable.png"
  "mcp-library.png         840 1680"
  "mcp-search.png          840 1680"
  "mcp-write.png           840 1680"
  "pack-dialog.png         380 760"
  "story-capture.png       1160 2320"
  "story-project.png       920"
  "story-ai-writeback.png  760"
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
