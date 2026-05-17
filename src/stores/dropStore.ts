import { create } from 'zustand';

// Transient UI state for an in-flight Finder drag (Phase 6 §9.6). The drop bridge in
// useThreadDropTarget writes it on every `over` event; BlockItem / BlockFeed read it to
// draw the highlight so the user can see where the drop will land.
interface DropState {
  // Block currently under the drag cursor — it gets a ring while the drag hovers it.
  targetBlockId: string | null;
  // True when the drag is inside the timeline but over no block: a drop here creates
  // a new block carrying the dropped artifacts.
  overEmpty: boolean;
  setTarget: (blockId: string | null, overEmpty: boolean) => void;
  clear: () => void;
}

export const useDropStore = create<DropState>((set) => ({
  targetBlockId: null,
  overEmpty: false,
  setTarget: (targetBlockId, overEmpty) =>
    set((s) =>
      s.targetBlockId === targetBlockId && s.overEmpty === overEmpty
        ? s
        : { targetBlockId, overEmpty },
    ),
  clear: () =>
    set((s) =>
      s.targetBlockId === null && !s.overEmpty
        ? s
        : { targetBlockId: null, overEmpty: false },
    ),
}));
