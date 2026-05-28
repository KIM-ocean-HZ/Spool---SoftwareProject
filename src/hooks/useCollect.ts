import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useEffect } from 'react';
import {
  COLLECT_CLOSED_EVENT,
  OPEN_COLLECT_PANEL_COMMAND,
  type CollectClosedPayload,
} from '@/lib/collect/protocol';
import { useBlocksStore } from '@/stores/blocksStore';
import { useCaptureStore } from '@/stores/captureStore';
import { useCollectStore } from '@/stores/collectStore';
import { useThreadsStore } from '@/stores/threadsStore';
import { buildCollectSendUndo, useUndoStore } from '@/stores/undoStore';

// §20.9 — the MAIN-window side of collect mode. Long-press ⌥ (Rust emits `collect-trigger`
// from the CGEventTap in double_tap.rs) opens the dedicated collect panel window. A 2nd
// long-press while the panel is already open is a no-op (§14.4) — a held key must not
// spawn a second panel or close an in-flight collection.
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
    let cancelled = false;

    void (async () => {
      const dispose1 = await listen('collect-trigger', () => {
        if (useCollectStore.getState().panelOpen) {
          // §14.4: already open — ignore so a held ⌥ can't accidentally re-open.
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
        const { block, threadId } = e.payload;
        useBlocksStore.setState((s) => ({
          byThread: {
            ...s.byThread,
            [threadId]: [...(s.byThread[threadId] ?? []), block],
          },
        }));
        useUndoStore.getState().pushUndo(
          buildCollectSendUndo({ blockId: block.id, threadId, content: block.content }),
        );
        useCaptureStore.getState().setFlash(threadId, block.id);
        void useThreadsStore.getState().patch(threadId, {});
        void getCurrentWindow()
          .setFocus()
          .catch((err) => console.warn('[collect] focus main failed', err));
      });
      if (cancelled) dispose2();
      else unlistenClosed = dispose2;
    })();

    return () => {
      cancelled = true;
      if (unlistenTrigger) unlistenTrigger();
      if (unlistenClosed) unlistenClosed();
    };
  }, []);
}
