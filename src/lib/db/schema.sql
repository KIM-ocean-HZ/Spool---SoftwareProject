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
CREATE TABLE IF NOT EXISTS threads (
  id                 TEXT PRIMARY KEY,
  workspace_id       TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title              TEXT NOT NULL DEFAULT '',
  summary            TEXT,                        -- active-stage AI status summary (optional)
  digest             TEXT,                        -- conclusion summary at completion (optional, may be empty)
  next_step          TEXT,                        -- free-text "where I left off / what's next"; shown on re-entry
  deadline           INTEGER,                     -- optional, ms epoch
  progress           INTEGER NOT NULL DEFAULT 0,  -- 0-100, manual
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
  source        TEXT,                           -- provenance label; auto-filled at capture, user-editable
  pinned        INTEGER NOT NULL DEFAULT 0,      -- marked as core context
  created_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_blocks_thread
  ON blocks(thread_id, created_at ASC);

-- Attachment: a file, folder, or URL linked to a block.
CREATE TABLE IF NOT EXISTS attachments (
  id         TEXT PRIMARY KEY,
  block_id   TEXT NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,                   -- file | folder | url
  target     TEXT NOT NULL,                   -- absolute path (file/folder) or the URL
  label      TEXT NOT NULL DEFAULT '',        -- display name; defaults to basename / domain
  created_at INTEGER NOT NULL
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
