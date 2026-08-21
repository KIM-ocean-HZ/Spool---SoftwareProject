#!/bin/bash
# Installs a launchd agent that snapshots the download counts once a day.
#
#     bash scripts/metrics-install-daily.sh          # install / update
#     bash scripts/metrics-install-daily.sh remove   # uninstall
#
# Why launchd and not a GitHub Action: the counts only need saving, not
# publishing, and a scheduled Action would have to commit into this repo every
# day — 484 commits of real history buried under a year of bot noise, and a
# second name on the contributors page. launchd keeps the whole thing on this
# machine, where the dashboard is read anyway.
#
# StartCalendarInterval is the reason this survives a closed laptop: if the Mac
# was asleep at the appointed hour, launchd runs the job on the next wake rather
# than skipping the day. A day genuinely missed is not lost either — the GitHub
# counter is cumulative, so the next reading folds the gap in and the dashboard
# labels that bar with the span it covers.
#
# ⚠️ Why the script gets COPIED out of this repo instead of run where it sits.
# This checkout is under ~/Desktop, which macOS gates behind TCC. A launchd agent
# has no session to show a consent prompt in, so reading a script from ~/Desktop —
# or being handed a WorkingDirectory there — hangs the process forever inside
# getcwd(), with no error and no log line. Measured 2026-08-20 with three probes
# (docs/METRICS.md). Everything the agent touches therefore lives in the store dir.
set -euo pipefail

LABEL="org.spoolapp.metrics.daily"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STORE="${SPOOL_METRICS_DIR:-$HOME/Library/Application Support/spool-metrics}"

if [ "${1:-}" = "remove" ]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"
  echo "removed $LABEL"
  exit 0
fi

NODE_BIN="$(command -v node)"
[ -x "$NODE_BIN" ] || { echo "node not found on PATH" >&2; exit 1; }

mkdir -p "$HOME/Library/LaunchAgents" "$STORE"

# The agent runs this copy, never the one in the repo — see the note above.
cp "$REPO/scripts/metrics-snapshot.mjs" "$STORE/snapshot.mjs"

# launchd starts jobs with a bare PATH, so node's own directory is handed over
# explicitly. Nothing else is needed: the snapshot talks to the public GitHub API
# over plain HTTPS and never touches the keychain.
cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$STORE/snapshot.mjs</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$(dirname "$NODE_BIN"):/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>HOME</key><string>$HOME</string>
    <key>SPOOL_METRICS_DIR</key><string>$STORE</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>9</integer><key>Minute</key><integer>30</integer></dict>
  <key>StandardOutPath</key><string>$STORE/snapshot.log</string>
  <key>StandardErrorPath</key><string>$STORE/snapshot.log</string>
</dict>
</plist>
PLISTEOF

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

echo "installed $LABEL — runs daily at 09:30"
echo "store: $STORE  (log: $STORE/snapshot.log)"
echo "run it now:  launchctl kickstart gui/$(id -u)/$LABEL"
