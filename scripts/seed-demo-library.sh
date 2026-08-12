#!/bin/bash
# Seeds the ISOLATED demo library used for website screenshots
# (docs/MCP_SCREENSHOT_GUIDE.md). Writes ONLY to the verify-identifier data dir —
# never touches the real library. Re-runnable: wipes and rebuilds each time.
#
# Dates are relative to today, so the library always looks current no matter
# when it is seeded. Times are written in LOCAL time via SQLite's 'utc' modifier.
#
# Scenario spread is deliberate: the sidebar has to show that Spool is for any
# long-running project — a job hunt, a course, a language, a flat, training,
# cooking — not just one kind of user.
set -euo pipefail

DIR="$HOME/Library/Application Support/com.oceanjin.spool.verify"
SCHEMA="$(cd "$(dirname "$0")/.." && pwd)/src/lib/db/schema.sql"

rm -rf "$DIR"
mkdir -p "$DIR"

# captureShortcut is bound so this library can be driven WITHOUT Input Monitoring: a bound
# shortcut goes through RegisterEventHotKey, which needs no TCC grant, while double-tap ⌥
# needs one — and an isolated identifier has never been granted it. Granting it would mean a
# second "Spool" in the user's Input Monitoring list next to the real app's entry, which is
# their working setup and not worth risking for a screenshot. Format is this repo's own
# grammar (lib/capture/shortcut.ts), NOT Tauri's "CmdOrCtrl+Shift+K" — that spelling is
# silently ignored.
cat > "$DIR/settings.json" <<'JSON'
{"mcpEnabled":true,"mcpWriteEnabled":true,"language":"en","autoExtractAttachments":true,"captureShortcut":"meta+shift+KeyK"}
JSON

sqlite3 "$DIR/spool.db" < "$SCHEMA"

# The version is READ from client.ts, never typed here — a hard-coded number left behind
# by a schema bump makes the app walk migrations against a database that already has the
# new shape (2026-08-06: both demo seeds were still stamping 8 at schema v11).
SCHEMA_VERSION="$(sed -n 's/^const SCHEMA_VERSION = \([0-9]*\);.*/\1/p' "$(cd "$(dirname "$0")/.." && pwd)/src/lib/db/client.ts")"
[ -n "$SCHEMA_VERSION" ] || { echo "读不出 client.ts 的 SCHEMA_VERSION,停下" >&2; exit 1; }
sqlite3 "$DIR/spool.db" "PRAGMA user_version = $SCHEMA_VERSION;"

sqlite3 "$DIR/spool.db" <<'SQL'

-- ms-epoch for a local wall-clock time N days ago
-- CAST(strftime('%s', date('now','localtime','-N days') || ' HH:MM:00', 'utc')*1000 AS INTEGER)

INSERT INTO workspaces (id, title, sort_order, created_at, updated_at) VALUES
 ('DemoWsWork0000000001','Work',0,
  CAST(strftime('%s', date('now','localtime','-60 days') || ' 09:00:00','utc')*1000 AS INTEGER),
  CAST(strftime('%s', date('now','localtime') || ' 17:12:00','utc')*1000 AS INTEGER)),
 ('DemoWsStudy000000002','Study',1,
  CAST(strftime('%s', date('now','localtime','-50 days') || ' 09:00:00','utc')*1000 AS INTEGER),
  CAST(strftime('%s', date('now','localtime','-3 days') || ' 21:10:00','utc')*1000 AS INTEGER)),
 ('DemoWsLife0000000003','Life',2,
  CAST(strftime('%s', date('now','localtime','-45 days') || ' 09:00:00','utc')*1000 AS INTEGER),
  CAST(strftime('%s', date('now','localtime','-2 days') || ' 19:40:00','utc')*1000 AS INTEGER));

INSERT INTO threads (id, workspace_id, title, summary, summary_source, deadline, status, is_capture_target, created_at, updated_at) VALUES
 -- MAIN thread: the one used for the MCP screenshots
 -- is_capture_target moved OFF this row and onto the course below: the schema allows exactly
 -- one globally, and the home page's story is the course, so that is where a capture taken
 -- for SHOT S1 has to land.
 ('DemoThJob00000000001','DemoWsWork0000000001','Job search',
  'Acme application — resume summary first, then the cover letter.','user',
  CAST(strftime('%s', date('now','localtime','weekday 5') || ' 18:00:00','utc')*1000 AS INTEGER),
  'active',0,
  CAST(strftime('%s', date('now','localtime','-21 days') || ' 09:30:00','utc')*1000 AS INTEGER),
  CAST(strftime('%s', date('now','localtime') || ' 17:12:00','utc')*1000 AS INTEGER)),
 ('DemoThPortfolio00002','DemoWsWork0000000001','Portfolio site',NULL,NULL,NULL,'active',0,
  CAST(strftime('%s', date('now','localtime','-18 days') || ' 20:00:00','utc')*1000 AS INTEGER),
  CAST(strftime('%s', date('now','localtime','-6 days') || ' 22:15:00','utc')*1000 AS INTEGER)),
 ('DemoThInterview00003','DemoWsWork0000000001','Interview prep',NULL,NULL,NULL,'active',0,
  CAST(strftime('%s', date('now','localtime','-12 days') || ' 19:00:00','utc')*1000 AS INTEGER),
  CAST(strftime('%s', date('now','localtime','-4 days') || ' 20:05:00','utc')*1000 AS INTEGER)),
 -- is_capture_target = 1: exactly one row globally may carry it, and no seeded row used to,
 -- so capture in this library failed outright ("no capture-target thread set") — which made
 -- SHOT S1, the capture overlay, impossible to shoot. It is this project rather than Job
 -- search because the home page's story is the course (DESIGN_SITE_REBUILD §3 answer 2).
 ('DemoThCourse00000004','DemoWsStudy000000002','Machine learning course',NULL,NULL,
  CAST(strftime('%s', date('now','localtime','+9 days') || ' 23:59:00','utc')*1000 AS INTEGER),
  'active',1,
  CAST(strftime('%s', date('now','localtime','-30 days') || ' 10:00:00','utc')*1000 AS INTEGER),
  CAST(strftime('%s', date('now','localtime','-3 days') || ' 21:10:00','utc')*1000 AS INTEGER)),
 ('DemoThJapanese000005','DemoWsStudy000000002','Japanese practice',NULL,NULL,NULL,'active',0,
  CAST(strftime('%s', date('now','localtime','-40 days') || ' 22:00:00','utc')*1000 AS INTEGER),
  CAST(strftime('%s', date('now','localtime','-9 days') || ' 22:40:00','utc')*1000 AS INTEGER)),
 ('DemoThFlat0000000006','DemoWsLife0000000003','Apartment hunt',NULL,NULL,
  CAST(strftime('%s', date('now','localtime','+2 days') || ' 14:00:00','utc')*1000 AS INTEGER),
  'active',0,
  CAST(strftime('%s', date('now','localtime','-16 days') || ' 12:00:00','utc')*1000 AS INTEGER),
  CAST(strftime('%s', date('now','localtime','-2 days') || ' 19:40:00','utc')*1000 AS INTEGER)),
 ('DemoThRunning0000007','DemoWsLife0000000003','Half marathon',NULL,NULL,NULL,'active',0,
  CAST(strftime('%s', date('now','localtime','-35 days') || ' 07:00:00','utc')*1000 AS INTEGER),
  CAST(strftime('%s', date('now','localtime','-8 days') || ' 08:20:00','utc')*1000 AS INTEGER)),
 -- untouched for weeks → shows the automatic "dormant" state
 ('DemoThRecipes0000008','DemoWsLife0000000003','Recipes',NULL,NULL,NULL,'active',0,
  CAST(strftime('%s', date('now','localtime','-44 days') || ' 19:00:00','utc')*1000 AS INTEGER),
  CAST(strftime('%s', date('now','localtime','-26 days') || ' 19:05:00','utc')*1000 AS INTEGER));

INSERT INTO blocks (id, thread_id, kind, content, annotation, source, pinned, created_at) VALUES
 -- ===== Job search (main) =====
 ('DemoBkJob00000000001','DemoThJob00000000001','text',
  'Goal: five strong applications by mid-November. Quality over quantity.',
  NULL,NULL,1,
  CAST(strftime('%s', date('now','localtime','-21 days') || ' 09:31:00','utc')*1000 AS INTEGER)),
 ('DemoBkJob00000000002','DemoThJob00000000001','text',
  'Acme is hiring a data analyst: SQL required, Python a plus. Small team, reports to the head of ops.',
  'Closest match so far.','acme.com · Safari',0,
  CAST(strftime('%s', date('now','localtime','-15 days') || ' 11:40:00','utc')*1000 AS INTEGER)),
 ('DemoBkJob00000000003','DemoThJob00000000001','text',
  'For a career switch, put a projects section above work history — recruiters spend about six seconds on the first screen.',
  'This decides the resume layout.','AI chat · Safari',1,
  CAST(strftime('%s', date('now','localtime','-8 days') || ' 14:05:00','utc')*1000 AS INTEGER)),
 ('DemoBkJob00000000004','DemoThJob00000000001','text',
  'Order of work: rewrite the resume summary first, then the Acme cover letter.',
  NULL,NULL,0,
  CAST(strftime('%s', date('now','localtime') || ' 00:30:00','utc')*1000 AS INTEGER)),
 ('DemoBkJob00000000005','DemoThJob00000000001','text',
  'Recruiter replied: they review applications in batches every two weeks, and the next batch closes Friday.',
  NULL,'Mail',0,
  CAST(strftime('%s', date('now','localtime') || ' 17:12:00','utc')*1000 AS INTEGER)),

 -- ===== Portfolio site =====
 ('DemoBkPort0000000001','DemoThPortfolio00002','text',
  'Three projects maximum. Cut everything else.',
  NULL,NULL,0,
  CAST(strftime('%s', date('now','localtime','-18 days') || ' 20:05:00','utc')*1000 AS INTEGER)),
 ('DemoBkPort0000000002','DemoThPortfolio00002','text',
  'A case study reads best in three parts: the problem, what I did, what changed. One number per project.',
  'Use this as the template for all three.','Safari',0,
  CAST(strftime('%s', date('now','localtime','-6 days') || ' 22:15:00','utc')*1000 AS INTEGER)),
 -- Dated TODAY on purpose. The sidebar's value panel only draws its 「今天」 line when
 -- something was captured today (首日价值二期 §3), and SHOT S2 has to show that line —
 -- otherwise whoever takes the screenshot has to capture two or three things by hand first,
 -- which on a fresh verify identifier means granting Input Monitoring to a new bundle id
 -- just to make a panel appear. Kept out of the Machine learning course on purpose: the pack
 -- excerpt published on the home page is rendered from that project, so its rows must not
 -- move without re-rendering the page.
 ('DemoBkPort0000000003','DemoThPortfolio00002','text',
  'Case studies that open with the outcome get read; the ones that open with the brief do not.',
  NULL,'Safari',0,
  CAST(strftime('%s', date('now','localtime') || ' 09:40:00','utc')*1000 AS INTEGER)),

 -- ===== Interview prep =====
 ('DemoBkIntv0000000001','DemoThInterview00003','text',
  'Practice the inventory dashboard story out loud — ninety seconds, no jargon.',
  NULL,NULL,0,
  CAST(strftime('%s', date('now','localtime','-12 days') || ' 19:10:00','utc')*1000 AS INTEGER)),
 ('DemoBkIntv0000000002','DemoThInterview00003','text',
  'Prepare three stories that each show a different strength, then reuse them across questions.',
  NULL,'AI chat · Safari',0,
  CAST(strftime('%s', date('now','localtime','-4 days') || ' 20:05:00','utc')*1000 AS INTEGER)),
 ('DemoBkIntv0000000003','DemoThInterview00003','text',
  'They ask "tell me about a failure" to hear what you changed afterwards, not what went wrong.',
  'Use the dashboard rollback for this one.','AI chat · Safari',0,
  CAST(strftime('%s', date('now','localtime') || ' 11:05:00','utc')*1000 AS INTEGER)),

 -- ===== Japanese practice =====
 ('DemoBkJpn00000000001','DemoThJapanese000005','text',
  '〜てしまう can mean finishing something completely, or regret that it happened. Context decides which.',
  NULL,'Safari',0,
  CAST(strftime('%s', date('now','localtime','-20 days') || ' 22:10:00','utc')*1000 AS INTEGER)),
 ('DemoBkJpn00000000002','DemoThJapanese000005','text',
  'Twenty minutes of listening before bed works better for me than an hour on the weekend.',
  NULL,NULL,0,
  CAST(strftime('%s', date('now','localtime','-9 days') || ' 22:40:00','utc')*1000 AS INTEGER)),

 -- ===== Apartment hunt =====
 ('DemoBkFlat0000000001','DemoThFlat0000000006','text',
  'Under 1,800 a month, walking distance to the train, not on the ground floor.',
  NULL,NULL,1,
  CAST(strftime('%s', date('now','localtime','-16 days') || ' 12:05:00','utc')*1000 AS INTEGER)),
 ('DemoBkFlat0000000002','DemoThFlat0000000006','text',
  'Landlord: viewing on Saturday at 2pm, bring ID and proof of income.',
  NULL,'Mail',0,
  CAST(strftime('%s', date('now','localtime','-2 days') || ' 19:40:00','utc')*1000 AS INTEGER)),

 -- ===== Half marathon =====
 ('DemoBkRun00000000001','DemoThRunning0000007','text',
  'Add no more than ten percent distance per week, or the injury risk climbs sharply.',
  NULL,'Safari',0,
  CAST(strftime('%s', date('now','localtime','-25 days') || ' 07:30:00','utc')*1000 AS INTEGER)),
 ('DemoBkRun00000000002','DemoThRunning0000007','text',
  'Long run moved to Sunday mornings — Saturdays never actually happen.',
  NULL,NULL,0,
  CAST(strftime('%s', date('now','localtime','-8 days') || ' 08:20:00','utc')*1000 AS INTEGER)),

 -- ===== Recipes (dormant) =====
 ('DemoBkRec00000000001','DemoThRecipes0000008','text',
  'Dry-brine the chicken overnight; one percent salt by weight.',
  NULL,'Serious Eats · Safari',0,
  CAST(strftime('%s', date('now','localtime','-26 days') || ' 19:05:00','utc')*1000 AS INTEGER));

-- ===== Machine learning course =====
-- Its own INSERT because it needs four columns the rest do not: `annotation_by`, and the
-- citation trio on the AI-written block. This is the project the website's demo walks
-- through (DESIGN_SITE_REBUILD §3 answer 2: 一门课), and the one the pack excerpt on the
-- home page is rendered from — so the four authority bands all have to be present in it:
-- an institutional source, another AI's synthesis, the user's own sourceless decision, and
-- a block an AI filed back. Before this the project held two plain blocks and the library
-- had no MCP-written block at all, which made SHOT S7 unshootable.
INSERT INTO blocks
  (id, thread_id, kind, content, annotation, annotation_by, source, pinned,
   ref_block_id, ref_kind, created_at) VALUES
 ('DemoBkCrs00000000001','DemoThCourse00000004','text',
  'Week 6 is about overfitting. The homework wants a validation curve, not just an accuracy number.',
  NULL,NULL,'course.edu · Safari',0,NULL,NULL,
  CAST(strftime('%s', date('now','localtime','-14 days') || ' 10:20:00','utc')*1000 AS INTEGER)),
 ('DemoBkCrs00000000002','DemoThCourse00000004','text',
  'A model that does well on the data it was trained on and badly on new data has overfitted. A bigger model is not the fix.',
  'This is the part I never followed in class.','user','Lecture 7 slides · Safari',0,NULL,NULL,
  CAST(strftime('%s', date('now','localtime','-10 days') || ' 11:40:00','utc')*1000 AS INTEGER)),
 ('DemoBkCrs00000000003','DemoThCourse00000004','text',
  'Regularisation is a fee charged for complexity: the model can still bend to the data, but every extra bend costs it something, so it keeps only the ones that pay for themselves.',
  NULL,NULL,'AI chat · Safari',0,NULL,NULL,
  CAST(strftime('%s', date('now','localtime','-10 days') || ' 14:05:00','utc')*1000 AS INTEGER)),
 ('DemoBkCrs00000000004','DemoThCourse00000004','text',
  'Revision plan: redo problem set 3 with the fee idea in hand, then watch lecture 8.',
  NULL,NULL,NULL,0,NULL,NULL,
  CAST(strftime('%s', date('now','localtime','-9 days') || ' 16:30:00','utc')*1000 AS INTEGER)),
 ('DemoBkCrs00000000005','DemoThCourse00000004','text',
  'Before Friday: problem set 3 question 2 is the overfitting one — that is the question the quiz will rhyme with. Do it with the fee idea, not with a bigger model.',
  NULL,NULL,'Claude · MCP',0,'DemoBkCrs00000000004','cites',
  CAST(strftime('%s', date('now','localtime','-9 days') || ' 16:42:00','utc')*1000 AS INTEGER));

-- `seq` is the number a human says out loud ("#12") and the circle drawn on every block in
-- the UI. The app assigns it as MAX(seq)+1 per thread inside the INSERT; seeding rows
-- straight into SQLite bypasses that, so every demo block used to carry seq = NULL — a
-- state real usage cannot produce (schema.sql: NULL only on rows predating v9's backfill).
-- The visible cost was that no screenshot of this library could show the numbered circles.
-- Numbered per thread in capture order, which is what the app's counter produces.
UPDATE blocks SET seq = (
  SELECT COUNT(*) FROM blocks AS earlier
   WHERE earlier.thread_id = blocks.thread_id
     AND earlier.created_at <= blocks.created_at
);
SQL

echo "seeded: $DIR"
sqlite3 "$DIR/spool.db" "SELECT 'workspaces=' || (SELECT COUNT(*) FROM workspaces), 'threads=' || (SELECT COUNT(*) FROM threads), 'blocks=' || (SELECT COUNT(*) FROM blocks);"
sqlite3 "$DIR/spool.db" "SELECT title, datetime(deadline/1000,'unixepoch','localtime') AS deadline FROM threads WHERE deadline IS NOT NULL;"
