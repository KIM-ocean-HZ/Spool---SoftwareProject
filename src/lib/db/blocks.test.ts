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
  countUserWrittenChars,
  createBlock,
  deleteBlock,
  listBlocksByThread,
  listCapturesSince,
  mergeBlocks,
  restoreBlock,
  applyCompression,
  restoreBlockOriginal,
  setBlockStale,
  setBlockSupersession,
  setCorrectedQuote,
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
    // The all-time count is the spool's number (首日价值二期 §2.3) and the pack hint's, and
    // it still sees both. ⚠️ It is a COUNT(*) now, not this list's length — the two must
    // keep agreeing on what a capture is, which is what these assertions pin.
    expect(await countCaptures()).toBe(2);
  });
});

// 首日价值二期 §2.2 — 「我写了多少字」, the one number in the card whose job is to change
// behaviour rather than report it (Ocean: 「鼓励用户多写个人的 notes」). It is 口径乙: the
// annotations the user wrote, plus the bodies of the blocks they typed themselves.
//
// Every row below is here because it would have been counted wrong by an obvious version of
// the query. The NULL `annotation_by` cases are pre-v14 rows and are the commonest thing in
// a real library — an SQL NOT() over an untreated NULL silently drops them.
describe('countUserWrittenChars', () => {
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

  it('counts the user own words and nothing else', async () => {
    const ws = await createWorkspace('工作区');
    const thread = await createThread(ws.id, 'T');
    const make = async (
      args: { content: string; source: string | null; annotation?: string | null },
      annotationBy: 'user' | 'ai' | null = 'user',
    ): Promise<void> => {
      const b = await createBlock({ threadId: thread.id, ...args });
      if (annotationBy === null) {
        // A row written before v14, when nobody recorded who wrote the annotation.
        sqlite.prepare('UPDATE blocks SET annotation_by = NULL WHERE id = ?').run(b.id);
      } else if (annotationBy === 'ai') {
        sqlite.prepare("UPDATE blocks SET annotation_by = 'ai' WHERE id = ?").run(b.id);
      }
    };

    // ✓ typed into the composer — 12 characters of his own
    await make({ content: '手打的一整块内容，十二字', source: null });
    // ✓ his note on something he captured (4) — the body is what he READ, never counted
    await make({ content: '一段读到的很长很长的正文', source: 'Safari', annotation: '我的批注' });
    // ✗ an AI wrote both the block and the note
    await make({ content: 'AI 写的', source: 'Claude · MCP', annotation: 'AI 的批注' }, 'ai');
    // ✗ pre-v14 MCP row: no annotation_by, so the source is what says the AI wrote it
    await make({ content: 'AI 写的', source: 'MCP', annotation: 'AI 的旧批注' }, null);
    // ✓ pre-v14 capture: no annotation_by and a source that is not MCP — his words (3)
    await make({ content: '读到的', source: 'Chrome', annotation: '旧批注' }, null);
    // ✓ pre-v14 composer row: sourceless body (3) + his note (3)
    await make({ content: '旧手打', source: null, annotation: '旧的注' }, null);
    // ✗ the tutorial arrives annotated — counting it opens a fresh install on 「我写了 700 字」
    await make({ content: '教程正文', source: 'Spool 指南', annotation: '教程的批注' });
    // ✗ whitespace is not writing
    await make({ content: '又一段读到的', source: 'Safari', annotation: '   ' });

    expect(await countUserWrittenChars()).toBe(12 + 4 + 3 + 3 + 3);
  });

  it('reports 0 on an empty library rather than null', async () => {
    // SUM() over no rows is NULL in SQLite, and 「我写了 null 字」 is what that looks like on
    // a fresh install — the one library where this card is guaranteed to be read.
    expect(await countUserWrittenChars()).toBe(0);
  });

  // The panel's 今天 line (Ocean 2026-08-11). Same 口径, bounded to blocks created since a
  // moment — and 0 rather than null on a day nothing was written, which is the state the
  // line is in most days.
  it('counts only blocks created at or after `since`', async () => {
    const ws = await createWorkspace('工作区');
    const thread = await createThread(ws.id, 'T');
    const at = async (createdAt: number, content: string): Promise<void> => {
      const b = await createBlock({ threadId: thread.id, content, source: null });
      sqlite.prepare('UPDATE blocks SET created_at = ? WHERE id = ?').run(createdAt, b.id);
    };
    await at(1000, '昨天写的四字'); // 6
    await at(2000, '今天写的'); // 4
    await at(3000, '今天又写'); // 4

    expect(await countUserWrittenChars()).toBe(14);
    expect(await countUserWrittenChars(2000)).toBe(8); // the boundary row is IN
    expect(await countUserWrittenChars(9000)).toBe(0);
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

  // 2026-08-19 — found in the real library on 2026-08-19: a block sat there carrying a
  // corrected_quote with no ref_kind and no ref_block_id. add_block refuses to write that
  // combination outright, so it can only have been produced here, by unlinking and leaving
  // the quote behind. A quote with nothing to point at marks a sentence in a block that
  // nobody is correcting any more.
  it('takes the corrected quote with the relation when it is cleared', async () => {
    const { thread, older, newer } = await seed();
    await setBlockSupersession(newer.id, older.id, 'corrects', 1_754_000_000_000);
    await setCorrectedQuote(newer.id, '截止 4 月 30 日');
    expect(
      (await listBlocksByThread(thread.id)).find((b) => b.id === newer.id)!.correctedQuote,
    ).toBe('截止 4 月 30 日');
    await setBlockSupersession(newer.id, null, null, 2_000_000_000_000);
    expect((await listBlocksByThread(thread.id)).find((b) => b.id === newer.id)).toMatchObject({
      refBlockId: null,
      refKind: null,
      correctedQuote: null,
    });
  });

  // ⛔⛔ T2 (2026-08-23, fifth round): the same rule on `supersedes`. The quote means
  // "the sentence in the old block this one corrects" — it belongs to `corrects` and to
  // nothing else. 2 of the 3 real proposals measured that night pointed at a pair that
  // already carried a `corrects`, and "retire the old one" would have left the quote
  // hanging off a `supersedes`: harder to spot than the 2026-08-19 case, because the
  // relation is still there so nothing looks broken.
  it('takes the corrected quote along when a correction is turned into a replacement', async () => {
    const { thread, older, newer } = await seed();
    await setBlockSupersession(newer.id, older.id, 'corrects', 1_754_000_000_000);
    await setCorrectedQuote(newer.id, '截止 4 月 30 日');
    await setBlockSupersession(newer.id, older.id, 'supersedes', 2_000_000_000_000);
    expect((await listBlocksByThread(thread.id)).find((b) => b.id === newer.id)).toMatchObject({
      refKind: 'supersedes',
      correctedQuote: null,
    });
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

// v24 · 压缩稿写回库（COMPRESS-UX-R2-2026-08-22 §1）。
// ⛔⛔ 这是 Spool 第一条会**改写用户已有文字**的路 —— 在此之前块只增不改
// （更正挂在旁边、作废让它退出 pack，两条都不动原文）。所以这几条盯的是护栏本身。
describe('applyCompression / restoreBlockOriginal', () => {
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
    const th = await createThread(ws.id, 'P');
    const b = await createBlock({ threadId: th.id, content: '很长很长的原文，里面有 2026-11-25。' });
    return { threadId: th.id, block: b };
  };
  const read = async (threadId: string) => (await listBlocksByThread(threadId))[0];

  it('留原文：正文换成压缩稿，原文和时间一起写上', async () => {
    const { threadId, block } = await seed();
    const { changed } = await applyCompression([{ id: block.id, content: '短一点，2026-11-25 还在。' }], true, 1_754_000_000_000);
    expect(changed).toBe(1);
    const after = await read(threadId);
    expect(after.content).toBe('短一点，2026-11-25 还在。');
    expect(after.originalContent).toBe('很长很长的原文，里面有 2026-11-25。');
    expect(after.compressedAt).toBe(1_754_000_000_000);
  });

  // ⛔ 压第二次不许把「原文」换成上一次的压缩稿 —— 那样一键还原还回去的是一份 AI 产物，
  //    而用户以为那是他自己的字。
  it('压第二次，原文仍然是**第一次**那一份', async () => {
    const { threadId, block } = await seed();
    await applyCompression([{ id: block.id, content: '第一次压完' }], true, 1);
    await applyCompression([{ id: block.id, content: '第二次压完' }], true, 2);
    const after = await read(threadId);
    expect(after.content).toBe('第二次压完');
    expect(after.originalContent).toBe('很长很长的原文，里面有 2026-11-25。');
  });

  // ⛔ 一个字都没短的块不该被标成「压过」—— 那个记号会印进以后每一份 pack，
  //    告诉收件 AI「这几句不是原话」，而它其实是原话。
  it('内容没变就一个字都不写', async () => {
    const { threadId, block } = await seed();
    const { changed } = await applyCompression([{ id: block.id, content: block.content }], true, 1);
    expect(changed).toBe(0);
    const after = await read(threadId);
    expect(after.compressedAt).toBeNull();
    expect(after.originalContent).toBeNull();
  });

  // 关掉备份 = 压缩不可逆。⚠️ 记号照样要写（pack 上仍然该说「这几句不是原话」），
  // 只是还不回去了。
  it('不留原文：记号照写，原文留空', async () => {
    const { threadId, block } = await seed();
    await applyCompression([{ id: block.id, content: '短一点' }], false, 5);
    const after = await read(threadId);
    expect(after.compressedAt).toBe(5);
    expect(after.originalContent).toBeNull();
  });

  // ⭐⭐ S3（2026-08-24，Ocean 选乙）—— **压缩不许悄悄打掉引文。**
  // 真库里已经发生过：〈申请帮助〉#11 那条更正的引文，被 08-24 11:20:51 的一次压缩打断，
  // 屏幕上什么都不划、也不报错。下面四条钉的就是这四种下落。
  describe('S3 · 压完重定位更正引文', () => {
    const seedPair = async (targetContent: string, quote: string) => {
      const ws = await createWorkspace('W');
      const th = await createThread(ws.id, 'P');
      const target = await createBlock({ threadId: th.id, content: targetContent });
      const corr = await createBlock({ threadId: th.id, content: '其实不是这样。' });
      await setBlockSupersession(corr.id, target.id, 'corrects', 1);
      await setCorrectedQuote(corr.id, quote);
      return { threadId: th.id, target, corr };
    };
    const readById = async (threadId: string, id: string) =>
      (await listBlocksByThread(threadId)).find((b) => b.id === id)!;

    it('标点被改写 —— 引文换成压缩稿里的那一句，不算打断', async () => {
      const { threadId, target, corr } = await seedPair(
        '前言。结论：不要把任何学校称为保底。后话。',
        '结论：不要把任何学校称为保底。',
      );
      const { quotesLost } = await applyCompression(
        [{ id: target.id, content: '结论:不要把任何学校称为保底.' }],
        true,
        9,
      );
      expect(quotesLost).toEqual([]);
      expect((await readById(threadId, corr.id)).correctedQuote).toBe(
        '结论:不要把任何学校称为保底.',
      );
    });

    it('措辞被改写 —— 引文清掉、关系留着，并且报出来', async () => {
      const { threadId, target, corr } = await seedPair(
        '关于必修实习位：NEU 的 co-op 属于培养方案内的必修实习。',
        'NEU 的 co-op 属于培养方案内的必修实习',
      );
      const { quotesLost } = await applyCompression(
        [{ id: target.id, content: 'NEU co-op 是必修实习。' }],
        true,
        9,
      );
      // ⛔ 报出来 —— 无声才是 08-24 那次的形状。两个号码都是屏幕上的 #N。
      expect(quotesLost).toEqual([{ correctionSeq: corr.seq, targetSeq: target.seq }]);
      const after = await readById(threadId, corr.id);
      expect(after.correctedQuote).toBeNull();
      // ⛔ 关系必须留着：pack 和界面仍然说得出「#N 里有一处被更正了」。
      expect(after.refKind).toBe('corrects');
      expect(after.refBlockId).toBe(target.id);
    });

    it('⛔ 压缩前就对不上的引文，压缩不许动它、也不许赖在自己头上', async () => {
      const { threadId, target, corr } = await seedPair('正文', '一句谁也对不上的话');
      const { quotesLost } = await applyCompression(
        [{ id: target.id, content: '压完的正文' }],
        true,
        9,
      );
      expect(quotesLost).toEqual([]);
      expect((await readById(threadId, corr.id)).correctedQuote).toBe('一句谁也对不上的话');
    });

    // ⚠️ `ref_block_id` 可以跨项目指 —— 按项目筛就会漏掉别的项目里那条更正。
    it('别的项目里的更正也照样重定位', async () => {
      const ws = await createWorkspace('W');
      const a = await createThread(ws.id, 'A');
      const b = await createThread(ws.id, 'B');
      const target = await createBlock({ threadId: a.id, content: '甲：这句话在 A 里。' });
      const corr = await createBlock({ threadId: b.id, content: '其实不是。' });
      await setBlockSupersession(corr.id, target.id, 'corrects', 1);
      await setCorrectedQuote(corr.id, '这句话在 A 里');

      const { quotesLost } = await applyCompression(
        [{ id: target.id, content: '甲：换了个说法。' }],
        true,
        9,
      );
      expect(quotesLost).toHaveLength(1);
      expect(
        (await listBlocksByThread(b.id)).find((x) => x.id === corr.id)!.correctedQuote,
      ).toBeNull();
    });
  });

  it('一键还原：换回原文，两列一起清空', async () => {
    const { threadId, block } = await seed();
    await applyCompression([{ id: block.id, content: '短一点' }], true, 1);
    expect(await restoreBlockOriginal(block.id)).toBe(true);
    const after = await read(threadId);
    expect(after.content).toBe('很长很长的原文，里面有 2026-11-25。');
    expect(after.originalContent).toBeNull();
    // ⚠️ 记号也要跟着没 —— 还原之后这一块又是「没被压过」。
    expect(after.compressedAt).toBeNull();
  });

  // ⛔ 压过、但当时没留原文的那一种：还原会把正文清成空的，比不还原糟得多。
  it('没留原文的块还原不了，⛔ 而且不会把正文清空', async () => {
    const { threadId, block } = await seed();
    await applyCompression([{ id: block.id, content: '短一点' }], false, 5);
    expect(await restoreBlockOriginal(block.id)).toBe(false);
    expect((await read(threadId)).content).toBe('短一点');
  });
});
