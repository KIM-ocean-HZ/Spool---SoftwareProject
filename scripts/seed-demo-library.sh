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

cat > "$DIR/settings.json" <<'JSON'
{"mcpEnabled":true,"mcpWriteEnabled":true,"language":"en","autoExtractAttachments":true}
JSON

sqlite3 "$DIR/spool.db" < "$SCHEMA"

sqlite3 "$DIR/spool.db" <<'SQL'
PRAGMA user_version = 8;

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
 ('DemoThJob00000000001','DemoWsWork0000000001','Job search',
  'Acme application — resume summary first, then the cover letter.','user',
  CAST(strftime('%s', date('now','localtime','weekday 5') || ' 18:00:00','utc')*1000 AS INTEGER),
  'active',1,
  CAST(strftime('%s', date('now','localtime','-21 days') || ' 09:30:00','utc')*1000 AS INTEGER),
  CAST(strftime('%s', date('now','localtime') || ' 17:12:00','utc')*1000 AS INTEGER)),
 ('DemoThPortfolio00002','DemoWsWork0000000001','Portfolio site',NULL,NULL,NULL,'active',0,
  CAST(strftime('%s', date('now','localtime','-18 days') || ' 20:00:00','utc')*1000 AS INTEGER),
  CAST(strftime('%s', date('now','localtime','-6 days') || ' 22:15:00','utc')*1000 AS INTEGER)),
 ('DemoThInterview00003','DemoWsWork0000000001','Interview prep',NULL,NULL,NULL,'active',0,
  CAST(strftime('%s', date('now','localtime','-12 days') || ' 19:00:00','utc')*1000 AS INTEGER),
  CAST(strftime('%s', date('now','localtime','-4 days') || ' 20:05:00','utc')*1000 AS INTEGER)),
 ('DemoThCourse00000004','DemoWsStudy000000002','Machine learning course',NULL,NULL,
  CAST(strftime('%s', date('now','localtime','+9 days') || ' 23:59:00','utc')*1000 AS INTEGER),
  'active',0,
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

 -- ===== Interview prep =====
 ('DemoBkIntv0000000001','DemoThInterview00003','text',
  'Practice the inventory dashboard story out loud — ninety seconds, no jargon.',
  NULL,NULL,0,
  CAST(strftime('%s', date('now','localtime','-12 days') || ' 19:10:00','utc')*1000 AS INTEGER)),
 ('DemoBkIntv0000000002','DemoThInterview00003','text',
  'Prepare three stories that each show a different strength, then reuse them across questions.',
  NULL,'AI chat · Safari',0,
  CAST(strftime('%s', date('now','localtime','-4 days') || ' 20:05:00','utc')*1000 AS INTEGER)),

 -- ===== Machine learning course =====
 ('DemoBkCrs00000000001','DemoThCourse00000004','text',
  'Week 6 is about overfitting. The homework wants a validation curve, not just an accuracy number.',
  NULL,'course.edu · Safari',0,
  CAST(strftime('%s', date('now','localtime','-10 days') || ' 10:20:00','utc')*1000 AS INTEGER)),
 ('DemoBkCrs00000000002','DemoThCourse00000004','text',
  'Ask in office hours: when is a validation split enough, and when do I need a separate test set?',
  NULL,NULL,0,
  CAST(strftime('%s', date('now','localtime','-3 days') || ' 21:10:00','utc')*1000 AS INTEGER)),

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
SQL

echo "seeded: $DIR"
sqlite3 "$DIR/spool.db" "SELECT 'workspaces=' || (SELECT COUNT(*) FROM workspaces), 'threads=' || (SELECT COUNT(*) FROM threads), 'blocks=' || (SELECT COUNT(*) FROM blocks);"
sqlite3 "$DIR/spool.db" "SELECT title, datetime(deadline/1000,'unixepoch','localtime') AS deadline FROM threads WHERE deadline IS NOT NULL;"
