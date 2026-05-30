import { createRequire } from 'node:module';
import type Database from '@tauri-apps/plugin-sql';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listAttachmentsByBlock } from '@/lib/db/attachments';
import { listBlocksByThread } from '@/lib/db/blocks';
import { __setTestDb } from '@/lib/db/client';
import schemaSql from '@/lib/db/schema.sql?raw';
import { createThread } from '@/lib/db/threads';
import { createWorkspace } from '@/lib/db/workspaces';
import { sendStaging } from './send';
import type { StagingAttachment, StagingItem } from './stagingBuffer';

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

let seq = 0;
const item = (over: Partial<StagingItem> = {}): StagingItem => ({
  id: `i${seq++}`,
  content: '',
  annotation: '',
  source: null,
  pinned: false,
  attachments: [],
  createdAt: seq,
  ...over,
});

const att = (label: string): StagingAttachment => ({
  kind: 'url',
  target: `https://example.com/${label}`,
  label,
});

describe('sendStaging — one independent block per item (§20.9 v2.10)', () => {
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

  it('writes one block per staging item, in order, each keeping its OWN annotation', async () => {
    const ws = await createWorkspace('W');
    const thread = await createThread(ws.id, 'T');

    const blocks = await sendStaging(
      [
        item({ content: 'first', annotation: 'note A', source: 'Safari' }),
        item({ content: 'second', annotation: '   ' }),
        item({ content: 'third', annotation: 'note C', pinned: true }),
      ],
      thread.id,
    );
    expect(blocks).toHaveLength(3);

    const feed = await listBlocksByThread(thread.id);
    expect(feed.map((b) => b.content)).toEqual(['first', 'second', 'third']);
    // Annotations stay INDEPENDENT per block (not merged into one); blank ones → null.
    expect(feed.find((b) => b.content === 'first')!.annotation).toBe('note A');
    expect(feed.find((b) => b.content === 'second')!.annotation).toBeNull();
    expect(feed.find((b) => b.content === 'third')!.annotation).toBe('note C');
    // Per-item pinned + source are preserved on the individual blocks.
    expect(feed.find((b) => b.content === 'third')!.pinned).toBe(true);
    expect(feed.find((b) => b.content === 'first')!.source).toBe('Safari');
    expect(feed.find((b) => b.content === 'second')!.pinned).toBe(false);
  });

  it('keeps each item attachments on that item own block', async () => {
    const ws = await createWorkspace('W');
    const thread = await createThread(ws.id, 'T');

    const blocks = await sendStaging(
      [
        item({ content: 'a', attachments: [att('one'), att('two')] }),
        item({ content: 'b' }),
        item({ content: 'c', attachments: [att('three')] }),
      ],
      thread.id,
    );

    const a0 = await listAttachmentsByBlock(blocks[0]!.id);
    const a1 = await listAttachmentsByBlock(blocks[1]!.id);
    const a2 = await listAttachmentsByBlock(blocks[2]!.id);
    expect(a0.map((a) => a.label)).toEqual(['one', 'two']);
    expect(a1).toHaveLength(0);
    expect(a2.map((a) => a.label)).toEqual(['three']);
  });

  it('empty buffer → no blocks written', async () => {
    const ws = await createWorkspace('W');
    const thread = await createThread(ws.id, 'T');
    expect(await sendStaging([], thread.id)).toEqual([]);
    expect(await listBlocksByThread(thread.id)).toHaveLength(0);
  });
});
