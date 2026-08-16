#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/visual-regression.sh update [BASE_URL]
  scripts/visual-regression.sh check  [BASE_URL]

Capture the full length of the six static-site routes at 390, 768, and 1440
CSS pixels, using a 1200px viewport to exercise lazy loading before capture.

Modes:
  update  Replace the 18 baseline PNGs after an intentional visual change.
  check   Capture current PNGs, compare every file, and write highlighted diffs.

Defaults and overrides:
  BASE_URL                 http://127.0.0.1:4173 (loopback URLs only)
  CHROME_BIN               /Applications/Google Chrome.app/Contents/MacOS/Google Chrome
  VISUAL_VIEWPORT_HEIGHT   1200
  VISUAL_SETTLE_MS         2000
  VISUAL_PIXEL_DELTA       8
  VISUAL_MAX_CHANGED_RATIO 0.001 (0.1 percent)
  VISUAL_MAX_CHANNEL_DIFF  32 (0-255 channel scale)
  VISUAL_BASELINE_DIR      docs/qa/visual-baselines
  VISUAL_CURRENT_DIR       docs/qa/visual-current
  VISUAL_DIFF_DIR          docs/qa/visual-diffs

Runtime requirements: Python 3 with Pillow and websocket-client, plus Google
Chrome at CHROME_BIN.

`check` exits non-zero if any image changes dimensions, more than 0.1 percent
of pixels differ by over 8 in any channel, or any channel differs by over 32.
EOF
}

if [[ $# -lt 1 || $# -gt 2 ]]; then
  usage >&2
  exit 64
fi

MODE="$1"
if [[ "$MODE" != "update" && "$MODE" != "check" ]]; then
  usage >&2
  exit 64
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BASE_URL="${2:-${BASE_URL:-http://127.0.0.1:4173}}"
BASE_URL="${BASE_URL%/}"
CHROME_BIN="${CHROME_BIN:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
VIEWPORT_HEIGHT="${VISUAL_VIEWPORT_HEIGHT:-1200}"
SETTLE_MS="${VISUAL_SETTLE_MS:-2000}"
PIXEL_DELTA="${VISUAL_PIXEL_DELTA:-8}"
MAX_CHANGED_RATIO="${VISUAL_MAX_CHANGED_RATIO:-0.001}"
MAX_CHANNEL_DIFF="${VISUAL_MAX_CHANNEL_DIFF:-32}"
BASELINE_DIR="${VISUAL_BASELINE_DIR:-$REPO_ROOT/docs/qa/visual-baselines}"
CURRENT_DIR="${VISUAL_CURRENT_DIR:-$REPO_ROOT/docs/qa/visual-current}"
DIFF_DIR="${VISUAL_DIFF_DIR:-$REPO_ROOT/docs/qa/visual-diffs}"
COMPARE_SCRIPT="$SCRIPT_DIR/compare-visual-snapshots.py"

python3 - "$BASE_URL" <<'PY'
import sys
from urllib.parse import urlsplit

url = urlsplit(sys.argv[1])
if url.scheme not in {"http", "https"}:
    raise SystemExit("BASE_URL must use http or https")
if url.hostname not in {"127.0.0.1", "localhost", "::1"}:
    raise SystemExit("BASE_URL must resolve explicitly to loopback (localhost, 127.0.0.1, or ::1)")
if url.username or url.password or url.query or url.fragment:
    raise SystemExit("BASE_URL must not contain credentials, a query, or a fragment")
if url.path not in {"", "/"}:
    raise SystemExit("BASE_URL must be an origin without a path")
PY

if [[ ! -x "$CHROME_BIN" ]]; then
  echo "Chrome binary is not executable: $CHROME_BIN" >&2
  exit 69
fi
if [[ ! -f "$COMPARE_SCRIPT" ]]; then
  echo "Comparison helper is missing: $COMPARE_SCRIPT" >&2
  exit 69
fi

for numeric_value in "$VIEWPORT_HEIGHT" "$SETTLE_MS" "$PIXEL_DELTA" "$MAX_CHANNEL_DIFF"; do
  if [[ ! "$numeric_value" =~ ^[0-9]+$ ]]; then
    echo "Integer visual-regression settings must contain digits only: $numeric_value" >&2
    exit 64
  fi
done

python3 - "$VIEWPORT_HEIGHT" "$SETTLE_MS" "$PIXEL_DELTA" "$MAX_CHANGED_RATIO" "$MAX_CHANNEL_DIFF" <<'PY'
import math
import sys

height, settle, pixel_delta, ratio, channel_diff = sys.argv[1:]
height = int(height)
settle = int(settle)
pixel_delta = int(pixel_delta)
ratio = float(ratio)
channel_diff = int(channel_diff)
if height < 1:
    raise SystemExit("VISUAL_VIEWPORT_HEIGHT must be positive")
if settle < 1:
    raise SystemExit("VISUAL_SETTLE_MS must be positive")
if not 0 <= pixel_delta <= 255:
    raise SystemExit("VISUAL_PIXEL_DELTA must be from 0 through 255")
if not math.isfinite(ratio) or not 0 <= ratio <= 1:
    raise SystemExit("VISUAL_MAX_CHANGED_RATIO must be a finite number from 0 through 1")
if not 0 <= channel_diff <= 255:
    raise SystemExit("VISUAL_MAX_CHANNEL_DIFF must be from 0 through 255")
PY

if ! curl --fail --silent --show-error --max-time 8 "$BASE_URL/" >/dev/null; then
  echo "The local site is not reachable at $BASE_URL/" >&2
  exit 69
fi

TEMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/knote-visual-regression.XXXXXX")"
cleanup() {
  if [[ -n "${TEMP_ROOT:-}" && -d "$TEMP_ROOT" ]]; then
    rm -rf -- "$TEMP_ROOT"
  fi
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

CAPTURE_DIR="$TEMP_ROOT/captures"
LOG_DIR="$TEMP_ROOT/logs"
mkdir -p "$CAPTURE_DIR" "$LOG_DIR"

ROUTES=(
  "home|/"
  "zh-home|/zh/"
  "story|/story.html"
  "zh-story|/zh/story.html"
  "privacy|/privacy.html"
  "zh-privacy|/zh/privacy.html"
)
WIDTHS=(390 768 1440)
SNAPSHOT_COUNT=$(( ${#ROUTES[@]} * ${#WIDTHS[@]} ))

capture_snapshot() {
  local name="$1"
  local route="$2"
  local width="$3"
  local output="$4"
  local profile="$TEMP_ROOT/profile-$name-$width"
  local log="$LOG_DIR/$name-$width.log"

  mkdir -p "$profile"
  # Chrome writes the requested image but can keep its headless process alive
  # on this static site. Give it a private process group, poll until Pillow can
  # read the complete frame, then terminate that group without leaving helpers.
  if ! TZ=UTC LC_ALL=C python3 - \
    "$CHROME_BIN" "$profile" "$output" "$log" "$width" \
    "$VIEWPORT_HEIGHT" "$SETTLE_MS" "$BASE_URL$route" <<'PY'
import base64
import json
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

from PIL import Image
import websocket

chrome, profile, output, log, width, height, settle_ms, url = sys.argv[1:]
expected_width = int(width)
viewport_height = int(height)
command = [
    chrome,
    "--headless=new",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-background-timer-throttling",
    "--disable-breakpad",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-gpu",
    "--disable-lcd-text",
    "--disable-renderer-backgrounding",
    "--disable-sync",
    "--force-color-profile=srgb",
    "--force-device-scale-factor=1",
    "--force-prefers-reduced-motion=reduce",
    "--lang=en-US",
    "--remote-allow-origins=*",
    "--remote-debugging-port=0",
    "--run-all-compositor-stages-before-draw",
    f"--user-data-dir={profile}",
    "--window-size=1280,900",
    "about:blank",
]

ready = False
with Path(log).open("w", encoding="utf-8") as log_file:
    process = subprocess.Popen(
        command,
        stdin=subprocess.DEVNULL,
        stdout=log_file,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    deadline = time.monotonic() + 20
    try:
        port_file = Path(profile) / "DevToolsActivePort"
        while time.monotonic() < deadline and not port_file.exists() and process.poll() is None:
            time.sleep(0.05)
        if not port_file.exists():
            raise RuntimeError("Chrome did not expose DevToolsActivePort")
        port_lines = port_file.read_text(encoding="utf-8").splitlines()
        port = port_lines[0]
        browser_ws = f"ws://127.0.0.1:{port}{port_lines[1]}"
        ws = websocket.create_connection(browser_ws, timeout=5)
        next_id = 0

        def cdp(method, params=None, session_id=None):
            # Keep the CDP client small; websocket-client is the only transport
            # dependency beyond Pillow, which also validates captures below.
            global next_id
            next_id += 1
            call_id = next_id
            message = {"id": call_id, "method": method, "params": params or {}}
            if session_id:
                message["sessionId"] = session_id
            ws.send(json.dumps(message))
            while True:
                message = json.loads(ws.recv())
                if message.get("id") == call_id:
                    if "error" in message:
                        raise RuntimeError(f"CDP {method} failed: {message['error']}")
                    return message.get("result", {})

        target_id = cdp("Target.createTarget", {"url": "about:blank"})["targetId"]
        session_id = cdp("Target.attachToTarget", {
            "targetId": target_id,
            "flatten": True,
        })["sessionId"]
        def page_cdp(method, params=None):
            return cdp(method, params, session_id)

        page_cdp("Emulation.setDeviceMetricsOverride", {
            "width": expected_width,
            "height": viewport_height,
            "deviceScaleFactor": 1,
            "mobile": False,
            "screenWidth": expected_width,
            "screenHeight": viewport_height,
        })
        page_cdp("Emulation.setTimezoneOverride", {"timezoneId": "UTC"})
        page_cdp("Emulation.setLocaleOverride", {"locale": "en-US"})
        page_cdp("Emulation.setEmulatedMedia", {
            "features": [{"name": "prefers-reduced-motion", "value": "reduce"}]
        })
        page_cdp("Page.enable")
        page_cdp("Page.navigate", {"url": url})
        while time.monotonic() < deadline:
            state = page_cdp("Runtime.evaluate", {
                "expression": "document.readyState",
                "returnByValue": True,
            }).get("result", {}).get("value")
            if state == "complete":
                break
            time.sleep(0.05)
        time.sleep(int(settle_ms) / 1000)
        page_height = int(page_cdp("Runtime.evaluate", {
            "expression": "Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)",
            "returnByValue": True,
        })["result"]["value"])
        # Exercise native lazy loading before the full-page capture. Scrolling is
        # stepped and deterministic; the final frame returns to the document top.
        step = max(1, int(viewport_height * 0.8))
        for y in range(0, page_height + 1, step):
            page_cdp("Runtime.evaluate", {
                "expression": f"window.scrollTo(0, {y})",
                "returnByValue": True,
            })
            time.sleep(0.08)
        page_cdp("Runtime.evaluate", {
            "expression": "window.scrollTo(0, 0)",
            "returnByValue": True,
        })
        time.sleep(0.2)
        page_height = int(page_cdp("Runtime.evaluate", {
            "expression": "Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)",
            "returnByValue": True,
        })["result"]["value"])
        shot = page_cdp("Page.captureScreenshot", {
            "format": "png",
            "fromSurface": True,
            "captureBeyondViewport": True,
            "clip": {
                "x": 0,
                "y": 0,
                "width": expected_width,
                "height": page_height,
                "scale": 1,
            },
        })
        Path(output).write_bytes(base64.b64decode(shot["data"]))
        ws.close()
        while time.monotonic() < deadline:
            try:
                with Image.open(output) as image:
                    image.load()
                    ready = (image.format == "PNG" and
                             image.size[0] == expected_width and
                             image.size[1] >= viewport_height)
            except (FileNotFoundError, OSError, ValueError):
                ready = False
            if ready:
                break
            if process.poll() is not None:
                break
            time.sleep(0.1)
    finally:
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=2)

if not ready:
    raise SystemExit(1)
PY
  then
    echo "Chrome failed while capturing $name at ${width}px:" >&2
    sed -n '1,120p' "$log" >&2
    return 1
  fi

  if [[ ! -s "$output" ]]; then
    echo "Chrome did not create a screenshot for $name at ${width}px" >&2
    sed -n '1,120p' "$log" >&2
    return 1
  fi

  python3 - "$output" "$width" "$VIEWPORT_HEIGHT" <<'PY'
import sys
from pathlib import Path
from PIL import Image

path = Path(sys.argv[1])
expected_width = int(sys.argv[2])
minimum_height = int(sys.argv[3])
try:
    with Image.open(path) as image:
        image.load()
        actual = image.size
        image_format = image.format
except (OSError, ValueError) as error:
    raise SystemExit(f"Invalid screenshot {path}: {error}")
if image_format != "PNG":
    raise SystemExit(f"Expected PNG from Chrome, got {image_format!r}: {path}")
if actual[0] != expected_width or actual[1] < minimum_height:
    raise SystemExit(
        f"Unexpected screenshot size {actual}; expected width {expected_width} "
        f"and height at least {minimum_height}: {path}"
    )
PY
}

echo "Visual regression mode: $MODE"
echo "Base URL: $BASE_URL"
echo "Full-page capture; viewport: 390/768/1440 x ${VIEWPORT_HEIGHT}; DPR 1; timezone UTC; reduced motion"
echo "Thresholds: pixel delta > $PIXEL_DELTA; changed ratio <= $MAX_CHANGED_RATIO; max channel diff <= $MAX_CHANNEL_DIFF"

for route_entry in "${ROUTES[@]}"; do
  IFS='|' read -r route_name route_path <<<"$route_entry"
  if ! curl --fail --silent --show-error --max-time 8 "$BASE_URL$route_path" >/dev/null; then
    echo "Route is not reachable: $BASE_URL$route_path" >&2
    exit 69
  fi
  for width in "${WIDTHS[@]}"; do
    filename="$route_name-${width}x${VIEWPORT_HEIGHT}.png"
    echo "Capturing $route_path at ${width}x${VIEWPORT_HEIGHT} -> $filename"
    capture_snapshot "$route_name" "$route_path" "$width" "$CAPTURE_DIR/$filename"
  done
done

if [[ "$MODE" == "update" ]]; then
  mkdir -p "$BASELINE_DIR"
  for captured in "$CAPTURE_DIR"/*.png; do
    install -m 0644 "$captured" "$BASELINE_DIR/$(basename "$captured")"
  done
  echo "Updated $SNAPSHOT_COUNT visual baselines in $BASELINE_DIR"
  exit 0
fi

mkdir -p "$CURRENT_DIR" "$DIFF_DIR"
rm -f -- "$CURRENT_DIR"/*.png "$DIFF_DIR"/*.png
failures=0
for route_entry in "${ROUTES[@]}"; do
  IFS='|' read -r route_name route_path <<<"$route_entry"
  for width in "${WIDTHS[@]}"; do
    filename="$route_name-${width}x${VIEWPORT_HEIGHT}.png"
    install -m 0644 "$CAPTURE_DIR/$filename" "$CURRENT_DIR/$filename"
    if ! python3 "$COMPARE_SCRIPT" \
      --label "$route_path @ ${width}x${VIEWPORT_HEIGHT}" \
      --baseline "$BASELINE_DIR/$filename" \
      --current "$CURRENT_DIR/$filename" \
      --diff "$DIFF_DIR/$filename" \
      --pixel-delta "$PIXEL_DELTA" \
      --max-changed-ratio "$MAX_CHANGED_RATIO" \
      --max-channel-diff "$MAX_CHANNEL_DIFF"; then
      failures=$((failures + 1))
    fi
  done
done

if [[ "$failures" -ne 0 ]]; then
  echo "$failures visual snapshot(s) failed; inspect $CURRENT_DIR and $DIFF_DIR" >&2
  exit 1
fi

rm -f -- "$CURRENT_DIR"/*.png "$DIFF_DIR"/*.png
rmdir "$CURRENT_DIR" "$DIFF_DIR" 2>/dev/null || true
echo "All $SNAPSHOT_COUNT visual snapshots passed; no current captures or diffs were retained."
