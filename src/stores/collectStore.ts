import { create } from 'zustand';

// v2.8 §20 Track B — collect mode is a separate capture mode that holds clipboard
// captures in a transient staging toast (in the overlay window) until the user
// explicitly Sends them as one merged block. While `active` is true, useCapture's
// capture-trigger handler skips the DB write and forwards the captured text to the
// overlay's staging list instead. Toggled on by long-press ⌥, toggled off when the
// overlay confirms the staging toast was sent or discarded.
//
// State lives in main (not the overlay) because main is the only place that owns the
// capture-trigger listener — checking a synchronous local flag is much cheaper than
// asking the overlay over IPC on the hot path.

interface CollectState {
  active: boolean;
  open: () => void;
  close: () => void;
}

export const useCollectStore = create<CollectState>((set) => ({
  active: false,
  open: () => set({ active: true }),
  close: () => set({ active: false }),
}));
