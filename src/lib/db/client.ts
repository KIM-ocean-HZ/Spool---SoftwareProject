import { getCurrentWindow } from '@tauri-apps/api/window';
import Database from '@tauri-apps/plugin-sql';
import { nanoid } from 'nanoid';
import schemaSql from './schema.sql?raw';

export const INBOX_WORKSPACE_TITLE = '收件箱';
export const UNSORTED_THREAD_TITLE = '未分类';

// Bump this whenever schema.sql changes, and add a named step to MIGRATIONS that
// carries a database from the previous version to the new one. On startup the
// database's PRAGMA user_version is compared against this and every applicable step
// runs in sequence, each stamping user_version as its own checkpoint (§19.3).
const SCHEMA_VERSION = 5;

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
];

const migrateSchema = async (db: Database): Promise<void> => {
  const rows = await db.select<{ user_version: number }[]>('PRAGMA user_version');
  let current = rows[0]?.user_version ?? 0;
  if (current === SCHEMA_VERSION) {
    console.info(`[db] schema version ${current} matches; no rebuild`);
    return;
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
    return;
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
};

// Test-only export (§19.3): lets the node:sqlite-backed Vitest cases drive the real
// migration walk against historical schemas. Never called outside tests.
export const __migrateSchemaForTest = migrateSchema;

// Idempotent base-data guarantee: at least one workspace (the Inbox) and at least one
// thread (the capture target). Runs at startup, and again after a deletion — so deleting
// the capture-target thread, or every thread / the Inbox workspace, self-heals by
// recreating an empty Inbox rather than leaving capture with no target.
const seedDefaults = async (db: Database): Promise<void> => {
  const now = Date.now();

  const wsRows = await db.select<{ c: number }[]>(
    'SELECT COUNT(*) AS c FROM workspaces WHERE deleted_at IS NULL',
  );
  let wsId: string;
  if ((wsRows[0]?.c ?? 0) === 0) {
    wsId = nanoid();
    await db.execute(
      'INSERT INTO workspaces (id, title, sort_order, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)',
      [wsId, INBOX_WORKSPACE_TITLE, 0, now, now],
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
      [nanoid(), wsId, UNSORTED_THREAD_TITLE, now, now],
    );
  }
};

// Public entry point for the same guarantee, called by the stores after a deletion.
export const ensureBaseData = async (): Promise<void> => {
  await seedDefaults(await getDb());
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
    await migrateSchema(db);
    console.info('[db] schema ready; seeding defaults');
    await seedDefaults(db);
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
  for (const t of ['attachments', 'blocks', 'threads', 'workspaces']) {
    await db.execute(`DELETE FROM ${t}`);
  }
  await seedDefaults(db);
};
