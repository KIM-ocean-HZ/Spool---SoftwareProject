import { create } from 'zustand';

// Transient UI state for an in-flight Finder drag (Phase 6 §9.6). The drop bridge in
// useThreadDropTarget writes it on every `over` event; BlockFeed reads it to show where the
// drop will land.
//
// v15 (DESIGN_PROJECT_FILES): there is no per-block target any more. A dropped file joins
// the PROJECT's files, so every point inside the timeline means the same thing and the ring
// that used to single out one block would have been pointing at nothing.
interface DropState {
  // True while a drag is inside the timeline. A drop here adds the files to this project.
  overThread: boolean;
  setOverThread: (value: boolean) => void;
}

export const useDropStore = create<DropState>((set) => ({
  overThread: false,
  setOverThread: (overThread) => set((s) => (s.overThread === overThread ? s : { overThread })),
}));
