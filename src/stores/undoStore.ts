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
} from '@/lib/db/blocks';
import * as undoLog from '@/lib/undo/undoLog';
import type {
  CapturePayload,
  CollectSendPayload,
  DeletePayload,
  MergePayload,
  UndoEntry,
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

// --- Pure helpers over an entry (exported for runUndo / the toast). ---

export const threadIdForEntry = (entry: UndoEntry): string => {
  switch (entry.kind) {
    case 'capture':
    case 'collect_send':
    case 'merge':
      return entry.payload.threadId;
    case 'delete':
      return entry.payload.block.threadId;
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
