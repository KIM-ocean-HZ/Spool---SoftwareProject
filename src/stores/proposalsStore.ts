import { create } from 'zustand';
import * as db from '@/lib/db/proposals';
import type { ProposalBatch } from '@/lib/db/proposals';
import { t } from '@/lib/i18n';
import { useBlocksStore } from './blocksStore';
import { useThreadsStore } from './threadsStore';
import { toast } from './toastStore';

// DESIGN_MCP_WRITE_ROLE §4.3 — state behind the review screen.
//
// The queue is written by a DIFFERENT process (the `spool --mcp` subprocess an AI client
// spawned), so this store never learns about a new batch by being told. It re-counts:
// once at startup and on every window focus, riding the same "coming back to the window
// is the moment to show what changed" reload App already does for threads and blocks.
//
// The count is a COUNT query, not a load — a badge needs a number, and the batches
// themselves are only read when the user opens the screen.

interface ProposalsState {
  /** Non-null only while the screen is open. */
  batches: ProposalBatch[] | null;
  pendingCount: number;
  /** Batches past their 7 days — one line on the screen, never approvable. */
  expiredBatches: number;
  panelOpen: boolean;
  busy: boolean;
  refresh: () => Promise<void>;
  open: () => Promise<void>;
  close: () => void;
  approve: (batchId: string, keepIds?: string[]) => Promise<void>;
  reject: (batchId: string) => Promise<void>;
  clearExpired: () => Promise<void>;
}

// Everything the approved blocks touched has to be re-read: they landed through a path
// these stores were not watching, and they may be spread across several projects.
const reloadLibrary = async (): Promise<void> => {
  await useThreadsStore.getState().loadAll();
  const active = useThreadsStore.getState().activeId;
  if (active) await useBlocksStore.getState().load(active);
};

export const useProposalsStore = create<ProposalsState>((set, get) => ({
  batches: null,
  pendingCount: 0,
  expiredBatches: 0,
  panelOpen: false,
  busy: false,

  refresh: async () => {
    try {
      const now = Date.now();
      const [pendingCount, expiredBatches] = await Promise.all([
        db.countPending(now),
        db.countExpiredBatches(now),
      ]);
      set({ pendingCount, expiredBatches });
      // Keep an open screen honest: a second client could have queued more while the
      // user was reading.
      if (get().panelOpen) set({ batches: await db.listPendingBatches(now) });
    } catch (e) {
      // A library that predates v10 has no such tables. Nothing to show is the right
      // answer, and it must not take the sidebar down with it.
      console.warn('[proposals] refresh failed', e);
    }
  },

  open: async () => {
    set({ panelOpen: true });
    await get().refresh();
    try {
      set({ batches: await db.listPendingBatches(Date.now()) });
    } catch (e) {
      console.warn('[proposals] load failed', e);
      set({ batches: [] });
    }
  },

  close: () => set({ panelOpen: false, batches: null }),

  approve: async (batchId, keepIds) => {
    if (get().busy) return;
    set({ busy: true });
    try {
      const written = await db.approveBatch(batchId, keepIds);
      await reloadLibrary();
      toast.notice(t('存进去了 {n} 块', { n: written }));
    } catch (e) {
      console.error('[proposals] approve failed', e);
      toast.error(t('存不进去：{msg}', { msg: e instanceof Error ? e.message : String(e) }));
    } finally {
      set({ busy: false });
      await get().refresh();
      if (get().panelOpen) {
        set({ batches: await db.listPendingBatches(Date.now()) });
        if ((get().batches ?? []).length === 0) get().close();
      }
    }
  },

  reject: async (batchId) => {
    if (get().busy) return;
    set({ busy: true });
    try {
      await db.rejectBatch(batchId);
    } catch (e) {
      console.error('[proposals] reject failed', e);
    } finally {
      set({ busy: false });
      await get().refresh();
      if (get().panelOpen) {
        set({ batches: await db.listPendingBatches(Date.now()) });
        if ((get().batches ?? []).length === 0) get().close();
      }
    }
  },

  clearExpired: async () => {
    try {
      await db.purgeExpired(Date.now());
    } catch (e) {
      console.warn('[proposals] purge failed', e);
    }
    await get().refresh();
  },
}));
