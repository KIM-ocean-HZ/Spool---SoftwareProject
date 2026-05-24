import { Fragment, type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import type { Attachment } from '@/lib/db/attachments';
import type { Block } from '@/lib/db/blocks';
import { useBlocksStore } from '@/stores/blocksStore';
import { useDropStore } from '@/stores/dropStore';
import { useSearchStore } from '@/stores/searchStore';
import BlockItem from './BlockItem';

// Tail-window cap for large threads (PLAN_EN.md §15 / Phase 12 — "enable virtual
// scrolling when blocks > 200"). Below the cap we render the whole feed unchanged;
// at or above we keep only the most recent WINDOW_SIZE blocks mounted and expose a
// "show earlier" affordance that grows the window in chunks. Trade-off: real
// row-virtualization would need height tracking that fights smart-truncation and
// date dividers; this pagination preserves the existing renderer while keeping the
// DOM bounded for the long-thread case the budget actually targets.
const WINDOW_SIZE = 200;

interface Props {
  threadId: string;
  // Forwarded from LogView so the §20.1 drag-marquee can auto-scroll the same container
  // and resolve block-element positions against the correct scroll origin.
  scrollRef: RefObject<HTMLDivElement | null>;
}

// v2.8 §20.1 drag-marquee constants.
// Edge-trigger band for auto-scroll while dragging near the top/bottom of the feed.
const MARQUEE_SCROLL_EDGE = 40;
// Pixels per animation frame while auto-scrolling — tuned so a long sweep feels
// continuous without being so fast the user overshoots the target block.
const MARQUEE_SCROLL_SPEED = 14;
// Bounding-box intersection — viewport coords for both rects.
const intersectsRect = (
  a: { left: number; right: number; top: number; bottom: number },
  b: DOMRect,
): boolean =>
  !(b.right < a.left || b.left > a.right || b.bottom < a.top || b.top > a.bottom);

// Module-level sentinel: a fresh `[]` inside the selector would change identity every
// render and trip React's useSyncExternalStore "snapshot is unstable" guard — the same
// trap that produced the Phase 3 "Maximum update depth exceeded" loop.
const EMPTY: readonly Block[] = [];
const EMPTY_ATTACHMENTS: readonly Attachment[] = [];

type SortMode = 'time' | 'source';

// Source-grouped order: blocks sharing a source sit together (sources ordered
// alphabetically), no-source blocks last; within a group chronological order is kept.
// `blocks` already arrives created_at ASC so the within-group order comes for free.
const sortBlocks = (blocks: readonly Block[], mode: SortMode): readonly Block[] => {
  if (mode === 'time') return blocks;
  return [...blocks].sort((a, b) => {
    const sa = (a.source ?? '').trim();
    const sb = (b.source ?? '').trim();
    if (sa === sb) return a.createdAt - b.createdAt;
    if (!sa) return 1;
    if (!sb) return -1;
    return sa.localeCompare(sb);
  });
};

// Two timestamps fall on the same local calendar day.
const isSameDay = (a: number, b: number): boolean =>
  new Date(a).toDateString() === new Date(b).toDateString();

// "5月17日 周六" — the calendar date plus a short weekday, for divider labels.
const formatDayLabel = (ts: number): string => {
  const d = new Date(ts);
  const md = d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
  const wd = d.toLocaleDateString('zh-CN', { weekday: 'short' });
  return `${md} ${wd}`;
};

// A thin 1px rule with the calendar date centred on it (PLAN_EN.md §9.3) — the
// dominant scanning aid for long threads.
function DateDivider({ ts }: { ts: number }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="h-px flex-1 bg-line" />
      <span className="font-mono text-[10px] text-muted">{formatDayLabel(ts)}</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

export default function BlockFeed({ threadId, scrollRef }: Props) {
  const load = useBlocksStore((s) => s.load);
  const togglePin = useBlocksStore((s) => s.togglePin);
  const remove = useBlocksStore((s) => s.remove);
  const blocks = useBlocksStore((s) => s.byThread[threadId] ?? EMPTY);
  const attachmentsByBlock = useBlocksStore((s) => s.attachmentsByBlock);
  const overEmpty = useDropStore((s) => s.overEmpty);
  const highlightBlockId = useSearchStore((s) => s.highlightBlockId);
  // v2.8 §20.1 selection state. Anchor id drives shift-click range selection.
  const selectedBlockIds = useBlocksStore((s) => s.selectedBlockIds);
  const toggleSelect = useBlocksStore((s) => s.toggleSelect);
  const selectMany = useBlocksStore((s) => s.selectMany);
  const setSelection = useBlocksStore((s) => s.setSelection);
  const clearSelection = useBlocksStore((s) => s.clearSelection);
  const selectionAnchor = useRef<string | null>(null);

  // v2.8 §20.1 drag-marquee state. Stored in viewport coords (clientX/Y) — origin is the
  // mouseDown point; cursor tracks current pointer. The visible rectangle stays anchored
  // to the viewport while auto-scrolling, matching Finder behaviour: blocks slide through
  // the rectangle as the feed scrolls, getting picked up as they intersect.
  const [marquee, setMarquee] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);
  // Snapshot of the selection at drag start. Each frame the new selection is computed as
  // baseline ∪ (blocks the rectangle currently intersects), so dragging into and back out
  // of a block doesn't leave it stuck selected.
  const marqueeBaseline = useRef<Set<string>>(new Set());

  // Selection is per-thread implicitly — clear it on thread switch so a stale set from
  // the previous feed can't accidentally include blocks the user can no longer see.
  useEffect(() => {
    clearSelection();
    selectionAnchor.current = null;
  }, [threadId, clearSelection]);

  const [sortMode, setSortMode] = useState<SortMode>('time');
  // Tail-window size for this thread. Reset on thread switch so a previously expanded
  // history doesn't carry into a different (possibly tiny) thread.
  const [windowSize, setWindowSize] = useState(WINDOW_SIZE);
  useEffect(() => {
    setWindowSize(WINDOW_SIZE);
  }, [threadId]);

  useEffect(() => {
    void load(threadId);
  }, [threadId, load]);

  const ordered = useMemo(() => sortBlocks(blocks, sortMode), [blocks, sortMode]);

  // If a search result targets a block outside the current tail window, widen so it's
  // mounted before the scrollIntoView below runs. Runs before the highlight effect so
  // the DOM lookup hits a rendered node, not a virtualized one.
  useEffect(() => {
    if (!highlightBlockId) return;
    const idx = ordered.findIndex((b) => b.id === highlightBlockId);
    if (idx === -1) return;
    const minWindow = ordered.length - idx;
    if (minWindow > windowSize) setWindowSize(minWindow);
  }, [highlightBlockId, ordered, windowSize]);

  // After a search result navigates here, scroll the target block into view. The
  // effect re-runs once `blocks` has loaded for the newly-selected thread; BlockItem
  // applies the flash highlight off the same store field.
  useEffect(() => {
    if (!highlightBlockId) return;
    if (!blocks.some((b) => b.id === highlightBlockId)) return;
    const el = document.querySelector(`[data-block-id="${highlightBlockId}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightBlockId, blocks, windowSize]);

  const handleCopy = (text: string) => {
    void navigator.clipboard.writeText(text);
  };

  // v2.8 §20.1 drag-marquee: mouseDown on empty feed space (no block, no button, no
  // textarea …) starts a rubber-band selection like Finder. Modifier-held mouseDown is
  // skipped so shift/cmd-click on a checkbox keeps its own meaning.
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return;
    if (e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target as HTMLElement;
    if (
      target.closest(
        '[data-block-id], button, textarea, input, a, select, label, [contenteditable]',
      )
    ) {
      return;
    }
    marqueeBaseline.current = new Set(useBlocksStore.getState().selectedBlockIds);
    setMarquee({ x1: e.clientX, y1: e.clientY, x2: e.clientX, y2: e.clientY });
    // Wipe any browser text selection that might have started on the empty-space click;
    // preventDefault on a non-focusable div also keeps a new selection from forming.
    window.getSelection()?.removeAllRanges();
    e.preventDefault();
  };

  // While a marquee drag is active: track cursor, auto-scroll near edges, recompute the
  // selection from rectangle ∩ block bounding rects. Esc reverts to the pre-drag baseline.
  // Effect re-runs only when a drag opens (origin x1/y1 changes) or closes (marquee →
  // null); intra-drag cursor updates flow through the mousemove closure + a dirty flag.
  useEffect(() => {
    if (!marquee) return;
    const origin = { x: marquee.x1, y: marquee.y1 };
    let cursorX = marquee.x2;
    let cursorY = marquee.y2;
    let dirty = false;
    let rafId = 0;

    const recompute = (): void => {
      const rect = {
        left: Math.min(origin.x, cursorX),
        right: Math.max(origin.x, cursorX),
        top: Math.min(origin.y, cursorY),
        bottom: Math.max(origin.y, cursorY),
      };
      const next = new Set(marqueeBaseline.current);
      document.querySelectorAll<HTMLElement>('[data-block-id]').forEach((el) => {
        if (intersectsRect(rect, el.getBoundingClientRect())) {
          const id = el.dataset.blockId;
          if (id) next.add(id);
        }
      });
      setSelection(next);
    };

    const tick = (): void => {
      // Auto-scroll while the cursor sits in the top / bottom edge band of the feed.
      const scrollEl = scrollRef.current;
      if (scrollEl) {
        const r = scrollEl.getBoundingClientRect();
        const maxScroll = scrollEl.scrollHeight - scrollEl.clientHeight;
        if (cursorY < r.top + MARQUEE_SCROLL_EDGE && scrollEl.scrollTop > 0) {
          scrollEl.scrollTop = Math.max(0, scrollEl.scrollTop - MARQUEE_SCROLL_SPEED);
          dirty = true;
        } else if (cursorY > r.bottom - MARQUEE_SCROLL_EDGE && scrollEl.scrollTop < maxScroll) {
          scrollEl.scrollTop = Math.min(
            maxScroll,
            scrollEl.scrollTop + MARQUEE_SCROLL_SPEED,
          );
          dirty = true;
        }
      }
      if (dirty) {
        recompute();
        // Push current cursor into React state so the visible rectangle re-renders.
        // The state setter is no-op when x2/y2 match, so a still cursor + no scroll
        // doesn't churn renders.
        setMarquee((m) => (m && (m.x2 !== cursorX || m.y2 !== cursorY)
          ? { ...m, x2: cursorX, y2: cursorY }
          : m));
        dirty = false;
      }
      rafId = requestAnimationFrame(tick);
    };

    const onMove = (e: MouseEvent): void => {
      cursorX = e.clientX;
      cursorY = e.clientY;
      dirty = true;
    };
    const onUp = (): void => setMarquee(null);
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      // Revert any additions this drag made; keep the pre-drag selection intact.
      setSelection(marqueeBaseline.current);
      setMarquee(null);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('keydown', onKey);
    rafId = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('keydown', onKey);
      cancelAnimationFrame(rafId);
    };
    // Effect lifecycle is keyed on origin: drag open (null → coords) re-runs, drag close
    // (coords → null) tears down. Intra-drag cursor changes flow through the closure.
  }, [marquee?.x1, marquee?.y1, setSelection, scrollRef]);

  // Range-select between the anchor and the just-clicked block, using current feed
  // order (whichever sort mode is active). Plain click sets the anchor; shift-click
  // extends to it. Re-clicking the anchor with shift collapses to a single toggle.
  const handleSelectClick = (id: string, shiftKey: boolean): void => {
    if (shiftKey && selectionAnchor.current && selectionAnchor.current !== id) {
      const ids = ordered.map((b) => b.id);
      const a = ids.indexOf(selectionAnchor.current);
      const b = ids.indexOf(id);
      if (a !== -1 && b !== -1) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        selectMany(ids.slice(lo, hi + 1));
        return;
      }
    }
    toggleSelect(id);
    selectionAnchor.current = id;
  };

  const anySelected = selectedBlockIds.size > 0;

  if (blocks.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 py-12">
        {overEmpty ? (
          <p className="rounded-md border-2 border-dashed border-accent bg-accent/5 px-8 py-10 text-center text-sm font-ui text-accent">
            松开以新建第一个块
          </p>
        ) : (
          <p className="text-center text-sm italic text-muted">
            双击{' '}
            <kbd className="rounded border border-line-strong bg-paper px-1 font-mono text-[10px] not-italic">
              ⌥
            </kbd>{' '}
            捕捉第一条信息，或在下方直接写。
          </p>
        )}
      </div>
    );
  }

  // Tail window: keep only the most recent `windowSize` blocks mounted once the feed
  // grows past WINDOW_SIZE. Older blocks stay one click away via the "show earlier"
  // button below. visible/hiddenCount drive both the slice and the divider/index math.
  const hiddenCount = Math.max(0, ordered.length - windowSize);
  const visible = hiddenCount > 0 ? ordered.slice(hiddenCount) : ordered;

  return (
    <div onMouseDown={handleMouseDown} className="px-6 py-3">
      <div className="mb-2 flex items-center justify-end gap-0.5 text-[11px]">
        <span className="mr-1 text-muted">排序</span>
        {(['time', 'source'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setSortMode(m)}
            className={`rounded-full border px-2 py-0.5 transition-colors ${
              sortMode === m
                ? 'border-accent text-accent'
                : 'border-line text-muted hover:border-line-strong'
            }`}
          >
            {m === 'time' ? '按时间' : '按来源'}
          </button>
        ))}
      </div>
      {hiddenCount > 0 && (
        <div className="mb-2 flex items-center justify-center">
          <button
            type="button"
            onClick={() => setWindowSize((n) => n + WINDOW_SIZE)}
            className="rounded-full border border-line bg-paper px-3 py-1 text-[11px] text-muted transition-colors hover:border-accent hover:text-accent"
          >
            查看更早的 {hiddenCount} 条
          </button>
        </div>
      )}
      <div className="space-y-2">
        {visible.map((b, i) => {
          // Date divider above any block that opens a new calendar day — the first
          // visible block always gets one. Skipped in "by source" mode, where the feed
          // is not time-ordered (§9.3). The previous-day comparison uses the full
          // `ordered` array via the absolute index so the boundary stays correct
          // across the tail-window cut.
          const absIdx = hiddenCount + i;
          const showDivider =
            sortMode === 'time' &&
            (i === 0 || !isSameDay(ordered[absIdx - 1]!.createdAt, b.createdAt));
          return (
            <Fragment key={b.id}>
              {showDivider && <DateDivider ts={b.createdAt} />}
              <BlockItem
                block={b}
                attachments={attachmentsByBlock[b.id] ?? EMPTY_ATTACHMENTS}
                highlight={b.id === highlightBlockId}
                selected={selectedBlockIds.has(b.id)}
                anySelected={anySelected}
                onSelectClick={(shiftKey) => handleSelectClick(b.id, shiftKey)}
                onTogglePin={() => void togglePin(b.id)}
                onCopy={() => handleCopy(b.content)}
                onDelete={() => void remove(b.id)}
              />
            </Fragment>
          );
        })}
        {/* Explicit drop zone: when a Finder drag is over empty timeline space (not
            over a block), this names the outcome — a new block — instead of leaving
            the user guessing. */}
        {overEmpty && (
          <div className="flex items-center justify-center rounded-md border-2 border-dashed border-accent bg-accent/5 px-3.5 py-5 font-ui text-[12px] text-accent">
            松开以新建一个块
          </div>
        )}
      </div>
      {/* §20.1 drag-marquee rectangle. Fixed position so it lives in viewport coords
          and isn't clipped by the scroll container; pointer-events:none so it never
          steals events from the blocks beneath. Rendered only while a drag is active. */}
      {marquee && (
        <div
          className="pointer-events-none fixed z-30 rounded-sm border border-accent/70 bg-accent/10"
          style={{
            left: Math.min(marquee.x1, marquee.x2),
            top: Math.min(marquee.y1, marquee.y2),
            width: Math.abs(marquee.x2 - marquee.x1),
            height: Math.abs(marquee.y2 - marquee.y1),
          }}
        />
      )}
    </div>
  );
}
