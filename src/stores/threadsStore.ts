import { create } from 'zustand';
import { ensureBaseData } from '@/lib/db/client';
import * as db from '@/lib/db/threads';
import type { Thread, ThreadPatch } from '@/lib/db/threads';
import { buildThreadDeleteUndo, useUndoStore } from './undoStore';

/** The sidebar's pinned entries — the two "projects" whose contents are not blocks.
 *  'board' is 项目管理 (every project), 'review' is 周回顾 (every project, over time). */
export type PinnedView = 'board' | 'review' | null;

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
  /** Which project the pack dialog is showing, or null.
   *
   *  DESIGN_WORKBENCH §9.13 — same reason as `completingId` above: 项目管理 can pack a
   *  project that is not the one on screen (Ocean: 「点击项目管理需要展开显示 pack」), so the
   *  dialog is mounted once in App (components/Pack/PackHost) and addressed by thread id. */
  packingId: string | null;
  /** Which pinned view owns the main area, or null when a project does (DESIGN_WORKBENCH
   *  §9.4, Ocean 2026-08-07: 「左侧边栏加入一个项目管理的一个总项目……它的工作区用来存放项目
   *  矩阵」).
   *
   *  2026-08-11 — there are two of them now. Ocean, on finding a 「回顾」 project sitting inside
   *  his 升学 workspace: 「周回顾在左侧边栏的位置应该和项目管理一起吧，作为独立工作区出现」.
   *  A weekly review reads every project, so it belongs to none of them, and the old code had
   *  no home for it — see components/ReviewBoard.
   *
   *  ⚠️ One field rather than two booleans: the two views are alternatives, and two flags
   *  would make "both open" representable and therefore eventually true.
   *
   *  ⚠️ A flag rather than a sentinel `activeId`. `loadAll` drops an activeId that no longer
   *  matches a row — a fake id would be silently reset on every reload, and every consumer
   *  of activeId (block loading, capture target, pack) would have to learn to skip it. The
   *  selected project stays selected underneath, so leaving the board goes back where you
   *  were. */
  pinnedView: PinnedView;
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
  setPacking: (id: string | null) => void;
  /** Undo a completion: back to active, and the completion's two artefacts cleared.
   *
   *  §9.13 — Ocean 2026-08-07: 「点击已完成也需要可以重新打开」. The header has had this
   *  since §9.2 R3, but only for the project you are reading; the board lists finished
   *  projects too, and a card you could finish but never un-finish was a one-way door. */
  reopen: (id: string) => Promise<void>;
  openPinned: (view: PinnedView) => void;
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
  packingId: null,
  pinnedView: null,
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

  // Picking a project always leaves whichever pinned view was open — that IS what clicking a
  // card in the matrix means (§9.4: 「点击可以跳转到项目即可」).
  select: (id) => set({ activeId: id, pinnedView: null }),

  setCompleting: (id) => set({ completingId: id }),

  setPacking: (id) => set({ packingId: id }),

  reopen: async (id) => {
    await get().patch(id, { status: 'active', completedAt: null, digest: null });
  },

  openPinned: (view) => set({ pinnedView: view }),
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
