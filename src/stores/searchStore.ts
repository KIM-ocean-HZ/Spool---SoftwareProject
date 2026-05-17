import { create } from 'zustand';
import { search } from '@/lib/search/query';
import type { SearchHit } from '@/lib/search/query';

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
  openSearch: () => void;
  closeSearch: () => void;
  setQuery: (q: string) => void;
  runSearch: () => Promise<void>;
  highlight: (blockId: string) => void;
}

export const useSearchStore = create<SearchState>((set, get) => ({
  open: false,
  query: '',
  results: [],
  loading: false,
  error: null,
  highlightBlockId: null,

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
}));
