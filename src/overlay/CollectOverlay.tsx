import { invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import {
  GripVertical,
  Link2,
  MessageSquarePlus,
  Pin,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { nanoid } from 'nanoid';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  COLLECT_APPEND_EVENT,
  COLLECT_CLOSED_EVENT,
  HIDE_OVERLAY_COMMAND,
  RESIZE_OVERLAY_COMMAND,
  type CollectAppendPayload,
  type CollectClosedPayload,
} from '@/lib/capture/overlayProtocol';
import { createAttachment } from '@/lib/db/attachments';
import { createBlock, togglePin as togglePinDb } from '@/lib/db/blocks';
import { getCaptureTargetThread } from '@/lib/db/threads';
import { joinSegments, type Segment } from '@/lib/blocks/segments';

// v2.8 §20 Track B — collect mode (staging toast).
//
// A persistent staging UI rendered inside the existing overlay window. While open,
// every clipboard capture (forwarded by useCapture in main) appends a transient item
// here instead of writing a block to SQLite. Items are block-like: small by default,
// click to expand for edit, hover-bar reveals add-annotation / add-URL / pin / delete /
// drag-to-reorder. Send merges everything into one block in the current capture target;
// Close discards.
//
// Crucial isolation invariant (§20.8): nothing touches the blocks / attachments table
// until the user clicks Send. A future revert is a clean module + hook + Rust-branch
// removal.

// Auto-size cap so the staging toast doesn't grow off-screen on a small display.
// Beyond this the panel's own scroll kicks in — per-item content still truncates +
// click-to-expand (no per-item scrollbars).
const MAX_PANEL_HEIGHT = 540;
// Tiny extra so the card's drop shadow isn't clipped by the OS window's bottom edge.
const SHADOW_ALLOWANCE = 8;

interface StagingItem {
  id: string;
  text: string;
  annotation: string;
  source: string | null;
  url: string;
  pinned: boolean;
}

interface ItemUiState {
  expanded: boolean; // true → text textarea visible; false → line-clamped preview
  editingAnnotation: boolean; // true → annotation textarea shown even when empty
  editingUrl: boolean; // true → URL input shown even when empty
}

const defaultUi = (): ItemUiState => ({
  expanded: false,
  editingAnnotation: false,
  editingUrl: false,
});

export default function CollectOverlay() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<StagingItem[]>([]);
  const [ui, setUi] = useState<Record<string, ItemUiState>>({});
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  // Index of the item being dragged (for HTML5 drag-and-drop reordering); null when
  // no drag in progress. Index — not id — so the over-handler reorders in O(1).
  const [dragFromIdx, setDragFromIdx] = useState<number | null>(null);
  // Where the dragged item would land if dropped right now. `idx` is the row the
  // cursor is over; `position: 'before'` means "land above row idx", `'after'`
  // means "land below row idx". `idx = -1` is the special "drop above the very
  // first row" zone (the top spacer). Drives both the thin drop-indicator line
  // shown to the user AND the final reorder math on drop.
  const [dropAt, setDropAt] = useState<
    { idx: number; position: 'before' | 'after' } | null
  >(null);

  // Stash refs so listener closures read latest state without re-subscribing.
  const itemsRef = useRef<StagingItem[]>([]);
  itemsRef.current = items;

  // ResizeObserver target — the card root. Drives Rust to match the OS window to
  // the card's actual height so the rounded bottom corner is always visible.
  const cardRef = useRef<HTMLDivElement>(null);
  // Inner scroll container for the items list — used by the auto-scroll-on-append
  // effect (task 5.1: panel auto-navigates to bottom when new items arrive).
  const listRef = useRef<HTMLDivElement>(null);

  // Listen for `collect:open` (long-press fired) and `collect:append` (a clipboard
  // capture forwarded while staging is open).
  useEffect(() => {
    let unlistenOpen: (() => void) | null = null;
    let unlistenAppend: (() => void) | null = null;
    let cancelled = false;

    void (async () => {
      const dispose1 = await listen('collect:open', () => {
        setOpen(true);
        setItems([]);
        setUi({});
        setConfirming(false);
      });
      if (cancelled) dispose1();
      else unlistenOpen = dispose1;

      const dispose2 = await listen<CollectAppendPayload>(COLLECT_APPEND_EVENT, (e) => {
        const incoming: StagingItem = {
          id: nanoid(),
          text: e.payload.text,
          annotation: '',
          source: e.payload.source,
          url: '',
          pinned: false,
        };
        setItems([...itemsRef.current, incoming]);
        setUi((u) => ({ ...u, [incoming.id]: defaultUi() }));
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

  // Task 5.1: when an item is appended, scroll the list to its bottom so the user
  // sees the newest item. Runs whenever items.length grows.
  const prevLenRef = useRef(0);
  useEffect(() => {
    if (items.length > prevLenRef.current && listRef.current) {
      // Defer to next frame so the new <li> is in the DOM before we measure.
      requestAnimationFrame(() => {
        const el = listRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
    }
    prevLenRef.current = items.length;
  }, [items.length]);

  // Esc → request-close (immediate when empty, confirm prompt otherwise). Mounted
  // only while staging is open so it doesn't shadow CaptureOverlay's Esc handler
  // when a normal toast is showing.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      if (confirming) {
        e.preventDefault();
        setConfirming(false);
        return;
      }
      e.preventDefault();
      if (itemsRef.current.length === 0) {
        void emit(COLLECT_CLOSED_EVENT, { kind: 'discarded' } satisfies CollectClosedPayload);
        void invoke(HIDE_OVERLAY_COMMAND);
        setOpen(false);
        setItems([]);
        setUi({});
        return;
      }
      setConfirming(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, confirming]);

  // Auto-size the OS window to the card's measured height (capped at MAX_PANEL_HEIGHT
  // — past that the inner list scrolls but per-item content still uses truncate +
  // expand, per task 5.2). Without this the window would either clip the rounded
  // bottom or waste space below a short panel.
  useLayoutEffect(() => {
    if (!open) return;
    const el = cardRef.current;
    if (!el) return;
    const apply = (): void => {
      const cardH = Math.ceil(el.getBoundingClientRect().height);
      const target = Math.min(MAX_PANEL_HEIGHT, cardH) + SHADOW_ALLOWANCE;
      void invoke(RESIZE_OVERLAY_COMMAND, { height: target }).catch((e) => {
        console.warn('[collect] resize failed', e);
      });
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  if (!open) return null;

  const close = (payload: CollectClosedPayload): void => {
    setOpen(false);
    setItems([]);
    setUi({});
    setConfirming(false);
    setSending(false);
    void emit(COLLECT_CLOSED_EVENT, payload).catch((e) => {
      console.warn('[collect] emit closed failed', e);
    });
    void invoke(HIDE_OVERLAY_COMMAND).catch((e) => {
      console.warn('[collect] hide overlay failed', e);
    });
  };

  const requestClose = (): void => {
    if (items.length === 0) {
      close({ kind: 'discarded' });
      return;
    }
    setConfirming(true);
  };

  const confirmDiscard = (): void => close({ kind: 'discarded' });
  const cancelDiscard = (): void => setConfirming(false);

  const updateItem = (id: string, patch: Partial<StagingItem>): void => {
    setItems((arr) => arr.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };
  const updateUi = (id: string, patch: Partial<ItemUiState>): void => {
    setUi((u) => ({ ...u, [id]: { ...(u[id] ?? defaultUi()), ...patch } }));
  };
  const removeItem = (id: string): void => {
    setItems((arr) => arr.filter((it) => it.id !== id));
    setUi((u) => {
      const { [id]: _drop, ...rest } = u;
      return rest;
    });
  };

  // Task 5.4: drag-to-reorder. Pin stays orthogonal — drag changes merge order, pin
  // propagates to the merged block's pinned flag.
  //
  // Position-aware: dropAt carries the row the cursor is over AND whether the drop
  // should land BEFORE or AFTER that row (decided by which half of the row the
  // cursor is in — see onDragOver in StagingRow). idx === -1 is the top spacer
  // ("drop above the very first row"). We adjust the final insertion index because
  // splice() removes from the source first, shifting later indices down by one.
  const dropDraggedItem = (): void => {
    if (dragFromIdx === null || !dropAt) return;
    const { idx, position } = dropAt;
    // Target = the raw insertion index in the un-modified array.
    let target = idx === -1 ? 0 : position === 'before' ? idx : idx + 1;
    // splice(fromIdx, 1) on a forward drag shifts every subsequent index down by 1.
    if (dragFromIdx < target) target -= 1;
    if (dragFromIdx !== target) {
      setItems((arr) => {
        const next = arr.slice();
        const [moved] = next.splice(dragFromIdx, 1);
        if (!moved) return arr;
        next.splice(target, 0, moved);
        return next;
      });
    }
    setDragFromIdx(null);
    setDropAt(null);
  };

  const computeDropPosition = (
    e: React.DragEvent,
    idx: number,
  ): { idx: number; position: 'before' | 'after' } => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    return { idx, position: e.clientY < midpoint ? 'before' : 'after' };
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
      setSending(false);
      console.warn('[collect] send aborted: no capture target');
      return;
    }

    // Build merged content via the segments module: each staging item becomes a
    // segment with its (optional) annotation lifted onto the `↪ note:` marker
    // line. Source disagreement gets a `[from <source>] ` prefix on non-first
    // segments (matches computeMergedFields's convention). The user's drag order
    // is honored — items render in the order the user laid them out.
    const sources = items.map((it) => (it.source ?? '').trim()).filter((s) => s.length > 0);
    const allSame = sources.length === items.length && new Set(sources).size <= 1;
    const sharedSource = allSame && sources.length > 0 ? sources[0]! : null;

    const segments: Segment[] = items.map((it, idx) => {
      const isFirst = idx === 0;
      const prefix = allSame || isFirst ? '' : `[from ${it.source?.trim() || '(无来源)'}] `;
      return {
        text: `${prefix}${it.text}`,
        annotation: it.annotation.trim() || null,
      };
    });
    const content = joinSegments(segments);
    const hasPinned = items.some((it) => it.pinned);

    let block: Awaited<ReturnType<typeof createBlock>>;
    try {
      block = await createBlock({
        threadId: target.id,
        kind: 'text',
        content,
        // Per-segment annotations are inside `content`; top-level annotation is null
        // for the merged block (mirrors computeMergedFields).
        annotation: null,
        source: sharedSource,
      });
    } catch (e) {
      console.error('[collect] createBlock failed', e);
      setSending(false);
      return;
    }

    if (hasPinned) {
      try {
        await togglePinDb(block.id);
        block = { ...block, pinned: true };
      } catch (e) {
        console.warn('[collect] pin merged block failed', e);
      }
    }

    for (const it of items) {
      const u = it.url.trim();
      if (!u) continue;
      try {
        const u2 = new URL(u);
        await createAttachment({
          blockId: block.id,
          kind: 'url',
          target: u,
          label: u2.host || u,
        });
      } catch (e) {
        console.warn('[collect] attach url failed', it.url, e);
      }
    }

    close({ kind: 'sent', block, threadId: target.id });
  };

  return (
    <div
      ref={cardRef}
      className="overlay-in flex w-full flex-col overflow-hidden rounded-lg border border-line-strong bg-paper"
      style={{ boxShadow: 'var(--shadow-toast)', maxHeight: MAX_PANEL_HEIGHT }}
    >
      <header className="flex flex-none items-center justify-between border-b border-line bg-paper-2/40 px-3 py-1.5">
        <div className="font-ui text-[11px] text-ink">
          <span className="font-serif text-[12px]">正在收集</span>
          <span className="ml-1.5 text-muted">
            {items.length === 0 ? '— ⌥⌥ 或 ⌘⇧C 加入内容' : `· ${items.length}`}
          </span>
        </div>
        <button
          type="button"
          onClick={requestClose}
          title="关闭（丢弃未发送内容）"
          aria-label="关闭"
          className="rounded p-1 text-muted/70 hover:bg-paper hover:text-ink"
        >
          <X size={11} />
        </button>
      </header>

      <div ref={listRef} className="flex-1 overflow-y-auto px-2 py-1.5">
        {items.length === 0 && (
          <p className="px-1 py-2 font-ui text-[11px] leading-relaxed text-muted">
            继续 ⌥⌥ 或 ⌘⇧C 捕捉，会在这里堆成草稿。整理后发送，会合并为一块写入当前目标脉络。
          </p>
        )}
        {items.length > 0 && (
          // Top sentinel: a small drop zone above the first row. Catches drags that
          // release near the very top so the user can pin a block to position 0
          // without having to overshoot the first row's top half.
          <div
            onDragOver={(e) => {
              if (dragFromIdx === null) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setDropAt({ idx: -1, position: 'before' });
            }}
            onDrop={(e) => {
              if (dragFromIdx === null) return;
              e.preventDefault();
              dropDraggedItem();
            }}
            className={`h-1.5 rounded transition-colors ${
              dragFromIdx !== null && dropAt?.idx === -1 ? 'bg-accent/60' : ''
            }`}
            aria-hidden="true"
          />
        )}
        {items.map((it, idx) => {
          const itemUi = ui[it.id] ?? defaultUi();
          const showAbove = dropAt?.idx === idx && dropAt.position === 'before';
          const showBelow = dropAt?.idx === idx && dropAt.position === 'after';
          return (
            <StagingRow
              key={it.id}
              item={it}
              ui={itemUi}
              isDragging={dragFromIdx === idx}
              indicator={showAbove ? 'above' : showBelow ? 'below' : null}
              onTextChange={(v) => updateItem(it.id, { text: v })}
              onAnnotationChange={(v) => updateItem(it.id, { annotation: v })}
              onUrlChange={(v) => updateItem(it.id, { url: v })}
              onTogglePin={() => updateItem(it.id, { pinned: !it.pinned })}
              onToggleExpand={() => updateUi(it.id, { expanded: !itemUi.expanded })}
              onToggleAnnotation={() =>
                updateUi(it.id, { editingAnnotation: !itemUi.editingAnnotation })
              }
              onToggleUrl={() => updateUi(it.id, { editingUrl: !itemUi.editingUrl })}
              onRemove={() => removeItem(it.id)}
              onDragStart={() => setDragFromIdx(idx)}
              onDragEnd={() => {
                setDragFromIdx(null);
                setDropAt(null);
              }}
              onDragOver={(e) => {
                if (dragFromIdx === null) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setDropAt(computeDropPosition(e, idx));
              }}
              onDrop={(e) => {
                if (dragFromIdx === null) return;
                e.preventDefault();
                dropDraggedItem();
              }}
            />
          );
        })}
      </div>

      {confirming ? (
        <footer className="flex flex-none items-center justify-between gap-2 border-t border-line bg-paper-2/40 px-3 py-1.5 text-[11px]">
          <span className="text-muted">丢弃 {items.length} 条草稿？</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={cancelDiscard}
              className="rounded px-2 py-0.5 text-muted hover:bg-paper hover:text-ink"
            >
              再想想
            </button>
            <button
              type="button"
              onClick={confirmDiscard}
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
            onClick={requestClose}
            className="rounded px-2 py-1 text-muted hover:bg-paper hover:text-ink"
          >
            关闭
          </button>
          <button
            type="button"
            onClick={() => void send()}
            disabled={items.length === 0 || sending}
            className="flex items-center gap-1 rounded-md border border-accent bg-accent-soft px-2.5 py-1 text-accent hover:bg-accent/10 disabled:cursor-not-allowed disabled:border-line disabled:bg-paper-2 disabled:text-muted/60"
          >
            <Send size={11} />
            <span>{sending ? '发送中…' : `发送（${items.length}）`}</span>
          </button>
        </footer>
      )}
    </div>
  );
}

// --- Per-item row -----------------------------------------------------------------------
// Block-like (task 4): default-quiet, line-clamped preview, hover toolbar exposes
// annotate / url toggles, click body to expand into edit mode. URL and annotation are
// hidden until either has content OR the toggle is on, so stacked staging items don't
// pile up empty input fields.

interface StagingRowProps {
  item: StagingItem;
  ui: ItemUiState;
  isDragging: boolean;
  // Drop indicator anchored to this row: 'above' draws a line at the top, 'below'
  // at the bottom. null means no indicator on this row. Parent decides which row
  // (if any) hosts the indicator based on the cursor's current dropAt target.
  indicator: 'above' | 'below' | null;
  onTextChange: (v: string) => void;
  onAnnotationChange: (v: string) => void;
  onUrlChange: (v: string) => void;
  onTogglePin: () => void;
  onToggleExpand: () => void;
  onToggleAnnotation: () => void;
  onToggleUrl: () => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

function StagingRow({
  item,
  ui,
  isDragging,
  indicator,
  onTextChange,
  onAnnotationChange,
  onUrlChange,
  onTogglePin,
  onToggleExpand,
  onToggleAnnotation,
  onToggleUrl,
  onRemove,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: StagingRowProps) {
  const [hover, setHover] = useState(false);
  const annotationVisible = ui.editingAnnotation || item.annotation.trim().length > 0;
  const urlVisible = ui.editingUrl || item.url.trim().length > 0;
  const showActions = hover || ui.expanded;
  // Task 2: detect whether the collapsed preview actually clips its content. Only
  // when it does should the "展开" affordance appear — short items stay quiet. Same
  // measure-by-DOM pattern BlockItem uses for `needsTruncation`. Re-measures when
  // the text or the expand state changes (the latter so collapsing back re-checks).
  const previewRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  useLayoutEffect(() => {
    if (ui.expanded) return;
    const el = previewRef.current;
    if (!el) return;
    setOverflows(el.scrollHeight - el.clientHeight > 1);
  }, [item.text, ui.expanded]);
  // Auto-grow the edit textarea so long items don't sprout an internal scroll bar.
  // The panel itself scrolls past MAX_PANEL_HEIGHT; per-item content uses the
  // "truncate when small, grow when expanded" pattern matching BlockItem.
  const taRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    if (!ui.expanded) return;
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }, [item.text, ui.expanded]);

  return (
    <div className="relative">
      {indicator === 'above' && (
        // Thin accent line so the user can see where the drop will land. Positioned
        // OUTSIDE the article so the article's own padding doesn't push it offscreen.
        <div className="pointer-events-none absolute -top-0.5 left-0 right-0 z-10 h-0.5 rounded bg-accent" />
      )}
      {indicator === 'below' && (
        <div className="pointer-events-none absolute -bottom-0.5 left-0 right-0 z-10 h-0.5 rounded bg-accent" />
      )}
      <article
        draggable
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onDragStart={(e) => {
          // dataTransfer must be set or some browsers don't fire dragover. Empty
          // string is fine — we track the index in component state, not in the payload.
          e.dataTransfer.setData('text/plain', item.id);
          e.dataTransfer.effectAllowed = 'move';
          onDragStart();
        }}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className={`mb-1 rounded-md border border-line bg-paper-2/30 px-1.5 py-1 last:mb-0 transition-opacity ${
          isDragging ? 'opacity-40' : ''
        }`}
      >
        {/* Row header: drag handle + source label + hover-revealed action chips. */}
        <div className="flex items-center gap-1 text-[10px] text-muted">
          <span
            // Cursor cue on the handle; the whole article is draggable, but the handle
            // makes the affordance discoverable.
            className="cursor-grab text-muted/60 hover:text-ink"
            title="拖动调整顺序"
            aria-hidden="true"
          >
            <GripVertical size={10} />
          </span>
        {item.source && <span className="truncate">{item.source}</span>}
        <div
          className={`ml-auto flex items-center gap-0.5 transition-opacity ${
            showActions ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          <RowBtn
            title={item.pinned ? '取消置顶' : '标为重点（发送后整块会置顶）'}
            onClick={onTogglePin}
            active={item.pinned}
          >
            <Pin size={10} className={item.pinned ? 'fill-current' : ''} />
          </RowBtn>
          <RowBtn
            title={annotationVisible ? '隐藏批注框' : '添加批注'}
            onClick={onToggleAnnotation}
            active={ui.editingAnnotation}
          >
            <MessageSquarePlus size={10} />
          </RowBtn>
          <RowBtn
            title={urlVisible ? '隐藏链接框' : '附一个链接'}
            onClick={onToggleUrl}
            active={ui.editingUrl}
          >
            <Link2 size={10} />
          </RowBtn>
          <RowBtn title="删除此项" onClick={onRemove} danger>
            <Trash2 size={10} />
          </RowBtn>
        </div>
      </div>

      {/* Body: collapsed preview (line-clamped, max 3 lines) or full edit textarea.
          Auto-shrink for long text + "展开"/"收起" affordance when overflow exists.
          Edit textarea auto-grows to fit so it never carries its own scrollbar —
          panel scrolls instead. Matches BlockItem's truncate-and-expand pattern. */}
      {ui.expanded ? (
        <div className="mt-1">
          <textarea
            ref={taRef}
            autoFocus
            value={item.text}
            onChange={(e) => onTextChange(e.target.value)}
            spellCheck={false}
            className="w-full resize-none overflow-hidden rounded border border-line-strong bg-paper px-2 py-1 font-ui text-[12px] leading-[1.5] text-ink outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={onToggleExpand}
            className="mt-0.5 text-[10px] text-muted hover:text-accent"
          >
            收起
          </button>
        </div>
      ) : (
        // Clickable preview area. Native HTML5 DnD on the parent <article> uses a
        // small movement threshold to distinguish click from drag, so a quiet click
        // here just expands while a click-and-drag from anywhere in the row still
        // initiates the reorder.
        <>
          <div
            ref={previewRef}
            role="button"
            tabIndex={0}
            onClick={onToggleExpand}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onToggleExpand();
              }
            }}
            title={overflows ? '点击展开 / 编辑' : '点击编辑'}
            className="mt-0.5 cursor-text whitespace-pre-wrap break-words rounded px-1 py-0.5 font-ui text-[12px] leading-[1.45] text-ink hover:bg-paper"
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {item.text || <span className="text-muted/70">（空）</span>}
          </div>
          {overflows && (
            <button
              type="button"
              onClick={onToggleExpand}
              className="mt-0.5 text-[10px] text-muted hover:text-accent"
            >
              展开全文
            </button>
          )}
        </>
      )}

      {/* Annotation: same visibility rule as a real block — present only when set
          OR the user just opened the field. Quiet styling so it doesn't compete. */}
      {annotationVisible && (
        <textarea
          value={item.annotation}
          onChange={(e) => onAnnotationChange(e.target.value)}
          placeholder="批注（可选）"
          rows={1}
          spellCheck={false}
          className="mt-1 w-full resize-none rounded border border-line bg-paper px-1.5 py-1 font-ui text-[11px] italic leading-[1.4] text-ink-2 placeholder:text-muted/60 outline-none focus:border-line-strong"
        />
      )}

      {urlVisible && (
        <input
          value={item.url}
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder="链接（可选）"
          spellCheck={false}
          className="mt-1 w-full rounded border border-line bg-paper px-1.5 py-0.5 font-ui text-[11px] text-ink outline-none focus:border-line-strong"
        />
      )}
      </article>
    </div>
  );
}

interface RowBtnProps {
  title: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}

function RowBtn({ title, onClick, active, danger, children }: RowBtnProps) {
  const tone = danger
    ? 'text-muted/70 hover:bg-paper hover:text-urgent'
    : active
      ? 'text-accent'
      : 'text-muted/70 hover:bg-paper hover:text-ink';
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      // Don't stopPropagation on mousedown — that was the prior bug that killed
      // drag init when the user grabbed near a chip. HTML5 DnD distinguishes click
      // from drag by movement threshold, so a quiet click here still triggers
      // onClick while a press-and-drag from this area still starts a reorder.
      className={`rounded p-1 transition-colors ${tone}`}
    >
      {children}
    </button>
  );
}
