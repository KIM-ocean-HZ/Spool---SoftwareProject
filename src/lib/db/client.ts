import Database from '@tauri-apps/plugin-sql';
import { nanoid } from 'nanoid';
import schemaSql from './schema.sql?raw';

export const INBOX_WORKSPACE_TITLE = '收件箱';
export const UNSORTED_THREAD_TITLE = '未分类';

// Bump this whenever schema.sql changes. On startup, if the database's PRAGMA
// user_version differs, every table is dropped and the schema is rebuilt from
// scratch — Spool is an unreleased personal tool with no production data and
// zero migration cost (PLAN_EN.md §5), so DROP-and-recreate is the policy.
// This is what makes "the next launch rebuilds the DB" code-guaranteed instead
// of depending on someone remembering to delete spool.db by hand.
const SCHEMA_VERSION = 2;

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

// DROP-and-recreate guard. If the on-disk schema version doesn't match
// SCHEMA_VERSION, drop every table and rebuild from schema.sql, then stamp the
// new version. A brand-new database reports user_version 0, which also triggers
// the (no-op) drop and a clean build.
const migrateSchema = async (db: Database): Promise<void> => {
  const rows = await db.select<{ user_version: number }[]>('PRAGMA user_version');
  const current = rows[0]?.user_version ?? 0;
  if (current === SCHEMA_VERSION) {
    console.info(`[db] schema version ${current} matches; no rebuild`);
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
    `INSERT INTO threads (id, workspace_id, title, status, is_capture_target, progress, created_at, updated_at)
     VALUES ($1, $2, $3, 'active', 1, 0, $4, $5)`,
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
