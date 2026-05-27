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
    current.startNavigation(highlightBlockId, hit.hitOffsets, current.query.trim());
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
        // Don't steal Esc from an active textarea / input — the field's own
        // Esc cancel handler should run first; nav clear can wait.
        const ae = document.activeElement;
        if (ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT')) return;
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
