import { create } from 'zustand';

// v2.9 §9.3 / §19.18: track the most-recently-acted-upon block so it can carry a
// brief background tint while the user works (edit, collapse, annotate). Only ONE
// block is active at a time globally; a new setActive call transfers the highlight
// and resets the fade timer.
//
// The timer reference lives in module scope (not React state) so a BlockItem
// re-render or remount can't drop it on the floor — the fade has to keep running
// even if the block gets unmounted by virtual scrolling.

// Must stay in sync with --block-active-bg-fade-ms in tokens.css: when the class
// is removed the CSS transition handles the visual fade-out over this same window.
const FADE_MS = 3000;

let fadeTimer: ReturnType<typeof setTimeout> | null = null;

interface ActiveBlockState {
  activeBlockId: string | null;
  setActive: (id: string) => void;
}

export const useActiveBlockStore = create<ActiveBlockState>((set) => ({
  activeBlockId: null,
  setActive: (id) => {
    if (fadeTimer !== null) {
      clearTimeout(fadeTimer);
      fadeTimer = null;
    }
    set({ activeBlockId: id });
    fadeTimer = setTimeout(() => {
      fadeTimer = null;
      set({ activeBlockId: null });
    }, FADE_MS);
  },
}));
