import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useEffect } from 'react';
import { COLLECT_CLOSED_EVENT, OPEN_COLLECT_PANEL_COMMAND } from '@/lib/collect/protocol';
import { useCollectStore } from '@/stores/collectStore';

// §20.9 — the MAIN-window side of collect mode. Long-press ⌥ (Rust emits `collect-trigger`
// from the CGEventTap in double_tap.rs) opens the dedicated collect panel window. A 2nd
// long-press while the panel is already open is a no-op (§14.4) — a held key must not
// spawn a second panel or close an in-flight collection. The panel emits `collect:closed`
// when the user Discards (5b adds Send), which clears the main-side `panelOpen` flag.
//
// Step 5a wires the open/close lifecycle only; capture routing into the panel + mirroring
// a Sent block back into the main stores land in 5b.
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

      const dispose2 = await listen(COLLECT_CLOSED_EVENT, () => {
        useCollectStore.getState().close();
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
