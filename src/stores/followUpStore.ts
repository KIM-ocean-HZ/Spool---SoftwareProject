import { create } from 'zustand';
import * as db from '@/lib/db/followUpItems';
import type { FollowUpItem } from '@/lib/db/followUpItems';

// DESIGN_FOLLOW_UP §8 — the follow-up list of whichever project is open.
//
// Two surfaces read the same list and one of them writes it: the right rail shows what the
// project is watching, the panel behind 「编辑」 is where lines are added, answered and
// retired. They have to agree the instant something changes, which is why this is a store
// and not two components each loading their own copy.
//
// ⚠️ `items` holds every row, including 'proposed' ones. Views filter, and none of them
// shows a proposed line as part of the list: a line an AI suggested is not something this
// project follows up until the user approves it on the review screen (§8.4).
//
// Only the open project's list lives here. A follow-up list is read when you are looking at
// a project, never in bulk — the one number anything else needs (how many lines are waiting
// for the user across all projects) belongs to the review badge, in proposalsStore.

interface FollowUpState {
  threadId: string | null;
  items: FollowUpItem[];
  load: (threadId: string) => Promise<void>;
  add: (text: string, standing: boolean) => Promise<void>;
  edit: (id: string, text: string) => Promise<void>;
  setStanding: (id: string, standing: boolean) => Promise<void>;
  close: (id: string) => Promise<void>;
  reopen: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useFollowUpStore = create<FollowUpState>((set, get) => {
  const reload = async (): Promise<void> => {
    const id = get().threadId;
    if (!id) return;
    set({ items: await db.listFollowUpItems(id) });
  };
  const after = async (run: Promise<void>): Promise<void> => {
    await run;
    await reload();
  };
  return {
    threadId: null,
    items: [],

    load: async (threadId) => {
      set({ threadId, items: [] });
      const items = await db.listFollowUpItems(threadId);
      // A slow load for a project the user has already navigated away from must not land on
      // top of the one they are looking at now.
      if (get().threadId === threadId) set({ items });
    },

    add: (text, standing) => after(db.addFollowUpItem(get().threadId!, text, standing)),
    edit: (id, text) => after(db.updateFollowUpItemText(id, text)),
    setStanding: (id, standing) => after(db.setFollowUpItemStanding(id, standing)),
    // The user closing a line by hand records no outcome: they know why, and inventing a
    // sentence on their behalf would put words in the library nobody wrote.
    close: (id) => after(db.closeFollowUpItem(id, null)),
    reopen: (id) => after(db.reopenFollowUpItem(id)),
    remove: (id) => after(db.deleteFollowUpItem(id)),
  };
});
