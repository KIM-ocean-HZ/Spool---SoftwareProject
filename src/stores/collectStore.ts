import { create } from 'zustand';

// §20.9 collect-mode coordination flag, owned by the MAIN window. `panelOpen` mirrors
// whether the dedicated collect panel window (label "collect") is currently shown:
// useCollect sets it from Rust's `collect-trigger` (open) and the panel's `collect:closed`
// (close). Main reads it on the capture hot path to decide whether a ⌥-capture should be
// staged in the panel rather than written straight to the DB — a synchronous local flag
// is far cheaper than asking the panel window over IPC per capture.
//
// The capture routing + the panel's own staging buffer / local undo land in 5b/5c; the
// buffer lives in the collect window's process (separate JS context), so this store is
// only the main-side flag.
interface CollectState {
  panelOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useCollectStore = create<CollectState>((set) => ({
  panelOpen: false,
  open: () => set({ panelOpen: true }),
  close: () => set({ panelOpen: false }),
}));
