import { nanoid } from 'nanoid';
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
import {
  buildCreateUndo,
  buildDeleteUndo,
  buildForwardUndo,
  buildMergeUndo,
  useUndoStore,
} from './undoStore';
import { useSettingsStore } from './settingsStore';
import { toast } from './toastStore';
import { t } from '@/lib/i18n';

interface BlocksState {
  byThread: Record<string, Block[]>;
  // v15 (DESIGN_PROJECT_FILES): attachments keyed by the PROJECT they belong to, not by a
  // block. Hydrated alongside the blocks on thread load, and read by the right rail's
  // 「项目文件」 panel — which is now the only place files are seen or added.
  attachmentsByThread: Record<string, Attachment[]>;
  // v2.8 §20.1: multi-select state for the merge action. Global (single set), cleared
  // on thread switch so a stale selection from a previous thread can't survive.
  selectedBlockIds: Set<string>;
  load: (threadId: string) => Promise<void>;
  append: (args: CreateBlockArgs) => Promise<Block>;
  togglePin: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setSource: (id: string, source: string | null) => Promise<void>;
  /** DESIGN_CONTEXT_HYGIENE §3.1 — 「这条不作数了」and taking it back. */
  setStale: (id: string, stale: boolean) => Promise<void>;
  /** §3.1 — declared FROM the newer block: which older one it replaces or corrects.
   *  `supersedes` retires the target in the same call; `corrects` leaves it untouched. */
  setSupersession: (
    id: string,
    targetBlockId: string,
    kind: 'supersedes' | 'corrects',
  ) => Promise<void>;
  /** §3.1 — undo either declaration: the relation goes and the target comes back. */
  clearSupersession: (id: string) => Promise<void>;
  setContent: (id: string, content: string) => Promise<void>;
  setAnnotation: (id: string, annotation: string | null) => Promise<void>;
  attach: (args: CreateAttachmentArgs) => Promise<Attachment>;
  detach: (attachmentId: string, threadId: string) => Promise<void>;
  // v2.8 §20.2: per-attachment toggle for inlining extracted_text into pack/summaries.
  // Persists immediately and patches the in-memory index so the row reflects state.
  setIncludeInPack: (attachmentId: string, threadId: string, value: boolean) => Promise<void>;
  // v15 §5.1 ①: the standing permission for an AI to ask for this file. Same shape as
  // setIncludeInPack and deliberately NOT the same flag — one is "put the text in the pack
  // I am building", the other is "an AI may ask for this at all".
  setAiAccess: (attachmentId: string, threadId: string, value: boolean) => Promise<void>;
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
  // §20.1 forward: COPY the given blocks into another thread (cross-workspace allowed).
  // Strictly additive — inserts NEW block + attachment rows and never mutates or deletes the
  // originals. Copies append to the target's bottom (created_at = now, +1ms per block to keep
  // their relative order). Pushes a forward undo (deletes only the copies) and returns the
  // number of blocks copied (0 if none resolved).
  forwardToThread: (ids: string[], targetThreadId: string) => Promise<number>;
}

// Patch one field of one attachment in the by-thread index. A no-op if that project is not
// loaded — the row is already persisted, and the next load reads it back.
const patchAttachment = (
  s: { attachmentsByThread: Record<string, Attachment[]> },
  threadId: string,
  attachmentId: string,
  fields: Partial<Attachment>,
): Partial<BlocksState> => {
  const list = s.attachmentsByThread[threadId];
  if (!list) return s;
  return {
    attachmentsByThread: {
      ...s.attachmentsByThread,
      [threadId]: list.map((a) => (a.id === attachmentId ? { ...a, ...fields } : a)),
    },
  };
};

// v2.7: patch one attachment's extraction fields in the by-thread index. A no-op if the
// thread is not currently loaded (e.g. a backfilled attachment in an unopened project — it
// picks up the cached text from the DB the next time that project loads).
const applyExtraction = (
  map: Record<string, Attachment[]>,
  threadId: string,
  attachmentId: string,
  extractedText: string | null,
  extractionKind: AttachmentExtractionKind,
): Record<string, Attachment[]> => {
  const list = map[threadId];
  if (!list) return map;
  return {
    ...map,
    [threadId]: list.map((a) =>
      a.id === attachmentId
        ? { ...a, extractedText, extractedAt: Date.now(), extractionKind }
        : a,
    ),
  };
};

// Patch one block wherever it is loaded. The feed is keyed by thread and a block only
// lives in one of them, but which one is not worth a lookup for a two-field update.
const patchBlock = (
  set: (partial: Partial<BlocksState>) => void,
  get: () => BlocksState,
  id: string,
  fields: Partial<Block>,
): void => {
  const next: Record<string, Block[]> = {};
  for (const [tId, list] of Object.entries(get().byThread)) {
    next[tId] = list.map((b) => (b.id === id ? { ...b, ...fields } : b));
  }
  set({ byThread: next });
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
        attachmentsByThread: applyExtraction(
          s.attachmentsByThread,
          a.threadId,
          a.id,
          text,
          result.kind,
        ),
      }));
      if (!result.ok && !result.reason.startsWith('unsupported extension')) {
        console.error('[extract] failed for', a.target, '—', result.reason);
        if (notify) toast.error(t('文件文字提取失败：{msg}', { msg: result.reason }));
      }
    } catch (e) {
      console.error('[extract] failed for attachment', a.id, e);
      if (notify) toast.error(t('文件文字提取失败：{msg}', { msg: e instanceof Error ? e.message : String(e) }));
    }
  };

  return {
    byThread: {},
    attachmentsByThread: {},
    selectedBlockIds: new Set<string>(),

    load: async (threadId) => {
      const [list, attachments] = await Promise.all([
        db.listBlocksByThread(threadId),
        adb.listAttachmentsByThread(threadId),
      ]);
      // v15: one project's files replace that project's entry wholesale. There is no
      // per-block bookkeeping left to reconcile — the query already returned exactly the
      // set that belongs here.
      set((s) => ({
        byThread: { ...s.byThread, [threadId]: list },
        attachmentsByThread: { ...s.attachmentsByThread, [threadId]: attachments },
      }));
    },

    append: async (args) => {
      const b = await db.createBlock(args);
      // ⚠️ Ocean, Windows 验收 2026-08-18 #1: 「自己写入的 block 无法撤销」. This is the
      // composer's path — the most common way a block comes into existence — and it was the
      // only creating action that recorded nothing. Capture, merge and forward all did.
      // ⚠️ `append` is the COMPOSER's entry point and nothing else calls it; blocks written
      // by MCP or the overlay go through db.createBlock directly and stay out of the undo
      // ring on purpose (an undo the user cannot see the cause of is worse than none).
      useUndoStore
        .getState()
        .pushUndo(buildCreateUndo({ blockId: b.id, threadId: b.threadId, content: b.content }));
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
      // §9.13: snapshot the block BEFORE the destructive delete so the undo entry captures
      // pre-state. ⚠️ v15: deleting a block no longer takes any file with it — files belong
      // to the project now, so there is nothing else to snapshot and nothing to restore.
      const before = get();
      let snapshot: Block | undefined;
      for (const list of Object.values(before.byThread)) {
        const found = list.find((b) => b.id === id);
        if (found) {
          snapshot = found;
          break;
        }
      }

      await db.deleteBlock(id);

      if (snapshot) useUndoStore.getState().pushUndo(buildDeleteUndo({ block: snapshot }));

      const state = get();
      const next: Record<string, Block[]> = {};
      for (const [tId, list] of Object.entries(state.byThread)) {
        next[tId] = list.filter((b) => b.id !== id);
      }
      set({ byThread: next });
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

    // DESIGN_CONTEXT_HYGIENE §3.1 — one timestamp, and the block is out of every pack.
    // No confirmation dialog and no undo entry, for the same reason pin has neither: the
    // action is its own inverse and the button sitting there says so. Nothing is deleted.
    setStale: async (id, stale) => {
      const staleAt = stale ? Date.now() : null;
      await db.setBlockStale(id, staleAt);
      patchBlock(set, get, id, { staleAt });
    },

    setSupersession: async (id, targetBlockId, kind) => {
      const now = Date.now();
      await db.setBlockSupersession(id, targetBlockId, kind, now);
      const state = get();
      const next: Record<string, Block[]> = {};
      for (const [tId, list] of Object.entries(state.byThread)) {
        next[tId] = list.map((b) => {
          if (b.id === id) return { ...b, refBlockId: targetBlockId, refKind: kind };
          // 'supersedes' retires the target in the same breath — the store has to show it,
          // or the block stays looking live until the next thread load.
          if (b.id === targetBlockId && kind === 'supersedes' && b.staleAt == null) {
            return { ...b, staleAt: now };
          }
          return b;
        });
      }
      set({ byThread: next });
    },

    // The relation goes; the target's retirement does NOT come back automatically. It was
    // its own statement the moment it was made, and un-retiring something the user may have
    // retired for three other reasons would be this feature guessing on their behalf —
    // exactly what §3.1 keeps AI out of. 「这条不作数了」 on the target is the way back.
    clearSupersession: async (id) => {
      await db.setBlockSupersession(id, null, null, Date.now());
      patchBlock(set, get, id, { refBlockId: null, refKind: null });
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
        attachmentsByThread: {
          ...s.attachmentsByThread,
          [a.threadId]: [...(s.attachmentsByThread[a.threadId] ?? []), a],
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

    detach: async (attachmentId, threadId) => {
      await adb.deleteAttachment(attachmentId);
      set((s) => {
        const list = s.attachmentsByThread[threadId];
        if (!list) return s;
        return {
          attachmentsByThread: {
            ...s.attachmentsByThread,
            [threadId]: list.filter((a) => a.id !== attachmentId),
          },
        };
      });
    },

    setIncludeInPack: async (attachmentId, threadId, value) => {
      await adb.setIncludeInPack(attachmentId, value);
      set((s) => patchAttachment(s, threadId, attachmentId, { includeInPack: value }));
    },

    setAiAccess: async (attachmentId, threadId, value) => {
      await adb.setAiAccess(attachmentId, value);
      set((s) => patchAttachment(s, threadId, attachmentId, { aiAccess: value }));
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
        toast.error(t('合并失败：所选 block 跨项目'));
        return;
      }
      const threadId = found[0]!.threadId;

      const merged = computeMergedFields(found.map((x) => x.block));

      // §9.13: snapshot pre-merge state for undo — the full rows BEFORE the merge mutates
      // the survivor. ⚠️ v15: a merge no longer moves any file. Files belong to the project,
      // and merging two of its blocks does not change which project they are in.
      const sourceBlocks = found.map((x) => x.block);

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
        toast.error(t('合并失败：{msg}', { msg: e instanceof Error ? e.message : String(e) }));
        return;
      }

      useUndoStore.getState().pushUndo(
        buildMergeUndo({ survivorId: merged.survivorId, threadId, sourceBlocks }),
      );
      // Clear selection and reload — simpler and safer than reconstructing the merged
      // block in-memory.
      set((s) => (s.selectedBlockIds.size === 0 ? s : { selectedBlockIds: new Set() }));
      await get().load(threadId);
    },

    forwardToThread: async (ids, targetThreadId) => {
      if (ids.length === 0) return 0;
      const state = get();
      // Resolve the selected source blocks from the loaded feeds (in practice the active
      // thread — selection is per-feed). Sort by createdAt so the copies append to the
      // target in the same relative order they had in the source.
      const wanted = new Set(ids);
      const sources: Block[] = [];
      for (const list of Object.values(state.byThread)) {
        for (const b of list) {
          if (wanted.has(b.id)) sources.push(b);
        }
      }
      if (sources.length === 0) return 0;
      sources.sort((a, b) => a.createdAt - b.createdAt);

      // Build the NEW rows: fresh ids, target thread_id, now-based created_at (+i ms per
      // block to preserve order → they append to the target's bottom chronologically). Every
      // other field is copied verbatim. Nothing here reads back or mutates a source row; the
      // originals are strictly read-only.
      // ⚠️ v15: no file travels with a copied block. Files belong to the source PROJECT, and
      // copying one of its conclusions into another project is not a reason to copy its
      // files there — if the destination needs a file, the user adds it in that project.
      const base = Date.now();
      const copyBlocks: Block[] = [];
      sources.forEach((src, i) => {
        const newId = nanoid();
        copyBlocks.push({
          id: newId,
          threadId: targetThreadId,
          kind: src.kind,
          content: src.content,
          annotation: src.annotation,
          // v14: authorship copies with the note. A copy that forgot it would launder an
          // AI's sentence into the user's own on arrival in the destination project.
          annotationBy: src.annotationBy,
          refThreadId: src.refThreadId,
          refBlockId: src.refBlockId,
          source: src.source,
          pinned: src.pinned,
          // A copy is a new block in a new project, so it draws a fresh number there —
          // insertBlocks assigns it and the source's own #n is left alone.
          seq: null,
          createdAt: base + i,
          // v13: the retirement travels with the copy. A block the user retired here is
          // retired there too — arriving as a live conclusion in the destination project is
          // exactly the resurrection DESIGN_CONTEXT_HYGIENE §3.1 exists to prevent. The
          // citation relation copies verbatim alongside refBlockId, which it annotates.
          staleAt: src.staleAt,
          refKind: src.refKind,
          // v20: a copy is the same finding in another drawer, so where it came from and
          // when it was read are still true of it — and a copy that dropped them would read
          // as something the user wrote by hand.
          sourceUrl: src.sourceUrl,
          retrievedAt: src.retrievedAt,
          recheckAfter: src.recheckAfter,
          // v21: travels with refKind/refBlockId for the same reason they do — it is one
          // more field OF that relation, and a copy that dropped it would point at the
          // right block with the aim knocked off.
          correctedQuote: src.correctedQuote,
        });
      });

      // INSERT-only. A failure leaves at worst orphan copy blocks (cleaned up by the forward
      // undo) — never a touched original.
      try {
        await db.insertBlocks(copyBlocks);
      } catch (e) {
        console.error('[forward] copy failed', e);
        toast.error(t('复制失败：{msg}', { msg: e instanceof Error ? e.message : String(e) }));
        return 0;
      }

      useUndoStore.getState().pushUndo(
        buildForwardUndo({ threadId: targetThreadId, blocks: copyBlocks }),
      );

      // Clear the selection and refresh the TARGET feed so the copies show if it's open. The
      // source feed is unchanged (additive), so it needs no reload.
      set((s) => (s.selectedBlockIds.size === 0 ? s : { selectedBlockIds: new Set() }));
      await get().load(targetThreadId);
      return copyBlocks.length;
    },
  };
});
