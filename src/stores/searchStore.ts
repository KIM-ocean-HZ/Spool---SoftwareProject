import { create } from 'zustand';
import { search } from '@/lib/search/query';
import type { HitOffset, SearchHit } from '@/lib/search/query';
import { useThreadsStore } from './threadsStore';

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
  // wraps every hit position in <mark>.
  // ⭐ 2026-08-27 起**只有** ✕ 和 Esc 关得掉它（Ocean:「不能长期显示，点击外面就会消失」）——
  // 原来点外面、或者滚开一段就会自动清掉，那两条已经删了，见 BlockItem 里的说明。
  activeNavigationBlockId: string | null;
  activeHits: HitOffset[];
  activeHitIndex: number;
  // The query string that triggered navigation — surfaced in the find bar so
  // the user keeps context after the global search overlay closes.
  activeQuery: string;
  // Bumps on every hit advance — used by BlockItem's scroll-active-into-view
  // effect so the same-index wrap-around still re-scrolls.
  flashTick: number;
  // v2.10: snapshot of the last search's result set + query, kept alive after the overlay
  // closes (which wipes `results`). Lets ▲/▼ step from the current block's last/first match
  // straight into the next/previous matching block — and its thread — instead of being
  // trapped inside one block.
  navResults: SearchHit[];
  navQuery: string;

  // `seed` 预填搜索词（⌘F 划词查找 —— 见 lib/search/selection.ts）。不传就是原来那样，
  // 开一个空的。
  openSearch: (seed?: string) => void;
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
  // Jump straight to a chosen matching block (from the find bar's cross-thread result list),
  // selecting its thread if needed. No-op if the id isn't in the kept result set.
  jumpToResult: (blockId: string) => void;
}

/** 查找条上那几个数（2026-08-27，Ocean:「搜索的计数有歧义」）。
 *
 *  ⚠️ 原来条上只有两个数，而且**两个数在数不同的东西**：`1 / N` 数的是「这一块里的第几处」，
 *  `≡ 6` 数的是「全部工作区里有几个**块**命中」。于是「这个项目里一共有多少处」——
 *  最常想知道的那一个 —— 一个数都答不上来。
 *
 *  ⚠️ 处 ≠ 块：一块里可以有五处。两个都要，因为它们回答的是两个问题
 *  （「还要按多少次下一个」和「要翻多少块」）。
 *
 *  ⚠️ 纯函数，⛔ 不进 store 的状态：它是 `navResults` 的算术，存一份就要跟着它更新，
 *  而那正是两个数开始互相说不一样的话的方式。 */
export interface MatchCounts {
  /** 这个项目里的处数 / 块数。 */
  threadHits: number;
  threadBlocks: number;
  /** 全部工作区。 */
  allHits: number;
  allBlocks: number;
}

export const countMatches = (results: SearchHit[], threadId: string | null): MatchCounts => {
  let threadHits = 0;
  let threadBlocks = 0;
  let allHits = 0;
  for (const hit of results) {
    // ⚠️ `hitOffsets` 是**两个字段合起来**的每一处（正文的在前，批注的在后）——
    // 「处」在查找条上下翻的时候就是按它走的，所以数它才和 ▲▼ 对得上。
    const n = hit.hitOffsets.length;
    allHits += n;
    if (threadId !== null && hit.threadId === threadId) {
      threadHits += n;
      threadBlocks += 1;
    }
  }
  return { threadHits, threadBlocks, allHits, allBlocks: results.length };
};

export const useSearchStore = create<SearchState>((set, get) => {
  // Land in-block navigation on `hit` at `hitIndex`, selecting its thread if it differs and
  // flashing it into view — the same orchestration as a search-result click (select +
  // highlight). Shared by ▲/▼ stepping and the find bar's result list.
  const goToHit = (hit: SearchHit, hitIndex: number): void => {
    if (hit.threadId !== useThreadsStore.getState().activeId) {
      useThreadsStore.getState().select(hit.threadId);
    }
    set((s) => ({
      activeNavigationBlockId: hit.blockId,
      activeHits: hit.hitOffsets,
      activeHitIndex: hitIndex,
      activeQuery: s.navQuery,
      flashTick: s.flashTick + 1,
    }));
    get().highlight(hit.blockId);
  };

  // Step into the next (dir=1) / previous (dir=-1) matching block in the kept result set.
  // Wraps around the whole list. Forward → land on the first match; backward → the last.
  const advanceBlock = (dir: 1 | -1): void => {
    const list = get().navResults;
    if (list.length === 0) return;
    const cur = list.findIndex((h) => h.blockId === get().activeNavigationBlockId);
    if (cur < 0) return;
    const next = list[(cur + dir + list.length) % list.length];
    if (!next) return;
    goToHit(next, dir > 0 ? 0 : Math.max(0, next.hitOffsets.length - 1));
  };

  return {
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
  navResults: [],
  navQuery: '',

  // ⚠️ 没有 seed 的时候**不碰** query：closeSearch 已经把它清空了，这里再写一次空串会把
  // 「⌘F 之前先划了词」那一路也一起抹掉（两者在同一批 set 里）。
  openSearch: (seed) => set(seed ? { open: true, query: seed } : { open: true }),

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
      // navResults/navQuery mirror the results but survive closeSearch, so cross-block ▲/▼
      // still has the full match list after the overlay is gone.
      set({ results, navResults: results, navQuery: q, loading: false });
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

  // Step to the next match: within the current block until its last hit, then on into the
  // next matching block/thread (§9.10 v2.10 — no longer trapped in one block).
  nextHit: () => {
    const s = get();
    if (s.activeHitIndex < s.activeHits.length - 1) {
      set({ activeHitIndex: s.activeHitIndex + 1, flashTick: s.flashTick + 1 });
    } else {
      advanceBlock(1);
    }
  },

  // Step to the previous match: backward within the block to its first hit, then into the
  // previous matching block/thread (landing on that block's last hit).
  prevHit: () => {
    const s = get();
    if (s.activeHitIndex > 0) {
      set({ activeHitIndex: s.activeHitIndex - 1, flashTick: s.flashTick + 1 });
    } else {
      advanceBlock(-1);
    }
  },

  jumpToResult: (blockId) => {
    const hit = get().navResults.find((h) => h.blockId === blockId);
    if (hit) goToHit(hit, 0);
  },
  };
});
