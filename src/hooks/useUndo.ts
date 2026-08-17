import { invoke } from '@tauri-apps/api/core';
import { useEffect } from 'react';
import {
  SHOW_UNDO_OVERLAY_COMMAND,
  type OverlayUndoPayload,
} from '@/lib/capture/overlayProtocol';
import { useBlocksStore } from '@/stores/blocksStore';
import { previewForEntry, threadIdForEntry, useUndoStore } from '@/stores/undoStore';
import { useThreadsStore } from '@/stores/threadsStore';
import { useWorkspacesStore } from '@/stores/workspacesStore';
import type { UndoEntry } from '@/lib/undo/undoLog';

// After a reversal (or re-apply), refresh whatever the op touched. Thread/workspace deletes
// move sidebar rows, not a block feed; everything else changes a thread's blocks.
const refreshAfterUndoRedo = async (entry: UndoEntry): Promise<void> => {
  switch (entry.kind) {
    case 'thread_delete':
    case 'thread_delete_many':
      await useThreadsStore.getState().loadAll();
      break;
    case 'workspace_delete':
      await useWorkspacesStore.getState().load();
      await useThreadsStore.getState().loadAll();
      break;
    default:
      await useBlocksStore.getState().load(threadIdForEntry(entry));
  }
};

// §9.13: the undo/redo confirmation is shown in the OVERLAY window so it floats over the
// user's current app (frictionless feedback even when Spool is hidden), not only inside
// the main window. The overlay also carries the 重做 quick-action.
const showUndoOverlay = (payload: OverlayUndoPayload): void => {
  void invoke(SHOW_UNDO_OVERLAY_COMMAND, { payload }).catch((e) =>
    console.warn('[undo] show undo overlay failed', e),
  );
};

// The single entry point Cmd+Z, the global undo shortcut, and the capture toast's Undo
// all call. Reverses the last valid op, refreshes the affected thread, and shows the
// confirmation card over the user's current window.
export const runUndo = async (): Promise<void> => {
  const entry = await useUndoStore.getState().undo();
  if (entry) {
    await refreshAfterUndoRedo(entry);
    showUndoOverlay({
      op: entry.kind,
      preview: previewForEntry(entry),
      mode: 'undone',
      canRedo: true,
    });
  } else {
    showUndoOverlay({ op: 'empty', preview: '', mode: 'undone', canRedo: false });
  }
};

// Re-applies the last undone op (the 重做 action). Silent if there is nothing to redo.
export const runRedo = async (): Promise<void> => {
  const entry = await useUndoStore.getState().redo();
  if (!entry) return;
  await refreshAfterUndoRedo(entry);
  showUndoOverlay({
    op: entry.kind,
    preview: previewForEntry(entry),
    mode: 'redone',
    canRedo: false,
  });
};

// Registers the Cmd+Z / Ctrl+Z shortcut on the main window (§14.1). The global,
// works-from-any-app variant is registered in Rust only while a toast is up.
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
