import { create } from 'zustand';
import * as adb from '@/lib/db/attachments';
import type { Attachment, CreateAttachmentArgs } from '@/lib/db/attachments';
import * as db from '@/lib/db/blocks';
import type { Block, CreateBlockArgs } from '@/lib/db/blocks';

interface BlocksState {
  byThread: Record<string, Block[]>;
  // Attachments keyed by their owning block id. Hydrated alongside blocks on thread
  // load so BlockItem can render chips without per-block queries.
  attachmentsByBlock: Record<string, Attachment[]>;
  load: (threadId: string) => Promise<void>;
  append: (args: CreateBlockArgs) => Promise<Block>;
  togglePin: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setSource: (id: string, source: string | null) => Promise<void>;
  setContent: (id: string, content: string) => Promise<void>;
  setAnnotation: (id: string, annotation: string | null) => Promise<void>;
  attach: (args: CreateAttachmentArgs) => Promise<Attachment>;
  detach: (attachmentId: string, blockId: string) => Promise<void>;
}

const removeAttachmentsForBlock = (
  map: Record<string, Attachment[]>,
  blockId: string,
): Record<string, Attachment[]> => {
  if (!(blockId in map)) return map;
  const { [blockId]: _drop, ...rest } = map;
  return rest;
};

export const useBlocksStore = create<BlocksState>((set, get) => ({
  byThread: {},
  attachmentsByBlock: {},

  load: async (threadId) => {
    const [list, attachments] = await Promise.all([
      db.listBlocksByThread(threadId),
      adb.listAttachmentsByThread(threadId),
    ]);
    // Reset attachments for blocks in this thread (so refresh doesn't keep stale rows
    // for deleted blocks), then index the fresh ones.
    const blockIds = new Set(list.map((b) => b.id));
    set((s) => {
      const nextAttach: Record<string, Attachment[]> = {};
      for (const [bId, arr] of Object.entries(s.attachmentsByBlock)) {
        if (!blockIds.has(bId)) nextAttach[bId] = arr;
      }
      for (const a of attachments) {
        const arr = nextAttach[a.blockId];
        if (arr) arr.push(a);
        else nextAttach[a.blockId] = [a];
      }
      return {
        byThread: { ...s.byThread, [threadId]: list },
        attachmentsByBlock: nextAttach,
      };
    });
  },

  append: async (args) => {
    const b = await db.createBlock(args);
    set((s) => ({
      byThread: {
        ...s.byThread,
        [b.threadId]: [...(s.byThread[b.threadId] ?? []), b],
      },
    }));
    return b;
  },

  togglePin: async (id) => {
    const pinned = await db.togglePin(id);
    const state = get();
    const next: Record<string, Block[]> = {};
    for (const [tId, list] of Object.entries(state.byThread)) {
      next[tId] = list.map((b) => (b.id === id ? { ...b, pinned } : b));
    }
    set({ byThread: next });
  },

  remove: async (id) => {
    await db.deleteBlock(id);
    const state = get();
    const next: Record<string, Block[]> = {};
    for (const [tId, list] of Object.entries(state.byThread)) {
      next[tId] = list.filter((b) => b.id !== id);
    }
    // Drop the block's attachments from the index — DB does it via ON DELETE CASCADE,
    // we mirror it here so the UI doesn't render orphan chips.
    set({
      byThread: next,
      attachmentsByBlock: removeAttachmentsForBlock(state.attachmentsByBlock, id),
    });
  },

  setSource: async (id, source) => {
    await db.updateBlockSource(id, source);
    const state = get();
    const next: Record<string, Block[]> = {};
    for (const [tId, list] of Object.entries(state.byThread)) {
      next[tId] = list.map((b) => (b.id === id ? { ...b, source } : b));
    }
    set({ byThread: next });
  },

  setContent: async (id, content) => {
    await db.updateBlockContent(id, content);
    const state = get();
    const next: Record<string, Block[]> = {};
    for (const [tId, list] of Object.entries(state.byThread)) {
      next[tId] = list.map((b) => (b.id === id ? { ...b, content } : b));
    }
    set({ byThread: next });
  },

  setAnnotation: async (id, annotation) => {
    await db.updateBlockAnnotation(id, annotation);
    const state = get();
    const next: Record<string, Block[]> = {};
    for (const [tId, list] of Object.entries(state.byThread)) {
      next[tId] = list.map((b) => (b.id === id ? { ...b, annotation } : b));
    }
    set({ byThread: next });
  },

  attach: async (args) => {
    const a = await adb.createAttachment(args);
    set((s) => ({
      attachmentsByBlock: {
        ...s.attachmentsByBlock,
        [a.blockId]: [...(s.attachmentsByBlock[a.blockId] ?? []), a],
      },
    }));
    return a;
  },

  detach: async (attachmentId, blockId) => {
    await adb.deleteAttachment(attachmentId);
    set((s) => {
      const list = s.attachmentsByBlock[blockId];
      if (!list) return s;
      const filtered = list.filter((a) => a.id !== attachmentId);
      if (filtered.length === 0) {
        const { [blockId]: _drop, ...rest } = s.attachmentsByBlock;
        return { attachmentsByBlock: rest };
      }
      return {
        attachmentsByBlock: { ...s.attachmentsByBlock, [blockId]: filtered },
      };
    });
  },
}));
