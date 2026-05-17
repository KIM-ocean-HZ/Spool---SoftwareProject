import { createRequire } from 'node:module';
import type Database from '@tauri-apps/plugin-sql';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBlock, updateBlockAnnotation, updateBlockContent } from '@/lib/db/blocks';
import { __setTestDb } from '@/lib/db/client';
import schemaSql from '@/lib/db/schema.sql?raw';
import { createThread } from '@/lib/db/threads';
import { createWorkspace } from '@/lib/db/workspaces';
import { buildSnippet, search } from './query';

// node:sqlite is a Node builtin that Vite's transform pipeline won't resolve as a
// static import — load it via createRequire so the specifier stays opaque to Vite.
const { DatabaseSync } = createRequire(import.meta.url)(
  'node:sqlite',
) as typeof import('node:sqlite');
type Sqlite = InstanceType<typeof DatabaseSync>;

describe('buildSnippet', () => {
  it('returns the single line for a one-line block, keyword marked', () => {
    const { field, snippet } = buildSnippet('论文文献综述初稿', null, '文献');
    expect(field).toBe('content');
    expect(snippet).toHaveLength(1);
    expect(snippet[0]!.isHit).toBe(true);
    expect(snippet[0]!.match).toEqual({ start: 2, end: 4 });
  });

  it('includes one line of context above and below the hit line', () => {
    const text = 'line one\nthe keyword here\nline three';
    const { snippet } = buildSnippet(text, null, 'keyword');
    expect(snippet.map((l) => l.text)).toEqual([
      'line one',
      'the keyword here',
      'line three',
    ]);
    expect(snippet[0]!.isHit).toBe(false);
    expect(snippet[1]!.isHit).toBe(true);
    expect(snippet[2]!.isHit).toBe(false);
    expect(snippet[1]!.match).toEqual({ start: 4, end: 11 });
  });

  it('omits the missing neighbour when the hit is on the first line', () => {
    const { snippet } = buildSnippet('first hit\nsecond', null, 'hit');
    expect(snippet).toHaveLength(2);
    expect(snippet[0]!.isHit).toBe(true);
    expect(snippet[1]!.isHit).toBe(false);
  });

  it('falls back to the annotation when the content has no match', () => {
    const { field, snippet } = buildSnippet('some captured text', '我的批注里有关键词', '关键词');
    expect(field).toBe('annotation');
    expect(snippet[0]!.isHit).toBe(true);
    expect(snippet[0]!.match).toEqual({ start: 6, end: 9 });
  });

  it('matches case-insensitively', () => {
    const { snippet } = buildSnippet('The API Reference', null, 'api');
    expect(snippet[0]!.match).toEqual({ start: 4, end: 7 });
  });

  it('windows a very long hit line around the keyword', () => {
    const long = 'x'.repeat(300) + 'NEEDLE' + 'y'.repeat(300);
    const hit = buildSnippet(long, null, 'NEEDLE').snippet[0]!;
    expect(hit.text.length).toBeLessThanOrEqual(122); // LINE_CAP + two ellipses
    expect(hit.text.startsWith('…')).toBe(true);
    expect(hit.text.endsWith('…')).toBe(true);
    expect(hit.text.slice(hit.match!.start, hit.match!.end)).toBe('NEEDLE');
  });

  it('falls back to the first lines when the keyword is not literally present', () => {
    const { snippet } = buildSnippet('alpha\nbeta\ngamma\ndelta', null, 'zzz');
    expect(snippet).toHaveLength(3);
    expect(snippet.every((l) => !l.isHit)).toBe(true);
  });
});

// PLAN_EN.md §19.5: Phase 6 added inline content + annotation editing. The FTS5 sync
// triggers (schema.sql) are supposed to keep blocks_fts current on UPDATE — this
// exercises that path end to end against a real SQLite engine, so a broken trigger
// fails the build instead of silently making §9.10 search miss edited blocks.

type SqlValue = string | number | bigint | null | Uint8Array;

// The app's SQL uses $N placeholders; node:sqlite uses positional ?N.
const toNumbered = (sql: string): string => sql.replace(/\$(\d+)/g, '?$1');

// A node:sqlite-backed stand-in for @tauri-apps/plugin-sql's Database — just enough
// surface (execute / select) for the query and CRUD modules to run against the real
// schema, with no Tauri runtime.
const makeAdapter = (handle: Sqlite): Database =>
  ({
    execute: async (sql: string, params: unknown[] = []) => {
      const r = handle.prepare(toNumbered(sql)).run(...(params as SqlValue[]));
      return { rowsAffected: Number(r.changes), lastInsertId: Number(r.lastInsertRowid) };
    },
    select: async (sql: string, params: unknown[] = []) =>
      handle.prepare(toNumbered(sql)).all(...(params as SqlValue[])),
  }) as unknown as Database;

describe('FTS index stays in sync after edits (§19.5)', () => {
  let sqlite: Sqlite;

  beforeEach(() => {
    sqlite = new DatabaseSync(':memory:');
    sqlite.exec(schemaSql); // applies the schema *and* its blocks_fts sync triggers
    __setTestDb(makeAdapter(sqlite));
  });

  afterEach(() => {
    __setTestDb(null);
    sqlite.close();
  });

  // workspace → thread → block; search()'s FTS query joins through all three.
  const seedBlock = async (content: string, annotation: string | null = null) => {
    const ws = await createWorkspace('工作区');
    const thread = await createThread(ws.id, '脉络');
    const block = await createBlock({ threadId: thread.id, content, annotation });
    return block.id;
  };

  it('indexes a freshly inserted block (AFTER INSERT trigger)', async () => {
    const blockId = await seedBlock('蓝莓松饼的烘焙温度记录');
    const hits = await search('蓝莓松饼');
    expect(hits.map((h) => h.blockId)).toEqual([blockId]);
  });

  it('reindexes content edited via updateBlockContent', async () => {
    const blockId = await seedBlock('一段与关键词无关的原始内容');
    expect(await search('蓝莓松饼')).toHaveLength(0);

    await updateBlockContent(blockId, '蓝莓松饼的改良配方');
    const hits = await search('蓝莓松饼');
    expect(hits.map((h) => h.blockId)).toEqual([blockId]);
  });

  it('reindexes an annotation edited via updateBlockAnnotation', async () => {
    const blockId = await seedBlock('与关键词无关的正文');
    expect(await search('蓝莓松饼')).toHaveLength(0);

    await updateBlockAnnotation(blockId, '批注：往蓝莓松饼这个方向试试');
    const hits = await search('蓝莓松饼');
    expect(hits.map((h) => h.blockId)).toEqual([blockId]);
    expect(hits[0]!.field).toBe('annotation');
  });
});
