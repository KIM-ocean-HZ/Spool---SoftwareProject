import { nanoid } from 'nanoid';
import { create } from 'zustand';
import {
  listAttachmentsByBlock,
  reassignAttachmentBlock,
  restoreAttachment,
} from '@/lib/db/attachments';
import {
  computeMergedFields,
  deleteBlock,
  getBlockById,
  mergeBlocks,
  restoreBlock,
  restoreBlockFields,
  updateBlockContent,
} from '@/lib/db/blocks';
import { restoreThread, softDeleteThread } from '@/lib/db/threads';
import { restoreWorkspace, softDeleteWorkspace } from '@/lib/db/workspaces';
import * as undoLog from '@/lib/undo/undoLog';
import type {
  CapturePayload,
  CollectSendPayload,
  DeletePayload,
  ForwardPayload,
  HighlightPayload,
  MergePayload,
  ThreadDeletePayload,
  UndoEntry,
  WorkspaceDeletePayload,
} from '@/lib/undo/undoLog';

// The single most-recent undo, kept so the overlay confirmation's 重做 (redo) action can
// re-apply it.
// Cleared when a new forward op pushes an undo entry (a fresh action invalidates redo) or
// once the redo is consumed. Only one level deep — §9.13 is a safety net, not a full
// editor history (the redo addition is a v2.9 follow-up Ocean requested on the toast).
interface RedoAction {
  entry: UndoEntry;
  apply: () => Promise<void>;
}

interface UndoStoreState {
  entries: UndoEntry[];
  redoable: RedoAction | null;
  pushUndo: (entry: UndoEntry) => void;
  // Pops the last valid entry, reverses it, and returns it (null if nothing to undo OR the
  // reversal failed). Records a RedoAction so the reversal can be re-applied. Does NOT
  // refresh blocksStore or show the toast — runUndo() in hooks/useUndo.ts orchestrates UI.
  undo: () => Promise<UndoEntry | null>;
  // Re-applies the last undone op and returns its entry (null if nothing redoable / failed).
  redo: () => Promise<UndoEntry | null>;
  invalidateForBlock: (blockId: string) => void;
}

// --- Entry builders. Callers snapshot pre-state, then push one of these. ---

export const buildCaptureUndo = (payload: CapturePayload): UndoEntry => ({
  id: nanoid(),
  kind: 'capture',
  timestamp: Date.now(),
  payload,
  affectedBlockIds: [payload.blockId],
  invalidated: false,
});

export const buildDeleteUndo = (payload: DeletePayload): UndoEntry => ({
  id: nanoid(),
  kind: 'delete',
  timestamp: Date.now(),
  payload,
  affectedBlockIds: [payload.block.id],
  invalidated: false,
});

export const buildMergeUndo = (payload: MergePayload): UndoEntry => ({
  id: nanoid(),
  kind: 'merge',
  timestamp: Date.now(),
  payload,
  affectedBlockIds: payload.sourceBlocks.map((b) => b.id),
  invalidated: false,
});

// Step 5 (§20.9) will build + push collect_send entries; the builder lives here so the
// emission site only has to call it. Unused in Step 4.
export const buildCollectSendUndo = (payload: CollectSendPayload): UndoEntry => ({
  id: nanoid(),
  kind: 'collect_send',
  timestamp: Date.now(),
  payload,
  affectedBlockIds: [payload.blockId],
  invalidated: false,
});

// Step 6 §20.5: highlight gesture. Tracks the block so a later content/annotation edit
// invalidates this entry (the user's edit wins).
export const buildHighlightUndo = (payload: HighlightPayload): UndoEntry => ({
  id: nanoid(),
  kind: 'highlight',
  timestamp: Date.now(),
  payload,
  affectedBlockIds: [payload.blockId],
  invalidated: false,
});

// Step 6 §8.1: thread / workspace deletes affect no single block, so they carry no
// affectedBlockIds — a block edit never invalidates them.
export const buildThreadDeleteUndo = (payload: ThreadDeletePayload): UndoEntry => ({
  id: nanoid(),
  kind: 'thread_delete',
  timestamp: Date.now(),
  payload,
  affectedBlockIds: [],
  invalidated: false,
});

export const buildWorkspaceDeleteUndo = (payload: WorkspaceDeletePayload): UndoEntry => ({
  id: nanoid(),
  kind: 'workspace_delete',
  timestamp: Date.now(),
  payload,
  affectedBlockIds: [],
  invalidated: false,
});

// §20.1 forward (copy to thread). The copies are the affected blocks: editing a copy after
// the forward invalidates this entry, so Cmd+Z won't delete an edited copy (the user's most-
// recent edit wins, §9.13). The originals are never in affectedBlockIds — undo never touches
// them.
export const buildForwardUndo = (payload: ForwardPayload): UndoEntry => ({
  id: nanoid(),
  kind: 'forward',
  timestamp: Date.now(),
  payload,
  affectedBlockIds: payload.blocks.map((b) => b.id),
  invalidated: false,
});

// --- Pure helpers over an entry (exported for runUndo / the toast). ---

export const threadIdForEntry = (entry: UndoEntry): string => {
  switch (entry.kind) {
    case 'capture':
    case 'collect_send':
    case 'merge':
    case 'highlight':
    case 'forward':
      return entry.payload.threadId;
    case 'delete':
      return entry.payload.block.threadId;
    case 'thread_delete':
      return entry.payload.threadId;
    case 'workspace_delete':
      // No single thread — the orchestration layer (runUndo) refreshes the workspace and
      // thread stores instead of a block feed, so this is never used for this kind.
      return '';
  }
};

const PREVIEW_MAX = 12;
const previewText = (raw: string): string => {
  const oneLine = raw.replace(/\s+/g, ' ').trim();
  return oneLine.length <= PREVIEW_MAX ? oneLine : `${oneLine.slice(0, PREVIEW_MAX)}…`;
};

export const previewForEntry = (entry: UndoEntry): string => {
  switch (entry.kind) {
    case 'capture':
    case 'collect_send':
      return previewText(entry.payload.content);
    case 'delete':
      return previewText(entry.payload.block.content);
    case 'merge': {
      const survivor =
        entry.payload.sourceBlocks.find((b) => b.id === entry.payload.survivorId) ??
        entry.payload.sourceBlocks[0];
      return survivor ? previewText(survivor.content) : '';
    }
    case 'highlight':
      return previewText(entry.payload.beforeContent);
    case 'thread_delete':
      return previewText(entry.payload.title);
    case 'workspace_delete':
      return '';
    case 'forward': {
      const first = entry.payload.blocks[0];
      return first ? previewText(first.content) : '';
    }
  }
};

// Reverse one entry and return a closure that RE-APPLIES the original operation (redo).
// Every branch is composed of additive (INSERT) or idempotent (UPDATE) writes ordered
// parent-before-child — no intermediate destructive delete — so a partial failure can at
// worst leave some attachments unrestored, never lose existing data. (tauri-plugin-sql's
// sqlx pool can't honour BEGIN/COMMIT across statements — see db/threads.ts:141 — so this
// ordering is how §9.13's "no half-applied reversal" is met without a real transaction.)
const reverseAndBuildRedo = async (
  entry: UndoEntry,
): Promise<() => Promise<void>> => {
  switch (entry.kind) {
    case 'capture':
    case 'collect_send': {
      // Snapshot the live block (source may have been back-filled since capture) so redo
      // restores it faithfully, then delete it.
      const block = await getBlockById(entry.payload.blockId);
      const attachments = block ? await listAttachmentsByBlock(block.id) : [];
      await deleteBlock(entry.payload.blockId);
      // §9.13: undoing a collect_send deletes the merged block here. Re-staging the
      // original items into the panel (when it is open + empty) is handled by the
      // orchestration layer (hooks/useUndo.ts runUndo), which can reach the collect
      // window over an event — this store stays free of cross-window/IPC concerns.
      return async () => {
        if (!block) return;
        await restoreBlock(block);
        for (const a of attachments) await restoreAttachment(a);
      };
    }
    case 'delete': {
      const { block, attachments } = entry.payload;
      await restoreBlock(block);
      for (const a of attachments) await restoreAttachment(a);
      return async () => {
        await deleteBlock(block.id);
      };
    }
    case 'merge': {
      const { survivorId, sourceBlocks, movedAttachments } = entry.payload;
      for (const b of sourceBlocks) {
        if (b.id !== survivorId) await restoreBlock(b);
      }
      const survivor = sourceBlocks.find((b) => b.id === survivorId);
      if (survivor) {
        await restoreBlockFields(
          survivor.id,
          survivor.content,
          survivor.annotation,
          survivor.pinned,
          survivor.source,
        );
      }
      for (const m of movedAttachments) {
        await reassignAttachmentBlock(m.id, m.originalBlockId);
      }
      return async () => {
        const merged = computeMergedFields(sourceBlocks);
        await mergeBlocks(
          merged.survivorId,
          merged.content,
          merged.annotation,
          merged.pinned,
          merged.source,
          merged.nonSurvivorIds,
        );
      };
    }
    case 'highlight': {
      const { blockId, beforeContent } = entry.payload;
      // Snapshot the highlighted (after) content first so redo can re-apply it.
      const after = (await getBlockById(blockId))?.content ?? beforeContent;
      await updateBlockContent(blockId, beforeContent);
      return async () => {
        await updateBlockContent(blockId, after);
      };
    }
    case 'thread_delete': {
      const { threadId } = entry.payload;
      await restoreThread(threadId);
      return async () => {
        await softDeleteThread(threadId);
      };
    }
    case 'workspace_delete': {
      const { workspaceId, deleteTimestamp } = entry.payload;
      await restoreWorkspace(workspaceId, deleteTimestamp);
      // Redo re-stamps with the SAME timestamp so a following undo still matches.
      return async () => {
        await softDeleteWorkspace(workspaceId, deleteTimestamp);
      };
    }
    case 'forward': {
      // §20.1: a forward only ever ADDED these copy blocks. Undo deletes ONLY the copies
      // (their copied attachments cascade-delete with them via the FK); the source blocks
      // and their attachments are never referenced here, so they stay untouched. Redo
      // re-inserts the copies verbatim (blocks before attachments for the FK).
      const { blocks, attachments } = entry.payload;
      for (const b of blocks) await deleteBlock(b.id);
      return async () => {
        for (const b of blocks) await restoreBlock(b);
        for (const a of attachments) await restoreAttachment(a);
      };
    }
  }
};

export const useUndoStore = create<UndoStoreState>((set, get) => ({
  entries: [],
  redoable: null,

  pushUndo: (entry) => {
    undoLog.push(entry);
    // A fresh forward operation invalidates any pending redo.
    set({ entries: undoLog.snapshot(), redoable: null });
  },

  undo: async () => {
    const entry = undoLog.popLastValid();
    set({ entries: undoLog.snapshot() });
    if (!entry) return null;
    try {
      const apply = await reverseAndBuildRedo(entry);
      set({ redoable: { entry, apply } });
    } catch (e) {
      console.error('[undo] reversal failed', e);
      return null;
    }
    return entry;
  },

  redo: async () => {
    const r = get().redoable;
    if (!r) return null;
    try {
      await r.apply();
    } catch (e) {
      console.error('[redo] re-apply failed', e);
      return null;
    }
    // The op exists again — make it undoable, and clear the (now consumed) redo.
    undoLog.push(r.entry);
    set({ entries: undoLog.snapshot(), redoable: null });
    return r.entry;
  },

  invalidateForBlock: (blockId) => {
    undoLog.invalidate(blockId);
    set({ entries: undoLog.snapshot() });
  },
}));
