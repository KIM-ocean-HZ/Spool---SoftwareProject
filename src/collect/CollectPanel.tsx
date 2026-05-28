import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import { Pin, Send, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  CLOSE_COLLECT_PANEL_COMMAND,
  COLLECT_CLOSED_EVENT,
  RESIZE_COLLECT_PANEL_COMMAND,
  type CollectClosedPayload,
} from '@/lib/collect/protocol';
import { sendStaging } from '@/lib/collect/send';
import {
  getAll,
  removeItem,
  subscribe,
  togglePin,
  updateItemAnnotation,
  updateItemContent,
  type StagingItem,
} from '@/lib/collect/stagingBuffer';
import { getCaptureTargetThread } from '@/lib/db/threads';
import { useCollectMode } from '@/hooks/useCollectMode';

// Cap so a long collection scrolls inside the panel instead of growing off-screen; the
// items list scrolls past this while per-item content still auto-grows.
const MAX_PANEL_HEIGHT = 540;
// Tiny extra so the card's drop shadow isn't clipped by the OS window's bottom edge.
const SHADOW_ALLOWANCE = 8;

// §20.9 collect-mode staging panel — its own Tauri window (label "collect"), distinct
// from the capture overlay. Holds clipboard captures as transient, editable items until
// the user Sends them as one merged block, or Discards. Each item exposes a VISIBLE
// annotation slot (§2.5.1 design bias) and Tab cycles those slots straight to Send.
export default function CollectPanel() {
  useCollectMode(); // listens for collect:open (reset) + collect:append (stage)
  const items = useSyncExternalStore(subscribe, getAll);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-size the OS window to the card's measured height (capped), so the rounded bottom
  // corner is always visible. The window is bottom-anchored in Rust, so growth extends up.
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const apply = (): void => {
      const h = Math.min(MAX_PANEL_HEIGHT, Math.ceil(el.getBoundingClientRect().height)) +
        SHADOW_ALLOWANCE;
      void invoke(RESIZE_COLLECT_PANEL_COMMAND, { height: h }).catch((e) => {
        console.warn('[collect] resize failed', e);
      });
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // When a new item is staged, scroll the list to its bottom so the newest is in view.
  const prevLenRef = useRef(0);
  useEffect(() => {
    if (items.length > prevLenRef.current && listRef.current) {
      requestAnimationFrame(() => {
        const el = listRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
    }
    prevLenRef.current = items.length;
  }, [items.length]);

  const close = (payload: CollectClosedPayload): void => {
    setConfirming(false);
    setSending(false);
    void emit(COLLECT_CLOSED_EVENT, payload).catch((e) =>
      console.warn('[collect] emit closed failed', e),
    );
    void invoke(CLOSE_COLLECT_PANEL_COMMAND).catch((e) =>
      console.warn('[collect] close panel failed', e),
    );
  };

  // Discard: empty buffer just closes; with items, confirm first (§20.9). Never undoable.
  const requestDiscard = (): void => {
    if (items.length === 0) {
      close({ kind: 'discarded' });
      return;
    }
    setConfirming(true);
  };

  const send = async (): Promise<void> => {
    if (items.length === 0 || sending) return;
    setSending(true);
    let target: Awaited<ReturnType<typeof getCaptureTargetThread>>;
    try {
      target = await getCaptureTargetThread();
    } catch (e) {
      console.error('[collect] capture target lookup failed', e);
      setSending(false);
      return;
    }
    if (!target) {
      console.warn('[collect] send aborted: no capture target');
      setSending(false);
      return;
    }
    let block: Awaited<ReturnType<typeof sendStaging>>;
    try {
      block = await sendStaging(items, target.id);
    } catch (e) {
      console.error('[collect] send failed', e);
      setSending(false);
      return;
    }
    if (!block) {
      setSending(false);
      return;
    }
    // Main pushes the collect_send undo entry + mirrors the block into its stores.
    close({ kind: 'sent', block, threadId: target.id });
  };

  // Esc: cancel a pending confirm, else discard (empty → close; with items → confirm).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (confirming) {
        setConfirming(false);
        return;
      }
      if (items.length === 0) {
        close({ kind: 'discarded' });
        return;
      }
      setConfirming(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirming, items.length]);

  const annotatedCount = items.filter((it) => it.annotation.trim().length > 0).length;

  return (
    <div
      ref={cardRef}
      className="collect-in flex w-full flex-col overflow-hidden rounded-lg border border-line-strong bg-paper"
      style={{ boxShadow: 'var(--shadow-toast)', maxHeight: MAX_PANEL_HEIGHT }}
    >
      <header className="flex flex-none items-center justify-between border-b border-line bg-paper-2/40 px-3 py-1.5">
        <div className="font-ui text-[11px] text-ink">
          <span className="font-serif text-[12px]">正在收集</span>
          {items.length > 0 && <span className="ml-1.5 text-muted">· {items.length}</span>}
        </div>
      </header>

      <div ref={listRef} className="flex-1 overflow-y-auto px-2 py-1.5">
        {items.length === 0 ? (
          <p className="px-1 py-2 font-ui text-[11px] leading-relaxed text-muted">
            暂存中。下次 ⌥-捕获将加入这里。
          </p>
        ) : (
          items.map((it) => (
            <StagingItemCard
              key={it.id}
              item={it}
              onContentChange={(v) => updateItemContent(it.id, v)}
              onAnnotationChange={(v) => updateItemAnnotation(it.id, v)}
              onTogglePin={() => togglePin(it.id)}
              onRemove={() => removeItem(it.id)}
            />
          ))
        )}
      </div>

      {confirming ? (
        <footer className="flex flex-none items-center justify-between gap-2 border-t border-line bg-paper-2/40 px-3 py-1.5 text-[11px]">
          <span className="text-muted">丢弃 {items.length} 条暂存内容？</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setConfirming(false)}
              className="rounded px-2 py-0.5 text-muted hover:bg-paper hover:text-ink"
            >
              再想想
            </button>
            <button
              type="button"
              tabIndex={-1}
              onClick={() => close({ kind: 'discarded' })}
              className="rounded border border-urgent/60 bg-paper px-2 py-0.5 text-urgent hover:bg-urgent/10"
            >
              确认丢弃
            </button>
          </div>
        </footer>
      ) : (
        <footer className="flex flex-none items-center justify-between gap-2 border-t border-line bg-paper-2/40 px-3 py-1.5 text-[11px]">
          <button
            type="button"
            tabIndex={-1}
            onClick={requestDiscard}
            className="rounded px-2 py-1 text-muted hover:bg-paper hover:text-ink"
          >
            丢弃
          </button>
          <button
            type="button"
            onClick={() => void send()}
            disabled={items.length === 0 || sending}
            className="flex items-center gap-1 rounded-md border border-accent bg-accent-soft px-2.5 py-1 text-accent hover:bg-accent/10 disabled:cursor-not-allowed disabled:border-line disabled:bg-paper-2 disabled:text-muted/60"
          >
            <Send size={11} />
            <span>
              {sending
                ? '发送中…'
                : annotatedCount > 0
                  ? `发送（${annotatedCount} 条已批注）`
                  : '发送'}
            </span>
          </button>
        </footer>
      )}
    </div>
  );
}

interface StagingItemCardProps {
  item: StagingItem;
  onContentChange: (v: string) => void;
  onAnnotationChange: (v: string) => void;
  onTogglePin: () => void;
  onRemove: () => void;
}

// One staging item (§13.2): content textarea on top, inline Pill source badge + pin + X,
// and a VISIBLE (never hover-gated) annotation textarea below per §2.5.1. Content / pin /
// remove are taken out of the Tab order (tabIndex -1) so Tab cycles only the annotation
// fields → Send button (the §2.5.1 batch-annotation ergonomic).
function StagingItemCard({
  item,
  onContentChange,
  onAnnotationChange,
  onTogglePin,
  onRemove,
}: StagingItemCardProps) {
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const annotationRef = useRef<HTMLTextAreaElement>(null);

  const autoGrow = (el: HTMLTextAreaElement | null): void => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };
  useLayoutEffect(() => autoGrow(contentRef.current), [item.content]);
  useLayoutEffect(() => autoGrow(annotationRef.current), [item.annotation]);

  return (
    <article className="mb-1.5 rounded-md border border-line bg-paper-2/30 px-2 py-1.5 last:mb-0">
      <div className="mb-1 flex items-center gap-1">
        {item.source && (
          <span className="min-w-0 truncate rounded-full border border-line px-2 py-0.5 font-mono text-[10px] text-muted">
            {item.source}
          </span>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            tabIndex={-1}
            onClick={onTogglePin}
            title={item.pinned ? '取消置顶' : '标为重点（发送后整块会置顶）'}
            aria-label={item.pinned ? '取消置顶' : '置顶'}
            className={`rounded p-1 transition-colors ${
              item.pinned ? 'text-accent' : 'text-muted/70 hover:bg-paper hover:text-ink'
            }`}
          >
            <Pin size={11} className={item.pinned ? 'fill-current' : ''} />
          </button>
          <button
            type="button"
            tabIndex={-1}
            onClick={onRemove}
            title="移除此项"
            aria-label="移除"
            className="rounded p-1 text-muted/70 transition-colors hover:bg-paper hover:text-urgent"
          >
            <X size={11} />
          </button>
        </div>
      </div>

      <textarea
        ref={contentRef}
        tabIndex={-1}
        value={item.content}
        onChange={(e) => onContentChange(e.target.value)}
        spellCheck={false}
        rows={1}
        className="w-full resize-none overflow-hidden rounded border border-line-strong bg-paper px-2 py-1 font-ui text-[14px] leading-[1.55] text-ink outline-none focus:border-accent"
      />

      <textarea
        ref={annotationRef}
        value={item.annotation}
        onChange={(e) => onAnnotationChange(e.target.value)}
        placeholder="批注（可选）"
        spellCheck={false}
        rows={1}
        className="mt-1 w-full resize-none overflow-hidden rounded border border-line bg-paper px-2 py-1 font-ui text-[12px] italic leading-[1.5] text-ink-2 placeholder:text-muted/60 outline-none focus:border-line-strong focus:not-italic"
      />
    </article>
  );
}
