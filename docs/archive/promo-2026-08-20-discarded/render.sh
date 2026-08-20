#!/bin/bash
# Renders every poster-*.html to out/*.png at 2x via headless Chrome.
# No dependencies beyond Chrome itself — nothing to npm install, nothing to keep updated.
set -euo pipefail
cd "$(dirname "$0")"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
mkdir -p out
for f in poster-*.html; do
  id="${f#poster-}"; id="${id%.html}"
  # vertical posters are 1080x1440, wide ones 1600x900 — read it off the class
  if grep -q 'class="poster v"' "$f"; then W=1080; H=1440; else W=1600; H=900; fi
  "$CHROME" --headless --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=2 --window-size="$W,$H" \
    --default-background-color=00000000 \
    --screenshot="out/$id.png" "$f" >/dev/null 2>&1
  echo "  out/$id.png   ${W}x${H} @2x"
done
echo "done — $(ls out/*.png | wc -l | tr -d ' ') posters"
