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

  // v2.9 §9.10 / §19.17: in-block navigation state. Set when a search result is
  // activated. While set, the find bar (mounted at the top of the destination
  // thread's LogView) is visible and BlockItem force-expands its target +
  // wraps every hit position in <mark>. Cleared by ✕, Esc, click-outside the
  // block + bar, or user-initiated scroll-away.
  activeNavigationBlockId: string | null;
  activeHits: HitOffset[];
  activeHitIndex: number;
  // The query string that triggered navigation — surfaced in the find bar so
  // the user keeps context after the global search overlay closes.
  activeQuery: string;
  // Bumps on every hit advance — used by BlockItem's scroll-active-into-view
  // effect so the same-index wrap-around still re-scrolls.
  flashTick: number;

  openSearch: () => void;
  closeSearch: () => void;
  setQuery: (q: string) => void;
  runSearch: () => Promise<void>;
  highlight: (blockId: string) => void;
  startNavigation: (blockId: string, hits: HitOffset[], query: string) => void;
  // Live edit of the find bar's query: caller (LogView) re-runs
  // buildHitOffsets against the target block and passes the new hits in.
  setNavigationQuery: (query: string, hits: HitOffset[]) => void;
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
  activeQuery: '',
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

  startNavigation: (blockId, hits, query) =>
    set((s) => ({
      activeNavigationBlockId: blockId,
      activeHits: hits,
      activeHitIndex: 0,
      activeQuery: query,
      flashTick: s.flashTick + 1,
    })),

  setNavigationQuery: (query, hits) =>
    set((s) => ({
      activeQuery: query,
      activeHits: hits,
      activeHitIndex: 0,
      flashTick: s.flashTick + 1,
    })),

  clearNavigation: () =>
    set({
      activeNavigationBlockId: null,
      activeHits: [],
      activeHitIndex: 0,
      activeQuery: '',
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
