#!/bin/bash
# Seeds the ISOLATED demo library for the website's "it compounds" pair
# (site/index.html #compounding). Writes ONLY to the verify-identifier data dir —
# never touches the real library.
#
# Two states of the SAME project, so the only variable in the screenshot pair is
# how deep the pile is:
#   ./seed-growth-demo.sh day1    → Job search holds 3 notes, all from this week
#   ./seed-growth-demo.sh week6   → Job search holds 21 notes spanning six weeks
#
# The sidebar is identical in both states on purpose: "day one" means day one of
# THIS project, not day one of using Spool. Dates are relative to today.
set -euo pipefail

STATE="${1:-}"
if [ "$STATE" != "day1" ] && [ "$STATE" != "week6" ]; then
  echo "usage: $0 day1|week6" >&2
  exit 2
fi

DIR="$HOME/Library/Application Support/com.oceanjin.spool.verify"
SCHEMA="$(cd "$(dirname "$0")/.." && pwd)/src/lib/db/schema.sql"

rm -rf "$DIR"
mkdir -p "$DIR"

cat > "$DIR/settings.json" <<'JSON'
{"mcpEnabled":false,"mcpWriteEnabled":false,"language":"en","autoExtractAttachments":true}
JSON

sqlite3 "$DIR/spool.db" < "$SCHEMA"

# ---- shared skeleton: same workspaces and same sidebar in both states ----
sqlite3 "$DIR/spool.db" <<'SQL'
PRAGMA user_version = 8;

INSERT INTO workspaces (id, title, sort_order, created_at, updated_at) VALUES
 ('GrowWsWork0000000001','Work',0,
  CAST(strftime('%s', date('now','localtime','-60 days') || ' 09:00:00','utc')*1000 AS INTEGER),
  CAST(strftime('%s', date('now','localtime') || ' 17:12:00','utc')*1000 AS INTEGER)),
 ('GrowWsStudy000000002','Study',1,
  CAST(strftime('%s', date('now','localtime','-50 days') || ' 09:00:00','utc')*1000 AS INTEGER),
  CAST(strftime('%s', date('now','localtime','-3 days') || ' 21:10:00','utc')*1000 AS INTEGER)),
 ('GrowWsLife0000000003','Life',2,
  CAST(strftime('%s', date('now','localtime','-45 days') || ' 09:00:00','utc')*1000 AS INTEGER),
  CAST(strftime('%s', date('now','localtime','-2 days') || ' 19:40:00','utc')*1000 AS INTEGER));

INSERT INTO threads (id, workspace_id, title, summary, summary_source, deadline, status, is_capture_target, created_at, updated_at) VALUES
 ('GrowThJob00000000001','GrowWsWork0000000001','Job search',
  'Acme application — resume summary first, then the cover letter.','user',
  CAST(strftime('%s', date('now','localtime','weekday 5') || ' 18:00:00','utc')*1000 AS INTEGER),
  'active',1,
  CAST(strftime('%s', date('now','localtime','-42 days') || ' 09:30:00','utc')*1000 AS INTEGER),
  CAST(strftime('%s', date('now','localtime') || ' 17:12:00','utc')*1000 AS INTEGER)),
 ('GrowThPortfolio00002','GrowWsWork0000000001','Portfolio site',NULL,NULL,NULL,'active',0,
  CAST(strftime('%s', date('now','localtime','-18 days') || ' 20:00:00','utc')*1000 AS INTEGER),
  CAST(strftime('%s', date('now','localtime','-6 days') || ' 22:15:00','utc')*1000 AS INTEGER)),
 ('GrowThInterview00003','GrowWsWork0000000001','Interview prep',NULL,NULL,NULL,'active',0,
  CAST(strftime('%s', date('now','localtime','-12 days') || ' 19:00:00','utc')*1000 AS INTEGER),
  CAST(strftime('%s', date('now','localtime','-4 days') || ' 20:05:00','utc')*1000 AS INTEGER)),
 ('GrowThCourse00000004','GrowWsStudy000000002','Machine learning course',NULL,NULL,
  CAST(strftime('%s', date('now','localtime','+9 days') || ' 23:59:00','utc')*1000 AS INTEGER),
  'active',0,
  CAST(strftime('%s', date('now','localtime','-30 days') || ' 10:00:00','utc')*1000 AS INTEGER),
  CAST(strftime('%s', date('now','localtime','-3 days') || ' 21:10:00','utc')*1000 AS INTEGER)),
 ('GrowThJapanese000005','GrowWsStudy000000002','Japanese practice',NULL,NULL,NULL,'active',0,
  CAST(strftime('%s', date('now','localtime','-40 days') || ' 22:00:00','utc')*1000 AS INTEGER),
  CAST(strftime('%s', date('now','localtime','-9 days') || ' 22:40:00','utc')*1000 AS INTEGER)),
 ('GrowThFlat0000000006','GrowWsLife0000000003','Apartment hunt',NULL,NULL,
  CAST(strftime('%s', date('now','localtime','+2 days') || ' 14:00:00','utc')*1000 AS INTEGER),
  'active',0,
  CAST(strftime('%s', date('now','localtime','-16 days') || ' 12:00:00','utc')*1000 AS INTEGER),
  CAST(strftime('%s', date('now','localtime','-2 days') || ' 19:40:00','utc')*1000 AS INTEGER)),
 ('GrowThRunning0000007','GrowWsLife0000000003','Half marathon',NULL,NULL,NULL,'active',0,
  CAST(strftime('%s', date('now','localtime','-35 days') || ' 07:00:00','utc')*1000 AS INTEGER),
  CAST(strftime('%s', date('now','localtime','-8 days') || ' 08:20:00','utc')*1000 AS INTEGER));

-- a little context in the other projects so the sidebar is not hollow
INSERT INTO blocks (id, thread_id, kind, content, annotation, source, pinned, created_at) VALUES
 ('GrowBkPort0000000001','GrowThPortfolio00002','text',
  'Three projects maximum. Cut everything else.',NULL,NULL,0,
  CAST(strftime('%s', date('now','localtime','-18 days') || ' 20:05:00','utc')*1000 AS INTEGER)),
 ('GrowBkIntv0000000001','GrowThInterview00003','text',
  'Practice the inventory dashboard story out loud — ninety seconds, no jargon.',NULL,NULL,0,
  CAST(strftime('%s', date('now','localtime','-12 days') || ' 19:10:00','utc')*1000 AS INTEGER)),
 ('GrowBkCour0000000001','GrowThCourse00000004','text',
  'Week 4 lab is the one that counts toward the grade.',NULL,NULL,0,
  CAST(strftime('%s', date('now','localtime','-30 days') || ' 10:05:00','utc')*1000 AS INTEGER)),
 ('GrowBkFlat0000000001','GrowThFlat0000000006','text',
  'Viewing booked for Saturday, 2pm. Bring the payslips.',NULL,'Mail',0,
  CAST(strftime('%s', date('now','localtime','-2 days') || ' 19:40:00','utc')*1000 AS INTEGER));
SQL

if [ "$STATE" = "day1" ]; then
  # ---- Day one of the project: three notes, one afternoon ----
  sqlite3 "$DIR/spool.db" <<'SQL'
UPDATE threads SET created_at =
  CAST(strftime('%s', date('now','localtime','-1 days') || ' 09:30:00','utc')*1000 AS INTEGER)
  WHERE id = 'GrowThJob00000000001';

INSERT INTO blocks (id, thread_id, kind, content, annotation, source, pinned, created_at) VALUES
 ('GrowBkJob00000000001','GrowThJob00000000001','text',
  'Goal: five strong applications by mid-November. Quality over quantity.',
  NULL,NULL,1,
  CAST(strftime('%s', date('now','localtime','-1 days') || ' 09:31:00','utc')*1000 AS INTEGER)),
 ('GrowBkJob00000000002','GrowThJob00000000001','text',
  'Acme is hiring a data analyst: SQL required, Python a plus. Small team, reports to the head of ops.',
  'Closest match so far.','acme.com · Safari',0,
  CAST(strftime('%s', date('now','localtime','-1 days') || ' 11:40:00','utc')*1000 AS INTEGER)),
 ('GrowBkJob00000000003','GrowThJob00000000001','text',
  'Order of work: rewrite the resume summary first, then the Acme cover letter.',
  NULL,NULL,0,
  CAST(strftime('%s', date('now','localtime') || ' 09:12:00','utc')*1000 AS INTEGER));
SQL
else
  # ---- Six weeks in: 21 notes. The three marked in the website copy are here —
  #      the option ruled out and why, a number given on the phone, a deadline
  #      buried in an email. Those are the ones nobody remembers unaided. ----
  sqlite3 "$DIR/spool.db" <<'SQL'
INSERT INTO blocks (id, thread_id, kind, content, annotation, source, pinned, created_at) VALUES
 ('GrowBkJob00000000001','GrowThJob00000000001','text',
  'Goal: five strong applications by mid-November. Quality over quantity.',
  NULL,NULL,1,
  CAST(strftime('%s', date('now','localtime','-42 days') || ' 09:31:00','utc')*1000 AS INTEGER)),
 ('GrowBkJob00000000002','GrowThJob00000000001','text',
  'Shortlist: analyst roles at Acme, Beacon, Corvid. Skip anything asking for five years.',
  NULL,NULL,0,
  CAST(strftime('%s', date('now','localtime','-41 days') || ' 10:20:00','utc')*1000 AS INTEGER)),
 ('GrowBkJob00000000003','GrowThJob00000000001','text',
  'Acme is hiring a data analyst: SQL required, Python a plus. Small team, reports to the head of ops.',
  'Closest match so far.','acme.com · Safari',0,
  CAST(strftime('%s', date('now','localtime','-38 days') || ' 11:40:00','utc')*1000 AS INTEGER)),
 ('GrowBkJob00000000004','GrowThJob00000000001','text',
  'Ruled out Beacon: the role is 80% reporting with no say in what gets measured. Same title, different job.',
  'Do not reopen this one in a weak week.',NULL,0,
  CAST(strftime('%s', date('now','localtime','-36 days') || ' 16:05:00','utc')*1000 AS INTEGER)),
 ('GrowBkJob00000000005','GrowThJob00000000001','text',
  'For a career switch, put a projects section above work history — recruiters spend about six seconds on the first screen.',
  'This decides the resume layout.','AI chat · Safari',1,
  CAST(strftime('%s', date('now','localtime','-34 days') || ' 14:05:00','utc')*1000 AS INTEGER)),
 ('GrowBkJob00000000006','GrowThJob00000000001','text',
  'Corvid application submitted. Portfolio link included.',
  NULL,NULL,0,
  CAST(strftime('%s', date('now','localtime','-31 days') || ' 18:30:00','utc')*1000 AS INTEGER)),
 ('GrowBkJob00000000007','GrowThJob00000000001','text',
  'Called Acme HR about the timeline. Reference number for my application: AC-4471-Q3. Ask for Dana.',
  'Written down because they said it once, quickly.','phone call',0,
  CAST(strftime('%s', date('now','localtime','-29 days') || ' 10:12:00','utc')*1000 AS INTEGER)),
 ('GrowBkJob00000000008','GrowThJob00000000001','text',
  'The dashboard project is the strongest thing I have. Lead with it, not with the internship.',
  NULL,NULL,0,
  CAST(strftime('%s', date('now','localtime','-27 days') || ' 21:15:00','utc')*1000 AS INTEGER)),
 ('GrowBkJob00000000009','GrowThJob00000000001','text',
  'Cover letters: one paragraph on why this team, one on the closest thing I have built, one on what I want to learn. No more.',
  NULL,'AI chat · Safari',0,
  CAST(strftime('%s', date('now','localtime','-25 days') || ' 12:40:00','utc')*1000 AS INTEGER)),
 ('GrowBkJob00000000010','GrowThJob00000000001','text',
  'Corvid rejection. Standard template, no reason given.',
  'Not worth rereading.','Mail',0,
  CAST(strftime('%s', date('now','localtime','-23 days') || ' 09:05:00','utc')*1000 AS INTEGER)),
 ('GrowBkJob00000000011','GrowThJob00000000001','text',
  'Rewrote the summary: what I do, the two tools, the one number. Three lines, no adjectives.',
  NULL,NULL,0,
  CAST(strftime('%s', date('now','localtime','-21 days') || ' 20:50:00','utc')*1000 AS INTEGER)),
 ('GrowBkJob00000000012','GrowThJob00000000001','text',
  'Acme uses a take-home task instead of a live coding round — SQL against a sample warehouse, two hours.',
  NULL,'glassdoor.com · Safari',0,
  CAST(strftime('%s', date('now','localtime','-19 days') || ' 13:20:00','utc')*1000 AS INTEGER)),
 ('GrowBkJob00000000013','GrowThJob00000000001','text',
  'Practice window functions before the take-home. That is the gap.',
  NULL,NULL,0,
  CAST(strftime('%s', date('now','localtime','-17 days') || ' 19:45:00','utc')*1000 AS INTEGER)),
 ('GrowBkJob00000000014','GrowThJob00000000001','text',
  'Referral: Mira worked with the Acme ops lead two jobs ago and offered to put my name in.',
  'Say yes before Friday.','Messages',0,
  CAST(strftime('%s', date('now','localtime','-14 days') || ' 08:30:00','utc')*1000 AS INTEGER)),
 ('GrowBkJob00000000015','GrowThJob00000000001','text',
  'Salary band for analysts in this city: 52–64k, higher end needs pipeline ownership.',
  NULL,'levels.fyi · Safari',0,
  CAST(strftime('%s', date('now','localtime','-12 days') || ' 22:10:00','utc')*1000 AS INTEGER)),
 ('GrowBkJob00000000016','GrowThJob00000000001','text',
  'Do not open with salary. If asked first, give the band and say the range depends on scope.',
  NULL,'AI chat · Safari',0,
  CAST(strftime('%s', date('now','localtime','-10 days') || ' 11:00:00','utc')*1000 AS INTEGER)),
 ('GrowBkJob00000000017','GrowThJob00000000001','text',
  'Take-home submitted. Kept the query readable instead of clever, explained the two assumptions at the top.',
  NULL,NULL,0,
  CAST(strftime('%s', date('now','localtime','-7 days') || ' 23:05:00','utc')*1000 AS INTEGER)),
 ('GrowBkJob00000000018','GrowThJob00000000001','text',
  'Buried at the bottom of the HR mail: applications for this batch close Friday 18:00, later ones roll to the next cycle.',
  'This is the actual deadline.','Mail',1,
  CAST(strftime('%s', date('now','localtime','-5 days') || ' 16:48:00','utc')*1000 AS INTEGER)),
 ('GrowBkJob00000000019','GrowThJob00000000001','text',
  'Interview questions to ask them: who decides what gets measured, and what happened to the last person in this seat.',
  NULL,NULL,0,
  CAST(strftime('%s', date('now','localtime','-3 days') || ' 20:25:00','utc')*1000 AS INTEGER)),
 ('GrowBkJob00000000020','GrowThJob00000000001','text',
  'Order of work: rewrite the resume summary first, then the Acme cover letter.',
  NULL,NULL,0,
  CAST(strftime('%s', date('now','localtime') || ' 00:30:00','utc')*1000 AS INTEGER)),
 ('GrowBkJob00000000021','GrowThJob00000000001','text',
  'Recruiter replied: they review applications in batches every two weeks, and the next batch closes Friday.',
  NULL,'Mail',0,
  CAST(strftime('%s', date('now','localtime') || ' 17:12:00','utc')*1000 AS INTEGER));
SQL
fi

COUNT=$(sqlite3 "$DIR/spool.db" "SELECT count(*) FROM blocks WHERE thread_id='GrowThJob00000000001'")
echo "seeded state=$STATE  Job search blocks=$COUNT  db=$DIR/spool.db"
