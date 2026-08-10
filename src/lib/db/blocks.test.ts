import { createRequire } from 'node:module';
import type Database from '@tauri-apps/plugin-sql';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAttachment, listAttachmentsByThread } from './attachments';
import {
  type Block,
  blockStatsByThread,
  computeMergedFields,
  countCaptures,
  countMcpBlocks,
  createBlock,
  deleteBlock,
  listBlocksByThread,
  listCapturesSince,
  mergeBlocks,
  restoreBlock,
  setBlockStale,
  setBlockSupersession,
  togglePin,
} from './blocks';
import { isMcpSource } from '@/lib/blocks/sourceIcon';
import { __setTestDb } from './client';
import schemaSql from './schema.sql?raw';
import { createThread } from './threads';
import { createWorkspace } from './workspaces';

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

const block = (id: string, createdAt: number, opts: Partial<Block> = {}): Block => ({
  id,
  threadId: 't',
  kind: 'text',
  content: '',
  annotation: null,
  refThreadId: null,
  refBlockId: null,
  source: null,
  pinned: false,
  createdAt,
  ...opts,
}) as Block;

describe('computeMergedFields (§20.1)', () => {
  it('keeps the earliest block as survivor and preserves its id', () => {
    const blocks = [
      block('b2', 200, { content: 'later' }),
      block('b1', 100, { content: 'first' }),
      block('b3', 300, { content: 'last' }),
    ];
    const m = computeMergedFields(blocks);
    expect(m.survivorId).toBe('b1');
    expect(m.nonSurvivorIds).toEqual(['b2', 'b3']);
  });

  it('joins contents chronologically with a blank-line separator', () => {
    const blocks = [
      block('b1', 100, { content: 'alpha' }),
      block('b2', 200, { content: 'beta' }),
      block('b3', 300, { content: 'gamma' }),
    ];
    expect(computeMergedFields(blocks).content).toBe('alpha\n\nbeta\n\ngamma');
  });

  it('prefixes non-survivor segments with [from <source>] when sources differ', () => {
    const blocks = [
      block('b1', 100, { content: 'a', source: null }),
      block('b2', 200, { content: 'b', source: 'Notion' }),
      block('b3', 300, { content: 'c', source: 'Chrome' }),
    ];
    expect(computeMergedFields(blocks).content).toBe(
      'a\n\n[from Notion] b\n\n[from Chrome] c',
    );
  });

  it('emits no source prefix when every block shares the same source', () => {
    const blocks = [
      block('b1', 100, { content: 'a', source: 'Notion' }),
      block('b2', 200, { content: 'b', source: 'Notion' }),
    ];
    expect(computeMergedFields(blocks).content).toBe('a\n\nb');
  });

  it('keeps the survivor source and reports pinned=true if any block was pinned', () => {
    const blocks = [
      block('b1', 100, { source: 'A', pinned: false }),
      block('b2', 200, { source: 'B', pinned: true }),
    ];
    const m = computeMergedFields(blocks);
    expect(m.source).toBe('A');
    expect(m.pinned).toBe(true);
  });

  it('encodes per-segment annotations inline (↪ note: marker) and nulls the top-level annotation', () => {
    const blocks = [
      block('b1', 100, { content: 'alpha', annotation: 'first note' }),
      block('b2', 200, { content: 'beta', annotation: null }),
      block('b3', 300, { content: 'gamma', annotation: '   ' }),
      block('b4', 400, { content: 'delta', annotation: 'fourth note' }),
    ];
    const m = computeMergedFields(blocks);
    // Top-level annotation is null — per-segment annotations live in the content.
    expect(m.annotation).toBeNull();
    // Each annotated segment gets a `↪ note: ...` line as its last line; un-annotated
    // segments stay unmarked.
    expect(m.content).toBe(
      'alpha\n↪ note: first note\n\nbeta\n\ngamma\n\ndelta\n↪ note: fourth note',
    );
  });

  it('emits marker-free content (and null annotation) when no block carried an annotation', () => {
    const blocks = [block('b1', 100, { content: 'a' }), block('b2', 200, { content: 'b' })];
    const m = computeMergedFields(blocks);
    expect(m.annotation).toBeNull();
    expect(m.content).toBe('a\n\nb');
    expect(m.content).not.toContain('↪ note:');
  });

  it('flattens a multi-line per-segment annotation onto one line (single ↪ note: line)', () => {
    const blocks = [
      block('b1', 100, { content: 'x', annotation: 'first line\nsecond line' }),
      block('b2', 200, { content: 'y', annotation: 'plain' }),
    ];
    const m = computeMergedFields(blocks);
    // The annotation marker must be the LAST line of its segment, so multi-line
    // annotations are flattened to one line.
    expect(m.content).toBe('x\n↪ note: first line second line\n\ny\n↪ note: plain');
  });
});

describe('mergeBlocks against a real SQLite engine (§20.1)', () => {
  let sqlite: Sqlite;

  beforeEach(() => {
    sqlite = new DatabaseSync(':memory:');
    sqlite.exec(schemaSql);
    __setTestDb(makeAdapter(sqlite));
  });

  afterEach(() => {
    __setTestDb(null);
    sqlite.close();
  });

  it('merges 3 blocks (pinned, differing sources) into the earliest, leaving the project files alone', async () => {
    const ws = await createWorkspace('工作区');
    const thread = await createThread(ws.id, 'T');

    const b1 = await createBlock({
      threadId: thread.id,
      content: 'first',
      source: 'Notion',
      annotation: 'note A',
    });
    // Force monotonically-later created_at by waiting a tick — createBlock uses Date.now().
    await new Promise((r) => setTimeout(r, 5));
    const b2 = await createBlock({ threadId: thread.id, content: 'second', source: 'Chrome' });
    await new Promise((r) => setTimeout(r, 5));
    await createBlock({ threadId: thread.id, content: 'third' });

    // pin the middle block — pinned should propagate to survivor
    await togglePin(b2.id);

    // v15: files belong to the PROJECT, so a merge of its blocks must not move or lose one.
    const a1 = await createAttachment({
      threadId: thread.id,
      kind: 'file',
      target: '/x/b2.pdf',
      label: 'b2.pdf',
    });
    const a2 = await createAttachment({
      threadId: thread.id,
      kind: 'folder',
      target: '/x/refs',
      label: 'refs',
    });

    const all = await listBlocksByThread(thread.id);
    const merged = computeMergedFields(all);
    await mergeBlocks(
      merged.survivorId,
      merged.content,
      merged.annotation,
      merged.pinned,
      merged.source,
      merged.nonSurvivorIds,
    );

    const after = await listBlocksByThread(thread.id);
    expect(after).toHaveLength(1);
    const survivor = after[0]!;

    // Survivor identity preserved
    expect(survivor.id).toBe(b1.id);
    expect(survivor.createdAt).toBe(b1.createdAt);

    // Sources differ → non-survivor segments are prefixed; b1's annotation rides
    // inside its segment as a `↪ note:` line.
    expect(survivor.content).toBe(
      'first\n↪ note: note A\n\n[from Chrome] second\n\n[from (无来源)] third',
    );

    // Survivor keeps its source, gains pinned from b2. Top-level annotation is null
    // — per-segment annotations live inside the content now (see segments.ts).
    expect(survivor.source).toBe('Notion');
    expect(survivor.pinned).toBe(true);
    expect(survivor.annotation).toBeNull();

    // ⚠️ The v15 property: merging blocks is not a file operation. Both files are still
    // the project's, untouched, and neither was re-pointed at anything.
    const projectFiles = await listAttachmentsByThread(thread.id);
    expect(projectFiles.map((a) => a.id).sort()).toEqual([a1.id, a2.id].sort());

    // FTS sync: searching for content from a merged-away block hits the survivor's row
    const ftsRows = sqlite
      .prepare("SELECT rowid FROM blocks_fts WHERE blocks_fts MATCH 'second'")
      .all() as { rowid: number }[];
    expect(ftsRows.length).toBeGreaterThan(0);
  });
});

// DESIGN_AI_ENGINE §1.3 — "AI 归档了 N 块" is measured with a SQL predicate, while every
// rendering surface decides the same question with isMcpSource(). Two spellings of one
// rule drift; this is the pin that makes a drift fail loudly instead of quietly turning
// the engine's headline number into a lie.
describe('countMcpBlocks agrees with isMcpSource', () => {
  let sqlite: Sqlite;

  beforeEach(() => {
    sqlite = new DatabaseSync(':memory:');
    sqlite.exec(schemaSql);
    __setTestDb(makeAdapter(sqlite));
  });

  afterEach(() => {
    __setTestDb(null);
    sqlite.close();
  });

  it('counts exactly the labels the badge treats as AI-written', async () => {
    const ws = await createWorkspace('工作区');
    const thread = await createThread(ws.id, 'T');
    const labels: (string | null)[] = [
      null,                       // the user typed it
      'Safari',                   // a capture
      'lecture-11.pdf',           // an attachment
      'MCP',                      // a client that sent no name
      'MCP — course.edu',         // …with a detail
      'Claude · MCP',             // the ordinary case
      'Claude Desktop · MCP — paper.pdf',
      'Cursor · MCP',
      'MCP的笔记',                 // a label that merely starts with the letters
    ];
    for (const source of labels) {
      await createBlock({ threadId: thread.id, content: source ?? 'user', source });
    }
    const expected = labels.filter((s) => isMcpSource(s)).length;
    expect(expected).toBe(5);
    expect(await countMcpBlocks()).toBe(expected);
  });
});

// 首日价值 §4.5 — 「今天读了什么」 counts what the user READ, and the sidebar card is the
// first surface that has to tell a capture apart from everything else in the table. Three
// kinds of block are not captures and each is here for its own reason: the composer writes
// no source, the MCP server writes a block the user never read, and the tutorial's blocks
// were seeded rather than captured (a fresh install would otherwise open on 「今天读了 6 条」
// before the user had done anything at all).
describe('listCapturesSince', () => {
  let sqlite: Sqlite;

  beforeEach(() => {
    sqlite = new DatabaseSync(':memory:');
    sqlite.exec(schemaSql);
    __setTestDb(makeAdapter(sqlite));
  });

  afterEach(() => {
    __setTestDb(null);
    sqlite.close();
  });

  it('keeps captures and hand-typed source labels, drops composer / MCP / tutorial', async () => {
    const ws = await createWorkspace('工作区');
    const thread = await createThread(ws.id, 'T');
    for (const source of [
      null,             // the composer — the user wrote it, did not read it
      'Safari',         // the gesture, source detected from the foreground app
      'Chrome',         // …counts once per block, not once per app
      '那本书',          // typed by hand on the badge when detection missed
      'Claude · MCP',   // the AI wrote it
      'MCP',
      'Spool 指南',      // seeded tutorial, zh
      'Spool Guide',    // seeded tutorial, en
    ]) {
      await createBlock({ threadId: thread.id, content: source ?? 'user', source });
    }

    const rows = await listCapturesSince(0);
    expect(rows.map((b) => b.source)).toEqual(['那本书', 'Chrome', 'Safari']); // newest first
    expect(await countCaptures()).toBe(3);
  });

  it('honours the cutoff, so yesterday never shows up under 「今天」', async () => {
    const ws = await createWorkspace('工作区');
    const thread = await createThread(ws.id, 'T');
    const old = await createBlock({ threadId: thread.id, content: '昨天读的', source: 'Safari' });
    const cutoff = Date.now();
    sqlite
      .prepare('UPDATE blocks SET created_at = ? WHERE id = ?')
      .run(cutoff - 86_400_000, old.id);
    await createBlock({ threadId: thread.id, content: '今天读的', source: 'Chrome' });

    expect((await listCapturesSince(cutoff)).map((b) => b.content)).toEqual(['今天读的']);
    // The all-time count is what the pack hint asks, and it still sees both.
    expect(await countCaptures()).toBe(2);
  });
});

// DESIGN_WORKBENCH §9.13 — the numbers an expanded row in 项目管理 shows.
describe('blockStatsByThread', () => {
  let sqlite: Sqlite;

  beforeEach(() => {
    sqlite = new DatabaseSync(':memory:');
    sqlite.exec(schemaSql);
    __setTestDb(makeAdapter(sqlite));
  });

  afterEach(() => {
    __setTestDb(null);
    sqlite.close();
  });

  it('counts blocks and characters per project, annotations included', async () => {
    const ws = await createWorkspace('W');
    const a = await createThread(ws.id, 'A');
    const b = await createThread(ws.id, 'B');
    await createBlock({ threadId: a.id, content: '12345', annotation: '123' }); // 8
    await createBlock({ threadId: a.id, content: '12' }); // 2 — a null annotation adds 0,
    await createBlock({ threadId: b.id, content: '1' }); //      not NULL to the whole sum
    const stats = await blockStatsByThread();
    expect(stats[a.id]).toEqual({ blocks: 2, chars: 10 });
    expect(stats[b.id]).toEqual({ blocks: 1, chars: 1 });
  });

  it('leaves an empty project out of the map rather than reporting a zero row', async () => {
    // The board reads `stats[id] ?? EMPTY_STATS`, so absence and zero render the same —
    // but a GROUP BY cannot invent a row for a thread with no blocks, and pretending it
    // could is how a caller ends up trusting `Object.keys(stats)` as a project list.
    const ws = await createWorkspace('W');
    const empty = await createThread(ws.id, 'nothing in it');
    expect(await blockStatsByThread()).not.toHaveProperty(empty.id);
  });
});

// DESIGN_CONTEXT_HYGIENE §3.1 — supersession. Two nullable columns, three ways to use
// them, and the property that makes the whole design safe: nothing is ever destroyed.
describe('supersession (v13)', () => {
  let sqlite: Sqlite;

  beforeEach(() => {
    sqlite = new DatabaseSync(':memory:');
    sqlite.exec(schemaSql);
    __setTestDb(makeAdapter(sqlite));
  });

  afterEach(() => {
    __setTestDb(null);
    sqlite.close();
  });

  const seed = async () => {
    const ws = await createWorkspace('W');
    const thread = await createThread(ws.id, 'T');
    const older = await createBlock({ threadId: thread.id, content: '截止 4 月 30 日' });
    const newer = await createBlock({ threadId: thread.id, content: '改成 3 月 15 日' });
    return { thread, older, newer };
  };

  it('starts every block valid and citing nothing in particular', async () => {
    const { older } = await seed();
    expect(older.staleAt).toBeNull();
    expect(older.refKind).toBeNull();
  });

  // Use ①: the user knows a conclusion has stopped holding but has no replacement yet —
  // Ocean 拍板'd that this must be supported on its own.
  it('retires a block with no replacement, and takes it back', async () => {
    const { thread, older } = await seed();
    await setBlockStale(older.id, 1_754_000_000_000);
    let rows = await listBlocksByThread(thread.id);
    expect(rows.find((b) => b.id === older.id)!.staleAt).toBe(1_754_000_000_000);
    // ⚠️ Still there, still readable, text untouched. Retiring is not deleting (§2.3's
    // TOKI distinction) — this assertion IS the design.
    expect(rows).toHaveLength(2);
    expect(rows.find((b) => b.id === older.id)!.content).toBe('截止 4 月 30 日');

    await setBlockStale(older.id, null);
    rows = await listBlocksByThread(thread.id);
    expect(rows.find((b) => b.id === older.id)!.staleAt).toBeNull();
  });

  // Use ②: wholesale replacement. One call, because leaving the old block live while the
  // new one claims to replace it is a state the user never meant to be in.
  it('retires the target in the same breath as declaring a replacement', async () => {
    const { thread, older, newer } = await seed();
    await setBlockSupersession(newer.id, older.id, 'supersedes', 1_754_000_000_000);
    const rows = await listBlocksByThread(thread.id);
    expect(rows.find((b) => b.id === newer.id)).toMatchObject({
      refBlockId: older.id,
      refKind: 'supersedes',
      staleAt: null,
    });
    expect(rows.find((b) => b.id === older.id)!.staleAt).toBe(1_754_000_000_000);
  });

  it('does not move a retirement the user already made', async () => {
    const { thread, older, newer } = await seed();
    await setBlockStale(older.id, 111);
    await setBlockSupersession(newer.id, older.id, 'supersedes', 999);
    // When they retired it is a fact about them, not about this declaration.
    expect((await listBlocksByThread(thread.id)).find((b) => b.id === older.id)!.staleAt).toBe(111);
  });

  // Use ③, and the answer to Ocean's question about copying: 'corrects' must leave the
  // target completely alone, or fixing one sentence costs a re-paste of the paragraph.
  it('leaves the target untouched for a partial correction', async () => {
    const { thread, older, newer } = await seed();
    await setBlockSupersession(newer.id, older.id, 'corrects', 1_754_000_000_000);
    const rows = await listBlocksByThread(thread.id);
    expect(rows.find((b) => b.id === newer.id)!.refKind).toBe('corrects');
    expect(rows.find((b) => b.id === older.id)).toMatchObject({
      staleAt: null,
      content: '截止 4 月 30 日',
    });
  });

  it('clears the relation without un-retiring the target', async () => {
    const { thread, older, newer } = await seed();
    await setBlockSupersession(newer.id, older.id, 'supersedes', 1_754_000_000_000);
    await setBlockSupersession(newer.id, null, null, 2_000_000_000_000);
    const rows = await listBlocksByThread(thread.id);
    expect(rows.find((b) => b.id === newer.id)).toMatchObject({
      refBlockId: null,
      refKind: null,
    });
    // Deliberate: "this no longer holds" was its own statement the moment it was made, and
    // guessing that it should be undone is exactly what §3.1 keeps out of this feature.
    expect(rows.find((b) => b.id === older.id)!.staleAt).toBe(1_754_000_000_000);
  });

  it('brings both fields back when an undone delete restores the block', async () => {
    const { thread, older, newer } = await seed();
    await setBlockSupersession(newer.id, older.id, 'supersedes', 1_754_000_000_000);
    const before = (await listBlocksByThread(thread.id)).find((b) => b.id === older.id)!;
    await deleteBlock(older.id);
    await restoreBlock(before);
    // ⌘Z must not quietly resurrect a conclusion the user had retired.
    expect((await listBlocksByThread(thread.id)).find((b) => b.id === older.id)).toEqual(before);
  });
});
