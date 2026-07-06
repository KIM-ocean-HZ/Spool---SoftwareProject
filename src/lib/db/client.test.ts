import { createRequire } from 'node:module';
import type Database from '@tauri-apps/plugin-sql';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { __migrateSchemaForTest, __setTestDb } from './client';
import schemaSql from './schema.sql?raw';

const { DatabaseSync } = createRequire(import.meta.url)(
  'node:sqlite',
) as typeof import('node:sqlite');
type Sqlite = InstanceType<typeof DatabaseSync>;

type SqlValue = string | number | bigint | null | Uint8Array;
const toNumbered = (sql: string): string => sql.replace(/\$(\d+)/g, '?$1');

const makeAdapter = (handle: Sqlite): Database =>
  ({
    execute: async (sql: string, params: unknown[] = []) => {
      const r = handle.prepare(toNumbered(sql)).run(...(params as SqlValue[]));
      return { rowsAffected: Number(r.changes), lastInsertId: Number(r.lastInsertRowid) };
    },
    select: async (sql: string, params: unknown[] = []) =>
      handle.prepare(toNumbered(sql)).all(...(params as SqlValue[])),
  }) as unknown as Database;

const applySchema = (handle: Sqlite): void => {
  handle.exec(schemaSql.replace(/--.*$/gm, ''));
};

const userVersion = (handle: Sqlite): number =>
  Number((handle.prepare('PRAGMA user_version').get() as { user_version: number }).user_version);

const columnNames = (handle: Sqlite, table: string): string[] =>
  (handle.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((r) => r.name);

// Rewind a current-schema database to the historical v2 shape: threads regain the
// rolled-back progress/next_step columns; attachments lose all four extraction-era
// columns (v3→4 added three, v4→5 added include_in_pack).
const downgradeToV2 = (handle: Sqlite): void => {
  handle.exec(`
    ALTER TABLE threads ADD COLUMN progress INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE threads ADD COLUMN next_step TEXT;
    ALTER TABLE attachments DROP COLUMN extracted_text;
    ALTER TABLE attachments DROP COLUMN extracted_at;
    ALTER TABLE attachments DROP COLUMN extraction_kind;
    ALTER TABLE attachments DROP COLUMN include_in_pack;
    PRAGMA user_version = 2;
  `);
};

const seedUserData = (handle: Sqlite): void => {
  const now = 1700000000000;
  handle.exec(`
    INSERT INTO workspaces (id, title, sort_order, created_at, updated_at)
      VALUES ('w1', 'ws', 0, ${now}, ${now});
    INSERT INTO threads (id, workspace_id, title, created_at, updated_at)
      VALUES ('t1', 'w1', 'thread', ${now}, ${now});
    INSERT INTO blocks (id, thread_id, content, created_at)
      VALUES ('b1', 't1', 'hello block', ${now});
    INSERT INTO attachments (id, block_id, kind, target, created_at)
      VALUES ('a1', 'b1', 'url', 'https://example.com', ${now});
  `);
};

describe('migrateSchema registry (§19.3)', () => {
  let handle: Sqlite;
  let db: Database;

  beforeEach(() => {
    handle = new DatabaseSync(':memory:');
    db = makeAdapter(handle);
    __setTestDb(db);
  });

  afterEach(() => {
    __setTestDb(null);
    handle.close();
  });

  it('walks a v2 database through every step to the current version', async () => {
    applySchema(handle);
    downgradeToV2(handle);
    seedUserData(handle);

    await __migrateSchemaForTest(db);

    expect(userVersion(handle)).toBe(5);
    const threadCols = columnNames(handle, 'threads');
    expect(threadCols).not.toContain('progress');
    expect(threadCols).not.toContain('next_step');
    // The old if-chain stamped a v2 database straight to 5 without these columns —
    // the sequential walk must add all four attachment columns.
    const attCols = columnNames(handle, 'attachments');
    for (const c of ['extracted_text', 'extracted_at', 'extraction_kind', 'include_in_pack']) {
      expect(attCols).toContain(c);
    }
    // User data survives.
    expect(handle.prepare('SELECT content FROM blocks').all()).toEqual([
      { content: 'hello block' },
    ]);
    expect(handle.prepare('SELECT target FROM attachments').all()).toEqual([
      { target: 'https://example.com' },
    ]);
  });

  it('resumes from a mid-chain checkpoint (v4 → v5 only)', async () => {
    applySchema(handle);
    handle.exec(`
      ALTER TABLE attachments DROP COLUMN include_in_pack;
      PRAGMA user_version = 4;
    `);
    seedUserData(handle);

    await __migrateSchemaForTest(db);

    expect(userVersion(handle)).toBe(5);
    expect(columnNames(handle, 'attachments')).toContain('include_in_pack');
    expect(handle.prepare('SELECT COUNT(*) AS c FROM blocks').get()).toEqual({ c: 1 });
  });

  it('is a no-op when the version already matches', async () => {
    applySchema(handle);
    handle.exec('PRAGMA user_version = 5');
    seedUserData(handle);

    await __migrateSchemaForTest(db);

    expect(userVersion(handle)).toBe(5);
    expect(handle.prepare('SELECT COUNT(*) AS c FROM blocks').get()).toEqual({ c: 1 });
  });

  it('refuses to rebuild a populated database at an unknown version', async () => {
    applySchema(handle);
    handle.exec('PRAGMA user_version = 99');
    seedUserData(handle);

    await expect(__migrateSchemaForTest(db)).rejects.toThrow(/refusing to rebuild/);
    // Nothing was dropped.
    expect(handle.prepare('SELECT COUNT(*) AS c FROM blocks').get()).toEqual({ c: 1 });
    expect(userVersion(handle)).toBe(99);
  });

  it('rebuilds an empty database at an unknown version from schema.sql', async () => {
    // A fresh install: no tables yet, user_version 0.
    await __migrateSchemaForTest(db);

    expect(userVersion(handle)).toBe(5);
    const tables = (
      handle.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
        name: string;
      }[]
    ).map((r) => r.name);
    for (const t of ['workspaces', 'threads', 'blocks', 'attachments']) {
      expect(tables).toContain(t);
    }
  });
});
