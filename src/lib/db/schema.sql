-- Spool data model (PLAN_EN.md §8.1). Three tiers: Workspace → Thread → Block.

-- Workspace: big topic. The thinnest tier — just a grouping container.
CREATE TABLE IF NOT EXISTS workspaces (
  id          TEXT PRIMARY KEY,            -- nanoid
  title       TEXT NOT NULL DEFAULT '',
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
  digest             TEXT,                        -- conclusion summary at completion (optional, may be empty)
  deadline           INTEGER,                     -- optional, ms epoch
  status             TEXT NOT NULL DEFAULT 'active', -- active | parked | done
  is_capture_target  INTEGER NOT NULL DEFAULT 0,  -- exactly one row globally may be 1
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL,
  completed_at       INTEGER,                     -- time status became done
  deleted_at         INTEGER
);

CREATE INDEX IF NOT EXISTS idx_threads_workspace
  ON threads(workspace_id, updated_at DESC) WHERE deleted_at IS NULL;

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
  created_at    INTEGER NOT NULL
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

-- Attachment: a file, folder, or URL linked to a block.
-- v2.7: `extracted_text` added — for `file` kinds with extractable text (PDF, docx, txt,
-- md, …), Spool auto-extracts the file's content on attach and caches it here.
-- v2.8 (§20.2): `include_in_pack` splits the formerly-conflated "extract" and "inline into
-- pack/summary" — extraction stays always-on (cheap, local, powers preview); inlining is
-- opt-in per attachment (default 0) so the user controls pack length / token cost.
CREATE TABLE IF NOT EXISTS attachments (
  id              TEXT PRIMARY KEY,
  block_id        TEXT NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,                   -- file | folder | url
  target          TEXT NOT NULL,                   -- absolute path (file/folder) or the URL
  label           TEXT NOT NULL DEFAULT '',        -- display name; defaults to basename / domain
  extracted_text  TEXT,                            -- v2.7: nullable; auto-extracted text for file kinds
  extracted_at    INTEGER,                         -- v2.7: ms epoch; null if extraction not attempted
  extraction_kind TEXT,                            -- v2.7: 'pdf' | 'docx' | 'plaintext' | 'failed' | null
  include_in_pack INTEGER NOT NULL DEFAULT 0,      -- v2.8 §20.2: 1 = inline extracted_text into pack/summaries
  created_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attachments_block
  ON attachments(block_id, created_at ASC);

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
  source_thread_id TEXT,                      -- where that passage lands, as the user's own block
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
  sort_order   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_proposals_batch
  ON proposals(batch_id, sort_order ASC);
