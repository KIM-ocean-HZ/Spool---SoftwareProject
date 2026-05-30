// §9.13 Undo Operation — in-memory ring buffer, capacity 10, lost on app restart.
// Pure module: no SQL, no React, no persistence. The undoStore (stores/undoStore.ts)
// wraps this with reactive state + the actual reversal logic; this file only owns the
// buffer mechanics (push / peek / pop / invalidate / clear) and the entry types.

import type { Attachment } from '@/lib/db/attachments';
import type { Block } from '@/lib/db/blocks';
import type { StagingItem } from '@/lib/collect/stagingBuffer';

export type UndoOpKind =
  | 'capture'
  | 'merge'
  | 'delete'
  | 'collect_send'
  | 'highlight'
  | 'thread_delete'
  | 'workspace_delete'
  | 'forward';

// Per-kind payloads. §8.2 types the schema-level payload as `unknown` for storage
// flexibility; at every usage site we narrow it via the discriminated UndoEntry union
// below so reversal code is type-checked against the exact shape it needs.
export interface CapturePayload {
  blockId: string;
  threadId: string;
  content: string; // snapshot for the toast preview (block is deleted on undo)
}

export interface DeletePayload {
  block: Block;
  attachments: Attachment[];
}

export interface MergePayload {
  survivorId: string;
  threadId: string;
  // Full pre-merge rows of every source block (survivor + non-survivors). Restored
  // verbatim on undo.
  sourceBlocks: Block[];
  // Attachments the forward merge re-pointed onto the survivor, with the block they
  // originally belonged to — so undo can move each back to its owner.
  movedAttachments: { id: string; originalBlockId: string }[];
}

export interface CollectSendPayload {
  blockId: string;
  threadId: string;
  content: string;
  // Pre-merge staging items, kept so an undo can re-stage them into the panel when it is
  // still open and empty (§9.13). They are not needed to delete the merged block.
  originalStagingItems: StagingItem[];
}

// Step 6 §20.5: a select-to-highlight gesture mutated stored content. Reversal restores
// the pre-gesture string. Invalidated (skipped) if the block is edited afterward.
export interface HighlightPayload {
  blockId: string;
  threadId: string;
  beforeContent: string;
}

// Step 6 §8.1: thread soft-delete (deleted_at). Reversal clears it; the thread's blocks
// have no deleted_at, so they return with it automatically.
export interface ThreadDeletePayload {
  threadId: string;
  title: string;
}

// Step 6 §8.1: workspace soft-delete cascades to its active threads with one shared
// timestamp. Reversal clears deleted_at only where it equals that timestamp, so threads
// the user had deleted earlier stay deleted.
export interface WorkspaceDeletePayload {
  workspaceId: string;
  deleteTimestamp: number;
}

// §20.1 forward (copy to another thread): the forward is purely additive — it INSERTed these
// NEW copy blocks (+ their copied attachments) into a target thread; the originals were never
// touched. Reversal deletes ONLY the copies (their attachments cascade with them); redo
// re-inserts them verbatim, so both arrays hold the copies, not the originals.
export interface ForwardPayload {
  threadId: string; // target thread — for feed refresh on undo/redo
  blocks: Block[];
  attachments: Attachment[];
}

interface BaseEntry {
  id: string;
  timestamp: number;
  affectedBlockIds: string[]; // for invalidation when any is edited after the op
  invalidated: boolean;
}

export interface CaptureUndoEntry extends BaseEntry {
  kind: 'capture';
  payload: CapturePayload;
}
export interface DeleteUndoEntry extends BaseEntry {
  kind: 'delete';
  payload: DeletePayload;
}
export interface MergeUndoEntry extends BaseEntry {
  kind: 'merge';
  payload: MergePayload;
}
export interface CollectSendUndoEntry extends BaseEntry {
  kind: 'collect_send';
  payload: CollectSendPayload;
}
export interface HighlightUndoEntry extends BaseEntry {
  kind: 'highlight';
  payload: HighlightPayload;
}
export interface ThreadDeleteUndoEntry extends BaseEntry {
  kind: 'thread_delete';
  payload: ThreadDeletePayload;
}
export interface WorkspaceDeleteUndoEntry extends BaseEntry {
  kind: 'workspace_delete';
  payload: WorkspaceDeletePayload;
}
export interface ForwardUndoEntry extends BaseEntry {
  kind: 'forward';
  payload: ForwardPayload;
}

export type UndoEntry =
  | CaptureUndoEntry
  | DeleteUndoEntry
  | MergeUndoEntry
  | CollectSendUndoEntry
  | HighlightUndoEntry
  | ThreadDeleteUndoEntry
  | WorkspaceDeleteUndoEntry
  | ForwardUndoEntry;

const CAPACITY = 10;

let ring: UndoEntry[] = [];

export const push = (entry: UndoEntry): void => {
  ring.push(entry);
  if (ring.length > CAPACITY) ring = ring.slice(ring.length - CAPACITY);
};

// Newest-to-oldest scan, returning the first entry that has NOT been invalidated by a
// later edit to one of its affected blocks.
export const peekLastValid = (): UndoEntry | null => {
  for (let i = ring.length - 1; i >= 0; i--) {
    const e = ring[i]!;
    if (!e.invalidated) return e;
  }
  return null;
};

// Like peekLastValid, but removes the entry it returns.
export const popLastValid = (): UndoEntry | null => {
  for (let i = ring.length - 1; i >= 0; i--) {
    const e = ring[i]!;
    if (!e.invalidated) {
      ring.splice(i, 1);
      return e;
    }
  }
  return null;
};

// Mark every entry touching this block as invalidated — called when the block's content
// or annotation is edited after the op, so the user's most-recent edit wins (§9.13).
export const invalidate = (blockId: string): void => {
  for (const e of ring) {
    if (e.affectedBlockIds.includes(blockId)) e.invalidated = true;
  }
};

export const clear = (): void => {
  ring = [];
};

// Read-only view of the ring, oldest-to-newest. Used by undoStore to mirror state into
// Zustand for the UI, and by tests.
export const snapshot = (): UndoEntry[] => [...ring];
