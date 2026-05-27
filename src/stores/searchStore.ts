import { create } from 'zustand';
import { search } from '@/lib/search/query';
import type { HitOffset, SearchHit } from '@/lib/search/query';

// How long a navigated-to block keeps its highlight. Slightly longer than the
// .flash CSS animation (900ms) so the class isn't pulled mid-animation.
const HIGHLIGHT_MS = 1200;

interface SearchState {
  open: boolean;
  query: string;
  results: SearchHit[];
  loading: boolean;
  error: string | null;
  // The block a search result navigated to — BlockFeed scrolls to it and BlockItem
  // flashes it. Self-clears after HIGHLIGHT_MS.
  highlightBlockId: string | null;

  // v2.9 §9.10 / §19.17: in-block navigation state. Set when SearchResultItem is
  // activated; BlockItem subscribes and, while it is the target, forces the block
  // expanded, wraps each hit position in <mark>, and mounts the InBlockNavigator
  // pill. Cleared by Esc, click outside the block, or >200px scroll away.
  activeNavigationBlockId: string | null;
  activeHits: HitOffset[];
  activeHitIndex: number;
  // Visibility of the navigator pill. `✕` dismisses just the pill while leaving
  // the highlights in place; the highlights themselves clear with
  // activeNavigationBlockId via the other dismissal conditions.
  navigatorOpen: boolean;
  // Bumps on every hit advance so the active <mark> can vary its React key and
  // restart the 900ms amber fade animation — including when wrapping back to
  // the same index from the opposite end.
  flashTick: number;

  openSearch: () => void;
  closeSearch: () => void;
  setQuery: (q: string) => void;
  runSearch: () => Promise<void>;
  highlight: (blockId: string) => void;
  startNavigation: (blockId: string, hits: HitOffset[]) => void;
  dismissNavigator: () => void;
  clearNavigation: () => void;
  nextHit: () => void;
  prevHit: () => void;
}

export const useSearchStore = create<SearchState>((set, get) => ({
  open: false,
  query: '',
  results: [],
  loading: false,
  error: null,
  highlightBlockId: null,
  activeNavigationBlockId: null,
  activeHits: [],
  activeHitIndex: 0,
  navigatorOpen: false,
  flashTick: 0,

  openSearch: () => set({ open: true }),

  // Clear the query/results on close so the next open starts fresh.
  closeSearch: () => set({ open: false, query: '', results: [], error: null, loading: false }),

  setQuery: (q) => set({ query: q }),

  runSearch: async () => {
    const q = get().query.trim();
    if (!q) {
      set({ results: [], loading: false, error: null });
      return;
    }
    set({ loading: true, error: null });
    try {
      const results = await search(q);
      set({ results, loading: false });
    } catch (e) {
      console.error('[search] query failed', e);
      set({ error: e instanceof Error ? e.message : String(e), results: [], loading: false });
    }
  },

  highlight: (blockId) => {
    set({ highlightBlockId: blockId });
    setTimeout(() => {
      if (get().highlightBlockId === blockId) set({ highlightBlockId: null });
    }, HIGHLIGHT_MS);
  },

  startNavigation: (blockId, hits) =>
    set((s) => ({
      activeNavigationBlockId: blockId,
      activeHits: hits,
      activeHitIndex: 0,
      navigatorOpen: hits.length > 0,
      flashTick: s.flashTick + 1,
    })),

  dismissNavigator: () => set({ navigatorOpen: false }),

  clearNavigation: () =>
    set({
      activeNavigationBlockId: null,
      activeHits: [],
      activeHitIndex: 0,
      navigatorOpen: false,
    }),

  nextHit: () =>
    set((s) => {
      if (s.activeHits.length === 0) return s;
      return {
        activeHitIndex: (s.activeHitIndex + 1) % s.activeHits.length,
        flashTick: s.flashTick + 1,
      };
    }),

  prevHit: () =>
    set((s) => {
      if (s.activeHits.length === 0) return s;
      return {
        activeHitIndex:
          (s.activeHitIndex - 1 + s.activeHits.length) % s.activeHits.length,
        flashTick: s.flashTick + 1,
      };
    }),
}));
