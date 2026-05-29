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
  updateBlockContent,
} from '@/lib/db/blocks';
import { __setTestDb } from '@/lib/db/client';
import { createThread, listAllThreads, softDeleteThread } from '@/lib/db/threads';
import { createWorkspace, listWorkspaces, softDeleteWorkspace } from '@/lib/db/workspaces';
import schemaSql from '@/lib/db/schema.sql?raw';
import { clear as clearUndoLog } from '@/lib/undo/undoLog';
import {
  buildCaptureUndo,
  buildDeleteUndo,
  buildHighlightUndo,
  buildMergeUndo,
  buildThreadDeleteUndo,
  buildWorkspaceDeleteUndo,
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
    useUndoStore.setState({ entries: [], redoable: null });
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

  it('redo() re-creates a captured block after its undo deleted it', async () => {
    const ws = await createWorkspace('W');
    const thread = await createThread(ws.id, 'T');
    const block = await createBlock({ threadId: thread.id, content: 'captured' });

    useUndoStore.getState().pushUndo(
      buildCaptureUndo({ blockId: block.id, threadId: thread.id, content: block.content }),
    );
    await useUndoStore.getState().undo();
    expect(await listBlocksByThread(thread.id)).toHaveLength(0);

    const redone = await useUndoStore.getState().redo();
    expect(redone?.kind).toBe('capture');
    const after = await listBlocksByThread(thread.id);
    expect(after).toHaveLength(1);
    expect(after[0]!.id).toBe(block.id);
    expect(after[0]!.content).toBe('captured');
    // After redo the op is undoable again.
    expect(useUndoStore.getState().redoable).toBeNull();
    await useUndoStore.getState().undo();
    expect(await listBlocksByThread(thread.id)).toHaveLength(0);
  });

  it('redo() re-merges after an undone merge', async () => {
    const ws = await createWorkspace('W');
    const thread = await createThread(ws.id, 'T');
    const b1 = await createBlock({ threadId: thread.id, content: 'first' });
    await tick();
    await createBlock({ threadId: thread.id, content: 'second' });

    const sourceBlocks = await listBlocksByThread(thread.id);
    const merged = computeMergedFields(sourceBlocks);
    await mergeBlocks(
      merged.survivorId,
      merged.content,
      merged.annotation,
      merged.pinned,
      merged.source,
      merged.nonSurvivorIds,
    );
    useUndoStore.getState().pushUndo(
      buildMergeUndo({
        survivorId: merged.survivorId,
        threadId: thread.id,
        sourceBlocks,
        movedAttachments: [],
      }),
    );

    await useUndoStore.getState().undo();
    expect(await listBlocksByThread(thread.id)).toHaveLength(2);

    const redone = await useUndoStore.getState().redo();
    expect(redone?.kind).toBe('merge');
    const after = await listBlocksByThread(thread.id);
    expect(after).toHaveLength(1);
    expect(after[0]!.id).toBe(b1.id);
    expect(after[0]!.content).toBe('first\n\nsecond');
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

  // --- Step 6: new op kinds ---

  it('undo(highlight) restores the pre-gesture content', async () => {
    const ws = await createWorkspace('W');
    const thread = await createThread(ws.id, 'T');
    const block = await createBlock({ threadId: thread.id, content: 'plain text here' });

    // Display-mode highlight gesture: persist == markers, then record the undo entry.
    await updateBlockContent(block.id, 'plain ==text== here');
    useUndoStore.getState().pushUndo(
      buildHighlightUndo({ blockId: block.id, threadId: thread.id, beforeContent: 'plain text here' }),
    );

    const entry = await useUndoStore.getState().undo();
    expect(entry?.kind).toBe('highlight');
    expect((await listBlocksByThread(thread.id))[0]!.content).toBe('plain text here');
  });

  it('a later edit invalidates a highlight entry so undo is skipped', async () => {
    const ws = await createWorkspace('W');
    const thread = await createThread(ws.id, 'T');
    const block = await createBlock({ threadId: thread.id, content: 'plain ==text== here' });

    useUndoStore.getState().pushUndo(
      buildHighlightUndo({ blockId: block.id, threadId: thread.id, beforeContent: 'plain text here' }),
    );
    // A content edit after the highlight (blocksStore.setContent invalidates).
    useUndoStore.getState().invalidateForBlock(block.id);

    expect(await useUndoStore.getState().undo()).toBeNull();
    // The block keeps its current (edited) content — the user's edit wins.
    expect((await listBlocksByThread(thread.id))[0]!.content).toBe('plain ==text== here');
  });

  it('undo(thread_delete) clears the soft-delete so the thread returns', async () => {
    const ws = await createWorkspace('W');
    const thread = await createThread(ws.id, 'Project');
    await softDeleteThread(thread.id);
    expect((await listAllThreads()).some((t) => t.id === thread.id)).toBe(false);

    useUndoStore.getState().pushUndo(
      buildThreadDeleteUndo({ threadId: thread.id, title: 'Project' }),
    );
    const entry = await useUndoStore.getState().undo();
    expect(entry?.kind).toBe('thread_delete');
    expect((await listAllThreads()).some((t) => t.id === thread.id)).toBe(true);
  });

  it('undo(workspace_delete) restores only the threads that delete removed', async () => {
    const ws = await createWorkspace('W');
    const a = await createThread(ws.id, 'A'); // deleted earlier, must STAY deleted
    const b = await createThread(ws.id, 'B'); // active at delete time, must come back

    await softDeleteThread(a.id);
    await tick(); // ensure a later, distinct timestamp for the workspace delete
    const deleteTimestamp = await softDeleteWorkspace(ws.id);

    expect((await listWorkspaces()).some((w) => w.id === ws.id)).toBe(false);

    useUndoStore.getState().pushUndo(
      buildWorkspaceDeleteUndo({ workspaceId: ws.id, deleteTimestamp }),
    );
    const entry = await useUndoStore.getState().undo();
    expect(entry?.kind).toBe('workspace_delete');

    expect((await listWorkspaces()).some((w) => w.id === ws.id)).toBe(true);
    const live = (await listAllThreads()).map((t) => t.id);
    expect(live).toContain(b.id); // restored
    expect(live).not.toContain(a.id); // earlier delete preserved (selective restore)
  });
});
