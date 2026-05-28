import { useEffect } from 'react';
import { useBlocksStore } from '@/stores/blocksStore';
import { threadIdForEntry, useUndoStore } from '@/stores/undoStore';

// §9.13: the single entry point both Cmd+Z and the capture toast's Undo call. Pops +
// reverses the last valid undo entry, refreshes the affected thread in blocksStore, and
// shows the UndoToast (op kind + preview, or "Nothing to undo" when nothing reversible).
export const runUndo = async (): Promise<void> => {
  const store = useUndoStore.getState();
  const entry = await store.undo();
  if (entry) {
    // Reload from DB rather than reconstruct in-memory — the reversal may have recreated
    // several blocks + re-pointed attachments across two indexes.
    await useBlocksStore.getState().load(threadIdForEntry(entry));
  }
  store.showUndoToast(entry);
};

// Registers the Cmd+Z / Ctrl+Z shortcut on the main window (§14.1).
export function useUndo(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const isUndo =
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        !e.altKey &&
        (e.key === 'z' || e.key === 'Z');
      if (!isUndo) return;
      // Let the browser's native text undo win inside editable fields (block edit, the
      // composer, search box, …). App-level undo only applies to feed-level operations.
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      void runUndo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
