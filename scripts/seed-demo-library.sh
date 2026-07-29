#!/bin/bash
# Seeds the ISOLATED demo library for MCP screenshots (docs/MCP_SCREENSHOT_GUIDE.md).
# Writes ONLY to the verify-identifier data dir — never touches the real library.
# Re-runnable: wipes and rebuilds the demo dir each time.
set -euo pipefail

DIR="$HOME/Library/Application Support/com.oceanjin.spool.verify"
SCHEMA="$(cd "$(dirname "$0")/.." && pwd)/src/lib/db/schema.sql"

rm -rf "$DIR"
mkdir -p "$DIR"

# Settings: MCP on, writes on, English UI (site screenshots are EN).
cat > "$DIR/settings.json" <<'JSON'
{"mcpEnabled":true,"mcpWriteEnabled":true,"language":"en","autoExtractAttachments":true}
JSON

sqlite3 "$DIR/spool.db" < "$SCHEMA"

sqlite3 "$DIR/spool.db" <<'SQL'
PRAGMA user_version = 8;

-- ms-epoch helper pattern: CAST(strftime('%s','date')*1000 AS INTEGER)
INSERT INTO workspaces (id, title, sort_order, created_at, updated_at) VALUES
 ('DemoWsResearch0000001','Research',0,CAST(strftime('%s','2026-06-15 09:00:00')*1000 AS INTEGER),CAST(strftime('%s','2026-07-29 09:12:00')*1000 AS INTEGER)),
 ('DemoWsLife00000000002','Life',1,CAST(strftime('%s','2026-06-20 09:00:00')*1000 AS INTEGER),CAST(strftime('%s','2026-07-12 19:00:00')*1000 AS INTEGER));

INSERT INTO threads (id, workspace_id, title, summary, summary_source, deadline, status, is_capture_target, created_at, updated_at) VALUES
 ('DemoThSched0000000001','DemoWsResearch0000001','Distributed scheduling paper',
  'Revising §3.2 — reversibility argument in, comparison table next.','user',
  CAST(strftime('%s','2026-07-31 10:00:00')*1000 AS INTEGER),'active',1,
  CAST(strftime('%s','2026-07-08 09:30:00')*1000 AS INTEGER),CAST(strftime('%s','2026-07-29 09:12:00')*1000 AS INTEGER)),
 ('DemoThRust00000000002','DemoWsResearch0000001','Rust study notes',NULL,NULL,NULL,'active',0,
  CAST(strftime('%s','2026-07-18 20:00:00')*1000 AS INTEGER),CAST(strftime('%s','2026-07-25 21:40:00')*1000 AS INTEGER)),
 ('DemoThReport000000003','DemoWsResearch0000001','Course report',NULL,NULL,NULL,'active',0,
  CAST(strftime('%s','2026-07-20 15:00:00')*1000 AS INTEGER),CAST(strftime('%s','2026-07-20 15:00:00')*1000 AS INTEGER)),
 ('DemoThRecipes00000004','DemoWsLife00000000002','Recipes',NULL,NULL,NULL,'active',0,
  CAST(strftime('%s','2026-07-12 19:00:00')*1000 AS INTEGER),CAST(strftime('%s','2026-07-12 19:00:00')*1000 AS INTEGER));

INSERT INTO blocks (id, thread_id, kind, content, annotation, source, pinned, created_at) VALUES
 ('DemoBk000000000000001','DemoThSched0000000001','text',
  'Target: submit the revision by Aug 15. Reviewer 2''s main objection is truncation.',
  NULL,NULL,1,CAST(strftime('%s','2026-07-08 09:31:00')*1000 AS INTEGER)),
 ('DemoBk000000000000002','DemoThSched0000000001','text',
  'Chapter 4 classifies straggler mitigation as speculative, proactive, or hybrid — orthogonal to our incremental/deadline split.',
  'Cite as contrast in related work.','arXiv · Safari',0,CAST(strftime('%s','2026-07-14 11:40:00')*1000 AS INTEGER)),
 ('DemoBk000000000000003','DemoThSched0000000001','text',
  'Incremental evaluation doesn''t require divisibility — only locally O(1) reversible updates. Sums qualify; products too, via the log domain.',
  'This is the skeleton sentence for §3.2.','AI chat · Safari',1,CAST(strftime('%s','2026-07-21 14:05:00')*1000 AS INTEGER)),
 ('DemoBk000000000000004','DemoThSched0000000001','text',
  'Revision order: fix the formula numbering in §3.2 first, then add the straggler comparison table.',
  NULL,NULL,0,CAST(strftime('%s','2026-07-28 16:30:00')*1000 AS INTEGER)),
 ('DemoBk000000000000005','DemoThSched0000000001','text',
  'Committee notes: the revised §3.2 argument resolves the truncation question; one more pass on notation.',
  NULL,'Mail',0,CAST(strftime('%s','2026-07-29 09:12:00')*1000 AS INTEGER)),
 ('DemoBk000000000000006','DemoThRust00000000002','text',
  'Interior mutability: RefCell moves borrow checking to runtime — panics on violation instead of failing to compile.',
  NULL,'The Rust Book · Safari',0,CAST(strftime('%s','2026-07-18 20:10:00')*1000 AS INTEGER)),
 ('DemoBk000000000000007','DemoThRust00000000002','text',
  'Try rewriting the parser with nom before deciding on a hand-rolled one.',
  NULL,NULL,0,CAST(strftime('%s','2026-07-25 21:40:00')*1000 AS INTEGER)),
 ('DemoBk000000000000008','DemoThReport000000003','text',
  'Outline due next week — three sections: motivation, method, evaluation.',
  NULL,NULL,0,CAST(strftime('%s','2026-07-20 15:05:00')*1000 AS INTEGER)),
 ('DemoBk000000000000009','DemoThRecipes00000004','text',
  'Dry-brine the chicken overnight; 1% salt by weight.',
  NULL,'Serious Eats · Safari',0,CAST(strftime('%s','2026-07-12 19:05:00')*1000 AS INTEGER));
SQL

echo "seeded: $DIR"
sqlite3 "$DIR/spool.db" "SELECT (SELECT COUNT(*) FROM workspaces), (SELECT COUNT(*) FROM threads), (SELECT COUNT(*) FROM blocks), (SELECT COUNT(*) FROM blocks_fts);"
