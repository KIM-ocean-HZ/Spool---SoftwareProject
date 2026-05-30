import { listen } from '@tauri-apps/api/event';
import { useEffect } from 'react';
import {
  COLLECT_APPEND_EVENT,
  COLLECT_OPEN_EVENT,
  COLLECT_RESTAGE_EVENT,
  type CollectAppendPayload,
  type CollectRestagePayload,
} from '@/lib/collect/protocol';
import { addItem, clear, getAll, stageCapturedItem } from '@/lib/collect/stagingBuffer';

// Collect-window side of §20.9. The dedicated panel window listens for:
// - `collect:open` (Rust, on long-press show): start a fresh staging session.
// - `collect:append` (main forwards a ⌥-capture that landed while the panel is open):
//   stage the captured text + source as a new item instead of writing a block.
// - `collect:restage` (main, on undo of a collect_send): re-stage the original items, but
//   only into an EMPTY buffer so a new session's captures aren't clobbered (§9.13).
//
// The capture-trigger listener and the panelOpen routing decision ("stage vs. write to
// DB", and the ⌘⇧C escape hatch) live in the MAIN window (useCapture / useCollect); this
// hook only consumes what main forwards, so there's no double-handling of the trigger.
export function useCollectMode(): void {
  useEffect(() => {
    let unlistenOpen: (() => void) | null = null;
    let unlistenAppend: (() => void) | null = null;
    let unlistenRestage: (() => void) | null = null;
    let cancelled = false;

    void (async () => {
      const dispose1 = await listen(COLLECT_OPEN_EVENT, () => {
        clear();
      });
      if (cancelled) dispose1();
      else unlistenOpen = dispose1;

      const dispose2 = await listen<CollectAppendPayload>(COLLECT_APPEND_EVENT, (e) => {
        // Deduped path (§20.9 v2.10): one capture stages exactly one item even if the event
        // is delivered more than once (e.g. a dev HMR-leaked listener).
        stageCapturedItem(e.payload.text, e.payload.source);
      });
      if (cancelled) dispose2();
      else unlistenAppend = dispose2;

      const dispose3 = await listen<CollectRestagePayload>(COLLECT_RESTAGE_EVENT, (e) => {
        if (getAll().length > 0) return; // only re-stage into an empty buffer
        for (const it of e.payload.items) addItem(it);
      });
      if (cancelled) dispose3();
      else unlistenRestage = dispose3;
    })();

    return () => {
      cancelled = true;
      if (unlistenOpen) unlistenOpen();
      if (unlistenAppend) unlistenAppend();
      if (unlistenRestage) unlistenRestage();
    };
  }, []);
}
