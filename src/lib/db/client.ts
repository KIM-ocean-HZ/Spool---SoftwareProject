import { getCurrentWindow } from '@tauri-apps/api/window';
import Database from '@tauri-apps/plugin-sql';
import { nanoid } from 'nanoid';
import { followUpFingerprint } from '@/lib/engine/followUp';
import schemaSql from './schema.sql?raw';

export const INBOX_WORKSPACE_TITLE = '默认工作区';
export const UNSORTED_THREAD_TITLE = '未分类';

// Seeded rows are per-language (2026-07-31, HANDOFF §2.2). Unlike UI strings — Chinese
// literal as the key, translated at render (lib/i18n) — these land in the database as
// ordinary user data: editable and deletable. So a fresh install is seeded once, in the
// language the user starts in.
//
// 2026-08-03 (Ocean): a later language switch DOES re-translate the tutorial threads —
// see retranslateTutorial below — but only the rows still character-for-character as
// seeded. Anything the user touched, renamed or deleted stays exactly as they left it.
export type SeedLanguage = 'zh' | 'en';

const INBOX_TITLE: Record<SeedLanguage, string> = {
  zh: INBOX_WORKSPACE_TITLE,
  en: 'Default workspace',
};
const UNSORTED_TITLE: Record<SeedLanguage, string> = { zh: UNSORTED_THREAD_TITLE, en: 'Unsorted' };

// Set by App.tsx from the resolved UI language BEFORE anything opens the database (it
// awaits the settings load first) — the seed paths below are the only readers. Kept as
// module state rather than an import of settingsStore: db/client.ts is imported by the
// node-based Vitest suites, and the store pulls in Tauri's event IPC at module scope.
let seedLanguage: SeedLanguage = 'zh';
export const setSeedLanguage = (lang: SeedLanguage): void => {
  seedLanguage = lang;
};

// Bump this whenever schema.sql changes, and add a named step to MIGRATIONS that
// carries a database from the previous version to the new one. On startup the
// database's PRAGMA user_version is compared against this and every applicable step
// runs in sequence, each stamping user_version as its own checkpoint (§19.3).
const SCHEMA_VERSION = 23;

// Things a migration did to the user's data that the user is entitled to hear about.
// v15 is the first migration that removes anything (the retired `url` attachments), and
// DESIGN_PROJECT_FILES §5.1 ③ point 2 is explicit that it must not happen silently. The
// migration pushes here; the UI drains it once, after the database is up.
export interface MigrationNotice {
  kind: 'url-attachments-removed';
  count: number;
}
const pendingMigrationNotices: MigrationNotice[] = [];
export const drainMigrationNotices = (): MigrationNotice[] =>
  pendingMigrationNotices.splice(0, pendingMigrationNotices.length);

// Tables in reverse dependency order: the two FTS shadows (virtual, mirroring blocks
// and attachments), the v10 review queue, then attachments → blocks → threads →
// workspaces. Indexes and the blocks_* / attachments_* FTS triggers are dropped
// automatically with their owning table.
const TABLES_TO_DROP = [
  'blocks_fts',
  'attachments_fts',
  'proposals',
  'proposal_batches',
  'attachments',
  'blocks',
  'threads',
  'workspaces',
];

let dbPromise: Promise<Database> | null = null;

// Test-only seam (PLAN_EN.md §19.5). When set, getDb() yields this instead of
// opening sqlite:spool.db — letting the node:sqlite-backed Vitest cases drive the
// real query/CRUD modules against schema.sql's FTS triggers without the Tauri
// runtime. Never set outside tests.
let testDb: Database | null = null;
export const __setTestDb = (db: Database | null): void => {
  testDb = db;
};

const splitStatements = (sql: string): string[] => {
  // Strip line comments first, then split top-level statements by `;` followed by a blank
  // line. Trigger bodies (BEGIN ... END;) survive intact because the inner `;` is
  // followed by a single newline, not a blank one.
  const cleaned = sql.replace(/--.*$/gm, '').trim();
  const padded = cleaned + '\n\n';
  return padded
    .split(/;\s*\n\s*\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => (s.endsWith(';') ? s : s + ';'));
};

const applySchema = async (db: Database): Promise<void> => {
  const stmts = splitStatements(schemaSql);
  for (let i = 0; i < stmts.length; i++) {
    const stmt = stmts[i]!;
    try {
      await db.execute(stmt);
    } catch (e) {
      console.error(`[db] schema statement ${i} failed:\n${stmt}\n`, e);
      throw e;
    }
  }
};

// Schema migration. If the on-disk user_version matches SCHEMA_VERSION there is
// nothing to do. The v2 → v3 step (the v2.6 design rollback) drops two `threads`
// columns; v3 → v4 (v2.7 attachment extraction) adds three `attachments` columns;
// v4 → v5 (v2.8 §20.2) adds `attachments.include_in_pack`. All three are additive
// ALTER TABLE migrations that leave every row of user data intact. Any other
// mismatch — including a brand-new database at user_version 0 — falls back to
// dropping every table and rebuilding from schema.sql.
// Best-effort consistent snapshot taken before any schema change. VACUUM INTO copies the
// live database through the SQL engine (correct even with an open WAL) and needs no fs
// permission. A failure here must never block startup, so everything is swallowed.
const backupDbBeforeMigration = async (db: Database, fromVersion: number): Promise<void> => {
  try {
    const { appConfigDir, join } = await import('@tauri-apps/api/path');
    const dir = await appConfigDir();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = await join(dir, `spool.pre-migration-v${fromVersion}-${stamp}.db`);
    await db.execute(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
    console.info(`[db] pre-migration backup written: ${dest}`);
  } catch (e) {
    console.error('[db] pre-migration backup FAILED (continuing without one):', e);
  }
};

// How many real user rows exist right now. Each table is counted independently so a
// brand-new database (where a table may not exist yet) reports zero instead of throwing.
const countExistingUserRows = async (db: Database): Promise<number> => {
  let total = 0;
  for (const t of ['blocks', 'attachments', 'threads', 'workspaces']) {
    try {
      const r = await db.select<{ c: number }[]>(`SELECT COUNT(*) AS c FROM ${t}`);
      total += r[0]?.c ?? 0;
    } catch {
      // Table absent on a fresh database — counts as zero, not an error.
    }
  }
  return total;
};

// Named migration registry (§19.3). Each step carries a database exactly one version
// forward and is individually idempotent (guarded ALTERs), so a crash between steps
// resumes cleanly on next startup from the checkpointed user_version. Steps run in
// sequence — a v2 database walks 2→3→4→5 in one startup pass. (The previous if-chain
// stamped a v2 database straight to 5 after only the v2→3 ALTERs, silently skipping
// the v3→4/v4→5 attachment columns; the sequential walk fixes that.)
interface Migration {
  from: number;
  to: number;
  name: string;
  run: (db: Database) => Promise<void>;
}

const MIGRATIONS: Migration[] = [
  {
    // v2.6 design rollback (PLAN_EN.md §8.1): manual progress / next_step removed.
    // Each DROP COLUMN guarded — the column may already be absent.
    from: 2,
    to: 3,
    name: 'drop-thread-progress-and-next-step',
    run: async (db) => {
      for (const col of ['progress', 'next_step']) {
        try {
          await db.execute(`ALTER TABLE threads DROP COLUMN ${col}`);
        } catch (e) {
          console.info(`[db] ${col}: not dropped (likely absent)`, e);
        }
      }
    },
  },
  {
    // v2.7 attachment text extraction (PLAN_EN.md §8.1). ADD COLUMN guarded — the
    // column may already exist on a database that saw a partial earlier pass.
    from: 3,
    to: 4,
    name: 'add-attachment-extraction-columns',
    run: async (db) => {
      for (const col of ['extracted_text TEXT', 'extracted_at INTEGER', 'extraction_kind TEXT']) {
        try {
          await db.execute(`ALTER TABLE attachments ADD COLUMN ${col}`);
        } catch (e) {
          console.info(`[db] ${col}: not added (likely exists)`, e);
        }
      }
    },
  },
  {
    // v2.8 §20.2 extraction/inline split. Default 0 — existing extracted rows stop
    // auto-inlining into pack/summaries until the user opts each one in (intentional).
    from: 4,
    to: 5,
    name: 'add-attachment-include-in-pack',
    run: async (db) => {
      try {
        await db.execute(
          'ALTER TABLE attachments ADD COLUMN include_in_pack INTEGER NOT NULL DEFAULT 0',
        );
      } catch (e) {
        console.info('[db] include_in_pack: not added (likely exists)', e);
      }
    },
  },
  {
    // MCP-first pivot (2026-07-09): summary provenance. NULL on legacy rows — treated
    // like 'user' by the MCP guard, so an existing summary is protected until the user
    // clears it or an MCP write claims a fresh one.
    from: 5,
    to: 6,
    name: 'add-thread-summary-source',
    run: async (db) => {
      try {
        await db.execute('ALTER TABLE threads ADD COLUMN summary_source TEXT');
      } catch (e) {
        console.info('[db] summary_source: not added (likely exists)', e);
      }
    },
  },
  {
    // §20.13 v2.4 (D2): block-level citations — add_block.ref_block_id lets an MCP
    // writer declare which existing block a finding builds on. NULL everywhere until a
    // writer sets it; nothing in the GUI writes it yet.
    from: 6,
    to: 7,
    name: 'add-block-ref-block-id',
    run: async (db) => {
      try {
        await db.execute('ALTER TABLE blocks ADD COLUMN ref_block_id TEXT');
      } catch (e) {
        console.info('[db] ref_block_id: not added (likely exists)', e);
      }
    },
  },
  {
    // R3 BUG-2: rows written before the v2.3 client-label map stored the raw agent
    // slug ("local-agent-mode-spool · MCP"); the GUI mapped it at render time but the
    // AI-facing surfaces (pack/digest/JSON) leaked it verbatim. Normalize the stored
    // label once — provenance semantics unchanged (same client, same · MCP marker,
    // any " — detail" suffix preserved). Idempotent: the WHERE matches nothing after
    // the first run.
    from: 7,
    to: 8,
    name: 'normalize-legacy-mcp-source-labels',
    run: async (db) => {
      await db.execute(
        "UPDATE blocks SET source = 'Claude' || substr(source, instr(source, ' · MCP')) " +
          "WHERE source LIKE 'local-agent-mode%' AND instr(source, ' · MCP') > 0",
      );
    },
  },
  {
    // v9 (DESIGN_SCHEMA_V9, Ocean approved 2026-08-04) — two changes that both touch the
    // database, deliberately landed as one migration so a library is never half-way
    // between them. H-1: `blocks.seq`, the number a human can see and say ("#12"). H-3:
    // an FTS index over attachment extracted text, so the words inside an attached PDF
    // are findable. Every step is guarded, so a crash mid-step resumes cleanly.
    from: 8,
    to: 9,
    name: 'add-block-seq-and-attachment-fts',
    run: async (db) => {
      try {
        await db.execute('ALTER TABLE blocks ADD COLUMN seq INTEGER');
      } catch (e) {
        console.info('[db] blocks.seq: not added (likely exists)', e);
      }
      // Backfill in the pack's own render order (created_at, then rowid as the
      // tie-break), so "the 3rd block in the pack" and "#3" agree on a library that
      // existed before numbering did. ROW_NUMBER is computed over ALL rows, so a
      // resumed run re-derives the same numbers for whatever is still NULL.
      await db.execute(
        `WITH numbered AS (
           SELECT rowid AS rid,
                  ROW_NUMBER() OVER (PARTITION BY thread_id ORDER BY created_at ASC, rowid ASC) AS n
             FROM blocks
         )
         UPDATE blocks SET seq = (SELECT n FROM numbered WHERE numbered.rid = blocks.rowid)
          WHERE seq IS NULL`,
      );
      await db.execute(
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_blocks_thread_seq ON blocks(thread_id, seq)',
      );
      await db.execute(
        `CREATE VIRTUAL TABLE IF NOT EXISTS attachments_fts USING fts5(
           extracted_text, content=attachments, content_rowid=rowid,
           tokenize = 'trigram'
         )`,
      );
      await db.execute(
        `CREATE TRIGGER IF NOT EXISTS attachments_ai AFTER INSERT ON attachments BEGIN
           INSERT INTO attachments_fts(rowid, extracted_text) VALUES (new.rowid, new.extracted_text);
         END`,
      );
      await db.execute(
        `CREATE TRIGGER IF NOT EXISTS attachments_ad AFTER DELETE ON attachments BEGIN
           INSERT INTO attachments_fts(attachments_fts, rowid, extracted_text) VALUES('delete', old.rowid, old.extracted_text);
         END`,
      );
      await db.execute(
        `CREATE TRIGGER IF NOT EXISTS attachments_au AFTER UPDATE ON attachments BEGIN
           INSERT INTO attachments_fts(attachments_fts, rowid, extracted_text) VALUES('delete', old.rowid, old.extracted_text);
           INSERT INTO attachments_fts(rowid, extracted_text) VALUES (new.rowid, new.extracted_text);
         END`,
      );
      // Index the attachments that already exist. 'rebuild' discards and re-derives the
      // whole index from the content table, so it is safe to run twice.
      await db.execute("INSERT INTO attachments_fts(attachments_fts) VALUES('rebuild')");
    },
  },
  {
    // v10 (DESIGN_MCP_WRITE_ROLE §4 M1): the triage review queue. Two brand-new tables
    // and nothing else — no column of an existing table moves, so an interrupted run
    // leaves every block, thread and workspace exactly as it was. CREATE ... IF NOT
    // EXISTS makes each step its own guard.
    from: 9,
    to: 10,
    name: 'add-proposal-queue',
    run: async (db) => {
      await db.execute(
        `CREATE TABLE IF NOT EXISTS proposal_batches (
           id               TEXT PRIMARY KEY,
           client           TEXT NOT NULL DEFAULT '',
           note             TEXT,
           source_text      TEXT,
           source_thread_id TEXT,
           created_at       INTEGER NOT NULL,
           expires_at       INTEGER NOT NULL
         )`,
      );
      await db.execute(
        `CREATE TABLE IF NOT EXISTS proposals (
           id           TEXT PRIMARY KEY,
           batch_id     TEXT NOT NULL REFERENCES proposal_batches(id) ON DELETE CASCADE,
           thread_id    TEXT NOT NULL,
           content      TEXT NOT NULL,
           annotation   TEXT,
           ref_block_id TEXT,
           sort_order   INTEGER NOT NULL
         )`,
      );
      await db.execute(
        'CREATE INDEX IF NOT EXISTS idx_proposals_batch ON proposals(batch_id, sort_order ASC)',
      );
    },
  },
  {
    // v11 (DESIGN_FOLLOW_UP §3.2): two nullable columns on `threads`, nothing else. Both
    // default to NULL on every existing row, and NULL brief means follow-up is off — so a
    // database that walks this step comes out behaving exactly as it did before, which is
    // the property that makes an interrupted run harmless.
    from: 10,
    to: 11,
    name: 'add-follow-up-brief',
    run: async (db) => {
      for (const col of ['follow_up_brief TEXT', 'follow_up_state TEXT']) {
        try {
          await db.execute(`ALTER TABLE threads ADD COLUMN ${col}`);
        } catch (e) {
          console.info(`[db] ${col}: not added (likely exists)`, e);
        }
      }
    },
  },
  {
    // v12 (DESIGN_WORKBENCH §4.1): one brand-new table, and not one column of an existing
    // table moves — so a database that walks this step comes out behaving exactly as it
    // did before, and an interrupted run leaves every block, thread and workspace as it
    // was. CREATE ... IF NOT EXISTS is each step's own guard.
    from: 11,
    to: 12,
    name: 'add-engine-runs',
    run: async (db) => {
      await db.execute(
        `CREATE TABLE IF NOT EXISTS engine_runs (
           id               TEXT PRIMARY KEY,
           action           TEXT NOT NULL,
           thread_id        TEXT,
           engine           TEXT NOT NULL,
           model            TEXT,
           outcome          TEXT NOT NULL,
           result_text      TEXT,
           detail           TEXT,
           blocks_written   INTEGER NOT NULL DEFAULT 0,
           proposals_queued INTEGER NOT NULL DEFAULT 0,
           cost_usd         REAL,
           input_tokens     INTEGER,
           output_tokens    INTEGER,
           started_at       INTEGER NOT NULL,
           finished_at      INTEGER NOT NULL,
           reviewed_at      INTEGER
         )`,
      );
      await db.execute(
        'CREATE INDEX IF NOT EXISTS idx_engine_runs_thread ON engine_runs(thread_id, finished_at DESC)',
      );
      await db.execute(
        'CREATE INDEX IF NOT EXISTS idx_engine_runs_time ON engine_runs(finished_at DESC)',
      );
      // DESIGN_WORKBENCH §4.3 — the per-project opt-out for automatic maintenance. NULL on
      // every existing row, and NULL means "follow the master switch", which is off by
      // default: this migration cannot start anything spending money on its own.
      try {
        await db.execute('ALTER TABLE threads ADD COLUMN auto_maintain INTEGER');
      } catch (e) {
        console.info('[db] auto_maintain: not added (likely exists)', e);
      }
    },
  },
  {
    // v13 (DESIGN_CONTEXT_HYGIENE §3.1): supersession. Two nullable columns on `blocks` and
    // nothing else — no row is rewritten, no existing column changes meaning, and NULL in
    // both is exactly the behaviour every reader had before v13 (`ref_kind` NULL reads as
    // 'cites'). That is what makes an interrupted run harmless: a database that walks half
    // of this step behaves identically to one that walked none of it.
    from: 12,
    to: 13,
    name: 'add-block-supersession',
    run: async (db) => {
      for (const col of ['stale_at INTEGER', 'ref_kind TEXT']) {
        try {
          await db.execute(`ALTER TABLE blocks ADD COLUMN ${col}`);
        } catch (e) {
          console.info(`[db] ${col}: not added (likely exists)`, e);
        }
      }
    },
  },
  {
    // v14 (DESIGN_CONTEXT_HYGIENE §9.3 拍板乙): who wrote a block's annotation. One nullable
    // column, no row rewritten — and deliberately NO backfill: NULL means "unknown", which
    // readers resolve through the block's own `source`, so an interrupted run and a complete
    // one behave identically and no user data is touched (2026-05-29 wipe class).
    from: 13,
    to: 14,
    name: 'add-annotation-author',
    run: async (db) => {
      try {
        await db.execute('ALTER TABLE blocks ADD COLUMN annotation_by TEXT');
      } catch (e) {
        console.info('[db] annotation_by: not added (likely exists)', e);
      }
      // 拍板甲 (§9.3): a proposal may now carry the correction relation it wants the
      // approved block to have. NULL on every existing row = a plain citation, which is
      // what every queued proposal already meant.
      try {
        await db.execute('ALTER TABLE proposals ADD COLUMN ref_kind TEXT');
      } catch (e) {
        console.info('[db] proposals.ref_kind: not added (likely exists)', e);
      }
    },
  },
  {
    // v15 (DESIGN_PROJECT_FILES, Ocean 2026-08-08) — an attachment stops belonging to a block
    // and starts belonging to the project.
    //
    // ⚠️⚠️ THIS IS THE FIRST MIGRATION IN THIS REGISTRY THAT DESTROYS ANYTHING. Every step
    // above is additive and an interrupted run of one is indistinguishable from a complete
    // run. This one deletes rows (`kind='url'`, §5.1 ③, Ocean's explicit answer (c) on
    // 2026-08-08) and drops a column. So the order below is not arbitrary:
    //
    //   1. backfill thread_id from the block BEFORE anything is destroyed — if the process
    //      dies here, nothing has been lost and the step re-runs from the top;
    //   2. delete the url rows;
    //   3. only then drop the index and the column.
    //
    // ⚠️ `deleteUrlAttachments` counts what it removed and stashes it in `pendingNotices`
    // (§5.1 ③ point 2: links must not evaporate silently).
    //
    // ⚠️ KNOWN AND ACCEPTED DIVERGENCE: on a MIGRATED database `thread_id` ends up nullable
    // and without the ON DELETE CASCADE that schema.sql gives a FRESH one. SQLite cannot add
    // NOT NULL or a foreign key to an existing column, and the alternative — rebuilding the
    // table — would mean dropping and recreating a table that an FTS index hangs off, i.e.
    // a far bigger blast radius than the constraint is worth here. The cascade in particular
    // is theoretical: threads are soft-deleted (`deleted_at`), never DELETEd, so it has
    // never once fired. The assertion at the end of this step is what actually holds the
    // invariant, and `createAttachment` is the only writer.
    from: 14,
    to: 15,
    name: 'move-attachments-to-thread',
    run: async (db) => {
      try {
        await db.execute('ALTER TABLE attachments ADD COLUMN thread_id TEXT');
      } catch (e) {
        console.info('[db] attachments.thread_id: not added (likely exists)', e);
      }
      try {
        await db.execute('ALTER TABLE attachments ADD COLUMN ai_access INTEGER NOT NULL DEFAULT 0');
      } catch (e) {
        console.info('[db] attachments.ai_access: not added (likely exists)', e);
      }
      // Step 1 — inherit the owning block's project. Guarded on the column still existing,
      // because a resumed run may already have dropped it.
      const cols = await db.select<{ name: string }[]>('PRAGMA table_info(attachments)');
      if (cols.some((c) => c.name === 'block_id')) {
        await db.execute(
          `UPDATE attachments
              SET thread_id = (SELECT b.thread_id FROM blocks b WHERE b.id = attachments.block_id)
            WHERE thread_id IS NULL`,
        );
      }
      // Step 2 — the url kind is retired (§5.1 ③). Explicit DELETE, never a silent one:
      // whatever this removes is reported to the user on the next start.
      const urls = await db.select<{ c: number }[]>(
        "SELECT COUNT(*) AS c FROM attachments WHERE kind = 'url'",
      );
      const urlCount = urls[0]?.c ?? 0;
      if (urlCount > 0) {
        await db.execute("DELETE FROM attachments WHERE kind = 'url'");
        pendingMigrationNotices.push({ kind: 'url-attachments-removed', count: urlCount });
        console.warn(`[db] v15: removed ${urlCount} url attachment(s) (DESIGN_PROJECT_FILES §5.1 ③)`);
      }
      // An attachment whose block had already gone has nothing to inherit. ON DELETE CASCADE
      // should have taken it years ago; if one is still here it is unreachable either way.
      const orphans = await db.select<{ c: number }[]>(
        'SELECT COUNT(*) AS c FROM attachments WHERE thread_id IS NULL',
      );
      const orphanCount = orphans[0]?.c ?? 0;
      if (orphanCount > 0) {
        await db.execute('DELETE FROM attachments WHERE thread_id IS NULL');
        console.warn(`[db] v15: removed ${orphanCount} attachment(s) whose block no longer exists`);
      }
      // Step 3 — now, and only now, the old ownership goes. The index has to go first:
      // SQLite refuses to drop a column any index mentions.
      await db.execute('DROP INDEX IF EXISTS idx_attachments_block');
      try {
        await db.execute('ALTER TABLE attachments DROP COLUMN block_id');
      } catch (e) {
        console.info('[db] attachments.block_id: not dropped (likely already gone)', e);
      }
      await db.execute(
        'CREATE INDEX IF NOT EXISTS idx_attachments_thread ON attachments(thread_id, created_at ASC)',
      );
      // The assertion DESIGN_PROJECT_FILES §3.1 asks for, and the same shape as v13's
      // "every block still counts". A row with no project is not reachable from anywhere.
      const left = await db.select<{ c: number }[]>(
        'SELECT COUNT(*) AS c FROM attachments WHERE thread_id IS NULL',
      );
      if ((left[0]?.c ?? 0) > 0) {
        throw new Error(
          `[db] v15 migration left ${left[0]?.c} attachment(s) with no project — refusing to stamp the version`,
        );
      }
    },
  },
  {
    // §5-5 (Ocean 2026-08-08): record when a summary was written. Purely additive — existing
    // summaries keep a NULL, because there is no honest value to backfill them with.
    from: 15,
    to: 16,
    name: 'add-summary-written-at',
    run: async (db) => {
      try {
        await db.execute('ALTER TABLE threads ADD COLUMN summary_at INTEGER');
      } catch (e) {
        console.info('[db] summary_at: not added (likely exists)', e);
      }
    },
  },
  {
    // 旧账 §5-3 (Ocean 2026-08-13): reminders for dates written inside a block's text. One
    // CREATE TABLE and nothing else — the dates are re-read from the blocks themselves, so
    // this step cannot touch a row of the user's library.
    from: 16,
    to: 17,
    name: 'add-date-dismissals',
    run: async (db) => {
      await db.execute(
        `CREATE TABLE IF NOT EXISTS date_dismissals (
           block_id   TEXT NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
           due_at     INTEGER NOT NULL,
           created_at INTEGER NOT NULL,
           PRIMARY KEY (block_id, due_at)
         )`,
      );
    },
  },
  {
    // DESIGN_PROJECT_FILES §3.4 (phase three) — the queue an AI's request to read a file
    // waits in. One CREATE TABLE, nothing else: no existing row is read or touched, and a
    // database that stops halfway is indistinguishable from one that never started.
    from: 17,
    to: 18,
    name: 'add-file-access-requests',
    run: async (db) => {
      await db.execute(
        `CREATE TABLE IF NOT EXISTS file_access_requests (
           id            TEXT PRIMARY KEY,
           request_id    TEXT NOT NULL,
           client        TEXT NOT NULL DEFAULT '',
           thread_id     TEXT NOT NULL,
           attachment_id TEXT NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
           why           TEXT NOT NULL DEFAULT '',
           created_at    INTEGER NOT NULL,
           expires_at    INTEGER NOT NULL
         )`,
      );
      await db.execute(
        'CREATE INDEX IF NOT EXISTS idx_file_access_requests ON file_access_requests(request_id, created_at ASC)',
      );
    },
  },
  {
    // 决定 5 (HANDOFF §4-1) — where an AI's proposed rewrite of the follow-up brief waits.
    // Purely additive, and deliberately three columns nobody backfills: a project with no
    // suggestion is NULL everywhere, which is every project the moment this lands.
    from: 18,
    to: 19,
    name: 'add-follow-up-brief-suggestion',
    run: async (db) => {
      for (const col of [
        'follow_up_brief_suggested TEXT',
        'follow_up_brief_suggested_by TEXT',
        'follow_up_brief_suggested_at INTEGER',
      ]) {
        try {
          await db.execute(`ALTER TABLE threads ADD COLUMN ${col}`);
        } catch (e) {
          console.info(`[db] ${col}: not added (likely exists)`, e);
        }
      }
    },
  },
  {
    // v20 (DESIGN_MCP_INTENT_ROUTING §4.6, Ocean 拍板乙) — where a block came from outside
    // the library, and when it should be looked at again. Six nullable columns across two
    // tables, no backfill, nothing rewritten: NULL is what every existing row means (the
    // user typed it, or an AI wrote it before this shipped), so a half-run of this step and
    // a complete one are indistinguishable. Not the 2026-05-29 wipe class (§6.3-9).
    from: 19,
    to: 20,
    name: 'add-block-provenance',
    run: async (db) => {
      const cols = ['source_url TEXT', 'retrieved_at INTEGER', 'recheck_after INTEGER'];
      for (const table of ['blocks', 'proposals']) {
        for (const col of cols) {
          try {
            await db.execute(`ALTER TABLE ${table} ADD COLUMN ${col}`);
          } catch (e) {
            console.info(`[db] ${table}.${col}: not added (likely exists)`, e);
          }
        }
      }
    },
  },
  {
    // v21 (Ocean 2026-08-10, 拍板「标到哪句话」) — which sentence in the cited block a
    // correction is aimed at. One nullable column on each of the two tables that carry a
    // correction, no backfill: NULL is what every existing row means (nobody said), and it
    // renders exactly as v13 did. Same class as v20 — a half-run and a complete run are
    // indistinguishable, not the 2026-05-29 wipe class (§6.3-9).
    from: 20,
    to: 21,
    name: 'add-corrected-quote',
    run: async (db) => {
      for (const table of ['blocks', 'proposals']) {
        try {
          await db.execute(`ALTER TABLE ${table} ADD COLUMN corrected_quote TEXT`);
        } catch (e) {
          console.info(`[db] ${table}.corrected_quote: not added (likely exists)`, e);
        }
      }
    },
  },
  {
    // v22 (DESIGN_FOLLOW_UP §8.7, Ocean 2026-08-16「合成一份清单」) — what a project follows
    // up stops being one blob of text in `threads.follow_up_brief` and becomes one row per
    // line in `follow_up_items`, so a single line can be pointed at, answered and reopened.
    //
    // ⚠️⚠️ This is the only step in M5 that can touch a real library, so it is ADDITIVE ONLY:
    // CREATE TABLE plus INSERTs. It does not UPDATE `threads`, does not touch `blocks`, and
    // above all does not rebuild a table — a rebuild branch is what emptied the live library
    // on 2026-05-29 (§6.3-9). `follow_up_brief` is left exactly as it was and simply stops
    // being read; the user's lines exist in both places afterwards, and that is deliberate:
    // if this step is ever wrong, the original text is still sitting there untouched.
    //
    // Re-runnable: a crash between the CREATE and the INSERTs resumes on the next launch
    // (user_version is only checkpointed after the whole step), and the backfill skips any
    // project that already has rows, so a half-run never doubles a line.
    from: 21,
    to: 22,
    name: 'split-follow-up-brief-into-items',
    run: async (db) => {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS follow_up_items (
          id              TEXT PRIMARY KEY,
          thread_id       TEXT NOT NULL,
          text            TEXT NOT NULL,
          why             TEXT,
          standing        INTEGER NOT NULL DEFAULT 0,
          fingerprint     TEXT NOT NULL,
          status          TEXT NOT NULL,
          proposed_by     TEXT,
          sort_order      INTEGER NOT NULL,
          created_at      INTEGER NOT NULL,
          approved_at     INTEGER,
          last_raised_at  INTEGER,
          answered_at     INTEGER,
          answer_block_id TEXT,
          outcome         TEXT
        )`);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_follow_up_items_thread
          ON follow_up_items(thread_id, status, sort_order)`);

      const threads = await db.select<{ id: string; follow_up_brief: string }[]>(
        `SELECT id, follow_up_brief FROM threads
          WHERE follow_up_brief IS NOT NULL AND TRIM(follow_up_brief) <> ''`,
      );
      const now = Date.now();
      for (const t of threads) {
        const already = await db.select<{ c: number }[]>(
          'SELECT COUNT(*) AS c FROM follow_up_items WHERE thread_id = $1',
          [t.id],
        );
        if ((already[0]?.c ?? 0) > 0) continue;
        // Every line the user had approved is a STANDING watch: that is what a brief was.
        // The numbering the old textarea wrote ("1. …") is display, not content — it is
        // stripped here so a line does not carry a stale ordinal once rows can be reordered.
        const lines = t.follow_up_brief
          .split('\n')
          .map((l) => l.replace(/^\s*\d+[.、)]\s*/, '').trim())
          .filter((l) => l.length > 0);
        for (const [i, line] of lines.entries()) {
          await db.execute(
            `INSERT INTO follow_up_items
               (id, thread_id, text, why, standing, fingerprint, status, proposed_by,
                sort_order, created_at, approved_at)
             VALUES ($1, $2, $3, NULL, 1, $4, 'open', NULL, $5, $6, $6)`,
            [nanoid(), t.id, line, followUpFingerprint(line), i, now],
          );
        }
        console.info(`[db] v22: ${lines.length} follow-up line(s) carried across for ${t.id}`);
      }
    },
  },
  {
    // v23 (DESIGN_WORKSPACE_PACK §4, Ocean 2026-08-15「可以在每个工作区内再新建工作区」) —
    // workspaces stop being flat. One nullable column, nothing else: every existing
    // workspace reads back as NULL = top level, which is exactly what it was, so this step
    // is behaviour-neutral by construction.
    //
    // ⚠️ ADD COLUMN only — no table rebuild. A rebuild branch is what emptied the live
    // library on 2026-05-29; there is no version of "add a parent pointer" that needs one.
    from: 22,
    to: 23,
    name: 'add-workspace-parent-id',
    run: async (db) => {
      try {
        await db.execute('ALTER TABLE workspaces ADD COLUMN parent_id TEXT');
      } catch (e) {
        console.info('[db] workspaces.parent_id: not added (likely exists)', e);
      }
    },
  },
];

// Returns true only when the fresh-install path ran (empty DB rebuilt from schema.sql)
// — the one moment the tutorial thread may be seeded (§Task 3, 2026-07-09: never on an
// existing database; the 2026-05-29 wipe class of bugs is exactly re-running seeds
// against user data).
const migrateSchema = async (db: Database): Promise<boolean> => {
  const rows = await db.select<{ user_version: number }[]>('PRAGMA user_version');
  let current = rows[0]?.user_version ?? 0;
  if (current === SCHEMA_VERSION) {
    console.info(`[db] schema version ${current} matches; no rebuild`);
    return false;
  }

  // The schema is about to change. Snapshot first so every path below — the additive
  // registry steps AND the destructive rebuild — is recoverable.
  await backupDbBeforeMigration(db, current);

  // Walk the registry. Each completed step checkpoints user_version (PRAGMA doesn't
  // accept bound parameters; `to` is a code-local integer).
  while (current < SCHEMA_VERSION) {
    const step = MIGRATIONS.find((m) => m.from === current);
    if (!step) break;
    console.warn(`[db] migration ${step.name}: v${step.from} -> v${step.to}`);
    await step.run(db);
    await db.execute(`PRAGMA user_version = ${step.to}`);
    current = step.to;
  }
  if (current === SCHEMA_VERSION) {
    console.info(`[db] migrations complete; user_version now ${current}`);
    return false;
  }

  // Unrecognized schema version — the one path that can destroy everything. It must never
  // run against a populated database. A version we don't know how to migrate from is almost
  // always a build/database skew (e.g. launching an older commit whose SCHEMA_VERSION is
  // below this database's user_version); silently dropping here is exactly how real user
  // data was lost on 2026-05-29. Only a genuinely empty database (fresh install, no rows)
  // is safe to build from scratch.
  const existing = await countExistingUserRows(db);
  if (existing > 0) {
    throw new Error(
      `[db] refusing to rebuild: on-disk schema version ${current} is not recognized ` +
        `(expected ${SCHEMA_VERSION}) and the database already holds ${existing} user rows. ` +
        `No tables were dropped. This usually means the app was started from a build whose ` +
        `SCHEMA_VERSION differs from this database — open the matching build, or migrate ` +
        `deliberately. A snapshot was just written next to spool.db.`,
    );
  }

  console.warn(`[db] schema version ${current} != ${SCHEMA_VERSION}; empty DB, building fresh`);
  for (const t of TABLES_TO_DROP) {
    await db.execute(`DROP TABLE IF EXISTS ${t}`);
  }
  await applySchema(db);
  await db.execute(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  console.info(`[db] schema rebuilt; user_version set to ${SCHEMA_VERSION}`);
  return true;
};

// Test-only export (§19.3): lets the node:sqlite-backed Vitest cases drive the real
// migration walk against historical schemas. Never called outside tests.
export const __migrateSchemaForTest = migrateSchema;

// Idempotent base-data guarantee: at least one workspace (the Inbox) and at least one
// thread (the capture target). Runs at startup, and again after a deletion — so deleting
// the capture-target thread, or every thread / the Inbox workspace, self-heals by
// recreating an empty Inbox rather than leaving capture with no target.
const seedDefaults = async (db: Database, lang: SeedLanguage): Promise<void> => {
  const now = Date.now();

  const wsRows = await db.select<{ c: number }[]>(
    'SELECT COUNT(*) AS c FROM workspaces WHERE deleted_at IS NULL',
  );
  let wsId: string;
  if ((wsRows[0]?.c ?? 0) === 0) {
    wsId = nanoid();
    await db.execute(
      'INSERT INTO workspaces (id, title, sort_order, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)',
      [wsId, INBOX_TITLE[lang], 0, now, now],
    );
  } else {
    const first = await db.select<{ id: string }[]>(
      'SELECT id FROM workspaces WHERE deleted_at IS NULL ORDER BY sort_order ASC, created_at ASC LIMIT 1',
    );
    wsId = first[0]!.id;
  }

  const thRows = await db.select<{ c: number }[]>(
    'SELECT COUNT(*) AS c FROM threads WHERE deleted_at IS NULL',
  );
  if ((thRows[0]?.c ?? 0) === 0) {
    await db.execute(
      `INSERT INTO threads (id, workspace_id, title, status, is_capture_target, created_at, updated_at)
       VALUES ($1, $2, $3, 'active', 1, $4, $5)`,
      [nanoid(), wsId, UNSORTED_TITLE[lang], now, now],
    );
  }
};

// Public entry point for the same guarantee, called by the stores after a deletion.
export const ensureBaseData = async (): Promise<void> => {
  await seedDefaults(await getDb(), seedLanguage);
};

// Tutorial thread for a brand-new install (Task 3, Ocean 2026-07-09 #5). Seeded ONLY
// from the fresh-DB rebuild path — never by seedDefaults' self-heal, so deleting it is
// final and re-launching / clearing data can't resurrect it. The blocks are the manual:
// each one teaches the gesture it demonstrates (content finalized with Ocean).
interface SeedBlock {
  content: string;
  annotation?: string;
  pinned?: boolean;
}
interface SeedThread {
  title: string;
  summary: string;
  blocks: SeedBlock[];
}

// 任务二 A2 (2026-07-12, Ocean-approved): the MCP scenarios get their own thread —
// one copy-paste phrase per block, the annotation naming the tool behind it. The
// thread is its own demo material (its review phrase asks the AI to read it).
const TUTORIAL: Record<SeedLanguage, { source: string; gesture: SeedThread; mcp: SeedThread }> = {
  zh: {
    source: 'Spool 指南',
    gesture: {
      title: '欢迎使用 Spool',
      summary: '新手教程：捕捉 → 整理 → 打包 → MCP 互通；可随时整条删除',
      blocks: [
        {
          content:
            'Spool 是一张上下文工作台：把散落的资料捕进「项目」，需要 AI 时一键打包成完整上下文。它自己不带 AI——你的数据永远只在本机。',
          annotation: '这条灰字就是「批注」——你自己的话，打包时会原样保留给 AI。',
        },
        {
          content:
            '捕捉：在任何应用选中文字按 ⌘C，再快速双击 ⌥（Option）——内容自动落进「捕捉目标」项目。这一步需要「输入监听」权限：点顶部横幅的「打开捕捉」开启，授权后完全退出 Spool 再打开。',
        },
        {
          content:
            '留下想法：捕捉弹窗里光标已经在批注框里，直接打字写下你此刻的想法，Enter 保存——你的话比摘录本身更值钱，AI 也会优先看它。不想写就点旁边任意处跳过。',
        },
        {
          content:
            '重要的块点 📌 置顶（打包时进入 Key Points）；选中文字可以高亮==像这样==；每个块都能写批注。试试取消这条的置顶！',
          pinned: true,
        },
        {
          content:
            '⌘⇧P 把整个项目变成结构化上下文，粘给任何 AI 就能用——网页版也行，不用装东西、不用配置。可选范围（仅置顶/近 7 天）与任务模板。',
        },
        {
          content:
            '（可选）设置 → MCP，一键接上你在用的 AI 客户端。上一步的打包已经是全部功能，MCP 只是省掉每次粘贴：接好后对 AI 说「读一下我的欢迎项目」，它自己就能查阅、检索、替你归档结论。AI 写入的块会带来源标签，和你自己的笔记始终分得清。',
        },
      ],
    },
    mcp: {
      title: '让 AI 用上你的 Spool',
      summary: '一块一个场景：引号里的话照抄给 AI；可随时整条删除',
      blocks: [
        {
          content:
            '这一整个项目讲的是可选的那一步：设置 → MCP，一键接上你在用的 AI 客户端（重启那个客户端才生效）。不接也不缺功能——⌘⇧P 打包粘给任何 AI 的网页版一样能用，接上只是省掉每次粘贴。下面每块一个场景，引号里的话可以照抄。Spool 本体不带 AI，数据始终在本机。',
          annotation: 'AI 只读接入即可用；要让它代写，需另开「允许 AI 写入」。',
          pinned: true,
        },
        {
          content:
            '复习与接续：「帮我复习〈让 AI 用上你的 Spool〉这个项目，再考我两个问题」——把标题换成你自己的项目，就是你的复习卡。',
          annotation: '背后是 get_pack：AI 拿到整个项目的结构化简报，置顶块和你的批注都在里面。',
        },
        {
          content: '回顾一周：「我最近一周在忙什么？」',
          annotation: '背后是 get_digest：跨项目简报，近 7 天各项目的新块加常驻置顶锚点。',
        },
        {
          content:
            '随手归档：「把刚才这段结论存进〈XX〉项目，批注一句为什么重要」（需打开「允许 AI 写入」）。',
          annotation:
            '背后是 add_block：AI 写入的块带「Claude · MCP」来源标签，永远和你手写的分得清；它还会用引用标注结论依据的旧块。',
        },
        {
          content: '找与查重：「XX 这个主题我记在哪个项目？」「帮我看看有没有重复收藏的内容」',
          annotation:
            '背后是 search_blocks / find_similar_blocks：查重只出报告，合并始终由你在 Spool 里动手。',
        },
        {
          content: '库体检：「给我的思簿做个体检」',
          annotation: '背后是 check_library：只读报告内部 id 泄漏与失效引用，不改你一个字。',
        },
      ],
    },
  },
  en: {
    source: 'Spool Guide',
    gesture: {
      title: 'Welcome to Spool',
      summary: 'Quick tour: capture → sort → pack → hand it to your AI. Delete any time.',
      blocks: [
        {
          content:
            'Spool is a workbench for context: capture scattered material into a project, then pack the whole project into one ready-made context whenever you need an AI. Spool ships no AI of its own — your data never leaves this machine.',
          annotation:
            'This grey line is an annotation — your own words. Packing passes them to the AI exactly as written.',
        },
        {
          content:
            'Capture: select text in any app and press ⌘C, then quickly double-tap ⌥ (Option) — it lands in your capture-target project. This needs the Input Monitoring permission: press "Turn on capture" in the banner at the top, then fully quit Spool and reopen.',
        },
        {
          content:
            "Leave a note: the capture popup opens with the cursor already in the note box — just type what you're thinking and press Enter. Your own words are worth more than the excerpt, and AIs read them first. Don't want one? Click anywhere else to skip.",
        },
        {
          content:
            'Pin the blocks that matter with 📌 (they lead the pack as Key Points); select text to highlight it ==like this==; every block can carry an annotation. Try unpinning this one!',
          pinned: true,
        },
        {
          content:
            '⌘⇧P turns the whole project into structured context you can paste into any AI — a browser tab works, with nothing to install and nothing to configure. Pick a range (pinned only / last 7 days) and a task template.',
        },
        {
          content:
            'Optional: Settings → MCP, and connect whichever AI client you use in one click. Packing above is already the full feature set — MCP only saves you the pasting: tell your AI "read my welcome project" and it looks things up, searches, and files conclusions back on its own. Blocks written by an AI carry a source tag, so they never blur with your own notes.',
        },
      ],
    },
    mcp: {
      title: 'Put your AI to work on Spool',
      summary: 'One scenario per block: copy the line in quotes to your AI. Delete any time.',
      blocks: [
        {
          content:
            'This whole project is about the optional step: Settings → MCP, and connect whichever AI client you use in one click (restart that client to apply). Skipping it costs you no features — ⌘⇧P packs the project for any AI, a browser tab included; connecting only saves you the pasting. One scenario per block below, and the line in quotes is meant to be copied as-is. Spool ships no AI of its own; your data stays on this machine.',
          annotation:
            'Read-only access is enough for all of this; to let the AI write back, turn on "Allow AI to write" as well.',
          pinned: true,
        },
        {
          content:
            'Review and pick up where you left off: "Walk me through my \'Put your AI to work on Spool\' project, then quiz me on two things." Swap in one of your own projects and it becomes your revision card.',
          annotation:
            'That runs get_pack: the AI gets the whole project as a structured brief, pinned blocks and your annotations included.',
        },
        {
          content: 'Look back on a week: "What have I been working on lately?"',
          annotation:
            'That runs get_digest: a brief across projects — the last 7 days of new blocks, plus the standing pinned anchors.',
        },
        {
          content:
            'File something on the spot: "Save that conclusion into my \'XX\' project and note why it matters." (Needs "Allow AI to write".)',
          annotation:
            'That runs add_block: blocks written by an AI carry a "Claude · MCP" source tag and never blur with your own; it also cites the older blocks a conclusion rests on.',
        },
        {
          content:
            'Find things, spot repeats: "Which project did I write about XX in?" "Check whether I saved the same thing twice."',
          annotation:
            'That runs search_blocks / find_similar_blocks: the duplicate check only reports — merging is always yours to do, inside Spool.',
        },
        {
          content: 'Check the library: "Run a health check on my notebook."',
          annotation:
            'That runs check_library: a read-only report on leaked internal ids and broken references. It changes nothing.',
        },
      ],
    },
  },
};

const insertSeedThread = async (
  db: Database,
  wsId: string,
  thread: SeedThread,
  source: string,
  at: number,
): Promise<string> => {
  const threadId = nanoid();
  await db.execute(
    `INSERT INTO threads (id, workspace_id, title, summary, summary_source, status,
                          is_capture_target, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'user', 'active', 0, $5, $5)`,
    [threadId, wsId, thread.title, thread.summary, at],
  );
  for (let i = 0; i < thread.blocks.length; i++) {
    const b = thread.blocks[i]!;
    await db.execute(
      `INSERT INTO blocks (id, thread_id, kind, content, annotation, source, pinned, created_at)
       VALUES ($1, $2, 'text', $3, $4, $5, $6, $7)`,
      [nanoid(), threadId, b.content, b.annotation ?? null, source, b.pinned ? 1 : 0, at + i],
    );
  }
  return threadId;
};

// DESIGN_FIRST_RUN 拍板点 1: the tutorial thread this launch just seeded. Non-null
// only in the process that created the database — that is exactly "this is a first
// launch", with no extra state to persist and no way for it to leak into a later
// session. App reads it to open there instead of the empty Unsorted thread.
let firstRunThreadId: string | null = null;
export const getFirstRunThreadId = (): string | null => firstRunThreadId;

const seedTutorialThread = async (db: Database, lang: SeedLanguage): Promise<void> => {
  const ws = await db.select<{ id: string }[]>(
    'SELECT id FROM workspaces WHERE deleted_at IS NULL ORDER BY sort_order ASC, created_at ASC LIMIT 1',
  );
  const wsId = ws[0]?.id;
  if (!wsId) return;
  const copy = TUTORIAL[lang];
  const now = Date.now();
  firstRunThreadId = await insertSeedThread(db, wsId, copy.gesture, copy.source, now);
  // The MCP thread is timestamped 10s earlier so the gesture tutorial stays on top of
  // the sidebar.
  await insertSeedThread(db, wsId, copy.mcp, copy.source, now - 10_000);
};

// Test-only export: lets Vitest exercise the seed against the node:sqlite adapter.
export const __seedTutorialThreadForTest = seedTutorialThread;

// The provenance label every seeded tutorial block carries, in both languages. A thread
// made up entirely of these is still the tutorial as we wrote it — LogView opens those at
// the top so the guide is read from block 1, while every other thread opens at the newest
// block (Ocean 2026-08-03). The moment the user captures something of their own into the
// thread, it stops being "the tutorial" and behaves like any other project.
const TUTORIAL_SOURCES: ReadonlySet<string> = new Set(
  Object.values(TUTORIAL).map((copy) => copy.source),
);
export const isTutorialSource = (source: string | null): boolean =>
  source !== null && TUTORIAL_SOURCES.has(source);

/** The same labels, for a query that has to ask the question in SQL (lib/db/blocks.ts binds
 *  them as parameters). Handing over the VALUES keeps this set the one definition of
 *  「哪些是教程种下的」 — a second spelling in a SQL literal is what drifts. */
export const tutorialSourceLabels = (): string[] => [...TUTORIAL_SOURCES];

// Switching the UI language re-translates the tutorial threads in place (Ocean,
// 2026-08-03: "教程的语言…需要随切换语言变化"). These are database rows, not UI strings,
// so the rule that keeps this from eating anyone's work is: **only rewrite what is still
// exactly as seeded.**
//
// - A thread is found by its seeded title; renamed or deleted → skipped, and nothing is
//   ever re-created (deleting the tutorial stays final, same as before).
// - Every seeded block must still match its seeded text, annotation and source label. One
//   edited block skips the whole thread — half-translated would be worse than untouched.
// - Blocks the user captured into the thread are left alone; so are pin state, ids,
//   timestamps and `updated_at` (a language switch is not activity, it must not reorder
//   the sidebar).
//
// Returns true when anything changed, so the caller can refresh the stores.
export const retranslateTutorial = async (
  from: SeedLanguage,
  to: SeedLanguage,
): Promise<boolean> => {
  if (from === to) return false;
  const db = await getDb();
  const fromCopy = TUTORIAL[from];
  const toCopy = TUTORIAL[to];
  let changed = false;

  for (const key of ['gesture', 'mcp'] as const) {
    const before = fromCopy[key];
    const after = toCopy[key];
    // The two languages are parallel translations; if that ever stops being true, do
    // nothing rather than pair blocks up by the wrong index.
    if (before.blocks.length !== after.blocks.length) continue;

    const threads = await db.select<{ id: string; summary: string | null }[]>(
      'SELECT id, summary FROM threads WHERE title = $1 AND deleted_at IS NULL',
      [before.title],
    );
    const thread = threads[0];
    if (!thread) continue;

    const rows = await db.select<{ id: string; content: string; annotation: string | null }[]>(
      'SELECT id, content, annotation FROM blocks WHERE thread_id = $1 AND source = $2',
      [thread.id, fromCopy.source],
    );
    const matched: string[] = [];
    for (const seedBlock of before.blocks) {
      const hit = rows.find(
        (r) =>
          !matched.includes(r.id) &&
          r.content === seedBlock.content &&
          (r.annotation ?? null) === (seedBlock.annotation ?? null),
      );
      if (!hit) break;
      matched.push(hit.id);
    }
    if (matched.length !== before.blocks.length) continue;

    for (let i = 0; i < matched.length; i++) {
      const target = after.blocks[i]!;
      await db.execute('UPDATE blocks SET content = $1, annotation = $2, source = $3 WHERE id = $4', [
        target.content,
        target.annotation ?? null,
        toCopy.source,
        matched[i]!,
      ]);
    }
    // The summary is a separate editable field — swap it only if it is still the seeded
    // one, so a user-written card keeps their words.
    if (thread.summary === before.summary) {
      await db.execute('UPDATE threads SET title = $1, summary = $2 WHERE id = $3', [
        after.title,
        after.summary,
        thread.id,
      ]);
    } else {
      await db.execute('UPDATE threads SET title = $1 WHERE id = $2', [after.title, thread.id]);
    }
    changed = true;
  }

  return changed;
};

// Only the main window initializes the database (migrations + base-data seeding). The
// overlay and collect windows run their own JS contexts and also open the DB at startup
// (the collect panel reads the capture target on mount) — on a FRESH install their
// seedDefaults raced the main window's (both saw count 0, both inserted), leaving a
// duplicate 收件箱/未分类, both flagged capture target; reproduced ~1 in 4 first
// launches. The fresh-DB rebuild inside migrateSchema is racy the same way (a late
// second rebuild would drop the first window's just-seeded rows). Single-writer init
// closes both: non-main windows open the connection and read; until main finishes, a
// fresh install's reads fail or return nothing and those surfaces already degrade
// quietly. Outside a Tauri window (tests calling initDb directly) the label probe
// throws — default to initializing.
const isMainWindow = (): boolean => {
  try {
    return getCurrentWindow().label === 'main';
  } catch {
    return true;
  }
};

const initDb = async (): Promise<Database> => {
  console.info('[db] loading sqlite:spool.db');
  const db = await Database.load('sqlite:spool.db');
  if (isMainWindow()) {
    console.info('[db] loaded; checking schema version');
    const fresh = await migrateSchema(db);
    console.info('[db] schema ready; seeding defaults');
    await seedDefaults(db, seedLanguage);
    if (fresh) {
      console.info(`[db] fresh install; seeding tutorial thread (lang=${seedLanguage})`);
      await seedTutorialThread(db, seedLanguage);
    }
  } else {
    console.info('[db] loaded; non-main window skips migration + seeding');
  }
  console.info('[db] ready');
  return db;
};

export const getDb = (): Promise<Database> => {
  if (testDb) return Promise.resolve(testDb);
  if (!dbPromise) {
    dbPromise = initDb().catch((e) => {
      // Reset so the next caller can retry after the user fixes the underlying issue
      // (e.g. permissions). Without this, every subsequent call awaits the same rejected
      // promise forever.
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
};

// "Clear all data" danger action (§9.12). Wipes every user row in dependency order
// (deleting blocks fires the FTS delete trigger, keeping blocks_fts in sync), then
// re-seeds the empty Inbox so the app still has a capture target. The caller is
// expected to reload the window afterwards so every store re-hydrates.
export const clearAllData = async (): Promise<void> => {
  const db = await getDb();
  // v10: the review queue goes too. It names thread ids that are about to stop existing,
  // and a queue that survives "clear all data" would offer to file text into projects the
  // user just wiped.
  for (const t of ['proposals', 'proposal_batches', 'attachments', 'blocks', 'threads', 'workspaces']) {
    await db.execute(`DELETE FROM ${t}`);
  }
  await seedDefaults(db, seedLanguage);
};
