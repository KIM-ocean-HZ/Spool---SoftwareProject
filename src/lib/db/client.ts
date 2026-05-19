import Database from '@tauri-apps/plugin-sql';
import { nanoid } from 'nanoid';
import schemaSql from './schema.sql?raw';

export const INBOX_WORKSPACE_TITLE = '收件箱';
export const UNSORTED_THREAD_TITLE = '未分类';

// Bump this whenever schema.sql changes. On startup the database's PRAGMA
// user_version is compared against this. The v2 → v3 and v3 → v4 steps run
// additive ALTER TABLE migrations (see migrateSchema) that preserve all user
// data; any other mismatch falls back to DROP-and-recreate — acceptable for an
// unreleased personal tool with no production data (PLAN_EN.md §5, §8.1). §19.3
// tracks the fuller migration framework still owed before any preview release.
const SCHEMA_VERSION = 4;

// Tables in reverse dependency order: blocks_fts (virtual, mirrors blocks),
// attachments → blocks → threads → workspaces. Indexes and the blocks_* FTS
// triggers are dropped automatically with their owning table.
const TABLES_TO_DROP = ['blocks_fts', 'attachments', 'blocks', 'threads', 'workspaces'];

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
// columns; the v3 → v4 step (the v2.7 attachment extraction work) adds three
// `attachments` columns. Both are additive ALTER TABLE migrations that leave
// every row of user data intact. Any other mismatch — including a brand-new
// database at user_version 0 — falls back to dropping every table and rebuilding
// from schema.sql.
const migrateSchema = async (db: Database): Promise<void> => {
  const rows = await db.select<{ user_version: number }[]>('PRAGMA user_version');
  const current = rows[0]?.user_version ?? 0;
  if (current === SCHEMA_VERSION) {
    console.info(`[db] schema version ${current} matches; no rebuild`);
    return;
  }

  // v2 → v3: drop `threads.progress` and `threads.next_step` (PLAN_EN.md §8.1).
  // Each DROP COLUMN is guarded independently — on a fresh or already-migrated
  // database a column may be absent, which is not an error.
  if (current === 2) {
    console.warn('[db] schema version 2 -> 3; additive ALTER TABLE migration');
    for (const col of ['progress', 'next_step']) {
      try {
        await db.execute(`ALTER TABLE threads DROP COLUMN ${col}`);
      } catch (e) {
        console.info(`[db] v2->3: column threads.${col} not dropped (likely absent)`, e);
      }
    }
    await db.execute(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    const after = await db.select<{ user_version: number }[]>('PRAGMA user_version');
    console.info(`[db] v2->3 migration complete; user_version now ${after[0]?.user_version}`);
    return;
  }

  // v3 → v4: add `extracted_text`, `extracted_at`, `extraction_kind` to `attachments`
  // (PLAN_EN.md §8.1, v2.7 text extraction). Each ADD COLUMN is guarded independently —
  // on an already-migrated database the column exists, which is not an error.
  if (current === 3) {
    console.warn('[db] schema version 3 -> 4; additive ALTER TABLE migration');
    for (const col of ['extracted_text TEXT', 'extracted_at INTEGER', 'extraction_kind TEXT']) {
      try {
        await db.execute(`ALTER TABLE attachments ADD COLUMN ${col}`);
      } catch (e) {
        console.info(`[db] v3->4: column attachments.${col} not added (likely exists)`, e);
      }
    }
    await db.execute(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    const after = await db.select<{ user_version: number }[]>('PRAGMA user_version');
    console.info(`[db] v3->4 migration complete; user_version now ${after[0]?.user_version}`);
    return;
  }

  console.warn(`[db] schema version ${current} != ${SCHEMA_VERSION}; rebuilding from scratch`);
  for (const t of TABLES_TO_DROP) {
    await db.execute(`DROP TABLE IF EXISTS ${t}`);
  }
  await applySchema(db);
  // PRAGMA does not accept bound parameters; SCHEMA_VERSION is a code-local integer.
  await db.execute(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  console.info(`[db] schema rebuilt; user_version set to ${SCHEMA_VERSION}`);
};

const seedDefaults = async (db: Database): Promise<void> => {
  const rows = await db.select<{ c: number }[]>(
    'SELECT COUNT(*) AS c FROM workspaces WHERE deleted_at IS NULL',
  );
  if ((rows[0]?.c ?? 0) > 0) return;

  const now = Date.now();
  const wsId = nanoid();
  const tId = nanoid();
  await db.execute(
    'INSERT INTO workspaces (id, title, sort_order, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)',
    [wsId, INBOX_WORKSPACE_TITLE, 0, now, now],
  );
  await db.execute(
    `INSERT INTO threads (id, workspace_id, title, status, is_capture_target, created_at, updated_at)
     VALUES ($1, $2, $3, 'active', 1, $4, $5)`,
    [tId, wsId, UNSORTED_THREAD_TITLE, now, now],
  );
};

const initDb = async (): Promise<Database> => {
  console.info('[db] loading sqlite:spool.db');
  const db = await Database.load('sqlite:spool.db');
  console.info('[db] loaded; checking schema version');
  await migrateSchema(db);
  console.info('[db] schema ready; seeding defaults');
  await seedDefaults(db);
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
  for (const t of ['attachments', 'blocks', 'threads', 'workspaces']) {
    await db.execute(`DELETE FROM ${t}`);
  }
  await seedDefaults(db);
};
