import { listen } from '@tauri-apps/api/event';
import { useEffect } from 'react';
import {
  COLLECT_APPEND_EVENT,
  COLLECT_OPEN_EVENT,
  type CollectAppendPayload,
} from '@/lib/collect/protocol';
import { addItem, clear } from '@/lib/collect/stagingBuffer';

// Collect-window side of §20.9. The dedicated panel window listens for:
// - `collect:open` (Rust, on long-press show): start a fresh staging session.
// - `collect:append` (main forwards a ⌥-capture that landed while the panel is open):
//   stage the captured text + source as a new item instead of writing a block.
//
// The capture-trigger listener and the panelOpen routing decision ("stage vs. write to
// DB", and the ⌘⇧C escape hatch) live in the MAIN window (useCapture / useCollect); this
// hook only consumes what main forwards, so there's no double-handling of the trigger.
export function useCollectMode(): void {
  useEffect(() => {
    let unlistenOpen: (() => void) | null = null;
    let unlistenAppend: (() => void) | null = null;
    let cancelled = false;

    void (async () => {
      const dispose1 = await listen(COLLECT_OPEN_EVENT, () => {
        clear();
      });
      if (cancelled) dispose1();
      else unlistenOpen = dispose1;

      const dispose2 = await listen<CollectAppendPayload>(COLLECT_APPEND_EVENT, (e) => {
        addItem({ content: e.payload.text, source: e.payload.source });
      });
      if (cancelled) dispose2();
      else unlistenAppend = dispose2;
    })();

    return () => {
      cancelled = true;
      if (unlistenOpen) unlistenOpen();
      if (unlistenAppend) unlistenAppend();
    };
  }, []);
}
