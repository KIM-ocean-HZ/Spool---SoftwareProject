import { nanoid } from 'nanoid';
import { create } from 'zustand';
import { reassignAttachmentBlock, restoreAttachment } from '@/lib/db/attachments';
import { deleteBlock, restoreBlock, restoreBlockFields } from '@/lib/db/blocks';
import * as undoLog from '@/lib/undo/undoLog';
import type {
  CapturePayload,
  CollectSendPayload,
  DeletePayload,
  MergePayload,
  UndoEntry,
  UndoOpKind,
} from '@/lib/undo/undoLog';

// The UndoToast surface (§13.2). 'empty' = the "没有可撤销的操作" state; otherwise the op
// kind + a short content preview. `id` forces a remount so a repeated undo re-triggers
// the slide-in + auto-dismiss even when the kind/preview are identical.
export type UndoToastState =
  | { id: number; kind: UndoOpKind; preview: string }
  | { id: number; kind: 'empty' }
  | null;

interface UndoStoreState {
  entries: UndoEntry[];
  undoToast: UndoToastState;
  pushUndo: (entry: UndoEntry) => void;
  // Pops the last valid entry, applies the reversal, and returns it (null if nothing to
  // undo OR the reversal failed — both surface as "Nothing to undo" per §14.4). Does NOT
  // refresh blocksStore or show the toast; runUndo() in hooks/useUndo.ts orchestrates
  // those so this store stays decoupled from the UI stores.
  undo: () => Promise<UndoEntry | null>;
  invalidateForBlock: (blockId: string) => void;
  showUndoToast: (entry: UndoEntry | null) => void;
  dismissUndoToast: () => void;
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
      // The earliest source block is the survivor — the most representative restored block.
      const survivor =
        entry.payload.sourceBlocks.find((b) => b.id === entry.payload.survivorId) ??
        entry.payload.sourceBlocks[0];
      return survivor ? previewText(survivor.content) : '';
    }
  }
};

// Apply the reversal for one entry. Every branch is composed of additive (INSERT) or
// idempotent (UPDATE) writes ordered parent-before-child — there is no intermediate
// destructive delete, so a partial failure can at worst leave some attachments
// unrestored, never lose existing data. (tauri-plugin-sql's sqlx pool can't honour an
// explicit BEGIN/COMMIT across statements — see db/threads.ts:141 — so this ordering is
// how §9.13's "no half-applied reversal" is met without a real transaction.)
const applyReversal = async (entry: UndoEntry): Promise<void> => {
  switch (entry.kind) {
    case 'capture':
      await deleteBlock(entry.payload.blockId);
      return;
    case 'collect_send':
      // TODO(step-5): if the collect panel is still open and empty, re-stage the original
      // items into it (§20.9). Step 4's reversal only deletes the written merged block.
      await deleteBlock(entry.payload.blockId);
      return;
    case 'delete': {
      const { block, attachments } = entry.payload;
      await restoreBlock(block);
      for (const a of attachments) await restoreAttachment(a);
      return;
    }
    case 'merge': {
      const { survivorId, sourceBlocks, movedAttachments } = entry.payload;
      // 1. Recreate the non-survivor blocks the forward merge hard-deleted.
      for (const b of sourceBlocks) {
        if (b.id !== survivorId) await restoreBlock(b);
      }
      // 2. Revert the survivor in place to its pre-merge fields.
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
      // 3. Move each re-pointed attachment back to its original owner (now recreated).
      for (const m of movedAttachments) {
        await reassignAttachmentBlock(m.id, m.originalBlockId);
      }
      return;
    }
  }
};

let toastSeq = 1;

export const useUndoStore = create<UndoStoreState>((set) => ({
  entries: [],
  undoToast: null,

  pushUndo: (entry) => {
    undoLog.push(entry);
    set({ entries: undoLog.snapshot() });
  },

  undo: async () => {
    const entry = undoLog.popLastValid();
    set({ entries: undoLog.snapshot() });
    if (!entry) return null;
    try {
      await applyReversal(entry);
    } catch (e) {
      console.error('[undo] reversal failed', e);
      return null;
    }
    return entry;
  },

  invalidateForBlock: (blockId) => {
    undoLog.invalidate(blockId);
    set({ entries: undoLog.snapshot() });
  },

  showUndoToast: (entry) => {
    const id = toastSeq++;
    set({
      undoToast: entry
        ? { id, kind: entry.kind, preview: previewForEntry(entry) }
        : { id, kind: 'empty' },
    });
  },

  dismissUndoToast: () => set({ undoToast: null }),
}));
