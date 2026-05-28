import { invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import { Send } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef } from 'react';
import {
  CLOSE_COLLECT_PANEL_COMMAND,
  COLLECT_CLOSED_EVENT,
  COLLECT_OPEN_EVENT,
  RESIZE_COLLECT_PANEL_COMMAND,
  type CollectClosedPayload,
} from '@/lib/collect/protocol';

// Tiny extra so the card's drop shadow isn't clipped by the OS window's bottom edge.
const SHADOW_ALLOWANCE = 8;

// §20.9 collect-mode staging panel — its own Tauri window (label "collect"), distinct
// from the capture overlay.
//
// Step 5a: placeholder shell. The window opens bottom-right on long-press ⌥ and shows
// the empty state (§14.5). The staging buffer, per-item editable cards (content + a
// visible annotation slot per §2.5.1), Tab focus traversal, Send/merge, Discard
// confirmation, and Cmd+Z land in 5b/5c. Send is disabled with nothing staged; Discard
// on an empty buffer just closes the panel (per the §20.9 contract).
export default function CollectPanel() {
  const cardRef = useRef<HTMLDivElement>(null);

  // Auto-size the OS window to the card's measured height so the rounded bottom corner is
  // always visible (mirrors the capture overlay's ResizeObserver loop). Since the window
  // is bottom-anchored in Rust, growing height extends the panel upward.
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const apply = (): void => {
      const h = Math.ceil(el.getBoundingClientRect().height) + SHADOW_ALLOWANCE;
      void invoke(RESIZE_COLLECT_PANEL_COMMAND, { height: h }).catch((e) => {
        console.warn('[collect] resize failed', e);
      });
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Rust emits `collect:open` when the panel is (re)shown. The placeholder has no staging
  // state to reset yet; wired so 5b can clear the buffer + local undo for a fresh session.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    void (async () => {
      const dispose = await listen(COLLECT_OPEN_EVENT, () => {
        // 5b: reset staging buffer here.
      });
      if (cancelled) dispose();
      else unlisten = dispose;
    })();
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  const discard = (): void => {
    void emit(COLLECT_CLOSED_EVENT, { kind: 'discarded' } satisfies CollectClosedPayload).catch(
      (e) => console.warn('[collect] emit closed failed', e),
    );
    void invoke(CLOSE_COLLECT_PANEL_COMMAND).catch((e) => {
      console.warn('[collect] close panel failed', e);
    });
  };

  // Esc closes the (empty) panel. Works once the non-activating window has taken a click
  // (acceptFirstMouse); the footer 丢弃 button is the primary close affordance.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        discard();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      ref={cardRef}
      className="collect-in flex w-full flex-col overflow-hidden rounded-lg border border-line-strong bg-paper"
      style={{ boxShadow: 'var(--shadow-toast)' }}
    >
      <header className="flex flex-none items-center justify-between border-b border-line bg-paper-2/40 px-3 py-1.5">
        <span className="font-serif text-[12px] text-ink">正在收集</span>
      </header>

      <p className="px-3 py-3 font-ui text-[11px] leading-relaxed text-muted">
        暂存中。下次 ⌥-捕获将加入这里。
      </p>

      <footer className="flex flex-none items-center justify-between gap-2 border-t border-line bg-paper-2/40 px-3 py-1.5 text-[11px]">
        <button
          type="button"
          onClick={discard}
          className="rounded px-2 py-1 text-muted hover:bg-paper hover:text-ink"
        >
          丢弃
        </button>
        <button
          type="button"
          disabled
          title="暂无可发送的内容"
          className="flex items-center gap-1 rounded-md border border-line bg-paper-2 px-2.5 py-1 text-muted/60"
        >
          <Send size={11} />
          <span>发送</span>
        </button>
      </footer>
    </div>
  );
}
