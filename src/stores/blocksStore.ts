import { create } from 'zustand';
import { extractAttachmentText } from '@/lib/attachments/extractor';
import * as adb from '@/lib/db/attachments';
import type {
  Attachment,
  AttachmentExtractionKind,
  CreateAttachmentArgs,
} from '@/lib/db/attachments';
import * as db from '@/lib/db/blocks';
import type { Block, CreateBlockArgs } from '@/lib/db/blocks';
import { computeMergedFields } from '@/lib/db/blocks';
import { buildDeleteUndo, buildMergeUndo, useUndoStore } from './undoStore';
import { useSettingsStore } from './settingsStore';
import { toast } from './toastStore';

interface BlocksState {
  byThread: Record<string, Block[]>;
  // Attachments keyed by their owning block id. Hydrated alongside blocks on thread
  // load so BlockItem can render chips without per-block queries.
  attachmentsByBlock: Record<string, Attachment[]>;
  // v2.8 §20.1: multi-select state for the merge action. Global (single set), cleared
  // on thread switch so a stale selection from a previous thread can't survive.
  selectedBlockIds: Set<string>;
  load: (threadId: string) => Promise<void>;
  append: (args: CreateBlockArgs) => Promise<Block>;
  togglePin: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setSource: (id: string, source: string | null) => Promise<void>;
  setContent: (id: string, content: string) => Promise<void>;
  setAnnotation: (id: string, annotation: string | null) => Promise<void>;
  attach: (args: CreateAttachmentArgs) => Promise<Attachment>;
  detach: (attachmentId: string, blockId: string) => Promise<void>;
  // v2.8 §20.2: per-attachment toggle for inlining extracted_text into pack/summaries.
  // Persists immediately and patches the in-memory index so the chip reflects state.
  setIncludeInPack: (attachmentId: string, blockId: string, value: boolean) => Promise<void>;
  // v2.7: one-time startup pass that extracts text for legacy file attachments created
  // before the extraction pipeline existed (PLAN §8.1, §9.6).
  backfillExtractions: () => Promise<void>;
  // v2.8 §20.1: selection helpers. toggleSelect flips one block; selectMany adds a range
  // (used by shift-click); setSelection REPLACES the entire set (used by drag-marquee on
  // every frame — baseline ∪ hits); clearSelection empties it.
  toggleSelect: (id: string) => void;
  selectMany: (ids: string[]) => void;
  setSelection: (ids: Iterable<string>) => void;
  clearSelection: () => void;
  // v2.8 §20.1: merge ≥2 blocks. Survivor = earliest createdAt. Re-points attachments,
  // joins contents chronologically (with [from <source>] prefixes when sources differ),
  // newline-joins annotations, OR-aggregates pinned. Hard-deletes non-survivors. Reloads
  // the thread afterwards so the store reflects the new shape in one round trip.
  mergeBlocks: (ids: string[]) => Promise<void>;
}

const removeAttachmentsForBlock = (
  map: Record<string, Attachment[]>,
  blockId: string,
): Record<string, Attachment[]> => {
  if (!(blockId in map)) return map;
  const { [blockId]: _drop, ...rest } = map;
  return rest;
};

// v2.7: patch one attachment's extraction fields in the by-block index. A no-op if the
// block is not currently loaded (e.g. a backfilled attachment in an unopened thread — it
// picks up the cached text from the DB the next time that thread loads).
const applyExtraction = (
  map: Record<string, Attachment[]>,
  blockId: string,
  attachmentId: string,
  extractedText: string | null,
  extractionKind: AttachmentExtractionKind,
): Record<string, Attachment[]> => {
  const list = map[blockId];
  if (!list) return map;
  return {
    ...map,
    [blockId]: list.map((a) =>
      a.id === attachmentId
        ? { ...a, extractedText, extractedAt: Date.now(), extractionKind }
        : a,
    ),
  };
};

export const useBlocksStore = create<BlocksState>((set, get) => {
  // v2.7: extract text for one file attachment, persist the result, and patch it into
  // the by-block index so an open thread / a later Pack reflects the text. Never throws —
  // extraction is best-effort and must not break the attach flow or the startup backfill.
  // `notify` surfaces a genuine extraction failure (not an unsupported file type) as a
  // toast — used on attach so the user sees why a file's text is missing; off for backfill.
  const extractAndStore = async (a: Attachment, notify: boolean): Promise<void> => {
    try {
      const result = await extractAttachmentText(a.target);
      const text = result.ok ? result.text : null;
      await adb.updateAttachmentExtraction(a.id, text, result.kind);
      set((s) => ({
        attachmentsByBlock: applyExtraction(s.attachmentsByBlock, a.blockId, a.id, text, result.kind),
      }));
      if (!result.ok && !result.reason.startsWith('unsupported extension')) {
        console.error('[extract] failed for', a.target, '—', result.reason);
        if (notify) toast.error(`文件文字提取失败：${result.reason}`);
      }
    } catch (e) {
      console.error('[extract] failed for attachment', a.id, e);
      if (notify) toast.error(`文件文字提取失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return {
    byThread: {},
    attachmentsByBlock: {},
    selectedBlockIds: new Set<string>(),

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
      // §9.13: snapshot the block + its attachments BEFORE the destructive delete so the
      // undo entry captures pre-state (the FK cascade will drop the attachment rows).
      const before = get();
      let snapshot: Block | undefined;
      for (const list of Object.values(before.byThread)) {
        const found = list.find((b) => b.id === id);
        if (found) {
          snapshot = found;
          break;
        }
      }
      const snapshotAttachments = before.attachmentsByBlock[id] ?? [];

      await db.deleteBlock(id);

      if (snapshot) {
        useUndoStore.getState().pushUndo(
          buildDeleteUndo({ block: snapshot, attachments: snapshotAttachments }),
        );
      }

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
      // §9.13: a content edit invalidates any prior undo entry for this block — the
      // user's most-recent edit wins, so Cmd+Z won't silently revert it.
      useUndoStore.getState().invalidateForBlock(id);
      const state = get();
      const next: Record<string, Block[]> = {};
      for (const [tId, list] of Object.entries(state.byThread)) {
        next[tId] = list.map((b) => (b.id === id ? { ...b, content } : b));
      }
      set({ byThread: next });
    },

    setAnnotation: async (id, annotation) => {
      await db.updateBlockAnnotation(id, annotation);
      // §9.13: an annotation edit invalidates any prior undo entry for this block (same
      // rationale as setContent). Pin/source edits do NOT — those are reversible by the
      // reverse action, so they leave undo entries intact.
      useUndoStore.getState().invalidateForBlock(id);
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
      // v2.7: kick off background text extraction for file attachments (§9.6). Fire-and-
      // forget — the chip is already visible; extracted text is patched in when ready.
      // Skipped entirely when the user has disabled auto-extraction (§2.5 privacy).
      if (a.kind === 'file' && useSettingsStore.getState().autoExtractAttachments) {
        void extractAndStore(a, true);
      }
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

    setIncludeInPack: async (attachmentId, blockId, value) => {
      await adb.setIncludeInPack(attachmentId, value);
      set((s) => {
        const list = s.attachmentsByBlock[blockId];
        if (!list) return s;
        return {
          attachmentsByBlock: {
            ...s.attachmentsByBlock,
            [blockId]: list.map((a) =>
              a.id === attachmentId ? { ...a, includeInPack: value } : a,
            ),
          },
        };
      });
    },

    backfillExtractions: async () => {
      // Respects the same privacy switch as on-attach extraction (§2.5).
      if (!useSettingsStore.getState().autoExtractAttachments) return;
      let pending: Attachment[];
      try {
        pending = await adb.listAttachmentsNeedingExtraction();
      } catch (e) {
        console.warn('[extract] backfill query failed', e);
        return;
      }
      // Sequential — one file at a time so app startup doesn't hammer the disk (§2.4).
      for (const a of pending) {
        await extractAndStore(a, false);
      }
    },

    toggleSelect: (id) => {
      set((s) => {
        const next = new Set(s.selectedBlockIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return { selectedBlockIds: next };
      });
    },

    selectMany: (ids) => {
      set((s) => {
        const next = new Set(s.selectedBlockIds);
        for (const id of ids) next.add(id);
        return { selectedBlockIds: next };
      });
    },

    setSelection: (ids) => {
      const next = new Set(ids);
      set((s) => {
        // Guard against churn — the drag-marquee tick calls this every frame even when
        // the hit set hasn't changed; without this, every frame triggers a full feed
        // re-render. Cheap O(n) compare since n is the selection size, not the feed.
        if (s.selectedBlockIds.size === next.size) {
          let same = true;
          for (const id of next) {
            if (!s.selectedBlockIds.has(id)) {
              same = false;
              break;
            }
          }
          if (same) return s;
        }
        return { selectedBlockIds: next };
      });
    },

    clearSelection: () => {
      set((s) => (s.selectedBlockIds.size === 0 ? s : { selectedBlockIds: new Set() }));
    },

    mergeBlocks: async (ids) => {
      if (ids.length < 2) return;
      const state = get();
      // Collect every selected block across threads. In practice they all sit in the
      // same thread (the UI only selects within one feed at a time), but reading from
      // every loaded thread keeps the store function decoupled from the caller.
      const wanted = new Set(ids);
      const found: { threadId: string; block: Block }[] = [];
      for (const [tId, list] of Object.entries(state.byThread)) {
        for (const b of list) {
          if (wanted.has(b.id)) found.push({ threadId: tId, block: b });
        }
      }
      if (found.length !== ids.length) {
        console.warn('[merge] some selected ids not found in loaded threads', {
          requested: ids,
          found: found.map((x) => x.block.id),
        });
      }
      if (found.length < 2) return;
      const threadIds = new Set(found.map((x) => x.threadId));
      if (threadIds.size > 1) {
        console.warn('[merge] refusing cross-thread merge', { threadIds: [...threadIds] });
        toast.error('合并失败：所选 block 跨脉络');
        return;
      }
      const threadId = found[0]!.threadId;

      const merged = computeMergedFields(found.map((x) => x.block));

      // §9.13: snapshot pre-merge state for undo. sourceBlocks are the full rows BEFORE
      // the merge mutates the survivor; movedAttachments are the attachments the forward
      // merge re-points from each non-survivor onto the survivor (the attachmentsByBlock
      // index is fully hydrated for the active thread, which is the only thread merge can
      // select from).
      const sourceBlocks = found.map((x) => x.block);
      const movedAttachments: { id: string; originalBlockId: string }[] = [];
      for (const { block: b } of found) {
        if (b.id === merged.survivorId) continue;
        for (const a of get().attachmentsByBlock[b.id] ?? []) {
          movedAttachments.push({ id: a.id, originalBlockId: b.id });
        }
      }

      try {
        await db.mergeBlocks(
          merged.survivorId,
          merged.content,
          merged.annotation,
          merged.pinned,
          merged.source,
          merged.nonSurvivorIds,
        );
      } catch (e) {
        console.error('[merge] failed', e);
        toast.error(`合并失败：${e instanceof Error ? e.message : String(e)}`);
        return;
      }

      useUndoStore.getState().pushUndo(
        buildMergeUndo({
          survivorId: merged.survivorId,
          threadId,
          sourceBlocks,
          movedAttachments,
        }),
      );
      // Clear selection and reload — simpler and safer than reconstructing the merged
      // block + reparented attachments in-memory across two indexes.
      set((s) => (s.selectedBlockIds.size === 0 ? s : { selectedBlockIds: new Set() }));
      await get().load(threadId);
    },
  };
});
