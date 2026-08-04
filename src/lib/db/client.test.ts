import { createRequire } from 'node:module';
import type Database from '@tauri-apps/plugin-sql';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  __migrateSchemaForTest,
  __seedTutorialThreadForTest,
  __setTestDb,
  retranslateTutorial,
} from './client';
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

// Rewind past v9: blocks lose `seq` and its uniqueness guard, and the attachment
// full-text index disappears with its three triggers. Every test that starts below v9
// applies this first, so the v8→v9 step is genuinely exercised rather than skipped by
// its own idempotence guards.
const downgradeToV8 = (handle: Sqlite): void => {
  handle.exec(`
    DROP TRIGGER IF EXISTS attachments_ai;
    DROP TRIGGER IF EXISTS attachments_ad;
    DROP TRIGGER IF EXISTS attachments_au;
    DROP TABLE IF EXISTS attachments_fts;
    DROP INDEX IF EXISTS idx_blocks_thread_seq;
    ALTER TABLE blocks DROP COLUMN seq;
    PRAGMA user_version = 8;
  `);
};

// Rewind a current-schema database to the historical v2 shape: threads regain the
// rolled-back progress/next_step columns and lose summary_source (v5→6); blocks lose
// ref_block_id (v6→7); attachments lose all four extraction-era columns (v3→4 added
// three, v4→5 added include_in_pack).
const downgradeToV2 = (handle: Sqlite): void => {
  downgradeToV8(handle);
  handle.exec(`
    ALTER TABLE threads ADD COLUMN progress INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE threads ADD COLUMN next_step TEXT;
    ALTER TABLE threads DROP COLUMN summary_source;
    ALTER TABLE blocks DROP COLUMN ref_block_id;
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

    expect(userVersion(handle)).toBe(9);
    const threadCols = columnNames(handle, 'threads');
    expect(threadCols).not.toContain('progress');
    expect(threadCols).not.toContain('next_step');
    expect(threadCols).toContain('summary_source');
    expect(columnNames(handle, 'blocks')).toContain('ref_block_id');
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

  it('resumes from a mid-chain checkpoint (v4 onward)', async () => {
    applySchema(handle);
    downgradeToV8(handle);
    handle.exec(`
      ALTER TABLE attachments DROP COLUMN include_in_pack;
      ALTER TABLE threads DROP COLUMN summary_source;
      ALTER TABLE blocks DROP COLUMN ref_block_id;
      PRAGMA user_version = 4;
    `);
    seedUserData(handle);

    await __migrateSchemaForTest(db);

    expect(userVersion(handle)).toBe(9);
    expect(columnNames(handle, 'attachments')).toContain('include_in_pack');
    expect(columnNames(handle, 'threads')).toContain('summary_source');
    expect(columnNames(handle, 'blocks')).toContain('ref_block_id');
    expect(handle.prepare('SELECT COUNT(*) AS c FROM blocks').get()).toEqual({ c: 1 });
  });

  it('v5 → v6 adds summary_source and keeps an existing summary (provenance NULL)', async () => {
    applySchema(handle);
    downgradeToV8(handle);
    handle.exec(`
      ALTER TABLE threads DROP COLUMN summary_source;
      ALTER TABLE blocks DROP COLUMN ref_block_id;
      PRAGMA user_version = 5;
    `);
    seedUserData(handle);
    handle.exec("UPDATE threads SET summary = '既有摘要' WHERE id = 't1'");

    await __migrateSchemaForTest(db);

    expect(userVersion(handle)).toBe(9);
    expect(handle.prepare('SELECT summary, summary_source FROM threads').get()).toEqual({
      summary: '既有摘要',
      summary_source: null,
    });
  });

  it('v6 → v7 adds blocks.ref_block_id (NULL) and keeps user data', async () => {
    applySchema(handle);
    downgradeToV8(handle);
    handle.exec(`
      ALTER TABLE blocks DROP COLUMN ref_block_id;
      PRAGMA user_version = 6;
    `);
    seedUserData(handle);

    await __migrateSchemaForTest(db);

    expect(userVersion(handle)).toBe(9);
    expect(handle.prepare('SELECT content, ref_block_id FROM blocks').get()).toEqual({
      content: 'hello block',
      ref_block_id: null,
    });
  });

  it('v7 → v8 normalizes legacy agent-slug MCP source labels only', async () => {
    applySchema(handle);
    downgradeToV8(handle);
    handle.exec('PRAGMA user_version = 7');
    seedUserData(handle);
    handle.exec(`
      INSERT INTO blocks (id, thread_id, content, source, created_at) VALUES
        ('m1', 't1', 'x', 'local-agent-mode-spool · MCP', 1),
        ('m2', 't1', 'x', 'local-agent-mode-2 · MCP — lecture.pdf', 2),
        ('m3', 't1', 'x', 'Claude · MCP', 3),
        ('m4', 't1', 'x', 'Safari', 4);
    `);

    await __migrateSchemaForTest(db);

    expect(userVersion(handle)).toBe(9);
    const rows = handle
      .prepare("SELECT id, source FROM blocks WHERE id LIKE 'm%' ORDER BY id")
      .all() as { id: string; source: string }[];
    expect(rows.map((r) => r.source)).toEqual([
      'Claude · MCP',
      'Claude · MCP — lecture.pdf',
      'Claude · MCP',
      'Safari',
    ]);
  });

  it('v8 → v9 numbers existing blocks per thread in pack order', async () => {
    applySchema(handle);
    downgradeToV8(handle);
    seedUserData(handle);
    // Deliberately inserted out of chronological order, and split across two threads:
    // the backfill must number by created_at (rowid breaking a tie), per thread, so the
    // number a user sees matches the position the block has always had in the pack.
    handle.exec(`
      INSERT INTO threads (id, workspace_id, title, created_at, updated_at)
        VALUES ('t2', 'w1', 'other', 1, 1);
      INSERT INTO blocks (id, thread_id, content, created_at) VALUES
        ('s3', 't1', 'third',  1700000000300),
        ('s1', 't1', 'first',  1700000000100),
        ('s2', 't1', 'second', 1700000000200),
        ('o1', 't2', 'other thread', 1700000000900);
    `);

    await __migrateSchemaForTest(db);

    expect(userVersion(handle)).toBe(9);
    // b1 (from seedUserData) is the oldest in t1, so it takes #1.
    expect(
      handle.prepare("SELECT id, seq FROM blocks WHERE thread_id = 't1' ORDER BY seq").all(),
    ).toEqual([
      { id: 'b1', seq: 1 },
      { id: 's1', seq: 2 },
      { id: 's2', seq: 3 },
      { id: 's3', seq: 4 },
    ]);
    // Numbering restarts per project — the other thread's only block is its #1.
    expect(handle.prepare("SELECT seq FROM blocks WHERE id = 'o1'").get()).toEqual({ seq: 1 });
  });

  it('v8 → v9 indexes text already extracted out of attachments', async () => {
    applySchema(handle);
    downgradeToV8(handle);
    seedUserData(handle);
    handle.exec(`
      UPDATE attachments SET extracted_text = '验证曲线告诉你模型是欠拟合还是过拟合'
       WHERE id = 'a1';
    `);

    await __migrateSchemaForTest(db);

    // The sentence lives only in the attachment, never in any block's own text — before
    // v9 it was unfindable.
    const hits = handle
      .prepare("SELECT rowid FROM attachments_fts WHERE attachments_fts MATCH '验证曲线'")
      .all();
    expect(hits).toHaveLength(1);
    // And the triggers keep it current afterwards, which is the part a one-off rebuild
    // would not give us.
    handle.exec("UPDATE attachments SET extracted_text = '学习率与批大小' WHERE id = 'a1'");
    expect(
      handle
        .prepare("SELECT rowid FROM attachments_fts WHERE attachments_fts MATCH '验证曲线'")
        .all(),
    ).toHaveLength(0);
    expect(
      handle
        .prepare("SELECT rowid FROM attachments_fts WHERE attachments_fts MATCH '学习率'")
        .all(),
    ).toHaveLength(1);
  });

  it('is a no-op when the version already matches', async () => {
    applySchema(handle);
    handle.exec('PRAGMA user_version = 9');
    seedUserData(handle);

    // Only the fresh-rebuild path reports true — it is the sole tutorial-seed gate.
    expect(await __migrateSchemaForTest(db)).toBe(false);

    expect(userVersion(handle)).toBe(9);
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
    // A fresh install: no tables yet, user_version 0. The rebuild reports fresh=true,
    // which is what lets initDb seed the tutorial thread exactly once.
    expect(await __migrateSchemaForTest(db)).toBe(true);

    expect(userVersion(handle)).toBe(9);
    const tables = (
      handle.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
        name: string;
      }[]
    ).map((r) => r.name);
    for (const t of ['workspaces', 'threads', 'blocks', 'attachments']) {
      expect(tables).toContain(t);
    }
  });

  it('walking the registry does not report fresh (no tutorial re-seed on upgrade)', async () => {
    applySchema(handle);
    downgradeToV8(handle);
    handle.exec(`
      ALTER TABLE threads DROP COLUMN summary_source;
      ALTER TABLE blocks DROP COLUMN ref_block_id;
      PRAGMA user_version = 5;
    `);
    seedUserData(handle);

    expect(await __migrateSchemaForTest(db)).toBe(false);
  });

  it('seeds the tutorial + MCP scenario threads (fresh install only)', async () => {
    applySchema(handle);
    handle.exec('PRAGMA user_version = 9');
    handle.exec(`
      INSERT INTO workspaces (id, title, sort_order, created_at, updated_at)
        VALUES ('w1', '收件箱', 0, 1, 1);
    `);

    await __seedTutorialThreadForTest(db, 'zh');

    // Two seeded threads; the gesture tutorial stays newest so it tops the sidebar.
    const threads = handle
      .prepare(
        'SELECT title, summary_source, is_capture_target FROM threads ORDER BY updated_at DESC',
      )
      .all() as Record<string, unknown>[];
    expect(threads.map((t) => t.title)).toEqual(['欢迎使用 Spool', '让 AI 用上你的 Spool']);
    expect(threads.every((t) => t.summary_source === 'user')).toBe(true); // MCP may not overwrite the cards
    expect(threads.every((t) => t.is_capture_target === 0)).toBe(true); // 未分类 keeps the capture target
    const blocks = handle
      .prepare('SELECT content, annotation, source, pinned FROM blocks ORDER BY created_at ASC')
      .all() as Record<string, unknown>[];
    expect(blocks).toHaveLength(12); // 6 gesture guide + 6 MCP scenarios
    expect(blocks.every((b) => b.source === 'Spool 指南')).toBe(true);
    expect(blocks.filter((b) => b.pinned === 1)).toHaveLength(2); // one anchor per thread
    // 任务二 A2: every scenario block's annotation names the tool behind the phrase.
    const scenarioNotes = blocks.slice(0, 6).map((b) => String(b.annotation));
    for (const tool of ['get_pack', 'get_digest', 'add_block', 'find_similar_blocks', 'check_library']) {
      expect(scenarioNotes.some((a) => a.includes(tool))).toBe(true);
    }
    // The FTS triggers indexed both threads (searchable like any user block).
    expect(
      handle.prepare("SELECT COUNT(*) AS c FROM blocks_fts WHERE blocks_fts MATCH '\"批注框\"'").get(),
    ).toEqual({ c: 1 });
    expect(
      handle.prepare("SELECT COUNT(*) AS c FROM blocks_fts WHERE blocks_fts MATCH '\"做个体检\"'").get(),
    ).toEqual({ c: 1 });
  });

  // 2026-07-31 (HANDOFF §2.2): the seed is per-language — an English first launch must
  // not land Chinese tutorial rows in the database, since these are user data and no
  // later language switch re-translates them.
  it('seeds the tutorial in English when the install starts in en', async () => {
    applySchema(handle);
    handle.exec('PRAGMA user_version = 9');
    handle.exec(`
      INSERT INTO workspaces (id, title, sort_order, created_at, updated_at)
        VALUES ('w1', 'Inbox', 0, 1, 1);
    `);

    await __seedTutorialThreadForTest(db, 'en');

    const threads = handle
      .prepare('SELECT title FROM threads ORDER BY updated_at DESC')
      .all() as Record<string, unknown>[];
    expect(threads.map((t) => t.title)).toEqual([
      'Welcome to Spool',
      'Put your AI to work on Spool',
    ]);
    const blocks = handle
      .prepare('SELECT content, annotation, source, pinned FROM blocks ORDER BY created_at ASC')
      .all() as Record<string, unknown>[];
    expect(blocks).toHaveLength(12);
    expect(blocks.every((b) => b.source === 'Spool Guide')).toBe(true);
    expect(blocks.filter((b) => b.pinned === 1)).toHaveLength(2);
    // Ocean 2026-07-30: "everything but the logo is English" — no CJK ideographs and no
    // CJK punctuation (「」〈〉，。) anywhere in the seeded copy. ⌘/⌥/📌 are not CJK.
    const cjk = /[一-鿿　-〿＀-￯]/;
    for (const b of blocks) {
      expect(cjk.test(String(b.content))).toBe(false);
      expect(cjk.test(String(b.annotation ?? ''))).toBe(false);
    }
    for (const t of threads) expect(cjk.test(String(t.title))).toBe(false);
  });
});

// Ocean 2026-08-03: switching the UI language re-translates the tutorial threads. They
// are database rows, so the whole feature hangs on one rule — only rewrite what is still
// exactly as seeded. These three cover the rule from both sides.
describe('retranslateTutorial', () => {
  let handle: Sqlite;
  let db: Database;

  beforeEach(() => {
    handle = new DatabaseSync(':memory:');
    db = makeAdapter(handle);
    __setTestDb(db);
    applySchema(handle);
    handle.exec('PRAGMA user_version = 9');
    handle.exec(`
      INSERT INTO workspaces (id, title, sort_order, created_at, updated_at)
        VALUES ('w1', 'Inbox', 0, 1, 1);
    `);
  });

  afterEach(() => {
    __setTestDb(null);
    handle.close();
  });

  const titles = (): unknown[] =>
    (handle.prepare('SELECT title FROM threads ORDER BY updated_at DESC').all() as {
      title: string;
    }[]).map((t) => t.title);

  it('rewrites an untouched English tutorial into Chinese, in place', async () => {
    await __seedTutorialThreadForTest(db, 'en');
    const before = handle.prepare('SELECT id, pinned, created_at FROM blocks ORDER BY id').all();

    expect(await retranslateTutorial('en', 'zh')).toBe(true);

    expect(titles()).toEqual(['欢迎使用 Spool', '让 AI 用上你的 Spool']);
    const blocks = handle
      .prepare('SELECT content, source FROM blocks ORDER BY created_at ASC')
      .all() as { content: string; source: string }[];
    expect(blocks).toHaveLength(12);
    expect(blocks.every((b) => b.source === 'Spool 指南')).toBe(true);
    expect(blocks.some((b) => b.content.includes('捕捉目标'))).toBe(true);
    // Same rows, same pins, same timestamps — this is a rewrite, not a re-seed.
    expect(handle.prepare('SELECT id, pinned, created_at FROM blocks ORDER BY id').all()).toEqual(
      before,
    );
    // Search stays consistent: the FTS mirror followed the update.
    expect(
      handle.prepare("SELECT COUNT(*) AS c FROM blocks_fts WHERE blocks_fts MATCH '\"批注框\"'").get(),
    ).toEqual({ c: 1 });
  });

  it('leaves a thread alone once the user has edited one of its blocks', async () => {
    await __seedTutorialThreadForTest(db, 'en');
    handle
      .prepare("UPDATE blocks SET content = 'my own words' WHERE content LIKE 'Capture:%'")
      .run();

    expect(await retranslateTutorial('en', 'zh')).toBe(true); // the other thread still swaps

    // The edited thread keeps its English title and every one of its blocks.
    expect(titles()).toContain('Welcome to Spool');
    const kept = handle
      .prepare("SELECT COUNT(*) AS c FROM blocks WHERE source = 'Spool Guide'")
      .get() as { c: number };
    expect(kept.c).toBe(6);
    expect(
      handle.prepare("SELECT COUNT(*) AS c FROM blocks WHERE content = 'my own words'").get(),
    ).toEqual({ c: 1 });
  });

  it('never re-creates a tutorial the user deleted', async () => {
    await __seedTutorialThreadForTest(db, 'en');
    handle.prepare('DELETE FROM blocks').run();
    handle.prepare('DELETE FROM threads').run();

    expect(await retranslateTutorial('en', 'zh')).toBe(false);

    expect(handle.prepare('SELECT COUNT(*) AS c FROM threads').get()).toEqual({ c: 0 });
    expect(handle.prepare('SELECT COUNT(*) AS c FROM blocks').get()).toEqual({ c: 0 });
  });
});
