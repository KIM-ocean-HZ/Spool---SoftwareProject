import { create } from 'zustand';
import { ensureBaseData } from '@/lib/db/client';
import * as db from '@/lib/db/workspaces';
import type { Workspace } from '@/lib/db/workspaces';
import { useThreadsStore } from './threadsStore';

interface WorkspacesState {
  workspaces: Workspace[];
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  create: (title?: string) => Promise<Workspace>;
  rename: (id: string, title: string) => Promise<void>;
  reorder: (orderedIds: string[]) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useWorkspacesStore = create<WorkspacesState>((set, get) => ({
  workspaces: [],
  loading: true,
  error: null,

  load: async () => {
    try {
      const ws = await db.listWorkspaces();
      set({ workspaces: ws, loading: false, error: null });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[workspaces] load failed', e);
      // Important: flip loading to false even on failure, otherwise App is stuck on the
      // "加载中…" screen forever and the user sees a blank cream background.
      set({ loading: false, error: msg });
    }
  },

  create: async (title = '') => {
    const ws = await db.createWorkspace(title);
    set((s) => ({ workspaces: [...s.workspaces, ws] }));
    return ws;
  },

  rename: async (id, title) => {
    const updatedAt = await db.renameWorkspace(id, title);
    set((s) => ({
      workspaces: s.workspaces.map((w) => (w.id === id ? { ...w, title, updatedAt } : w)),
    }));
  },

  reorder: async (orderedIds) => {
    await db.reorderWorkspaces(orderedIds);
    const current = get().workspaces;
    const byId = new Map(current.map((w) => [w.id, w]));
    set({
      workspaces: orderedIds
        .map((id, i) => {
          const w = byId.get(id);
          return w ? { ...w, sortOrder: i } : null;
        })
        .filter((w): w is Workspace => w !== null),
    });
  },

  remove: async (id) => {
    // Cascade-soft-deletes the workspace's threads too. Restore a usable base afterwards
    // (recreates the Inbox if this was the last workspace), then refresh both stores —
    // threads were deleted and the capture target may need re-promoting.
    await db.softDeleteWorkspace(id);
    await ensureBaseData();
    await get().load();
    await useThreadsStore.getState().loadAll();
  },
}));
