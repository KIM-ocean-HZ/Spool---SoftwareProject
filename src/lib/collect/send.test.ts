import { createRequire } from 'node:module';
import type Database from '@tauri-apps/plugin-sql';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseSegments } from '@/lib/blocks/segments';
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

describe('sendStaging — one merged block, per-item annotations kept independent (§20.9 v2.10)', () => {
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

  it('merges into ONE block whose content carries each item’s own annotation as a segment note', async () => {
    const ws = await createWorkspace('W');
    const thread = await createThread(ws.id, 'T');

    const block = await sendStaging(
      [
        item({ content: 'first', annotation: 'note A', source: 'Safari' }),
        item({ content: 'second', annotation: '   ' }),
        item({ content: 'third', annotation: 'note C', pinned: true }),
      ],
      thread.id,
    );
    expect(block).not.toBeNull();

    const feed = await listBlocksByThread(thread.id);
    // ONE block — not split into three.
    expect(feed).toHaveLength(1);
    const merged = feed[0]!;

    // The per-item annotations live inline as independent segment notes (not flattened into
    // one top-level annotation, which stays null).
    expect(merged.annotation).toBeNull();
    const segments = parseSegments(merged.content);
    expect(segments.map((s) => s.text)).toEqual(['first', 'second', 'third']);
    expect(segments.map((s) => s.annotation)).toEqual(['note A', null, 'note C']);

    // pinned if ANY item was pinned; source = the first item's.
    expect(merged.pinned).toBe(true);
    expect(merged.source).toBe('Safari');
  });

  it('collects every item’s attachments onto the one merged block', async () => {
    const ws = await createWorkspace('W');
    const thread = await createThread(ws.id, 'T');

    const block = await sendStaging(
      [
        item({ content: 'a', attachments: [att('one'), att('two')] }),
        item({ content: 'b' }),
        item({ content: 'c', attachments: [att('three')] }),
      ],
      thread.id,
    );

    const atts = await listAttachmentsByBlock(block!.id);
    expect(atts.map((a) => a.label).sort()).toEqual(['one', 'three', 'two']);
  });

  it('empty buffer → no block written', async () => {
    const ws = await createWorkspace('W');
    const thread = await createThread(ws.id, 'T');
    expect(await sendStaging([], thread.id)).toBeNull();
    expect(await listBlocksByThread(thread.id)).toHaveLength(0);
  });
});
