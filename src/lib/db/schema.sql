-- Spool data model (PLAN_EN.md §8.1). Three tiers: Workspace → Thread → Block.

-- Workspace: big topic. The thinnest tier — just a grouping container.
-- v23 (DESIGN_WORKSPACE_PACK §4): a workspace may sit inside another one. `parent_id` is
-- NULL for a top-level workspace and holds another workspace's id otherwise. No foreign
-- key on purpose — deletes here are soft (deleted_at), so the row a child points at is
-- still present; orphan handling lives in lib/db/workspaces.ts, not in the engine.
CREATE TABLE IF NOT EXISTS workspaces (
  id          TEXT PRIMARY KEY,            -- nanoid
  title       TEXT NOT NULL DEFAULT '',
  parent_id   TEXT,                        -- NULL = top level; else the enclosing workspace
  sort_order  INTEGER NOT NULL DEFAULT 0,  -- manual sidebar ordering
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted_at  INTEGER
);

-- Thread: small project.
-- v2.6 rollback: dropped `progress` (manual % theater) and `next_step` (manual note that
-- failed dogfooding) — see §2.6. Schema migrates via ALTER TABLE DROP COLUMN (SQLite 3.35+).
CREATE TABLE IF NOT EXISTS threads (
  id                 TEXT PRIMARY KEY,
  workspace_id       TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title              TEXT NOT NULL DEFAULT '',
  summary            TEXT,                        -- active-stage status summary (optional)
  summary_source     TEXT,                        -- 'user' | 'mcp' | NULL; MCP never overwrites a non-'mcp' summary
  -- v16 (§5-5, Ocean 2026-08-08): when the summary above was last written, ms epoch.
  -- ⚠️ Deliberately NOT shown in the UI — Ocean asked for it recorded, not displayed. It
  -- exists so "is this card stale?" stops being a guess. NULL = written before v16.
  summary_at         INTEGER,
  digest             TEXT,                        -- conclusion summary at completion (optional, may be empty)
  deadline           INTEGER,                     -- optional, ms epoch
  status             TEXT NOT NULL DEFAULT 'active', -- active | parked | done
  is_capture_target  INTEGER NOT NULL DEFAULT 0,  -- exactly one row globally may be 1
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL,
  completed_at       INTEGER,                     -- time status became done
  deleted_at         INTEGER,
  -- v11 (DESIGN_FOLLOW_UP §3.2): what this project wants watched on the open web, and
  -- what the last run already saw. NULL brief = follow-up is off for this project, which
  -- is why there is no separate on/off column.
  --
  -- ⚠️ v22 (DESIGN_FOLLOW_UP §8.2, Ocean 2026-08-16「合成一份清单」): `follow_up_brief` is
  -- a LEGACY column. What a project follows up now lives one row per line in
  -- `follow_up_items`, because the list holds two kinds of line with different lifetimes
  -- and only rows can be pointed at individually. The v22 migration copied every line
  -- across; nothing reads this column any more.
  -- ⚠️⚠️ It is kept, not dropped, and so are the three `follow_up_brief_suggested*`
  -- columns below: dropping a column in SQLite rebuilds the whole table, and a rebuild
  -- branch is what emptied the live library on 2026-05-29. An unread column costs nothing.
  follow_up_brief    TEXT,
  follow_up_state    TEXT,                        -- JSON: last run time + URLs/fingerprints already proposed
  -- v12 (DESIGN_WORKBENCH §4.3): per-project opt-out for automatic maintenance.
  -- NULL = follow the master switch; 0 = never touch this project automatically.
  -- Deliberately not a boolean defaulting to 1: "the user has not said" and "the user said
  -- yes" are different states, and only the first should follow a switch flipped later.
  auto_maintain      INTEGER,
  -- v19 (决定 5, HANDOFF §4-1): an AI's proposed rewrite of `follow_up_brief`, parked until
  -- the user reads it. It is NEVER written into `follow_up_brief` by the tool.
  --
  -- ⚠️ This column exists because the brief is not content — it is the standing instruction
  -- Spool goes out to the open web with. A page a follow-up run fetched could otherwise
  -- rewrite what the next run goes looking for (web page → brief → next search), which is
  -- exactly the injection-to-privilege chain DESIGN_FOLLOW_UP §2.5 draws. Parking the
  -- suggestion here keeps the human step §6-2 拍板 in place: the user reads it on the review
  -- screen, and only their click moves it across.
  follow_up_brief_suggested    TEXT,
  follow_up_brief_suggested_by TEXT,     -- the client that proposed it, for the review card
  follow_up_brief_suggested_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_threads_workspace
  ON threads(workspace_id, updated_at DESC) WHERE deleted_at IS NULL;

-- v22 (DESIGN_FOLLOW_UP §8.7) — one row per line of what a project follows up.
-- One list, as Ocean decided on 2026-08-16, holding two kinds of line:
--
--   standing = 1  a watch that never completes ("has the deadline moved"). An AI may NOT
--                 close it — it can only propose retiring it, which the user settles.
--   standing = 0  a question that retires the moment it is answered.
--
-- ⚠️ The marker is what keeps merging the two into one list safe (§8.2): without it, an AI
-- that answers "the deadline is March 1" closes the standing watch as well, and the project
-- silently stops being watched — the one thing this feature exists to do.
CREATE TABLE IF NOT EXISTS follow_up_items (
  id              TEXT PRIMARY KEY,
  thread_id       TEXT NOT NULL,
  text            TEXT NOT NULL,             -- one line: the thing watched, or the open question
  why             TEXT,                      -- one line: why it matters here (AI-proposed rows)
  standing        INTEGER NOT NULL DEFAULT 0,
  -- Identity for the duplicate check, computed on BOTH sides (followUpFingerprint in
  -- lib/engine/followUp.ts, follow_up_fingerprint in mcp.rs): lowercase + collapsed
  -- whitespace, kept that simple precisely so the two agree exactly.
  fingerprint     TEXT NOT NULL,
  -- 'proposed' → waiting on the review screen (§8.4: an AI may never file one directly,
  -- because a line here outlives this conversation and steers the next one's searches)
  -- 'open'     → live
  -- 'answered' → retired but still visible and reopenable (§8.6: closing is not deleting)
  -- A rejected proposal leaves no row at all — same rule as a rejected block proposal.
  status          TEXT NOT NULL,
  proposed_by     TEXT,                      -- the client that proposed it, for the review card
  sort_order      INTEGER NOT NULL,
  created_at      INTEGER NOT NULL,
  approved_at     INTEGER,
  last_raised_at  INTEGER,                   -- §8.5: so the same line is not raised twice a day
  answered_at     INTEGER,
  answer_block_id TEXT,                      -- the block that answered it; NULL is legitimate
  outcome         TEXT                       -- one line: what the answer was ("nothing changed")
);

CREATE INDEX IF NOT EXISTS idx_follow_up_items_thread
  ON follow_up_items(thread_id, status, sort_order);

-- Block: a captured fragment, a handwritten draft, or an @-reference.
-- A file/folder/URL becomes an attachment on a block (see §9.6) — there is no anchor kind.
CREATE TABLE IF NOT EXISTS blocks (
  id            TEXT PRIMARY KEY,
  thread_id     TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL DEFAULT 'text',  -- text | ref
  content       TEXT NOT NULL DEFAULT '',       -- the block's main text (captured or written) / ref display name
  annotation    TEXT,                           -- the user's own note about this block (optional)
  ref_thread_id TEXT,                           -- kind=ref: the thread pointed to
  ref_block_id  TEXT,                           -- v7 (§20.13 v2.4 D2): block-level citation, declared by the writer at insert; unenforced FK (cited block may be deleted later)
  source        TEXT,                           -- provenance label; auto-filled at capture, user-editable
  pinned        INTEGER NOT NULL DEFAULT 0,      -- marked as core context
  seq           INTEGER,                        -- v9: the block's human-visible number within its thread (#12); see below
  created_at    INTEGER NOT NULL,
  -- v13 (DESIGN_CONTEXT_HYGIENE §3.1): supersession — the one memory-governance strategy
  -- Spool did not have. Age, recency and salience were all covered; nothing recorded that a
  -- block had stopped being TRUE, so a conclusion overturned three weeks ago still read as
  -- current to every AI the pack was handed to.
  --
  -- `stale_at` is Zep/Graphiti's `invalid_at`, not an invention: when the user said this no
  -- longer holds. NULL = still valid. The block itself is never edited and never deleted —
  -- TOKI's distinction, which this column exists to honour: superseding keeps the evidence
  -- of how a belief changed, deleting erases the history. A stale block stays searchable,
  -- stays readable through get_blocks, and simply stops being served as current in packs.
  --
  -- ⚠️ Only the user writes it. AI may not declare supersession (§3.1 «谁能用»): whether a
  -- conclusion still holds is information only the user has, and a wrong guess deletes a
  -- correct conclusion from every future pack — far worse than one more noisy block.
  stale_at      INTEGER,
  -- v13: what the existing `ref_block_id` MEANS. NULL / 'cites' is every row written before
  -- v13 and every citation since — unchanged behaviour. 'supersedes' = this block replaces
  -- that one wholesale (the old one carries stale_at too). 'corrects' = one point inside
  -- that block is wrong; the old block is NOT touched and keeps rendering in full, which is
  -- the §3.1.1 answer to «替代信息大多是大段文字里的一句话» — correcting a sentence must not
  -- cost a re-paste of the other 1,900 characters.
  ref_kind      TEXT,
  -- v14 (DESIGN_CONTEXT_HYGIENE §9.3 拍板乙): WHO wrote `annotation`. The pack's Notation
  -- section tells every receiving AI that `note:` is the user's own words and to weigh it as
  -- 💭 Personal even on a 📖 Reference block — and `add_block` / `propose_blocks` both let an
  -- AI supply `annotation`. So an AI-written sentence could take the highest authority the
  -- pack has, and after W7 (§3.2, annotation-as-title) it could take the block's NAME too.
  -- Nothing recorded the difference, because before MCP could write there was none.
  --
  -- NULL = unknown: every row written before v14. Readers fall back to the block's `source`
  -- for those (an MCP-labelled block's note was written by that client) — the same proxy the
  -- cheap version of this fix would have used everywhere, but confined to rows that predate
  -- the column. 'user' / 'ai' are explicit and always win over the proxy.
  --
  -- ⚠️ The proxy is why this is not a backfill: the migration writes no user data at all
  -- (2026-05-29 wipe class), and the first time the user edits any note the row self-heals
  -- to an explicit 'user' — which is exactly the case the proxy gets wrong.
  annotation_by TEXT,
  -- v20 (DESIGN_MCP_INTENT_ROUTING §4.6, Ocean 拍板乙 2026-08-09): where a block came from
  -- OUTSIDE the library, and whether it has gone off.
  --
  -- `source` already carries a provenance LABEL, but it is one line rendered inside every
  -- block bracket on every surface, so a URL in it pushes the reader's eye off the body —
  -- and it says nothing about time. A block written from a program's admissions page is
  -- true on the day it is read and quietly false a year later; nothing in Spool could tell
  -- those two apart, which is the same disease v13 treated for conclusions the user
  -- retired by hand, one step upstream.
  --
  -- All three are NULL on every row written before v20 and on every row the user writes by
  -- hand — the UI has no input for them and deliberately does not get one (§4.6: their user
  -- is the model that went and looked something up; an input box would tax the main path
  -- for a case it never hits). Only add_block and propose_blocks fill them in.
  --
  -- ⚠️ `retrieved_at` / `recheck_after` are DATES, stored as UTC midnight in unix ms. They
  -- are not moments — "查于 2026-08-09" means the day, and a day rendered through the
  -- machine's local zone would read as a different day either side of the date line. Every
  -- other timestamp here IS a moment (created_at, stale_at) and stays local-rendered; these
  -- two are formatted by format_utc_date / formatUtcDate, which is what makes them
  -- round-trip to the same characters the caller sent.
  source_url    TEXT,
  retrieved_at  INTEGER,
  recheck_after INTEGER,
  -- v21 (Ocean 2026-08-10, after §7 sentence 5 ran on ChatGPT): the sentence in the CITED
  -- block that this block corrects — quoted verbatim from it, by whoever wrote the
  -- correction. Meaningful only on a row whose ref_kind is 'corrects'.
  --
  -- v13 gave a correction a target (`ref_block_id`) but no aim. Ocean read the result in
  -- the real library: 「展开也不知道到底是哪里被修改了」— a 1,900-character block flagged as
  -- containing one wrong point, and no way to find which. The §3.1.1 bargain (correcting a
  -- sentence must not cost a re-paste of the other 1,900 characters) is what makes that
  -- unavoidable without this column: the correction never contains the old text.
  --
  -- Stored as the quote and matched by substring at render time rather than as offsets.
  -- Offsets would be a lie the moment the user edits the cited block by one character,
  -- and they would be a lie SILENTLY — pointing at the wrong words is worse than pointing
  -- at none. A quote that no longer matches simply stops being drawn, and the block-level
  -- 「one point in this block was corrected later」 warning stands on its own.
  --
  -- NULL on every pre-v21 row, every hand-written correction (SupersedePicker has no input
  -- for it and does not get one — same reasoning as v20's三列), and every model that does
  -- not fill it in. All three degrade to exactly the v13 behaviour.
  corrected_quote TEXT
);

-- v9 (DESIGN_SCHEMA_V9 H-1): `seq` is the number a human sees and says out loud — "#12"
-- in the block stream, "#12" in the pack — so an AI can point at one block and the user
-- can find it. It is STORED, never derived: a "12th by time" rule would renumber every
-- later block the moment one is deleted, and the #12 the user wrote down yesterday would
-- silently point somewhere else. Assigned per thread as MAX(seq)+1 inside the INSERT
-- statement (WAL serialises writers, so the app and the MCP subprocess cannot collide),
-- and never reused after a delete. NULL only on rows written before v9's backfill.
-- Internal ids stay invisible: `seq` is for people, `id` is still a tool parameter.
CREATE UNIQUE INDEX IF NOT EXISTS idx_blocks_thread_seq
  ON blocks(thread_id, seq);

CREATE INDEX IF NOT EXISTS idx_blocks_thread
  ON blocks(thread_id, created_at ASC);

-- Attachment: a file or folder belonging to a PROJECT.
-- v2.7: `extracted_text` added — for `file` kinds with extractable text (PDF, docx, txt,
-- md, …), Spool auto-extracts the file's content on attach and caches it here.
-- v2.8 (§20.2): `include_in_pack` splits the formerly-conflated "extract" and "inline into
-- pack/summary" — extraction stays always-on (cheap, local, powers preview); inlining is
-- opt-in per attachment (default 0) so the user controls pack length / token cost.
-- v15 (DESIGN_PROJECT_FILES, Ocean 2026-08-08): an attachment used to hang off ONE BLOCK.
-- It now belongs to the project. The `url` kind is gone with the same decision — a link is
-- not a file, and the two entry points that created them are gone from the block action bar.
-- ⚠️ `target` is only ever written from the system file picker. Nothing may accept a path
-- from anywhere else — that is the whole reason this shape was allowed at all (§2).
CREATE TABLE IF NOT EXISTS attachments (
  id              TEXT PRIMARY KEY,
  thread_id       TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,                   -- file | folder
  target          TEXT NOT NULL,                   -- absolute path, from the file picker only
  label           TEXT NOT NULL DEFAULT '',        -- display name; defaults to basename
  extracted_text  TEXT,                            -- v2.7: nullable; auto-extracted text for file kinds
  extracted_at    INTEGER,                         -- v2.7: ms epoch; null if extraction not attempted
  extraction_kind TEXT,                            -- v2.7: 'pdf' | 'docx' | 'plaintext' | 'failed' | null
  include_in_pack INTEGER NOT NULL DEFAULT 0,      -- v2.8 §20.2: 1 = inline extracted_text into pack/summaries
  ai_access       INTEGER NOT NULL DEFAULT 0,      -- v15 §5.1 ①: 1 = an AI may ask for this file's text
  created_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attachments_thread
  ON attachments(thread_id, created_at ASC);

-- Full-text search over block text AND the user's annotations.
-- The `trigram` tokenizer indexes every 3-character window, so a keyword is matched
-- mid-word — including inside an unbroken run of Chinese, which the default unicode61
-- tokenizer would treat as a single token and miss. trigram needs a query of ≥3
-- characters; 1–2 character queries fall back to a LIKE scan in lib/search/query.ts.
CREATE VIRTUAL TABLE IF NOT EXISTS blocks_fts USING fts5(
  content, annotation, content=blocks, content_rowid=rowid,
  tokenize = 'trigram'
);

CREATE TRIGGER IF NOT EXISTS blocks_ai AFTER INSERT ON blocks BEGIN
  INSERT INTO blocks_fts(rowid, content, annotation) VALUES (new.rowid, new.content, new.annotation);
END;

CREATE TRIGGER IF NOT EXISTS blocks_ad AFTER DELETE ON blocks BEGIN
  INSERT INTO blocks_fts(blocks_fts, rowid, content, annotation) VALUES('delete', old.rowid, old.content, old.annotation);
END;

CREATE TRIGGER IF NOT EXISTS blocks_au AFTER UPDATE ON blocks BEGIN
  INSERT INTO blocks_fts(blocks_fts, rowid, content, annotation) VALUES('delete', old.rowid, old.content, old.annotation);
  INSERT INTO blocks_fts(rowid, content, annotation) VALUES (new.rowid, new.content, new.annotation);
END;

-- v9 (DESIGN_SCHEMA_V9 H-3): the text Spool extracts out of an attached PDF/docx used to
-- sit entirely outside the search index — the sentence was demonstrably in the lecture
-- notes and search returned nothing. It gets its own FTS table rather than a column on
-- blocks_fts: blocks_fts is an external-content index (content=blocks), so every one of
-- its columns must be a real column of `blocks`, and the extracted text lives on
-- `attachments`. A second external-content index over `attachments` costs no duplicated
-- storage and keeps the attachment that matched identifiable, which is what lets a hit
-- say "this sentence is in the file, not in the block's own text".
CREATE VIRTUAL TABLE IF NOT EXISTS attachments_fts USING fts5(
  extracted_text, content=attachments, content_rowid=rowid,
  tokenize = 'trigram'
);

CREATE TRIGGER IF NOT EXISTS attachments_ai AFTER INSERT ON attachments BEGIN
  INSERT INTO attachments_fts(rowid, extracted_text) VALUES (new.rowid, new.extracted_text);
END;

CREATE TRIGGER IF NOT EXISTS attachments_ad AFTER DELETE ON attachments BEGIN
  INSERT INTO attachments_fts(attachments_fts, rowid, extracted_text) VALUES('delete', old.rowid, old.extracted_text);
END;

-- Extraction happens AFTER the row is inserted (attach first, extract async), so this
-- update trigger — not the insert one — is what actually indexes most attachment text.
CREATE TRIGGER IF NOT EXISTS attachments_au AFTER UPDATE ON attachments BEGIN
  INSERT INTO attachments_fts(attachments_fts, rowid, extracted_text) VALUES('delete', old.rowid, old.extracted_text);
  INSERT INTO attachments_fts(rowid, extracted_text) VALUES (new.rowid, new.extracted_text);
END;

-- v10 (DESIGN_MCP_WRITE_ROLE §4, M1): the triage review queue.
--
-- These two tables are NOT part of the library. A proposal is something an AI has
-- offered; a block is something the user's library holds. §4.2-2 draws that line as a
-- hard one: proposals never enter the block stream, a pack, a digest or a search — so
-- they live in their own tables rather than as a flag on `blocks`, and every reader of
-- `blocks` stays correct without knowing this feature exists.
--
-- Approval is what turns a proposal into blocks (written through the ordinary insert
-- path, source-labelled like any MCP write); rejection deletes the rows and leaves no
-- trace (§4.3 — a rejection log would turn the queue into a landfill). Expiry is the
-- same deletion, just triggered by time instead of a click.
CREATE TABLE IF NOT EXISTS proposal_batches (
  id               TEXT PRIMARY KEY,
  client           TEXT NOT NULL DEFAULT '',  -- source label the approved blocks will carry
  note             TEXT,                      -- one line from the AI: what this batch is
  source_text      TEXT,                      -- §4.4 A: the whole passage the split came from
  source_thread_id TEXT,                      -- where that passage lands, labelled "<client> — user's own passage"
  created_at       INTEGER NOT NULL,
  expires_at       INTEGER NOT NULL           -- §4.2-3: 7 days, then the batch is void
);

CREATE TABLE IF NOT EXISTS proposals (
  id           TEXT PRIMARY KEY,
  batch_id     TEXT NOT NULL REFERENCES proposal_batches(id) ON DELETE CASCADE,
  thread_id    TEXT NOT NULL,                 -- the project this block would land in
  content      TEXT NOT NULL,
  annotation   TEXT,
  ref_block_id TEXT,                          -- an explicit citation; §4.4 A fills it in on approval
  -- v14 (DESIGN_CONTEXT_HYGIENE §9.3 拍板甲): what the approved block's ref_block_id will
  -- MEAN. Only 'corrects' may ever appear here, and NULL is everything else. §3.1's ban on
  -- AI-declared supersession is unchanged for ①②: those REMOVE the old block from every
  -- future pack, and a wrong guess silently deletes a correct conclusion. ③ removes nothing
  -- — the corrected block still renders in full — so its worst case is one visible extra
  -- line the user can see and undo, which is the risk level of a mis-written citation, and
  -- that has been allowed since v7.
  --
  -- ⚠️ It is a proposal, never a direct write: this column is on `proposals`, not written
  -- by the MCP server into `blocks`. The user approves it in Spool or it expires in 7 days.
  ref_kind     TEXT,
  -- v20 (§4.6): the same three provenance fields the approved block will carry. They ride
  -- through the queue rather than being re-derived on approval, for the reason the queue
  -- exists at all — by the time the user clicks approve the caller is long gone, and a URL
  -- and a retrieval date it did not write down cannot be reconstructed from anything here.
  source_url    TEXT,
  retrieved_at  INTEGER,
  recheck_after INTEGER,
  -- v21: the quoted sentence a `corrects` proposal aims at, riding the queue for the same
  -- reason the three above do — the caller that read the old block is gone by the time the
  -- user approves, and nothing left here could reconstruct which sentence it meant.
  corrected_quote TEXT,
  sort_order   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_proposals_batch
  ON proposals(batch_id, sort_order ASC);

-- v12 (DESIGN_WORKBENCH §4.1): what the AI actually said.
--
-- This table exists because of a real bug, not a feature request. The three maintenance
-- prompts all tell the model "say the conclusion to the user first, and store it only
-- once they agree" — written for a chat client, where a human IS there to agree. Spool's
-- engine slot runs `claude -p` headless, where nobody can, so the model correctly wrote
-- the whole answer into its final message and stored nothing. That message reached the
-- frontend, was assigned to a local variable, and was dropped on the floor; the user got
-- "跑完了，没有新增块" and reasonably concluded the AI had done nothing.
--
-- So: unlike follow-up state (HANDOFF §3.5, "derived view, no table"), this is NOT
-- derivable from anything. The AI's prose has exactly one copy and it lives here — which
-- is also what finally gives "say it to the user first, they agree, then it is stored"
-- somewhere to happen. The prompts stay word for word as they are.
--
-- Written only by the app (engineStore), never by the MCP subprocess: one writer, so no
-- cross-process coordination is needed. Nothing in `blocks` / packs / digests reads it —
-- a run is not library content until the user presses 存成一块.
CREATE TABLE IF NOT EXISTS engine_runs (
  id               TEXT PRIMARY KEY,
  action           TEXT NOT NULL,             -- distill / thread_health / weekly_review / follow_up_brief / follow_up
  thread_id        TEXT,                      -- NULL for weekly_review: it is a whole-library action (§3.4)
  engine           TEXT NOT NULL,             -- claude / codex
  model            TEXT,                      -- what the CLI reported using; NULL when it did not say
  outcome          TEXT NOT NULL,             -- ok / failed / cancelled
  result_text      TEXT,                      -- THE thing that used to be thrown away
  detail           TEXT,                      -- the CLI's own words on a failure (never a Spool paraphrase)
  blocks_written   INTEGER NOT NULL DEFAULT 0,
  proposals_queued INTEGER NOT NULL DEFAULT 0,
  cost_usd         REAL,                      -- NULL when the CLI did not report it (codex today, §5)
  input_tokens     INTEGER,
  output_tokens    INTEGER,
  started_at       INTEGER NOT NULL,
  finished_at      INTEGER NOT NULL,
  reviewed_at      INTEGER                    -- when the user acted on the card; NULL = still waiting on them
);

-- The two reads this table has: one project's runs (the right rail follows the open
-- project), and the library-wide feed (weekly reviews, cost totals).
CREATE INDEX IF NOT EXISTS idx_engine_runs_thread ON engine_runs(thread_id, finished_at DESC);
CREATE INDEX IF NOT EXISTS idx_engine_runs_time ON engine_runs(finished_at DESC);

-- v17 (旧账 §5-3): the dates a user has told Spool to stop reminding them about.
--
-- The dates themselves are NOT stored — they are re-read from the block's own text every
-- time (lib/blocks/dates.ts), so editing a block updates its reminders for free and nothing
-- can drift out of sync with the words on screen. Only the user's 「别再提这条」 is a fact
-- worth keeping, and it is keyed by (block, day) because one block can name several dates
-- and dismissing one must not silence the rest.
--
-- ⚠️ Dismissals are the whole state of this feature. That is deliberate: a table of detected
-- dates would need invalidating on every edit, and a stale reminder is exactly the failure
-- §5-3 is about.
CREATE TABLE IF NOT EXISTS date_dismissals (
  block_id   TEXT NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
  due_at     INTEGER NOT NULL,            -- local midnight of the day, ms epoch
  created_at INTEGER NOT NULL,
  PRIMARY KEY (block_id, due_at)
);

-- v18 (DESIGN_PROJECT_FILES §3.4, phase three): the files an AI has ASKED to read.
--
-- Every attachment starts at `ai_access = 0` — nobody reads the user's files unless they
-- say so. This table is the only way that changes without the user going to the file panel
-- themselves: an AI names files ALREADY in a project, says why, and the request waits on
-- the review screen beside the block proposals. Approval sets `ai_access = 1` on those
-- attachments and deletes these rows; refusal just deletes them (§4.3's rule for the
-- proposal queue — what the user turned away leaves no trace).
--
-- ⚠️ One row per requested FILE, grouped by `request_id`, because one call may name several
-- and the review screen must show it as ONE decision, not three.
-- ⚠️ No path can ever arrive here: `attachment_id` points at a row the user created from
-- the system file dialog (§2). An AI can ask about a file the user put in a project and can
-- never introduce a new one — that is the whole reason this feature was allowed at all.
CREATE TABLE IF NOT EXISTS file_access_requests (
  id            TEXT PRIMARY KEY,
  request_id    TEXT NOT NULL,             -- groups the files named in one request_file_access call
  client        TEXT NOT NULL DEFAULT '',  -- who asked, shown on the card
  thread_id     TEXT NOT NULL,
  attachment_id TEXT NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
  why           TEXT NOT NULL DEFAULT '',  -- the reason the user judges the request by
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL           -- same 7 days as a proposal batch
);

CREATE INDEX IF NOT EXISTS idx_file_access_requests
  ON file_access_requests(request_id, created_at ASC);
