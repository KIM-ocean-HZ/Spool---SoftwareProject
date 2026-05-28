import { createRequire } from 'node:module';
import type Database from '@tauri-apps/plugin-sql';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createAttachment,
  listAttachmentsByBlock,
} from '@/lib/db/attachments';
import {
  computeMergedFields,
  createBlock,
  deleteBlock,
  listBlocksByThread,
  mergeBlocks,
  togglePin,
} from '@/lib/db/blocks';
import { __setTestDb } from '@/lib/db/client';
import { createThread } from '@/lib/db/threads';
import { createWorkspace } from '@/lib/db/workspaces';
import schemaSql from '@/lib/db/schema.sql?raw';
import { clear as clearUndoLog } from '@/lib/undo/undoLog';
import {
  buildCaptureUndo,
  buildDeleteUndo,
  buildMergeUndo,
  useUndoStore,
} from './undoStore';

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

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 5));

describe('undoStore reversal against a real SQLite engine (§9.13)', () => {
  let sqlite: Sqlite;

  beforeEach(() => {
    sqlite = new DatabaseSync(':memory:');
    sqlite.exec(schemaSql);
    __setTestDb(makeAdapter(sqlite));
    clearUndoLog();
    useUndoStore.setState({ entries: [], undoToast: null });
  });

  afterEach(() => {
    __setTestDb(null);
    sqlite.close();
  });

  it('undo(capture) deletes the captured block', async () => {
    const ws = await createWorkspace('W');
    const thread = await createThread(ws.id, 'T');
    const block = await createBlock({ threadId: thread.id, content: 'captured text' });

    useUndoStore.getState().pushUndo(
      buildCaptureUndo({ blockId: block.id, threadId: thread.id, content: block.content }),
    );

    const entry = await useUndoStore.getState().undo();
    expect(entry?.kind).toBe('capture');
    expect(await listBlocksByThread(thread.id)).toHaveLength(0);
  });

  it('undo(delete) restores the block and its attachments', async () => {
    const ws = await createWorkspace('W');
    const thread = await createThread(ws.id, 'T');
    const block = await createBlock({
      threadId: thread.id,
      content: 'to be deleted',
      annotation: 'my note',
      source: 'Chrome',
    });
    await createAttachment({
      blockId: block.id,
      kind: 'url',
      target: 'https://example.com',
      label: 'example',
    });

    // Snapshot pre-state (as blocksStore.remove does), then delete (cascades attachments).
    const snapshot = (await listBlocksByThread(thread.id))[0]!;
    const snapshotAttachments = await listAttachmentsByBlock(block.id);
    await deleteBlock(block.id);
    expect(await listBlocksByThread(thread.id)).toHaveLength(0);

    useUndoStore.getState().pushUndo(
      buildDeleteUndo({ block: snapshot, attachments: snapshotAttachments }),
    );
    const entry = await useUndoStore.getState().undo();
    expect(entry?.kind).toBe('delete');

    const after = await listBlocksByThread(thread.id);
    expect(after).toHaveLength(1);
    expect(after[0]!.id).toBe(block.id);
    expect(after[0]!.content).toBe('to be deleted');
    expect(after[0]!.annotation).toBe('my note');
    expect(after[0]!.source).toBe('Chrome');
    const restoredAtt = await listAttachmentsByBlock(block.id);
    expect(restoredAtt).toHaveLength(1);
    expect(restoredAtt[0]!.target).toBe('https://example.com');
  });

  it('undo(merge) restores all source blocks with original attachments + annotations', async () => {
    const ws = await createWorkspace('W');
    const thread = await createThread(ws.id, 'T');

    const b1 = await createBlock({
      threadId: thread.id,
      content: 'first',
      source: 'Notion',
      annotation: 'note A',
    });
    await tick();
    const b2 = await createBlock({ threadId: thread.id, content: 'second', source: 'Chrome' });
    await tick();
    const b3 = await createBlock({ threadId: thread.id, content: 'third' });
    await togglePin(b2.id);
    const a2 = await createAttachment({
      blockId: b2.id,
      kind: 'file',
      target: '/x/b2.pdf',
      label: 'b2.pdf',
    });
    const a3 = await createAttachment({
      blockId: b3.id,
      kind: 'url',
      target: 'https://e.com',
      label: 'e',
    });

    // Snapshot pre-merge state (as blocksStore.mergeBlocks does).
    const sourceBlocks = await listBlocksByThread(thread.id);
    const merged = computeMergedFields(sourceBlocks);
    const movedAttachments = [
      { id: a2.id, originalBlockId: b2.id },
      { id: a3.id, originalBlockId: b3.id },
    ];
    await mergeBlocks(
      merged.survivorId,
      merged.content,
      merged.annotation,
      merged.pinned,
      merged.source,
      merged.nonSurvivorIds,
    );
    expect(await listBlocksByThread(thread.id)).toHaveLength(1);

    useUndoStore.getState().pushUndo(
      buildMergeUndo({
        survivorId: merged.survivorId,
        threadId: thread.id,
        sourceBlocks,
        movedAttachments,
      }),
    );
    const entry = await useUndoStore.getState().undo();
    expect(entry?.kind).toBe('merge');

    const after = await listBlocksByThread(thread.id);
    expect(after.map((b) => b.id).sort()).toEqual([b1.id, b2.id, b3.id].sort());

    const survivor = after.find((b) => b.id === b1.id)!;
    // Survivor reverted in place to its pre-merge fields (not the merged content).
    expect(survivor.content).toBe('first');
    expect(survivor.annotation).toBe('note A');
    expect(survivor.source).toBe('Notion');

    // The middle block keeps its pin; attachments are back on their original owners.
    const restored2 = after.find((b) => b.id === b2.id)!;
    expect(restored2.pinned).toBe(true);
    expect(restored2.content).toBe('second');
    expect((await listAttachmentsByBlock(b2.id)).map((a) => a.id)).toEqual([a2.id]);
    expect((await listAttachmentsByBlock(b3.id)).map((a) => a.id)).toEqual([a3.id]);
    // Survivor should no longer hold the re-pointed attachments.
    expect(await listAttachmentsByBlock(b1.id)).toHaveLength(0);
  });

  it('undo() skips an invalidated entry and returns null', async () => {
    const ws = await createWorkspace('W');
    const thread = await createThread(ws.id, 'T');
    const block = await createBlock({ threadId: thread.id, content: 'edited later' });

    useUndoStore.getState().pushUndo(
      buildCaptureUndo({ blockId: block.id, threadId: thread.id, content: block.content }),
    );
    // Simulate a content edit after capture (blocksStore.setContent does this).
    useUndoStore.getState().invalidateForBlock(block.id);

    const entry = await useUndoStore.getState().undo();
    expect(entry).toBeNull();
    // Block is untouched — the user's edit wins.
    expect(await listBlocksByThread(thread.id)).toHaveLength(1);
  });
});
