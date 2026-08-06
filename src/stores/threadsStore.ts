import { create } from 'zustand';
import { ensureBaseData } from '@/lib/db/client';
import * as db from '@/lib/db/threads';
import type { Thread, ThreadPatch } from '@/lib/db/threads';
import { buildThreadDeleteUndo, useUndoStore } from './undoStore';

interface ThreadsState {
  threadsByWorkspace: Record<string, Thread[]>;
  activeId: string | null;
  captureTargetId: string | null;
  /** Which project the "这个项目结束了" panel is asking about, or null.
   *
   *  DESIGN_WORKBENCH §9.4 — the project board can finish a project that is not the one on
   *  screen, so the panel cannot live in ThreadView's local state any more. Held here for
   *  the same reason `engineStore.briefOpen` is held there: two surfaces can now open it,
   *  and two local `useState`s would be two panels stacked on top of each other. */
  completingId: string | null;
  /** Whether the 项目管理 view owns the main area (DESIGN_WORKBENCH §9.4, Ocean 2026-08-07:
   *  「左侧边栏加入一个项目管理的一个总项目……它的工作区用来存放项目矩阵」).
   *
   *  ⚠️ A flag rather than a sentinel `activeId`. `loadAll` drops an activeId that no longer
   *  matches a row — a fake id would be silently reset on every reload, and every consumer
   *  of activeId (block loading, capture target, pack) would have to learn to skip it. The
   *  selected project stays selected underneath, so leaving the board goes back where you
   *  were. */
  boardOpen: boolean;
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
  setCompleting: (id: string | null) => void;
  openBoard: () => void;
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
  completingId: null,
  boardOpen: false,
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
      set((s) => ({
        threadsByWorkspace: groupByWorkspace(all),
        captureTargetId: findCaptureTarget(all),
        // If the previously-active thread was deleted (here or via a workspace delete),
        // drop the selection so App re-selects the capture target.
        activeId: all.some((t) => t.id === s.activeId) ? s.activeId : null,
        loading: false,
        error: null,
      }));
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
    // Snapshot the title before deleting so the undo toast can name the project (§9.13).
    const title = selectThreadById(id)(get())?.title ?? '';
    await db.softDeleteThread(id);
    useUndoStore.getState().pushUndo(buildThreadDeleteUndo({ threadId: id, title }));
    // If that was the capture target (or the last thread), restore a usable base + target;
    // loadAll then re-promotes a target and recomputes captureTargetId / activeId.
    await ensureBaseData();
    await get().loadAll();
  },

  // Picking a project always leaves the board — that IS what clicking a card in the matrix
  // means (§9.4: 「点击可以跳转到项目即可」).
  select: (id) => set({ activeId: id, boardOpen: false }),

  setCompleting: (id) => set({ completingId: id }),

  openBoard: () => set({ boardOpen: true }),
}));

// ⚠️ Imperative use only — `selectAllThreadsFlat(useThreadsStore.getState())`.
// NEVER `useThreadsStore(selectAllThreadsFlat)`: it returns a fresh array every call, so
// as a hook selector zustand's useSyncExternalStore compares two different objects on every
// render and loops until React gives up (#185, "Maximum update depth exceeded"). A component
// that wants this list subscribes to `threadsByWorkspace` and flattens it in a useMemo —
// see ReviewPanel. (Cost 2026-08-05: a white window with only a minified error to go on.)
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
