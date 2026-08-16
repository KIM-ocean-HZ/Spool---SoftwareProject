import { create } from 'zustand';
import * as files from '@/lib/db/fileAccess';
import type { FileAccessRequest } from '@/lib/db/fileAccess';
import * as db from '@/lib/db/proposals';
import type { ProposalBatch } from '@/lib/db/proposals';
import * as followUp from '@/lib/db/followUpItems';
import type { FollowUpProposal } from '@/lib/db/followUpItems';
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

// 2026-08-14: the screen grew two more kinds of "AI 提的，等你过目", and they share this
// store on purpose. Each could have had its own badge, and three badges in the sidebar
// would be three things to learn — the user's question is "is anything waiting for me",
// and that has one answer. `pendingCount` is therefore the total; each kind keeps its own
// count only so the screen can render the right sections.
interface ProposalsState {
  /** Non-null only while the screen is open. */
  batches: ProposalBatch[] | null;
  /** DESIGN_PROJECT_FILES §3.4 — files an AI has asked to read. */
  fileRequests: FileAccessRequest[] | null;
  /** DESIGN_FOLLOW_UP §8.4 — lines an AI proposed for a project's follow-up list. */
  followUpProposals: FollowUpProposal[] | null;
  /** Everything waiting on the user, in one number: the sidebar badge. */
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
  approveFiles: (requestId: string) => Promise<void>;
  rejectFiles: (requestId: string) => Promise<void>;
  approveFollowUp: (itemId: string) => Promise<void>;
  dismissFollowUp: (itemId: string) => Promise<void>;
}

// Everything the approved blocks touched has to be re-read: they landed through a path
// these stores were not watching, and they may be spread across several projects.
const reloadLibrary = async (): Promise<void> => {
  await useThreadsStore.getState().loadAll();
  const active = useThreadsStore.getState().activeId;
  if (active) await useBlocksStore.getState().load(active);
};

// Load everything the screen shows, in one place, so the three kinds can never be read
// from different moments in time.
const loadAll = async (): Promise<
  Pick<ProposalsState, 'batches' | 'fileRequests' | 'followUpProposals'>
> => {
  const now = Date.now();
  const [batches, fileRequests, followUpProposals] = await Promise.all([
    db.listPendingBatches(now),
    files.listPendingFileRequests(now),
    followUp.listFollowUpProposals(),
  ]);
  return { batches, fileRequests, followUpProposals };
};

// What every act-on-something path does afterwards: re-count for the badge, re-read what
// the open screen shows, and close it once there is nothing left. The screen closes on
// "nothing waiting at all", not "no proposals left" — with three kinds sharing it, closing
// on the first empty section would hide the other two.
type Setter = (partial: Partial<ProposalsState>) => void;
const settle = async (get: () => ProposalsState, set: Setter): Promise<void> => {
  await get().refresh();
  if (!get().panelOpen) return;
  const state = await loadAll();
  set(state);
  const nothingLeft =
    state.batches!.length === 0 &&
    state.fileRequests!.length === 0 &&
    state.followUpProposals!.length === 0;
  if (nothingLeft) get().close();
};

export const useProposalsStore = create<ProposalsState>((set, get) => ({
  batches: null,
  fileRequests: null,
  followUpProposals: null,
  pendingCount: 0,
  expiredBatches: 0,
  panelOpen: false,
  busy: false,

  refresh: async () => {
    try {
      const now = Date.now();
      const [proposals, expiredBatches, fileRequests, followUpLines] = await Promise.all([
        db.countPending(now),
        db.countExpiredBatches(now),
        files.countPendingFileRequests(now),
        followUp.countFollowUpProposals(),
      ]);
      set({ pendingCount: proposals + fileRequests + followUpLines, expiredBatches });
      // Keep an open screen honest: a second client could have queued more while the
      // user was reading.
      if (get().panelOpen) set(await loadAll());
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
      set(await loadAll());
    } catch (e) {
      console.warn('[proposals] load failed', e);
      set({ batches: [], fileRequests: [], followUpProposals: [] });
    }
  },

  close: () =>
    set({ panelOpen: false, batches: null, fileRequests: null, followUpProposals: null }),

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
      await settle(get, set);
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
      await settle(get, set);
    }
  },

  // DESIGN_PROJECT_FILES §3.4 — the grant. It is standing, so the toast says where to take
  // it back: a permission the user cannot find again is not one they gave knowingly.
  approveFiles: async (requestId) => {
    if (get().busy) return;
    set({ busy: true });
    try {
      const granted = await files.approveFileRequest(requestId);
      // The file panel reads attachments out of blocksStore, so the ✓ has to be re-read
      // from the database or the switch the user just flipped stays off on screen.
      const active = useThreadsStore.getState().activeId;
      if (active) await useBlocksStore.getState().load(active);
      toast.notice(t('{n} 个文件现在 AI 可以读了。随时可以在项目文件那一栏点掉。', { n: granted }));
    } catch (e) {
      console.error('[files] grant failed', e);
      toast.error(t('没能打开权限：{msg}', { msg: e instanceof Error ? e.message : String(e) }));
    } finally {
      set({ busy: false });
      await settle(get, set);
    }
  },

  rejectFiles: async (requestId) => {
    if (get().busy) return;
    set({ busy: true });
    try {
      await files.rejectFileRequest(requestId);
    } catch (e) {
      console.error('[files] refusal failed', e);
    } finally {
      set({ busy: false });
      await settle(get, set);
    }
  },

  // DESIGN_FOLLOW_UP §8.4 — the 过目 gate closing, one line at a time. This click is the
  // only thing that can put a line into what Spool goes out to the web with, and it is
  // per line on purpose: the whole-brief suggestion it replaces made the user take or
  // leave a whole rewrite, and could silently overwrite one they had not read yet.
  approveFollowUp: async (itemId) => {
    if (get().busy) return;
    set({ busy: true });
    try {
      await followUp.approveFollowUpProposal(itemId);
      await useThreadsStore.getState().loadAll();
      toast.notice(t('加进跟进清单了'));
    } catch (e) {
      console.error('[follow-up] approve failed', e);
      toast.error(t('存不下来：{msg}', { msg: e instanceof Error ? e.message : String(e) }));
    } finally {
      set({ busy: false });
      await settle(get, set);
    }
  },

  dismissFollowUp: async (itemId) => {
    if (get().busy) return;
    set({ busy: true });
    try {
      await followUp.dismissFollowUpProposal(itemId);
    } catch (e) {
      console.error('[follow-up] dismiss failed', e);
    } finally {
      set({ busy: false });
      await settle(get, set);
    }
  },

  clearExpired: async () => {
    try {
      await db.purgeExpired(Date.now());
      await files.purgeExpiredFileRequests(Date.now());
    } catch (e) {
      console.warn('[proposals] purge failed', e);
    }
    await get().refresh();
  },
}));
