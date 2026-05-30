import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useEffect } from 'react';
import {
  COLLECT_CLOSED_EVENT,
  COLLECT_UNDO_MAIN_EVENT,
  OPEN_COLLECT_PANEL_COMMAND,
  REPOSITION_COLLECT_PANEL_COMMAND,
  type CollectClosedPayload,
} from '@/lib/collect/protocol';
import { useBlocksStore } from '@/stores/blocksStore';
import { useCaptureStore } from '@/stores/captureStore';
import { useCollectStore } from '@/stores/collectStore';
import { useThreadsStore } from '@/stores/threadsStore';
import { buildCollectSendUndo, useUndoStore } from '@/stores/undoStore';
import { runUndo } from '@/hooks/useUndo';

// §20.9 — the MAIN-window side of collect mode. Long-press ⌥ (Rust emits `collect-trigger`
// from the CGEventTap in double_tap.rs) opens the dedicated collect panel window. A 2nd
// long-press while it's open never spawns a second panel (§14.4); instead it brings the
// existing panel to the user's current monitor/Space (window-following last-resort).
//
// The panel emits `collect:closed` when it closes:
// - `discarded`: nothing was written; just clear the main-side flag.
// - `sent`: the panel merged the staging buffer into ONE block (in its own SQLite). Main
//   mirrors that block into its stores, pushes the `collect_send` entry into the MAIN undo
//   ring (§9.13 — the op persisted a block, so it belongs in main's ring, not the panel's),
//   and surfaces the main window so the user sees their committed collection.
export function useCollect(): void {
  useEffect(() => {
    let unlistenTrigger: (() => void) | null = null;
    let unlistenClosed: (() => void) | null = null;
    let unlistenFallthrough: (() => void) | null = null;
    let cancelled = false;

    void (async () => {
      const dispose1 = await listen('collect-trigger', () => {
        if (useCollectStore.getState().panelOpen) {
          // §20.9 last-resort follow: a 2nd long-press while open doesn't spawn a second
          // panel (§14.4) — it brings the existing one to the user's current monitor/Space
          // (a no-op when it's already there, so a dragged position is preserved).
          void invoke(REPOSITION_COLLECT_PANEL_COMMAND).catch((e) =>
            console.warn('[collect] reposition_collect_panel failed', e),
          );
          return;
        }
        useCollectStore.getState().open();
        void invoke(OPEN_COLLECT_PANEL_COMMAND).catch((e) => {
          console.error('[collect] open_collect_panel failed', e);
          useCollectStore.getState().close();
        });
      });
      if (cancelled) dispose1();
      else unlistenTrigger = dispose1;

      const dispose2 = await listen<CollectClosedPayload>(COLLECT_CLOSED_EVENT, (e) => {
        useCollectStore.getState().close();
        if (e.payload.kind === 'discarded') return;
        const { blocks, threadId, items } = e.payload;
        if (blocks.length === 0) return;
        useBlocksStore.setState((s) => ({
          byThread: {
            ...s.byThread,
            [threadId]: [...(s.byThread[threadId] ?? []), ...blocks],
          },
        }));
        useUndoStore.getState().pushUndo(
          buildCollectSendUndo({
            blockIds: blocks.map((b) => b.id),
            threadId,
            content: blocks[0]!.content,
            originalStagingItems: items,
          }),
        );
        useCaptureStore.getState().setFlash(threadId, blocks[blocks.length - 1]!.id);
        void useThreadsStore.getState().patch(threadId, {});
        void getCurrentWindow()
          .setFocus()
          .catch((err) => console.warn('[collect] focus main failed', err));
      });
      if (cancelled) dispose2();
      else unlistenClosed = dispose2;

      // §9.13: Cmd+Z in the panel with an empty local sub-undo log falls through to the
      // MAIN undo ring — the panel asks main to run the same reversal Cmd+Z does here.
      const dispose3 = await listen(COLLECT_UNDO_MAIN_EVENT, () => {
        void runUndo();
      });
      if (cancelled) dispose3();
      else unlistenFallthrough = dispose3;
    })();

    return () => {
      cancelled = true;
      if (unlistenTrigger) unlistenTrigger();
      if (unlistenClosed) unlistenClosed();
      if (unlistenFallthrough) unlistenFallthrough();
    };
  }, []);
}
