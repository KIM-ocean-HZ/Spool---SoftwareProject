import { listen } from '@tauri-apps/api/event';
import { useEffect, useRef } from 'react';
import type { SearchHit } from '@/lib/search/query';
import { useSearchStore } from '@/stores/searchStore';

// Debounce before hitting SQLite. PLAN_EN.md §16 budgets <150ms input→results;
// a local FTS5 query is single-digit ms, so this delay is the dominant term.
const DEBOUNCE_MS = 130;

// Wires the search overlay (PLAN_EN.md §9.10 / Phase 7): the system-global
// ⌘/Ctrl+Shift+F shortcut, relayed from Rust as a `search-trigger` event, opens
// it; query edits are debounced into the FTS query.
// ⚠️ 窗口里的 ⌘F 是**另一条路**，在 App.tsx 的 keydown 里 —— 它不经过 Rust，也不该经过：
// 系统级的 ⌘F 会把这个键从每一个别的软件手里抢走。
export function useSearch(): void {
  const open = useSearchStore((s) => s.open);
  const query = useSearchStore((s) => s.query);
  const results = useSearchStore((s) => s.results);
  const runSearch = useSearchStore((s) => s.runSearch);
  const highlightBlockId = useSearchStore((s) => s.highlightBlockId);
  const activeNavBlockId = useSearchStore((s) => s.activeNavigationBlockId);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    void (async () => {
      const dispose = await listen('search-trigger', () => {
        useSearchStore.getState().openSearch();
      });
      if (cancelled) dispose();
      else unlisten = dispose;
    })();
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => void runSearch(), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [open, query, runSearch]);

  // v2.9 §9.10 / §19.17: hold the most recent non-empty result set so the
  // navigation kickoff below can look up the chosen hit even after closeSearch
  // wipes results. SearchOverlay batches select+highlight+closeSearch into one
  // navigate(), so by the time `highlightBlockId` change fires, `results` is
  // already []. The ref captures the snapshot before that wipe.
  const lastResultsRef = useRef<SearchHit[]>([]);
  useEffect(() => {
    if (results.length > 0) lastResultsRef.current = results;
  }, [results]);

  // Start in-block navigation whenever a search result navigates to a block.
  // SearchResultItem also calls startNavigation on its own click; this path
  // additionally covers Enter from the overlay's keyboard handler, which calls
  // SearchOverlay.navigate() directly without going through SearchResultItem.
  // Idempotent: a double call lands the same state.
  useEffect(() => {
    if (!highlightBlockId) return;
    const hit = lastResultsRef.current.find((h) => h.blockId === highlightBlockId);
    if (!hit) return;
    const current = useSearchStore.getState();
    if (current.activeNavigationBlockId === highlightBlockId) return;
    // ⚠️⚠️ `|| navQuery` —— 2026-08-27 实机验收时抓到的：这条路是**按 ↵ 跳转**走的，而
    // SearchOverlay.navigate() 先 closeSearch 再让这个 effect 收尾，`query` 那时已经被清空了。
    // 结果是查找条挂出来了、命中也高亮了，但**查找框是空的**，计数那一格也是空的（点结果那条
    // 路没事：SearchResultItem 在 close 之前就读了 query）。`navQuery` 是同一句话的副本，
    // 专门为「面板关掉之后还要用」留着，正是这里要的。
    current.startNavigation(
      highlightBlockId,
      hit.hitOffsets,
      current.query.trim() || current.navQuery,
    );
  }, [highlightBlockId]);

  // v2.9 §14.1: Cmd/Ctrl+G next, +Shift prev, F3 mirrors; Esc clears nav.
  // Gated on `activeNavigationBlockId` so the shortcuts only fire while the
  // find bar is mounted — Cmd+G never steals the key otherwise.
  useEffect(() => {
    if (!activeNavBlockId) return;
    const onKey = (e: KeyboardEvent) => {
      const { nextHit, prevHit, clearNavigation } = useSearchStore.getState();
      if (e.key === 'Escape') {
        if (e.defaultPrevented) return;
        // Skip Esc when focus is in an editor (block textarea, etc.) so the
        // field's own cancel handler keeps it — but allow Esc from the find
        // bar's own input (it lives inside [data-search-nav-bar]) so the
        // user can dismiss search from there with a single key.
        const ae = document.activeElement as HTMLElement | null;
        const inFindBar = ae?.closest('[data-search-nav-bar]') != null;
        const isEditor =
          !inFindBar && ae != null && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT');
        if (isEditor) return;
        e.preventDefault();
        clearNavigation();
        return;
      }
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && (e.key === 'g' || e.key === 'G')) {
        e.preventDefault();
        if (e.shiftKey) prevHit();
        else nextHit();
        return;
      }
      if (e.key === 'F3') {
        e.preventDefault();
        if (e.shiftKey) prevHit();
        else nextHit();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [activeNavBlockId]);
}
