import { create } from 'zustand';
import * as db from '@/lib/db/threads';
import type { Thread, ThreadPatch } from '@/lib/db/threads';

interface ThreadsState {
  threadsByWorkspace: Record<string, Thread[]>;
  activeId: string | null;
  captureTargetId: string | null;
  loading: boolean;
  error: string | null;
  loadAll: () => Promise<void>;
  loadWorkspace: (workspaceId: string) => Promise<void>;
  create: (workspaceId: string, title?: string) => Promise<Thread>;
  patch: (id: string, patch: ThreadPatch) => Promise<void>;
  setSummary: (id: string, summary: string | null) => Promise<void>;
  setCaptureTarget: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  select: (id: string | null) => void;
}

const groupByWorkspace = (threads: Thread[]): Record<string, Thread[]> => {
  const out: Record<string, Thread[]> = {};
  for (const t of threads) {
    if (!out[t.workspaceId]) out[t.workspaceId] = [];
    out[t.workspaceId]!.push(t);
  }
  return out;
};

const findCaptureTarget = (threads: Thread[]): string | null =>
  threads.find((t) => t.isCaptureTarget)?.id ?? null;

export const useThreadsStore = create<ThreadsState>((set, get) => ({
  threadsByWorkspace: {},
  activeId: null,
  captureTargetId: null,
  loading: true,
  error: null,

  loadAll: async () => {
    try {
      // Self-heal: if a prior session's broken transactional setCaptureTarget left zero
      // threads marked as target, promote the oldest active one back. Without this the
      // tray says "（无）", the pin button stays disabled, and every capture fails with
      // "no-target" until the user does something — but they can't, because the UI
      // entry points for *setting* a target are themselves broken on the same path.
      const promoted = await db.ensureCaptureTarget();
      if (promoted) {
        console.info('[threads] auto-promoted capture target after self-heal:', promoted);
      }
      const all = await db.listAllThreads();
      set({
        threadsByWorkspace: groupByWorkspace(all),
        captureTargetId: findCaptureTarget(all),
        loading: false,
        error: null,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[threads] load failed', e);
      set({ loading: false, error: msg });
    }
  },

  loadWorkspace: async (workspaceId) => {
    const list = await db.listThreadsByWorkspace(workspaceId);
    set((s) => ({
      threadsByWorkspace: { ...s.threadsByWorkspace, [workspaceId]: list },
    }));
  },

  create: async (workspaceId, title = '') => {
    const t = await db.createThread(workspaceId, title);
    set((s) => ({
      threadsByWorkspace: {
        ...s.threadsByWorkspace,
        [workspaceId]: [t, ...(s.threadsByWorkspace[workspaceId] ?? [])],
      },
      activeId: t.id,
    }));
    return t;
  },

  patch: async (id, patch) => {
    const updatedAt = await db.updateThread(id, patch);
    const state = get();
    // A thread may move across workspaces; rebuild by walking all groups.
    const flat: Thread[] = [];
    for (const list of Object.values(state.threadsByWorkspace)) {
      for (const t of list) {
        if (t.id === id) {
          flat.push({ ...t, ...patch, updatedAt } as Thread);
        } else {
          flat.push(t);
        }
      }
    }
    set({ threadsByWorkspace: groupByWorkspace(flat) });
  },

  // The AI status-summary write path (§11.3). User-triggered, so no debounce.
  setSummary: async (id, summary) => {
    await get().patch(id, { summary });
  },

  setCaptureTarget: async (id) => {
    await db.setCaptureTarget(id);
    const state = get();
    const flat: Thread[] = [];
    for (const list of Object.values(state.threadsByWorkspace)) {
      for (const t of list) {
        flat.push({ ...t, isCaptureTarget: t.id === id });
      }
    }
    set({ threadsByWorkspace: groupByWorkspace(flat), captureTargetId: id });
  },

  remove: async (id) => {
    await db.softDeleteThread(id);
    set((s) => {
      const next: Record<string, Thread[]> = {};
      for (const [wsId, list] of Object.entries(s.threadsByWorkspace)) {
        next[wsId] = list.filter((t) => t.id !== id);
      }
      return {
        threadsByWorkspace: next,
        activeId: s.activeId === id ? null : s.activeId,
      };
    });
  },

  select: (id) => set({ activeId: id }),
}));

export const selectAllThreadsFlat = (s: ThreadsState): Thread[] =>
  Object.values(s.threadsByWorkspace).flat();

export const selectThreadById = (id: string | null) => (s: ThreadsState): Thread | null => {
  if (!id) return null;
  for (const list of Object.values(s.threadsByWorkspace)) {
    const t = list.find((x) => x.id === id);
    if (t) return t;
  }
  return null;
};
