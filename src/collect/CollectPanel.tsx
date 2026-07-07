import { invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Maximize2, Minimize2, Pin, Send, Undo2, X } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import {
  CAPTURE_TARGET_CHANGED_EVENT,
  CLOSE_COLLECT_PANEL_COMMAND,
  COLLECT_CLOSED_EVENT,
  COLLECT_OPEN_EVENT,
  COLLECT_TOGGLE_COLLAPSE_EVENT,
  COLLECT_UNDO_MAIN_EVENT,
  RESIZE_COLLECT_PANEL_COMMAND,
  type CollectClosedPayload,
} from '@/lib/collect/protocol';
import { sendStaging } from '@/lib/collect/send';
import {
  clear,
  getAll,
  removeItem,
  subscribe,
  togglePin,
  undoLocal,
  updateItemAnnotation,
  updateItemContent,
  type StagingItem,
} from '@/lib/collect/stagingBuffer';
import { getCaptureTargetThread } from '@/lib/db/threads';
import { listWorkspaces } from '@/lib/db/workspaces';
import { isImeComposing } from '@/lib/utils/ime';
import { useCollectMode } from '@/hooks/useCollectMode';
import { useT } from '@/lib/i18n';

// Cap so a long collection scrolls inside the panel instead of growing off-screen; the
// items list scrolls past this while per-item content still auto-grows.
const MAX_PANEL_HEIGHT = 540;
// Tiny extra so the card's drop shadow isn't clipped by the OS window's bottom edge.
const SHADOW_ALLOWANCE = 8;
// Fixed width of the expanded card. The OS window is then sized to the measured content
// width (this when expanded, the pill's own width when collapsed) so the collapsed pill
// doesn't leave a transparent, click-blocking strip beside it.
const PANEL_WIDTH = 340;

// Drag the panel by its header / collapsed pill so the user can move it off content. The
// window is non-activating; acceptFirstMouse lets the drag start without focusing it.
const startPanelDrag = (e: ReactMouseEvent): void => {
  if (e.button !== 0) return;
  void getCurrentWindow()
    .startDragging()
    .catch((err) => console.warn('[collect] panel drag failed', err));
};

// §20.9 collect-mode staging panel — its own Tauri window (label "collect"), distinct
// from the capture overlay. Holds clipboard captures as transient, editable items until
// the user Sends them as one merged block, or Discards. Each item exposes a VISIBLE
// annotation slot (§2.5.1 design bias) and Tab cycles those slots straight to Send.
//
// The panel is draggable (header / collapsed pill) and collapsible to a compact pill, so
// it can sit discreetly on the desktop through a long collection session. Cmd+Z runs the
// panel-local sub-undo, falling through to the main undo ring when the local log is empty.
export default function CollectPanel() {
  const t = useT();
  useCollectMode(); // collect:open (reset) + collect:append (stage) + collect:restage
  const items = useSyncExternalStore(subscribe, getAll);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  // Where Send lands — mirrors the CaptureToast two-tier attribution (§9.4) so the panel
  // says, quietly, what it's collecting into. null → no target (shouldn't happen): show nothing.
  const [target, setTarget] = useState<{ workspaceTitle: string; threadTitle: string } | null>(
    null,
  );
  // Transient "已加入 · 撤销" affordance shown after each capture appends an item — the only
  // feedback when the panel is collapsed (the list is hidden), and the undo entry point the
  // expanded panel previously lacked. Auto-fades; 撤销 runs the panel-local sub-undo.
  const [showAddedUndo, setShowAddedUndo] = useState(false);
  const addedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cardRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-size the OS window to the measured content height (capped), so the rounded bottom
  // corner is always visible. The window is top-anchored in Rust, so growth/shrink extends
  // downward and never disturbs a position the user dragged the panel to. cardRef is a
  // stable wrapper around the collapsed pill / expanded card. Extracted to a stable callback
  // so collect:open can re-assert it (see below).
  const measureAndResize = useCallback((): void => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = Math.ceil(rect.width);
    const height = Math.min(MAX_PANEL_HEIGHT, Math.ceil(rect.height)) + SHADOW_ALLOWANCE;
    void invoke(RESIZE_COLLECT_PANEL_COMMAND, { width, height }).catch((e) => {
      console.warn('[collect] resize failed', e);
    });
  }, []);

  // The observer catches every content-height change (collapse, item add/remove, the target
  // line landing).
  useLayoutEffect(() => {
    measureAndResize();
    const el = cardRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measureAndResize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measureAndResize]);

  // A fresh long-press (collect:open) starts a new session expanded, even if the previous
  // one ended collapsed. (useCollectMode clears the buffer on the same event.)
  //
  // Also re-measure here: Rust resets the window to a fixed initial height on every open, but
  // a fresh session's empty content height usually MATCHES the last measurement, so the
  // ResizeObserver never fires — leaving the panel clipped to that too-short initial height
  // until the first capture changes the height. The rAF lets the expand render first.
  useEffect(() => {
    let cancelled = false;
    const disposers: Array<() => void> = [];
    void (async () => {
      const d1 = await listen(COLLECT_OPEN_EVENT, () => {
        setCollapsed(false);
        requestAnimationFrame(measureAndResize);
      });
      cancelled ? d1() : disposers.push(d1);
      // §20.9 v2.10: a single clean ⌥ tap (Rust) toggles the pill ↔ full card.
      const d2 = await listen(COLLECT_TOGGLE_COLLAPSE_EVENT, () => setCollapsed((v) => !v));
      cancelled ? d2() : disposers.push(d2);
    })();
    return () => {
      cancelled = true;
      for (const d of disposers) d();
    };
  }, [measureAndResize]);

  // Resolve the current capture target (+ its workspace). No target → null, render nothing.
  const refreshTarget = useCallback(async (): Promise<void> => {
    try {
      const th = await getCaptureTargetThread();
      if (!th) {
        setTarget(null);
        return;
      }
      const ws = await listWorkspaces();
      setTarget({
        workspaceTitle: ws.find((w) => w.id === th.workspaceId)?.title.trim() || t('未命名'),
        threadTitle: th.title.trim() || t('无标题'),
      });
    } catch (e) {
      console.warn('[collect] capture-target lookup failed', e);
    }
  }, [t]);

  // Keep the destination line current: read on mount, on each fresh session (collect:open),
  // and whenever the target is toggled from the main window (§9.2 — a pure state change, so
  // it can move while the panel sits open).
  useEffect(() => {
    void refreshTarget();
    let cancelled = false;
    const disposers: Array<() => void> = [];
    void (async () => {
      for (const evt of [COLLECT_OPEN_EVENT, CAPTURE_TARGET_CHANGED_EVENT]) {
        const dispose = await listen(evt, () => void refreshTarget());
        if (cancelled) dispose();
        else disposers.push(dispose);
      }
    })();
    return () => {
      cancelled = true;
      for (const d of disposers) d();
    };
  }, [refreshTarget]);

  // When a new item is staged: scroll the list to its bottom (if expanded), and surface the
  // transient "已加入 · 撤销" affordance — the only "something landed" signal while collapsed.
  const prevLenRef = useRef(0);
  useEffect(() => {
    if (items.length > prevLenRef.current) {
      setShowAddedUndo(true);
      if (addedTimerRef.current) clearTimeout(addedTimerRef.current);
      addedTimerRef.current = setTimeout(() => setShowAddedUndo(false), 3500);
      if (listRef.current) {
        requestAnimationFrame(() => {
          const el = listRef.current;
          if (el) el.scrollTop = el.scrollHeight;
        });
      }
    }
    prevLenRef.current = items.length;
  }, [items.length]);

  useEffect(() => () => {
    if (addedTimerRef.current) clearTimeout(addedTimerRef.current);
  }, []);

  // 撤销 on the added-affordance: reverse the last panel-local op (the just-staged item, same
  // as Cmd+Z in the panel) and hide the affordance.
  const handleUndoAdd = (): void => {
    undoLocal();
    setShowAddedUndo(false);
    if (addedTimerRef.current) clearTimeout(addedTimerRef.current);
  };

  const close = (payload: CollectClosedPayload): void => {
    setConfirming(false);
    setSending(false);
    clear(); // items discarded from memory on close (Send already captured them in payload)
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
    // Main pushes the collect_send undo entry + mirrors the block into its stores. The
    // pre-send items ride along so an undo can re-stage them (§9.13).
    close({ kind: 'sent', block, threadId: target.id, items });
  };

  // Esc: cancel a pending confirm, else discard (empty → close; with items → confirm).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      // Esc while composing in a staging textarea only cancels the IME composition —
      // it must not surface the discard confirm.
      if (isImeComposing(e)) return;
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

  // Cmd+Z (§9.13 cross-window contract): native text undo wins while a staging textarea is
  // focused (a typing run is undone there, not the op log); otherwise reverse the last
  // panel-local staging op (add / remove / edit) SILENTLY — the panel visibly updates, so
  // collect-internal undo needs no toast (Ocean). When the local sub-undo log is empty,
  // fall through to the MAIN undo ring.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const isUndo =
        (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && (e.key === 'z' || e.key === 'Z');
      if (!isUndo) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable)) {
        return;
      }
      e.preventDefault();
      if (!undoLocal()) {
        void emit(COLLECT_UNDO_MAIN_EVENT).catch(() => {});
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const annotatedCount = items.filter((it) => it.annotation.trim().length > 0).length;

  // "已加入 · 撤销" affordance, shared by the collapsed pill and the expanded header.
  const undoChip = showAddedUndo ? (
    <div className="collect-in flex flex-none items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] text-accent">
      <span>{t('已加入')}</span>
      <button
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={handleUndoAdd}
        title={t('撤销刚加入的一条')}
        className="flex items-center gap-0.5 underline-offset-2 hover:underline"
      >
        <Undo2 size={10} />
        {t('撤销')}
      </button>
    </div>
  ) : null;

  return (
    // w-fit so the wrapper shrinks to the active content (pill or card); ml-auto keeps it at
    // the window's right edge before the OS window resizes to match.
    <div ref={cardRef} className="ml-auto w-fit">
      {collapsed ? (
        // Stack the pill + the transient "已加入·撤销" chip vertically (right-aligned) so the
        // chip appearing never stretches the pill — the pill keeps its exact shape.
        <div className="flex flex-col items-end gap-1.5">
          <div
            onMouseDown={startPanelDrag}
            className="collect-in group flex cursor-grab items-center gap-2 rounded-full border border-line-strong bg-paper py-1.5 pl-3.5 pr-2 active:cursor-grabbing"
            style={{ boxShadow: 'var(--shadow-toast)' }}
          >
            <span className="font-serif text-[12px] text-ink">{t('正在收集')}</span>
            <span className="font-mono text-[11px] text-muted">· {items.length}</span>
            {/* Send straight from the pill without expanding — revealed on hover. */}
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => void send()}
              disabled={items.length === 0 || sending}
              title={t('发送')}
              aria-label={t('发送')}
              className="hidden rounded p-1 text-accent hover:bg-accent/10 disabled:text-muted/50 group-hover:inline-flex"
            >
              <Send size={11} />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => setCollapsed(false)}
              title={t('展开面板')}
              aria-label={t('展开')}
              className="rounded p-1 text-muted/80 hover:bg-paper-2 hover:text-ink"
            >
              <Maximize2 size={11} />
            </button>
          </div>
          {undoChip}
        </div>
      ) : (
        <div
          className="collect-in flex flex-col overflow-hidden rounded-lg border border-line-strong bg-paper"
          style={{ boxShadow: 'var(--shadow-toast)', maxHeight: MAX_PANEL_HEIGHT, width: PANEL_WIDTH }}
        >
          <header
            onMouseDown={startPanelDrag}
            className="flex flex-none cursor-grab items-center justify-between border-b border-line bg-paper-2/40 px-3 py-1.5 active:cursor-grabbing"
          >
            <div className="min-w-0 font-ui text-[11px] text-ink">
              <div>
                <span className="font-serif text-[12px]">{t('正在收集')}</span>
                {items.length > 0 && <span className="ml-1.5 text-muted">· {items.length}</span>}
              </div>
              {target && (
                <div
                  className="mt-0.5 truncate font-mono text-[10px] text-muted"
                  title={`${target.workspaceTitle} / ${target.threadTitle}`}
                >
                  → 「{target.workspaceTitle} / {target.threadTitle}」
                </div>
              )}
            </div>
            <div className="flex flex-none items-center gap-1.5">
              <span className="font-mono text-[10px] text-muted/60">{t('单击 ⌥ 收起')}</span>
              <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => setCollapsed(true)}
                title={t('收起为小标签（或单击 ⌥）')}
                aria-label={t('收起')}
                className="rounded p-1 text-muted/80 hover:bg-paper hover:text-ink"
              >
                <Minimize2 size={11} />
              </button>
            </div>
          </header>

          <div ref={listRef} className="flex-1 overflow-y-auto px-2 py-1.5">
            {items.length === 0 ? (
              <p className="px-1 py-2 font-ui text-[11px] leading-relaxed text-muted">
                {t('暂存中。下次 ⌥-捕获将加入这里。')}
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
              <span className="text-muted">{t('丢弃 {n} 条暂存内容？', { n: items.length })}</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setConfirming(false)}
                  className="rounded px-2 py-0.5 text-muted hover:bg-paper hover:text-ink"
                >
                  {t('再想想')}
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => close({ kind: 'discarded' })}
                  className="rounded border border-urgent/60 bg-paper px-2 py-0.5 text-urgent hover:bg-urgent/10"
                >
                  {t('确认丢弃')}
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
                {t('丢弃')}
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
                    ? t('发送中…')
                    : annotatedCount > 0
                      ? t('发送（{n} 条已批注）', { n: annotatedCount })
                      : t('发送')}
                </span>
              </button>
            </footer>
          )}
        </div>
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
  const t = useT();
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
            title={item.pinned ? t('取消置顶') : t('标为重点（发送后整块会置顶）')}
            aria-label={item.pinned ? t('取消置顶') : t('置顶')}
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
            title={t('移除此项')}
            aria-label={t('移除')}
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
        placeholder={t('批注（可选）')}
        spellCheck={false}
        rows={1}
        className="mt-1 w-full resize-none overflow-hidden rounded border border-line bg-paper px-2 py-1 font-ui text-[12px] italic leading-[1.5] text-ink-2 placeholder:text-muted/60 outline-none focus:border-line-strong focus:not-italic"
      />
    </article>
  );
}
