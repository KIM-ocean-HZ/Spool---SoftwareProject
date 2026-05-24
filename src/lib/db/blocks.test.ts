import { createRequire } from 'node:module';
import type Database from '@tauri-apps/plugin-sql';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAttachment, listAttachmentsByBlock } from './attachments';
import {
  type Block,
  computeMergedFields,
  createBlock,
  listBlocksByThread,
  mergeBlocks,
  togglePin,
} from './blocks';
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
  source: null,
  pinned: false,
  createdAt,
  ...opts,
});

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

  it('merges 3 blocks (pinned, two with attachments, differing sources) into the earliest', async () => {
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
    const b3 = await createBlock({ threadId: thread.id, content: 'third' });

    // pin the middle block — pinned should propagate to survivor
    await togglePin(b2.id);

    // attachments on the two non-survivors
    const a2 = await createAttachment({
      blockId: b2.id,
      kind: 'file',
      target: '/x/b2.pdf',
      label: 'b2.pdf',
    });
    const a3 = await createAttachment({
      blockId: b3.id,
      kind: 'url',
      target: 'https://example.com',
      label: 'example',
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

    // Both non-survivor attachments now belong to the survivor
    const survivorAttachments = await listAttachmentsByBlock(survivor.id);
    expect(survivorAttachments.map((a) => a.id).sort()).toEqual([a2.id, a3.id].sort());

    // FTS sync: searching for content from a merged-away block hits the survivor's row
    const ftsRows = sqlite
      .prepare("SELECT rowid FROM blocks_fts WHERE blocks_fts MATCH 'second'")
      .all() as { rowid: number }[];
    expect(ftsRows.length).toBeGreaterThan(0);
  });
});
