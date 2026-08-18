import { createRequire } from 'node:module';
import type Database from '@tauri-apps/plugin-sql';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAttachment, listAttachmentsByThread } from '@/lib/db/attachments';
import {
  computeMergedFields,
  createBlock,
  deleteBlock,
  insertBlocks,
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
  buildCreateUndo,
  buildDeleteUndo,
  buildForwardUndo,
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

  // Ocean, Windows 验收 2026-08-18 #1: 「自己写入的 block 无法撤销」. Composer writes recorded
  // nothing at all, so there was no entry for ⌘Z to find. These pin both directions —
  // reversing a write removes the block, and redo puts back the row as it stood when it was
  // reversed (pin and edits included), not the bare text that was first typed.
  it('undo(create) removes a block the user typed, and redo restores it as it stood', async () => {
    const ws = await createWorkspace('W');
    const thread = await createThread(ws.id, 'T');
    const block = await createBlock({ threadId: thread.id, content: 'typed by hand' });

    useUndoStore.getState().pushUndo(
      buildCreateUndo({ blockId: block.id, threadId: thread.id, content: block.content }),
    );
    // What happens to a real block between being written and being undone.
    await togglePin(block.id);

    const entry = await useUndoStore.getState().undo();
    expect(entry?.kind).toBe('create');
    expect(await listBlocksByThread(thread.id)).toHaveLength(0);

    await useUndoStore.getState().redo();
    const back = await listBlocksByThread(thread.id);
    expect(back).toHaveLength(1);
    expect(back[0]?.content).toBe('typed by hand');
    expect(back[0]?.pinned).toBe(true);
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

  it('undo(delete) restores the block, and never touched the project\u2019s files', async () => {
    const ws = await createWorkspace('W');
    const thread = await createThread(ws.id, 'T');
    const block = await createBlock({
      threadId: thread.id,
      content: 'to be deleted',
      annotation: 'my note',
      source: 'Chrome',
    });
    const file = await createAttachment({
      threadId: thread.id,
      kind: 'file',
      target: '/x/notes.pdf',
      label: 'notes.pdf',
    });

    // Snapshot pre-state (as blocksStore.remove does), then delete.
    const snapshot = (await listBlocksByThread(thread.id))[0]!;
    await deleteBlock(block.id);
    expect(await listBlocksByThread(thread.id)).toHaveLength(0);
    // ⚠️ v15: the FK cascade that used to take the block's attachments with it is gone —
    // the file is the project's, and deleting one of its blocks is not a reason to lose it.
    expect((await listAttachmentsByThread(thread.id)).map((a) => a.id)).toEqual([file.id]);

    useUndoStore.getState().pushUndo(buildDeleteUndo({ block: snapshot }));
    const entry = await useUndoStore.getState().undo();
    expect(entry?.kind).toBe('delete');

    const after = await listBlocksByThread(thread.id);
    expect(after).toHaveLength(1);
    expect(after[0]!.id).toBe(block.id);
    expect(after[0]!.content).toBe('to be deleted');
    expect(after[0]!.annotation).toBe('my note');
    expect(after[0]!.source).toBe('Chrome');
    expect((await listAttachmentsByThread(thread.id)).map((a) => a.id)).toEqual([file.id]);
  });

  it('undo(merge) restores all source blocks with their annotations, files untouched', async () => {
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
    const file = await createAttachment({
      threadId: thread.id,
      kind: 'file',
      target: '/x/b2.pdf',
      label: 'b2.pdf',
    });

    // Snapshot pre-merge state (as blocksStore.mergeBlocks does).
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
    expect(await listBlocksByThread(thread.id)).toHaveLength(1);

    useUndoStore.getState().pushUndo(
      buildMergeUndo({ survivorId: merged.survivorId, threadId: thread.id, sourceBlocks }),
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

    // The middle block keeps its pin. v15: the merge moved no file, so undoing it has no
    // file to move back — the project still holds exactly what it held before.
    const restored2 = after.find((b) => b.id === b2.id)!;
    expect(restored2.pinned).toBe(true);
    expect(restored2.content).toBe('second');
    expect((await listAttachmentsByThread(thread.id)).map((a) => a.id)).toEqual([file.id]);
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

  it('forward(copy) is additive — copies land in the target, the source is untouched, undo removes only the copies', async () => {
    const ws = await createWorkspace('W');
    const source = await createThread(ws.id, 'Source');
    const target = await createThread(ws.id, 'Target');

    const b1 = await createBlock({ threadId: source.id, content: 'one', annotation: 'note one' });
    await tick();
    const b2 = await createBlock({ threadId: source.id, content: 'two' });
    await togglePin(b2.id);
    await tick();
    const b3 = await createBlock({ threadId: source.id, content: 'three' });
    const file = await createAttachment({
      threadId: source.id,
      kind: 'file',
      target: '/x/e.pdf',
      label: 'e.pdf',
    });

    // Build the copies exactly as blocksStore.forwardToThread does: fresh ids, target
    // thread_id, verbatim fields, now-based created_at (+i ms). Then INSERT them (additive)
    // and record the forward undo entry. The copy of b3 (the 3rd source, index 2) is copy-2.
    const sources = await listBlocksByThread(source.id);
    const base = Date.now();
    const copyBlocks = sources.map((src, i) => ({
      ...src,
      id: `copy-${i}`,
      threadId: target.id,
      createdAt: base + i,
    }));
    await insertBlocks(copyBlocks);

    // Copies landed in the target with pin / annotation preserved, appended in source order
    // — with brand-new ids.
    const copies = await listBlocksByThread(target.id);
    expect(copies.map((c) => c.content)).toEqual(['one', 'two', 'three']);
    expect(copies.every((c) => ![b1.id, b2.id, b3.id].includes(c.id))).toBe(true);
    expect(copies.find((c) => c.content === 'one')!.annotation).toBe('note one');
    expect(copies.find((c) => c.content === 'two')!.pinned).toBe(true);
    // ⚠️ v15: no file travelled. A file belongs to the SOURCE project, and copying one of
    // its conclusions elsewhere is not a decision to copy its files there.
    expect(await listAttachmentsByThread(target.id)).toHaveLength(0);

    // The source is strictly read-only through the forward.
    expect((await listBlocksByThread(source.id)).map((b) => b.id).sort()).toEqual(
      [b1.id, b2.id, b3.id].sort(),
    );

    useUndoStore.getState().pushUndo(
      buildForwardUndo({ threadId: target.id, blocks: copyBlocks }),
    );
    const entry = await useUndoStore.getState().undo();
    expect(entry?.kind).toBe('forward');

    // Undo deleted ONLY the copies; the source still holds all three originals intact.
    expect(await listBlocksByThread(target.id)).toHaveLength(0);
    const sourceAfter = await listBlocksByThread(source.id);
    expect(sourceAfter.map((b) => b.id).sort()).toEqual([b1.id, b2.id, b3.id].sort());
    expect(sourceAfter.find((b) => b.id === b2.id)!.pinned).toBe(true);
    expect(sourceAfter.find((b) => b.id === b1.id)!.annotation).toBe('note one');
    expect((await listAttachmentsByThread(source.id)).map((a) => a.id)).toEqual([file.id]);
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
