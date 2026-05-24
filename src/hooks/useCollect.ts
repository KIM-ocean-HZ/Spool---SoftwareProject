import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { useEffect } from 'react';
import {
  COLLECT_CLOSED_EVENT,
  SHOW_COLLECT_OVERLAY_COMMAND,
  type CollectClosedPayload,
} from '@/lib/capture/overlayProtocol';
import { useBlocksStore } from '@/stores/blocksStore';
import { useCaptureStore } from '@/stores/captureStore';
import { useCollectStore } from '@/stores/collectStore';
import { useThreadsStore } from '@/stores/threadsStore';

// v2.8 §20 Track B — wires the Rust long-press ⌥ trigger into collect mode:
// - On `collect-trigger`: flip the store's `active` flag, show the staging overlay.
//   No-op if collect mode is already active (the spec says re-triggering is a no-op;
//   user closes the staging toast via Send or Cancel buttons).
// - On `collect:closed` from the overlay: clear the flag and, if a block was actually
//   sent, mirror it into the main window's stores + focus the main window so the user
//   sees their committed work.
export function useCollect(): void {
  useEffect(() => {
    let unlistenTrigger: (() => void) | null = null;
    let unlistenClosed: (() => void) | null = null;
    let cancelled = false;

    void (async () => {
      const dispose1 = await listen('collect-trigger', () => {
        if (useCollectStore.getState().active) {
          // Already open — no-op. Spec: 2nd long-press while staging open is ignored
          // so a held key can't accidentally close the user's in-flight collection.
          return;
        }
        useCollectStore.getState().open();
        void invoke(SHOW_COLLECT_OVERLAY_COMMAND).catch((e) => {
          console.error('[collect] show_collect_overlay failed', e);
          useCollectStore.getState().close();
        });
      });
      if (cancelled) dispose1();
      else unlistenTrigger = dispose1;

      const dispose2 = await listen<CollectClosedPayload>(COLLECT_CLOSED_EVENT, (e) => {
        useCollectStore.getState().close();
        if (e.payload.kind === 'discarded') return;
        // The overlay wrote the new block to the DB and gave us the row. Drop it into
        // blocksStore so the open thread reflects the new block immediately.
        const { block, threadId } = e.payload;
        useBlocksStore.setState((s) => ({
          byThread: {
            ...s.byThread,
            [threadId]: [...(s.byThread[threadId] ?? []), block],
          },
        }));
        useCaptureStore.getState().setFlash(threadId, block.id);
        void useThreadsStore.getState().patch(threadId, {});
        // Bring the main window forward so the user sees their committed collection.
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
