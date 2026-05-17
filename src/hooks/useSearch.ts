import { listen } from '@tauri-apps/api/event';
import { useEffect } from 'react';
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
  const runSearch = useSearchStore((s) => s.runSearch);

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
}
